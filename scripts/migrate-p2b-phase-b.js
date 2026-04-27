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

(async () => {
  console.log('PR-B migration starting...\n');
  for (const prefix of PREFIXES) {
    const tbl = `${prefix}_project_plan_versions`;
    if (!(await tableExists(`${prefix}_projects`))) { console.log(`SKIP ${prefix}`); continue; }
    if (await tableExists(tbl)) { console.log(`  ${tbl}: exists`); continue; }
    await seq.query(`
      CREATE TABLE ${tbl} (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
        plan_json JSONB NOT NULL,
        plan_version_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by_member_id INT REFERENCES ${prefix}_members(id),
        amendment_reason TEXT
      )
    `);
    await seq.query(`CREATE INDEX ${tbl}_proj_idx ON ${tbl}(project_id, created_at DESC)`);
    console.log(`  + ${tbl} created`);
  }
  await seq.close();
  console.log('Migration complete.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
