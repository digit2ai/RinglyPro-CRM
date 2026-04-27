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

async function ensureTasks(prefix) {
  const tbl = `${prefix}_project_tasks`;
  if (await tableExists(tbl)) { console.log(`  ${tbl}: exists`); return; }
  await seq.query(`
    CREATE TABLE ${tbl} (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
      title VARCHAR(300) NOT NULL,
      description TEXT,
      status VARCHAR(30) DEFAULT 'todo',
      assignee_member_id INT REFERENCES ${prefix}_members(id),
      milestone_id INT,
      priority VARCHAR(20) DEFAULT 'medium',
      due_date DATE,
      created_by_member_id INT NOT NULL REFERENCES ${prefix}_members(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await seq.query(`CREATE INDEX ${tbl}_proj_idx ON ${tbl}(project_id, status)`);
  console.log(`  + ${tbl}: created`);
}

async function ensureMilestones(prefix) {
  const tbl = `${prefix}_project_milestones`;
  if (await tableExists(tbl)) { console.log(`  ${tbl}: exists`); return; }
  await seq.query(`
    CREATE TABLE ${tbl} (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
      title VARCHAR(300) NOT NULL,
      description TEXT,
      target_month INT,
      target_date DATE,
      budget_allocation_usd NUMERIC(12,2),
      escrow_status VARCHAR(30),
      stripe_escrow_id VARCHAR(200),
      status VARCHAR(30) DEFAULT 'planned',
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log(`  + ${tbl}: created`);
}

async function ensureMessages(prefix) {
  const tbl = `${prefix}_project_messages`;
  if (await tableExists(tbl)) { console.log(`  ${tbl}: exists`); return; }
  await seq.query(`
    CREATE TABLE ${tbl} (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
      member_id INT NOT NULL REFERENCES ${prefix}_members(id),
      body TEXT NOT NULL,
      attachment_url VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await seq.query(`CREATE INDEX ${tbl}_proj_idx ON ${tbl}(project_id, created_at DESC)`);
  console.log(`  + ${tbl}: created`);
}

async function ensureDocs(prefix) {
  const tbl = `${prefix}_project_documents`;
  if (await tableExists(tbl)) { console.log(`  ${tbl}: exists`); return; }
  await seq.query(`
    CREATE TABLE ${tbl} (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES ${prefix}_projects(id) ON DELETE CASCADE,
      uploaded_by_member_id INT NOT NULL REFERENCES ${prefix}_members(id),
      title VARCHAR(300) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      doc_type VARCHAR(50),
      visibility VARCHAR(30) DEFAULT 'participants',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log(`  + ${tbl}: created`);
}

(async () => {
  console.log('PR-4 / Stage 3 migration starting...\n');
  for (const prefix of PREFIXES) {
    console.log(`Prefix: ${prefix}`);
    if (!(await tableExists(`${prefix}_projects`))) { console.log('  SKIP'); continue; }
    await ensureTasks(prefix);
    await ensureMilestones(prefix);
    await ensureMessages(prefix);
    await ensureDocs(prefix);
    console.log('');
  }
  await seq.close();
  console.log('Migration complete.');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
