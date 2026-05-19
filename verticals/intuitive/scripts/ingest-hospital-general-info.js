'use strict';

/*
  ingest-hospital-general-info.js — populate intuitive_hospitals from CMS
  "Hospital General Information" (dataset id xubh-q36u).

  Source: https://data.cms.gov/provider-data/dataset/xubh-q36u
  File: Hospital_General_Information.csv (~1.4 MB, ~5,400 rows)

  Run:
    node verticals/intuitive/scripts/ingest-hospital-general-info.js --file=/tmp/hospital_general_info.csv
    node verticals/intuitive/scripts/ingest-hospital-general-info.js --url=https://data.cms.gov/.../Hospital_General_Information.csv
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
const FILE = args.file;
const URL = args.url;

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function downloadToTmp(url) {
  return new Promise((resolve, reject) => {
    const tmp = path.join('/tmp', `hospital-gi-${Date.now()}.csv`);
    const out = fs.createWriteStream(tmp);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return downloadToTmp(res.headers.location).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(tmp); });
    }).on('error', reject);
  });
}

async function main() {
  console.log('[ingest-hospital-general-info] starting');
  await sequelize.authenticate();
  await models.IntuitiveHospital.sync();

  let filePath = FILE;
  if (!filePath && URL) {
    filePath = await downloadToTmp(URL);
    console.log(`[ingest-hospital-general-info] downloaded to ${filePath}`);
  }
  if (!filePath) {
    console.warn('[ingest-hospital-general-info] No --file or --url');
    await sequelize.close();
    return;
  }

  const { parse } = require('csv-parse');
  let scanned = 0;
  const batch = [];

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
    parser.on('readable', () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        const ccn = String(r['Facility ID'] || r.ccn || '').trim();
        const name = (r['Facility Name'] || r.facility_name || '').trim();
        if (!ccn || !name) continue;
        batch.push({
          ccn, facility_name: name,
          facility_name_normalized: normalize(name),
          address: r.Address || null,
          city: r['City/Town'] || r.City || null,
          state: (r.State || '').slice(0, 2) || null,
          zip: r['ZIP Code'] || r.ZIP || null,
          county: r['County/Parish'] || r.County || null,
          telephone: r['Telephone Number'] || null,
          hospital_type: r['Hospital Type'] || null,
          hospital_ownership: r['Hospital Ownership'] || null,
          emergency_services: /yes|true/i.test(r['Emergency Services'] || ''),
          overall_rating: r['Hospital overall rating'] || null,
          ingested_at: new Date(),
        });
      }
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    fs.createReadStream(filePath).pipe(parser);
  });

  await models.IntuitiveHospital.bulkCreate(batch, {
    updateOnDuplicate: ['facility_name', 'facility_name_normalized', 'address', 'city', 'state', 'zip',
      'county', 'telephone', 'hospital_type', 'hospital_ownership', 'emergency_services', 'overall_rating', 'ingested_at'],
  });

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_hospitals');
  console.log(`[ingest-hospital-general-info] done. ${scanned} scanned, ${batch.length} upserted. Table now has ${rows[0].c} rows.`);

  if (URL && filePath.startsWith('/tmp/')) { try { fs.unlinkSync(filePath); } catch(e){} }
  await sequelize.close();
}

main().catch(err => { console.error('[ingest-hospital-general-info] FATAL:', err); process.exit(1); });
