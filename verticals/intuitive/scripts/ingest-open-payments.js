'use strict';

/*
  ingest-open-payments.js — populate intuitive_open_payments_intuitive from CMS Open Payments General Payments file.

  Open Payments annual general-payments CSV. URL pattern:
    https://download.cms.gov/openpayments/PGYY_P012025_01172025.zip
  (subject to change — verify on https://www.cms.gov/openpayments)

  Strategy:
  - Stream-parse general payments CSV row-by-row.
  - Filter rows where applicable_manufacturer_or_applicable_gpo_making_payment_name CONTAINS 'Intuitive Surgical'.
  - Aggregate per (npi, fiscal_year): sum total_amount_of_payment_usdollars, collect categories.
  - Idempotent UPSERT on (npi, fiscal_year).

  Run: node verticals/intuitive/scripts/ingest-open-payments.js --file=/path/to/OP_DTL_GNRL_PGYY.csv [--year=2024]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v == null ? true : v;
  return acc;
}, {});
const FILE = args.file;
const YEAR = Number(args.year) || new Date().getFullYear() - 1;
const INTUITIVE_NEEDLE = 'intuitive surgical';

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));

async function main() {
  console.log(`[ingest-open-payments] starting`);
  await sequelize.authenticate();
  await models.IntuitiveOpenPaymentsIntuitive.sync();

  if (!FILE) {
    console.warn('[ingest-open-payments] No --file specified. Download the latest Open Payments general-payments CSV from');
    console.warn('              https://www.cms.gov/openpayments/data/dataset-downloads');
    console.warn('              then run: node ingest-open-payments.js --file=/path/to/OP_DTL_GNRL_PGYY.csv');
    console.warn('[ingest-open-payments] For initial deployment, the table is stubbed empty; the connector will gracefully return null until ingestion runs.');
    await sequelize.close();
    return;
  }

  const { parse } = require('csv-parse');
  const aggregator = new Map();
  let scanned = 0;
  let matched = 0;

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true });
    parser.on('readable', () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        if (scanned % 100000 === 0) console.log(`[ingest-open-payments] scanned ${scanned} rows, matched ${matched} so far`);
        const mfr = String(r.Applicable_Manufacturer_or_Applicable_GPO_Making_Payment_Name
          || r.applicable_manufacturer_or_applicable_gpo_making_payment_name || '').toLowerCase();
        if (!mfr.includes(INTUITIVE_NEEDLE)) continue;
        const npi = String(r.Covered_Recipient_NPI || r.physician_npi || r.NPI || '').replace(/\D/g, '');
        if (!npi || npi.length !== 10) continue;
        const amount = Number(r.Total_Amount_of_Payment_USDollars || r.total_amount_of_payment_usdollars || 0);
        if (!amount) continue;
        const yr = Number(r.Program_Year || r.program_year || YEAR);
        const cat = r.Nature_of_Payment_or_Transfer_of_Value || r.nature_of_payment_or_transfer_of_value || 'unknown';
        const dt = r.Date_of_Payment || r.date_of_payment || null;
        const key = `${npi}|${yr}`;
        if (!aggregator.has(key)) {
          aggregator.set(key, { npi, fiscal_year: yr, total_amount: 0, categories: {}, last_payment_date: null, payment_count: 0 });
        }
        const agg = aggregator.get(key);
        agg.total_amount += amount;
        agg.categories[cat] = (agg.categories[cat] || 0) + amount;
        agg.payment_count += 1;
        if (dt) {
          const d = new Date(dt);
          if (!agg.last_payment_date || d > agg.last_payment_date) agg.last_payment_date = d;
        }
        matched++;
      }
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    fs.createReadStream(FILE).pipe(parser);
  });

  console.log(`[ingest-open-payments] scan complete: ${scanned} rows, ${matched} Intuitive matches, ${aggregator.size} unique (npi, year) pairs`);

  let upserted = 0;
  for (const agg of aggregator.values()) {
    await models.IntuitiveOpenPaymentsIntuitive.upsert({
      npi: agg.npi,
      fiscal_year: agg.fiscal_year,
      total_amount: agg.total_amount,
      categories: agg.categories,
      last_payment_date: agg.last_payment_date,
      payment_count: agg.payment_count,
      ingested_at: new Date(),
    });
    upserted++;
    if (upserted % 1000 === 0) console.log(`[ingest-open-payments] upserted ${upserted}`);
  }

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_open_payments_intuitive');
  console.log(`[ingest-open-payments] done. table now has ${rows[0].c} rows`);
  await sequelize.close();
}

main().catch(err => { console.error('[ingest-open-payments] FATAL:', err); process.exit(1); });
