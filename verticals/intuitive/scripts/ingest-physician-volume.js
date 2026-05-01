'use strict';

/*
  ingest-physician-volume.js — populate intuitive_physician_procedure_volume from CMS MPUP.

  CMS Medicare Physician Provider Utilization & Payment Data:
    https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners

  Strategy:
  - Stream-parse the annual CSV (1-3 GB).
  - Filter rows to robotic-relevant HCPCS codes (loaded from data/robotic-cpt-codes.json).
  - Idempotent UPSERT on (npi, fiscal_year, hcpcs_code).

  Run: node verticals/intuitive/scripts/ingest-physician-volume.js --file=/path/to/MUP_PHY_RYY_PYY_NPI_HCPCS.csv [--year=2024]
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
const YEAR = Number(args.year) || new Date().getFullYear() - 2;

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));
const cptLib = require(path.join(__dirname, '..', 'data', 'robotic-cpt-codes.json'));
const ROBOTIC_CPT = new Set(Object.keys(cptLib.codes || {}));

async function main() {
  console.log(`[ingest-physician-volume] starting; tracking ${ROBOTIC_CPT.size} robotic-relevant CPT codes`);
  await sequelize.authenticate();
  await models.IntuitivePhysicianProcedureVolume.sync();

  if (!FILE) {
    console.warn('[ingest-physician-volume] No --file specified. Download the latest MPUP physician+HCPCS CSV from');
    console.warn('              https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners');
    console.warn('              then run: node ingest-physician-volume.js --file=/path/to/MUP_PHY_RYY_PYY_NPI_HCPCS.csv');
    await sequelize.close();
    return;
  }

  const { parse } = require('csv-parse');
  let scanned = 0;
  let matched = 0;
  let upserted = 0;

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true });
    parser.on('readable', async () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        if (scanned % 100000 === 0) console.log(`[ingest-physician-volume] scanned ${scanned}, matched ${matched}, upserted ${upserted}`);
        const hcpcs = String(r.HCPCS_Cd || r.HCPCS_CODE || r.hcpcs_code || '').trim();
        if (!hcpcs || !ROBOTIC_CPT.has(hcpcs)) continue;
        const npi = String(r.Rndrng_NPI || r.NPI || r.npi || '').replace(/\D/g, '');
        if (!npi || npi.length !== 10) continue;
        const yr = Number(r.year || r.Year || YEAR);
        try {
          await models.IntuitivePhysicianProcedureVolume.upsert({
            npi,
            fiscal_year: yr,
            hcpcs_code: hcpcs,
            hcpcs_description: r.HCPCS_Desc || r.hcpcs_description || cptLib.codes[hcpcs]?.description || '',
            place_of_service: r.Place_Of_Srvc || '',
            total_services: Number(r.Tot_Srvcs || r.total_services || 0),
            total_beneficiaries: Number(r.Tot_Benes || r.total_beneficiaries || 0),
            avg_submitted_charge: Number(r.Avg_Sbmtd_Chrg || r.avg_submitted_charge || 0),
            avg_medicare_payment: Number(r.Avg_Mdcr_Pymt_Amt || r.avg_medicare_payment || 0),
            ingested_at: new Date(),
          });
          upserted++;
          matched++;
        } catch (e) {
          // ignore individual row errors, continue
        }
      }
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    fs.createReadStream(FILE).pipe(parser);
  });

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_physician_procedure_volume');
  console.log(`[ingest-physician-volume] done. ${scanned} scanned, ${matched} matched, table now has ${rows[0].c} rows`);
  await sequelize.close();
}

main().catch(err => { console.error('[ingest-physician-volume] FATAL:', err); process.exit(1); });
