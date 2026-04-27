#!/usr/bin/env node
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

async function ensureMeetingsTable(prefix) {
  const tbl = `${prefix}_project_meetings`;
  if (await tableExists(tbl)) { console.log(`  ${tbl}: exists`); return; }
  await seq.query(`
    CREATE TABLE ${tbl} (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
      meeting_type VARCHAR(50) NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      duration_minutes INT DEFAULT 60,
      video_link VARCHAR(500),
      ical_event_uid VARCHAR(200),
      attendees INT[] NOT NULL,
      status VARCHAR(30) DEFAULT 'scheduled',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log(`  + ${tbl}: created`);
}

async function ensureSignoffsTable(prefix) {
  const tbl = `${prefix}_project_signoffs`;
  if (await tableExists(tbl)) { console.log(`  ${tbl}: exists`); return; }
  await seq.query(`
    CREATE TABLE ${tbl} (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
      member_id INT NOT NULL REFERENCES ${prefix}_members(id),
      signed_at TIMESTAMPTZ DEFAULT NOW(),
      plan_version_hash VARCHAR(64),
      signature_method VARCHAR(30),
      signature_payload TEXT,
      ip_address VARCHAR(50),
      user_agent VARCHAR(500),
      UNIQUE (project_id, member_id)
    )
  `);
  console.log(`  + ${tbl}: created`);
}

(async () => {
  console.log('PR-3 / Stage 2 migration starting...\n');
  for (const prefix of PREFIXES) {
    console.log(`Prefix: ${prefix}`);
    if (!(await tableExists(`${prefix}_projects`))) { console.log(`  SKIP`); continue; }
    await ensureMeetingsTable(prefix);
    await ensureSignoffsTable(prefix);
    console.log('');
  }
  await seq.close();
  console.log('Migration complete.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
