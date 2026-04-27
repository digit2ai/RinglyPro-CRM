#!/usr/bin/env node
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const PREFIXES = ['hispamind', 'pacccfl', 'pcci'];

async function tableExists(t) {
  const [r] = await seq.query(`SELECT 1 FROM information_schema.tables WHERE table_name = :t LIMIT 1`, { replacements: { t }, type: QueryTypes.SELECT });
  return !!r;
}
async function colExists(t, c) {
  const [r] = await seq.query(`SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c LIMIT 1`, { replacements: { t, c }, type: QueryTypes.SELECT });
  return !!r;
}

(async () => {
  console.log('PR-C migration starting...\n');
  for (const prefix of PREFIXES) {
    const tbl = `${prefix}_project_milestones`;
    if (!(await tableExists(tbl))) { console.log(`SKIP ${tbl}`); continue; }
    if (!(await colExists(tbl, 'lead_member_ids'))) {
      await seq.query(`ALTER TABLE ${tbl} ADD COLUMN lead_member_ids INT[] DEFAULT '{}'::int[]`);
      console.log(`  + ${tbl}.lead_member_ids added`);
    } else { console.log(`  ${tbl}.lead_member_ids exists`); }
    if (!(await colExists(tbl, 'created_by_member_id'))) {
      await seq.query(`ALTER TABLE ${tbl} ADD COLUMN created_by_member_id INT REFERENCES ${prefix}_members(id)`);
      console.log(`  + ${tbl}.created_by_member_id added`);
    } else { console.log(`  ${tbl}.created_by_member_id exists`); }
  }
  await seq.close();
  console.log('Migration complete.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
