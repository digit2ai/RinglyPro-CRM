#!/usr/bin/env node
/**
 * P2B Enhancement -- Stage 0 migration
 * Adds plan_json (JSONB), plan_status, visibility columns to chamber project tables.
 */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const TABLES = ['hispamind_projects', 'pacccfl_projects', 'pcci_projects'];

async function colExists(table, col) {
  const [r] = await seq.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c LIMIT 1`,
    { replacements: { t: table, c: col }, type: QueryTypes.SELECT }
  );
  return !!r;
}

async function tableExists(table) {
  const [r] = await seq.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = :t LIMIT 1`,
    { replacements: { t: table }, type: QueryTypes.SELECT }
  );
  return !!r;
}

async function addColumn(table, col, ddl) {
  if (!(await tableExists(table))) {
    console.log(`  - ${table}: SKIP (table missing)`);
    return;
  }
  if (await colExists(table, col)) {
    console.log(`  - ${table}.${col}: already exists`);
    return;
  }
  await seq.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  console.log(`  + ${table}.${col} added`);
}

(async () => {
  console.log('PR-1 / Stage 0 migration starting...\n');
  for (const t of TABLES) {
    console.log(`Table: ${t}`);
    await addColumn(t, 'plan_json', 'JSONB');
    await addColumn(t, 'plan_status', "VARCHAR(30) DEFAULT 'draft'");
    await addColumn(t, 'visibility', "VARCHAR(30) DEFAULT 'public_plan'");
    console.log('');
  }

  // Verify
  console.log('Verification:');
  for (const t of TABLES) {
    if (!(await tableExists(t))) continue;
    const cols = await seq.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = :t AND column_name IN ('plan_json','plan_status','visibility')
       ORDER BY column_name`,
      { replacements: { t }, type: QueryTypes.SELECT }
    );
    console.log(`  ${t}:`, cols.map(c => `${c.column_name}(${c.data_type})`).join(', '));
  }

  await seq.close();
  console.log('\nMigration complete.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
