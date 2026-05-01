'use strict';

/*
  ingest-florida-ahca.js — populate intuitive_florida_ahca_hospitals from Florida AHCA hospital characteristics.

  Source: https://ahca.myflorida.com / https://www.floridahealthfinder.gov
  No public API — manual download of the latest hospital characteristics file (CSV/XLSX).

  Strategy:
  - Read CSV/XLSX (one row per hospital).
  - Normalize hospital name for fuzzy matching at runtime.
  - Idempotent UPSERT on (license_number).

  Run: node verticals/intuitive/scripts/ingest-florida-ahca.js --file=/path/to/florida_hospitals_2024.csv

  TODO: When CA OSHPD, TX DSHS, NY SPARCS connectors are added, mirror this script for each state.
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

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`[ingest-florida-ahca] starting`);
  await sequelize.authenticate();
  await models.IntuitiveFloridaAhcaHospital.sync();

  if (!FILE) {
    console.warn('[ingest-florida-ahca] No --file specified. Download the latest Florida hospital characteristics file from');
    console.warn('              https://ahca.myflorida.com/health-care-policy-and-oversight/bureau-of-health-facility-regulation');
    console.warn('              then run: node ingest-florida-ahca.js --file=/path/to/florida_hospitals.csv');
    console.warn('[ingest-florida-ahca] For initial deployment, the table is stubbed empty; the connector will gracefully return null until ingestion runs.');
    await sequelize.close();
    return;
  }

  const { parse } = require('csv-parse');
  let scanned = 0;
  let upserted = 0;

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true });
    parser.on('readable', async () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        const name = r.HOSPITAL_NAME || r.hospital_name || r.FACILITY_NAME || r.NAME || null;
        if (!name) continue;
        try {
          await models.IntuitiveFloridaAhcaHospital.upsert({
            provider_id: r.CCN || r.PROVIDER_ID || r.provider_id || null,
            license_number: r.LICENSE_NUM || r.LICENSE || r.license_number || null,
            hospital_name: name,
            hospital_name_normalized: normalizeName(name),
            licensed_beds: Number(r.LICENSED_BEDS || r.licensed_beds || 0),
            staffed_beds: Number(r.STAFFED_BEDS || r.staffed_beds || 0),
            hospital_type: r.HOSPITAL_TYPE || r.TYPE || r.hospital_type || null,
            ownership: r.OWNERSHIP || r.ownership || null,
            total_or_count: Number(r.OR_COUNT || r.OPERATING_ROOMS || 0),
            total_admissions: Number(r.TOTAL_ADMISSIONS || r.ADMISSIONS || 0),
            fiscal_year: Number(r.FISCAL_YEAR || r.YEAR || YEAR),
            ingested_at: new Date(),
          });
          upserted++;
          if (upserted % 50 === 0) console.log(`[ingest-florida-ahca] upserted ${upserted}`);
        } catch (e) {
          // ignore individual row errors
        }
      }
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    fs.createReadStream(FILE).pipe(parser);
  });

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_florida_ahca_hospitals');
  console.log(`[ingest-florida-ahca] done. ${scanned} scanned, ${upserted} upserted, table now has ${rows[0].c} rows`);
  await sequelize.close();
}

main().catch(err => { console.error('[ingest-florida-ahca] FATAL:', err); process.exit(1); });
