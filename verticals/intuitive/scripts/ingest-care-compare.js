'use strict';

/*
  ingest-care-compare.js — populate intuitive_provider_affiliations from CMS Care Compare
  (formerly Physician Compare; now "Doctors and Clinicians" under data.cms.gov).

  Source dataset: https://data.cms.gov/provider-data/dataset/mj5m-pzi6
  (DAC_NationalDownloadableFile.csv — ~3M rows, ~500MB)

  Strategy:
  - Stream-parse the CSV (memory-safe for the full file)
  - Group rows by NPI (a provider appears once per practice location × hospital affiliation)
  - Upsert one consolidated row per NPI with primary affiliation + all_hospital_affiliations JSONB
  - Idempotent — re-running replaces stale data

  Run:
    node verticals/intuitive/scripts/ingest-care-compare.js --file=/path/to/DAC_NationalDownloadableFile.csv
    node verticals/intuitive/scripts/ingest-care-compare.js --url=https://data.cms.gov/.../DAC_NationalDownloadableFile.csv
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

// Only retain surgical specialties relevant to da Vinci
const SURGICAL_SPECIALTY_KEYWORDS = [
  'SURGERY', 'SURGICAL', 'UROLOGY', 'GYNECOLOG', 'OBSTETRIC',
  'COLON', 'RECTAL', 'THORACIC', 'CARDIOVASCULAR', 'CARDIOTHORACIC',
  'OTOLARYNGOLOGY', 'PLASTIC', 'ONCOLOGY', 'BARIATRIC',
];

function isSurgical(primary, secondary) {
  const blob = `${primary || ''} ${secondary || ''}`.toUpperCase();
  return SURGICAL_SPECIALTY_KEYWORDS.some(k => blob.includes(k));
}

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});
const models = require(path.join(__dirname, '..', 'models'));

function downloadToTmp(url) {
  return new Promise((resolve, reject) => {
    const tmp = path.join('/tmp', `care-compare-${Date.now()}.csv`);
    const out = fs.createWriteStream(tmp);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadToTmp(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes % (50 * 1024 * 1024) < chunk.length) {
          console.log(`[ingest-care-compare] downloaded ${(bytes / (1024 * 1024)).toFixed(0)} MB...`);
        }
      });
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(tmp); });
    }).on('error', reject);
  });
}

async function main() {
  console.log('[ingest-care-compare] starting');
  await sequelize.authenticate();
  await models.IntuitiveProviderAffiliation.sync();

  let filePath = FILE;
  if (!filePath && URL) {
    console.log(`[ingest-care-compare] downloading ${URL}`);
    filePath = await downloadToTmp(URL);
    console.log(`[ingest-care-compare] downloaded to ${filePath}`);
  }
  if (!filePath) {
    console.warn('[ingest-care-compare] No --file or --url specified. Download the latest CMS Care Compare CSV from');
    console.warn('              https://data.cms.gov/provider-data/dataset/mj5m-pzi6');
    console.warn('              then run: node ingest-care-compare.js --file=/path/to/DAC_NationalDownloadableFile.csv');
    await sequelize.close();
    return;
  }

  const { parse } = require('csv-parse');

  let scanned = 0;
  let surgicalRows = 0;
  // Aggregate per-NPI in memory (3M total rows, but only ~300K surgical NPIs after filter — OK in memory)
  const byNpi = new Map();

  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
    parser.on('readable', () => {
      let r;
      while ((r = parser.read()) !== null) {
        scanned++;
        if (scanned % 100000 === 0) console.log(`[ingest-care-compare] scanned ${scanned}, surgical ${surgicalRows}, unique NPIs ${byNpi.size}`);

        // Care Compare column names (DAC_NationalDownloadableFile)
        const npi = String(r.NPI || r.npi || '').replace(/\D/g, '');
        if (!npi || npi.length !== 10) continue;

        const primarySpec = r['pri_spec'] || r['Primary specialty'] || r['Provider Type'] || '';
        const secSpec = r['sec_spec_all'] || r['Secondary specialty'] || '';
        if (!isSurgical(primarySpec, secSpec)) continue;
        surgicalRows++;

        const hospCcn = String(r['Facility ID'] || r['facility_ccn'] || r['hospital_ccn'] || '').trim() || null;
        const hospName = (r['Facility Name'] || r['hospital_name'] || '').trim();
        const hospState = (r['adr_ln_1_st'] || r['State'] || '').trim().slice(0, 2) || null;

        let agg = byNpi.get(npi);
        if (!agg) {
          agg = {
            npi,
            full_name: `${r['frst_nm'] || r['First Name'] || ''} ${r['mid_nm'] ? r['mid_nm'].slice(0,1) + ' ' : ''}${r['lst_nm'] || r['Last Name'] || ''}`.replace(/\s+/g, ' ').trim(),
            credential: r['Cred'] || r['cred'] || '',
            primary_specialty: primarySpec,
            secondary_specialty: secSpec,
            group_pac_id: r['org_pac_id'] || r['Group Practice PAC ID'] || null,
            group_legal_name: r['org_nm'] || r['Group Practice Legal Business Name'] || null,
            group_member_count: Number(r['num_org_mem'] || r['Number of Group Practice members']) || null,
            hospital_ccn: hospCcn,
            hospital_name: hospName || null,
            hospital_state: hospState,
            all_hospital_affiliations: [],
            medical_school: r['Med_sch'] || r['med_school'] || null,
            graduation_year: Number(r['Grd_yr'] || r['graduation_year']) || null,
            practice_state: (r['adr_ln_1_st'] || r['State'] || '').slice(0, 2) || null,
            practice_city: r['Cty'] || r['City'] || null,
            practice_zip: String(r['zip'] || r['Zip Code'] || '').slice(0, 10) || null,
            sex: (r['gndr'] || r['Gender'] || '').slice(0, 1) || null,
          };
          byNpi.set(npi, agg);
        }
        // Track all unique hospital affiliations
        if (hospCcn && !agg.all_hospital_affiliations.find(h => h.ccn === hospCcn)) {
          agg.all_hospital_affiliations.push({ ccn: hospCcn, name: hospName, state: hospState });
        }
      }
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    fs.createReadStream(filePath).pipe(parser);
  });

  console.log(`[ingest-care-compare] aggregation done: ${byNpi.size} unique surgical NPIs from ${scanned} scanned rows`);

  // Bulk upsert in batches of 500
  const all = Array.from(byNpi.values());
  let upserted = 0;
  const BATCH = 500;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    try {
      await models.IntuitiveProviderAffiliation.bulkCreate(batch, {
        updateOnDuplicate: ['full_name', 'credential', 'primary_specialty', 'secondary_specialty',
          'group_pac_id', 'group_legal_name', 'group_member_count',
          'hospital_ccn', 'hospital_name', 'hospital_state', 'all_hospital_affiliations',
          'medical_school', 'graduation_year',
          'practice_state', 'practice_city', 'practice_zip', 'sex', 'ingested_at'],
      });
      upserted += batch.length;
      if (i % 5000 === 0) console.log(`[ingest-care-compare] upserted ${upserted}/${all.length}`);
    } catch (e) {
      console.error(`[ingest-care-compare] batch ${i} error:`, e.message);
    }
  }

  const [rows] = await sequelize.query('SELECT COUNT(*) AS c FROM intuitive_provider_affiliations');
  console.log(`[ingest-care-compare] done. ${scanned} scanned, ${surgicalRows} surgical, ${upserted} upserted, table now has ${rows[0].c} rows`);

  // Clean up temp file if we downloaded
  if (URL && filePath.startsWith('/tmp/')) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }

  await sequelize.close();
}

main().catch(err => { console.error('[ingest-care-compare] FATAL:', err); process.exit(1); });
