#!/usr/bin/env node
/**
 * P2B Phase Flow -- PR-A migration
 * Adds recruitment_deadline + Monte Carlo cache columns.
 */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const PREFIXES = ['hispamind', 'pacccfl', 'pcci'];

async function tableExists(table) {
  const [r] = await seq.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = :t LIMIT 1`,
    { replacements: { t: table }, type: QueryTypes.SELECT }
  );
  return !!r;
}
async function colExists(table, col) {
  const [r] = await seq.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c LIMIT 1`,
    { replacements: { t: table, c: col }, type: QueryTypes.SELECT }
  );
  return !!r;
}
async function addCol(tbl, col, ddl) {
  if (!(await tableExists(tbl))) { console.log(`  - ${tbl}: SKIP`); return; }
  if (await colExists(tbl, col)) { console.log(`  - ${tbl}.${col}: exists`); return; }
  await seq.query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${ddl}`);
  console.log(`  + ${tbl}.${col} added`);
}

(async () => {
  console.log('PR-A migration starting...\n');
  for (const prefix of PREFIXES) {
    console.log(`Prefix: ${prefix}_projects`);
    const tbl = `${prefix}_projects`;
    await addCol(tbl, 'recruitment_deadline', 'TIMESTAMPTZ');
    await addCol(tbl, 'recruitment_closed_at', 'TIMESTAMPTZ');
    await addCol(tbl, 'recruitment_closed_by', 'VARCHAR(20)');
    await addCol(tbl, 'monte_carlo_result', 'JSONB');
    await addCol(tbl, 'monte_carlo_at', 'TIMESTAMPTZ');
    console.log('');
  }
  await seq.close();
  console.log('Migration complete.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
