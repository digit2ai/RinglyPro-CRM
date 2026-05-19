'use strict';

/*
  ingest-florida-ahca.js — populate intuitive_florida_ahca_hospitals from
  Florida AHCA hospital characteristics + quarterly utilization.

  Source: https://ahca.myflorida.com/ahca-database-download-form
    AHCA publishes quarterly hospital characteristics + utilization extracts.
    No public API — manual download of the latest CSV/XLSX.

  Refresh cadence: first Sunday of Jan / Apr / Jul / Oct for the prior
  calendar quarter (e.g. 2026-04 ingest covers 2026-Q1 data).

  Strategy:
    - Read CSV (one row per hospital).
    - Tolerant column-name parsing — AHCA header casing/labels drift between
      quarters (LICENSED_BEDS vs Licensed Beds vs lic_beds_total etc.).
    - Idempotent upsert keyed by (license_number) OR (hospital_name) when
      license_number is absent.
    - Optional --quarter=YYYY-QX tag is written to fiscal_period for audit.

  Run:
    node verticals/intuitive/scripts/ingest-florida-ahca.js --file=/path/to/florida_hospitals.csv [--year=2025] [--quarter=2025-Q4]
    node verticals/intuitive/scripts/ingest-florida-ahca.js --url=https://ahca.myflorida.com/.../<file>.csv [--quarter=2025-Q4]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { Sequelize } = require('sequelize');

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v == null ? true : v;
  return acc;
}, {});
const FILE = args.file;
const URL = args.url;
const YEAR = Number(args.year) || new Date().getFullYear() - 1;
const QUARTER = typeof args.quarter === 'string' ? args.quarter.trim() : null; // e.g. '2025-Q1'

if (QUARTER && !/^\d{4}-Q[1-4]$/.test(QUARTER)) {
  console.error(`[ingest-florida-ahca] --quarter must look like YYYY-QX (got "${QUARTER}")`);
  process.exit(1);
}

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Tolerant column lookup — AHCA renames headers every few quarters
function pickCol(row, candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== '') return row[c];
    const key = Object.keys(row).find(k => k.toLowerCase() === c.toLowerCase());
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function parseInt0(v) {
  if (v == null || v === '') return 0;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return isFinite(n) ? n : 0;
}

function downloadToTmp(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const tmp = path.join('/tmp', `florida-ahca-${Date.now()}.csv`);
    const out = fs.createWriteStream(tmp);
    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadToTmp(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes % (5 * 1024 * 1024) < chunk.length) {
          console.log(`[ingest-florida-ahca] downloaded ${(bytes / (1024 * 1024)).toFixed(0)} MB...`);
        }
      });
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(tmp); });
    }).on('error', reject);
  });
}

async function main() {
  console.log(`[ingest-florida-ahca] starting${QUARTER ? ` (quarter ${QUARTER})` : ''}`);
  await sequelize.authenticate();
  await models.IntuitiveFloridaAhcaHospital.sync();

  let filePath = FILE;
  if (!filePath && URL) {
    console.log(`[ingest-florida-ahca] downloading ${URL}`);
    filePath = await downloadToTmp(URL);
    console.log(`[ingest-florida-ahca] downloaded to ${filePath}`);
  }

  if (!filePath) {
    console.warn('[ingest-florida-ahca] No --file or --url specified.');
    console.warn('  Download the latest Florida hospital characteristics CSV from:');
    console.warn('    https://ahca.myflorida.com/ahca-database-download-form');
    console.warn('  Then run:');
    console.warn('    node ingest-florida-ahca.js --file=/path/to/florida_hospitals.csv [--quarter=2025-Q4]');
    console.warn('    node ingest-florida-ahca.js --url=https://ahca.myflorida.com/.../file.csv --quarter=2025-Q4');
    await sequelize.close();
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.error(`[ingest-florida-ahca] file not found: ${filePath}`);
    await sequelize.close();
    process.exit(1);
  }

  const { parse } = require('csv-parse');
  let scanned = 0;
  let upserted = 0;

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
    parser.on('readable', async () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        const name = pickCol(r, ['HOSPITAL_NAME', 'Hospital Name', 'hospital_name', 'FACILITY_NAME', 'Facility Name', 'facility_name', 'NAME', 'Name']);
        if (!name) continue;
        const license = pickCol(r, ['LICENSE_NUM', 'License_Num', 'license_number', 'LICENSE_NUMBER', 'LICENSE', 'License Number']);
        const ccn = pickCol(r, ['CCN', 'PROVIDER_ID', 'Provider_Id', 'provider_id', 'Medicare Provider Number']);

        try {
          // Prefer license_number as the natural key; fall back to (hospital_name, fiscal_year)
          const where = license
            ? { license_number: String(license) }
            : { hospital_name: name, fiscal_year: Number(pickCol(r, ['FISCAL_YEAR', 'Fiscal Year', 'fiscal_year', 'YEAR', 'Year'])) || YEAR };
          const existing = await models.IntuitiveFloridaAhcaHospital.findOne({ where });
          const payload = {
            provider_id: ccn ? String(ccn) : (existing && existing.provider_id) || null,
            license_number: license ? String(license) : (existing && existing.license_number) || null,
            hospital_name: name,
            hospital_name_normalized: normalizeName(name),
            licensed_beds: parseInt0(pickCol(r, ['LICENSED_BEDS', 'Licensed Beds', 'licensed_beds', 'LIC_BEDS', 'BEDS_LICENSED'])),
            staffed_beds: parseInt0(pickCol(r, ['STAFFED_BEDS', 'Staffed Beds', 'staffed_beds', 'BEDS_STAFFED'])),
            hospital_type: pickCol(r, ['HOSPITAL_TYPE', 'Hospital Type', 'hospital_type', 'TYPE', 'Type']),
            ownership: pickCol(r, ['OWNERSHIP', 'Ownership', 'ownership', 'OWNER_TYPE']),
            total_or_count: parseInt0(pickCol(r, ['OR_COUNT', 'Operating Rooms', 'OPERATING_ROOMS', 'TOTAL_OR'])),
            total_admissions: parseInt0(pickCol(r, ['TOTAL_ADMISSIONS', 'Admissions', 'ADMISSIONS', 'total_admissions'])),
            fiscal_year: Number(pickCol(r, ['FISCAL_YEAR', 'Fiscal Year', 'fiscal_year', 'YEAR', 'Year'])) || YEAR,
            fiscal_period: QUARTER || (existing && existing.fiscal_period) || null,
            ingested_at: new Date(),
          };
          if (existing) {
            await existing.update(payload);
          } else {
            await models.IntuitiveFloridaAhcaHospital.create(payload);
          }
          upserted++;
          if (upserted % 50 === 0) console.log(`[ingest-florida-ahca] upserted ${upserted}`);
        } catch (e) {
          // ignore individual row errors, continue
        }
      }
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    fs.createReadStream(filePath).pipe(parser);
  });

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_florida_ahca_hospitals');
  console.log(`[ingest-florida-ahca] done. ${scanned} scanned, ${upserted} upserted, table now has ${rows[0].c} rows${QUARTER ? `, tagged ${QUARTER}` : ''}`);

  // Clean up downloaded temp file
  if (URL && filePath.startsWith('/tmp/')) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }

  await sequelize.close();
}

main().catch(err => { console.error('[ingest-florida-ahca] FATAL:', err); process.exit(1); });
