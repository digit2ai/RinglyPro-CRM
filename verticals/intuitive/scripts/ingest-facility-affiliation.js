'use strict';

/*
  ingest-facility-affiliation.js — populate intuitive_surgeon_hospital_affiliations
  from CMS Care Compare's "Facility Affiliation Data" (dataset id 27ea-46a8).

  Source: https://data.cms.gov/provider-data/dataset/27ea-46a8
  CSV columns:
    NPI, Ind_PAC_ID, Provider Last Name, Provider First Name, Provider Middle Name,
    suff, facility_type, Facility Affiliations Certification Number, Facility Type Certification Number

  Each row is one (NPI, facility CCN) affiliation. We keep ALL facility types
  (Hospital, Long-term care, Inpatient rehab, etc.) — the consumer can filter by
  facility_type at query time.

  Strategy:
    - Stream-parse the CSV (~125 MB / ~2.2M rows)
    - Batched bulkCreate with updateOnDuplicate on (npi, facility_ccn)

  Run:
    node verticals/intuitive/scripts/ingest-facility-affiliation.js --file=/tmp/facility_affiliation.csv
    node verticals/intuitive/scripts/ingest-facility-affiliation.js --url=https://data.cms.gov/.../Facility_Affiliation.csv
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

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));

function downloadToTmp(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const tmp = path.join('/tmp', `facility-affiliation-${Date.now()}.csv`);
    const out = fs.createWriteStream(tmp);
    lib.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadToTmp(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes % (25 * 1024 * 1024) < chunk.length) {
          console.log(`[ingest-facility-affiliation] downloaded ${(bytes / (1024 * 1024)).toFixed(0)} MB...`);
        }
      });
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(tmp); });
    }).on('error', reject);
  });
}

async function main() {
  console.log('[ingest-facility-affiliation] starting');
  await sequelize.authenticate();
  await models.IntuitiveSurgeonHospitalAffiliation.sync();

  let filePath = FILE;
  if (!filePath && URL) {
    console.log(`[ingest-facility-affiliation] downloading ${URL}`);
    filePath = await downloadToTmp(URL);
    console.log(`[ingest-facility-affiliation] downloaded to ${filePath}`);
  }
  if (!filePath) {
    console.warn('[ingest-facility-affiliation] No --file or --url specified.');
    console.warn('  Dataset: https://data.cms.gov/provider-data/dataset/27ea-46a8');
    console.warn('  Then run: node ingest-facility-affiliation.js --file=/tmp/facility_affiliation.csv');
    await sequelize.close();
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.error(`[ingest-facility-affiliation] file not found: ${filePath}`);
    await sequelize.close();
    process.exit(1);
  }

  const { parse } = require('csv-parse');
  let scanned = 0;
  let upserted = 0;
  let errored = 0;
  const BATCH = 1000;
  let batch = [];

  async function flush() {
    if (!batch.length) return;
    try {
      await models.IntuitiveSurgeonHospitalAffiliation.bulkCreate(batch, {
        updateOnDuplicate: ['ind_pac_id', 'facility_type', 'surgeon_last_name', 'surgeon_first_name', 'ingested_at'],
      });
      upserted += batch.length;
    } catch (e) {
      errored += batch.length;
      console.error(`[ingest-facility-affiliation] batch error: ${e.message.slice(0, 120)}`);
    }
    batch = [];
  }

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
    parser.on('readable', async () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        if (scanned % 100000 === 0) console.log(`[ingest-facility-affiliation] scanned ${scanned}, upserted ${upserted}, errored ${errored}`);
        const npi = String(r.NPI || r.npi || '').replace(/\D/g, '');
        if (!npi || npi.length !== 10) continue;
        const ccn = String(r['Facility Affiliations Certification Number'] || r['facility_ccn'] || r['Facility CCN'] || '').trim();
        if (!ccn) continue;
        batch.push({
          npi,
          ind_pac_id: String(r.Ind_PAC_ID || r['Ind PAC ID'] || '').trim() || null,
          facility_ccn: ccn,
          facility_type: (r.facility_type || r['Facility Type'] || '').toString().slice(0, 80) || null,
          surgeon_last_name: (r['Provider Last Name'] || r['Last Name'] || '').toString().slice(0, 120) || null,
          surgeon_first_name: (r['Provider First Name'] || r['First Name'] || '').toString().slice(0, 120) || null,
          ingested_at: new Date(),
        });
        if (batch.length >= BATCH) {
          parser.pause();
          await flush();
          parser.resume();
        }
      }
    });
    parser.on('error', reject);
    parser.on('end', async () => {
      await flush();
      resolve();
    });
    fs.createReadStream(filePath).pipe(parser);
  });

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_surgeon_hospital_affiliations');
  console.log(`[ingest-facility-affiliation] done. ${scanned} scanned, ${upserted} upserted, ${errored} errored. Table now has ${rows[0].c} rows.`);

  if (URL && filePath.startsWith('/tmp/')) {
    try { fs.unlinkSync(filePath); console.log(`[ingest-facility-affiliation] removed temp ${filePath}`); } catch (e) { /* ignore */ }
  }
  await sequelize.close();
}

main().catch(err => { console.error('[ingest-facility-affiliation] FATAL:', err); process.exit(1); });
