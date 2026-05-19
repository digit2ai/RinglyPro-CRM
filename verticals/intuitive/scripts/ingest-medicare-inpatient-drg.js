'use strict';

/*
  ingest-medicare-inpatient-drg.js — populate intuitive_hospital_drg_volume from
  CMS Medicare Inpatient Hospitals by Provider and Service (hospital × MS-DRG).

  Source:
    https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals
    Typical filename: MUP_INP_RY{YY}_P{YY}_V10_DY{YYYY}_PR.csv (~600MB, ~3M rows)

  Strategy:
    - Stream-parse the bulk CSV (memory-safe for the full file)
    - Tolerant column-name parsing (CMS renames headers between years)
    - Upsert on (hospital_ccn, fiscal_year, drg_cd) — idempotent re-runs

  Run:
    node verticals/intuitive/scripts/ingest-medicare-inpatient-drg.js --file=/path/to/MUP_INP*.csv [--year=2024]

  This is a ONE-SHOT ops task. Run on a Render shell after downloading the CSV.
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
const YEAR = Number(args.year) || null;

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));

// Tolerant column lookup — CMS renames headers between years
function pickCol(row, candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== '') return row[c];
    // Try case-insensitive
    const key = Object.keys(row).find(k => k.toLowerCase() === c.toLowerCase());
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return isFinite(n) ? n : null;
}

async function main() {
  console.log('[ingest-medicare-inpatient-drg] starting');
  await sequelize.authenticate();
  await models.IntuitiveHospitalDrgVolume.sync();

  if (!FILE) {
    console.warn('[ingest-medicare-inpatient-drg] No --file specified.');
    console.warn('  Download the latest "Medicare Inpatient Hospitals by Provider and Service"');
    console.warn('  CSV from https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals');
    console.warn('  Then run: node ingest-medicare-inpatient-drg.js --file=/path/to/MUP_INP*.csv --year=2024');
    await sequelize.close();
    return;
  }
  if (!fs.existsSync(FILE)) {
    console.error(`[ingest-medicare-inpatient-drg] file not found: ${FILE}`);
    await sequelize.close();
    process.exit(1);
  }

  const { parse } = require('csv-parse');
  let scanned = 0;
  let upserted = 0;
  let errored = 0;
  const BATCH_SIZE = 500;
  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    try {
      await models.IntuitiveHospitalDrgVolume.bulkCreate(batch, {
        updateOnDuplicate: ['drg_desc', 'total_discharges', 'avg_covered_charges',
          'avg_total_payment', 'avg_medicare_payment', 'ingested_at'],
      });
      upserted += batch.length;
    } catch (e) {
      console.error(`[ingest-medicare-inpatient-drg] batch error: ${e.message}`);
      errored += batch.length;
    }
    batch = [];
  }

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
    parser.on('readable', async () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        if (scanned % 50000 === 0) {
          console.log(`[ingest-medicare-inpatient-drg] scanned ${scanned}, upserted ${upserted}, errored ${errored}`);
        }
        const ccn = String(pickCol(r, ['Rndrng_Prvdr_CCN', 'CCN', 'Provider_Id', 'PROVIDER_ID', 'provider_id', 'Provider Number']) || '').trim();
        const drg = String(pickCol(r, ['DRG_Cd', 'DRG_Code', 'DRG', 'drg_cd', 'DRG Cd']) || '').trim();
        if (!ccn || !drg || ccn.length > 10) continue;
        const desc = pickCol(r, ['DRG_Desc', 'DRG_Description', 'DRG Description', 'drg_desc']) || '';
        const discharges = parseNum(pickCol(r, ['Tot_Dschrgs', 'Total_Discharges', 'Discharges', 'tot_dschrgs']));
        const covered = parseNum(pickCol(r, ['Avg_Submtd_Cvrd_Chrg', 'Average_Covered_Charges', 'Avg Submtd Cvrd Chrg']));
        const totalPay = parseNum(pickCol(r, ['Avg_Tot_Pymt_Amt', 'Average_Total_Payments', 'Avg Tot Pymt Amt']));
        const mcrPay = parseNum(pickCol(r, ['Avg_Mdcr_Pymt_Amt', 'Average_Medicare_Payments', 'Avg Mdcr Pymt Amt']));
        const yr = YEAR || Number(pickCol(r, ['year', 'Year', 'fiscal_year', 'YEAR'])) || new Date().getFullYear() - 2;

        batch.push({
          hospital_ccn: ccn,
          fiscal_year: yr,
          drg_cd: drg,
          drg_desc: desc,
          total_discharges: discharges || 0,
          avg_covered_charges: covered,
          avg_total_payment: totalPay,
          avg_medicare_payment: mcrPay,
          ingested_at: new Date(),
        });
        if (batch.length >= BATCH_SIZE) {
          // Pause stream while flushing
          parser.pause();
          await flushBatch();
          parser.resume();
        }
      }
    });
    parser.on('error', reject);
    parser.on('end', async () => {
      await flushBatch();
      resolve();
    });
    fs.createReadStream(FILE).pipe(parser);
  });

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_hospital_drg_volume');
  console.log(`[ingest-medicare-inpatient-drg] done. ${scanned} scanned, ${upserted} upserted, ${errored} errored. Table now has ${rows[0].c} rows.`);
  await sequelize.close();
}

main().catch(err => { console.error('[ingest-medicare-inpatient-drg] FATAL:', err); process.exit(1); });
