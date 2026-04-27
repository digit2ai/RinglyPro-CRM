#!/usr/bin/env node
/**
 * P2B Enhancement -- Stage 1 migration
 * Adds project_invitations table + role_title/role_index/invitation_id columns
 * to project_members.
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

async function ensureInvitationsTable(prefix) {
  const tbl = `${prefix}_project_invitations`;
  if (await tableExists(tbl)) {
    console.log(`  ${tbl}: already exists`);
    return;
  }
  await seq.query(`
    CREATE TABLE ${tbl} (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
      member_id INT NOT NULL REFERENCES ${prefix}_members(id),
      role_index INT NOT NULL,
      role_title VARCHAR(200),
      status VARCHAR(30) DEFAULT 'pending',
      match_score NUMERIC(4,3),
      invited_by_member_id INT REFERENCES ${prefix}_members(id),
      invited_at TIMESTAMPTZ DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      message TEXT,
      UNIQUE (project_id, member_id, role_index)
    )
  `);
  console.log(`  + ${tbl}: created`);
}

async function ensureProjectMembersColumns(prefix) {
  const tbl = `${prefix}_project_members`;
  if (!(await tableExists(tbl))) {
    console.log(`  ${tbl}: SKIP (table missing)`);
    return;
  }
  if (!(await colExists(tbl, 'role_title'))) {
    await seq.query(`ALTER TABLE ${tbl} ADD COLUMN role_title VARCHAR(200)`);
    console.log(`  + ${tbl}.role_title added`);
  }
  if (!(await colExists(tbl, 'role_index'))) {
    await seq.query(`ALTER TABLE ${tbl} ADD COLUMN role_index INT`);
    console.log(`  + ${tbl}.role_index added`);
  }
  if (!(await colExists(tbl, 'invitation_id'))) {
    await seq.query(`ALTER TABLE ${tbl} ADD COLUMN invitation_id INT REFERENCES ${prefix}_project_invitations(id)`);
    console.log(`  + ${tbl}.invitation_id added`);
  }
}

(async () => {
  console.log('PR-2 / Stage 1 migration starting...\n');
  for (const prefix of PREFIXES) {
    console.log(`Prefix: ${prefix}`);
    if (!(await tableExists(`${prefix}_projects`))) {
      console.log(`  SKIP (no ${prefix}_projects)`);
      continue;
    }
    await ensureInvitationsTable(prefix);
    await ensureProjectMembersColumns(prefix);
    console.log('');
  }

  await seq.close();
  console.log('Migration complete.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
