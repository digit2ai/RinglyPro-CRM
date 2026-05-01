'use strict';

/*
  ingest-hcris.js — populate intuitive_hospital_cost_reports from CMS HCRIS.

  HCRIS quarterly bulk download (CSV/XLSX) URL pattern:
    https://www.cms.gov/files/zip/hospital-2552-2010-cost-report-data.zip

  Strategy:
  - Stream-parse the latest annual file (do NOT buffer; CSV can be 1GB+).
  - Map columns: provider_id (CCN), fiscal_year, total_revenue, total_expenses,
    total_or_count, beds_available, beds_staffed, payer_medicare_pct, etc.
  - Idempotent UPSERT on (provider_id, fiscal_year).

  Run: node verticals/intuitive/scripts/ingest-hcris.js [--year=2024] [--limit=10000]

  TODO: CMS sometimes restructures the HCRIS download URL. If the script fails
  with HTTP 404, manually download the latest "Hospital 2552-10 Annual Final"
  file from https://www.cms.gov/Research-Statistics-Data-and-Systems/Files-for-Order/CostReports
  and pass --file=/path/to/hosp10_yyyy.csv
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Sequelize } = require('sequelize');

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v == null ? true : v;
  return acc;
}, {});

const YEAR = Number(args.year) || (new Date().getFullYear() - 2);
const LIMIT = Number(args.limit) || 100000;
const FILE = args.file;
const HCRIS_URL = `https://www.cms.gov/files/zip/hospital-2552-2010-cost-report-data-${YEAR}.zip`;

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

const models = require(path.join(__dirname, '..', 'models'));

async function streamCsv(filePath, onRow) {
  const { parse } = require('csv-parse');
  return new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true });
    let rows = 0;
    parser.on('readable', () => {
      let r;
      while ((r = parser.read()) !== null) {
        rows++;
        if (rows > LIMIT) { parser.end(); break; }
        onRow(r, rows).catch(e => console.error(`row ${rows} error:`, e.message));
      }
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(rows));
    fs.createReadStream(filePath).pipe(parser);
  });
}

async function ingestRow(row) {
  // HCRIS column names vary; common mappings:
  const provider_id = row.PRVDR_NUM || row.provider_id || row.PROV_ID || row.PROVIDER || null;
  if (!provider_id) return;
  const fiscal_year = Number(row.FY_END_YR || row.FISCAL_YEAR || row.fy_year) || YEAR;

  const numField = (...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v != null && v !== '' && !isNaN(Number(v))) return Number(v);
    }
    return null;
  };

  await models.IntuitiveHospitalCostReport.upsert({
    provider_id: String(provider_id).trim().padStart(6, '0'),
    fiscal_year,
    total_revenue: numField('TOT_PT_REV', 'TOTAL_REVENUE', 'total_revenue'),
    total_expenses: numField('TOT_OPER_EXP', 'TOTAL_EXPENSES', 'total_expenses'),
    surgical_revenue: numField('SURG_REV', 'surgical_revenue'),
    total_surgical_cases: numField('TOT_SURG_CASES', 'total_surgical_cases'),
    payer_medicare_pct: numField('MCR_PCT', 'medicare_pct', 'payer_medicare_pct'),
    payer_medicaid_pct: numField('MCD_PCT', 'medicaid_pct', 'payer_medicaid_pct'),
    payer_self_pay_pct: numField('SELF_PAY_PCT', 'self_pay_pct'),
    total_or_count: numField('OR_CNT', 'or_count', 'total_or_count'),
    beds_available: numField('BEDS_AVAIL', 'beds_available'),
    beds_staffed: numField('BEDS_STAFFED', 'beds_staffed', 'BEDS'),
    raw_filing_url: `https://hcris.cms.gov/${provider_id}`,
    ingested_at: new Date(),
  });
}

async function main() {
  console.log(`[ingest-hcris] starting for FY=${YEAR}, limit=${LIMIT}`);
  await sequelize.authenticate();
  await models.IntuitiveHospitalCostReport.sync();

  if (FILE) {
    console.log(`[ingest-hcris] using local file: ${FILE}`);
    let processed = 0;
    const total = await streamCsv(FILE, async (row) => {
      await ingestRow(row);
      processed++;
      if (processed % 1000 === 0) console.log(`[ingest-hcris] processed ${processed} rows`);
    });
    console.log(`[ingest-hcris] done. ${total} rows scanned.`);
  } else {
    console.warn('[ingest-hcris] No --file specified. Auto-download from data.cms.gov is not implemented in this stub due to CMS URL volatility.');
    console.warn('[ingest-hcris] TODO: Download the latest HCRIS bulk file manually from');
    console.warn('              https://www.cms.gov/Research-Statistics-Data-and-Systems/Files-for-Order/CostReports');
    console.warn('              then run: node ingest-hcris.js --file=/path/to/hosp10_2024.csv');
    console.warn('[ingest-hcris] For initial deployment, the table is stubbed empty; the connector will gracefully return null until ingestion runs.');
  }

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_hospital_cost_reports');
  console.log(`[ingest-hcris] table now has ${rows[0].c} rows`);
  await sequelize.close();
}

main().catch(err => { console.error('[ingest-hcris] FATAL:', err); process.exit(1); });
