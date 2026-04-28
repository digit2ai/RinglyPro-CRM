#!/usr/bin/env node
/**
 * PR-1: Create chambers table + unified tenant tables with chamber_id FK
 *
 * Uses hispamind_* tables as the schema source (they're the canonical layout).
 * For each prefix table, generates a CREATE TABLE for the unified name with
 * a chamber_id INT NOT NULL FK prepended.
 */
require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const SOURCE_PREFIX = 'hispamind';
const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

function pgType(col) {
  // Map information_schema column rows to a CREATE TABLE type clause
  const t = col.data_type;
  const udt = col.udt_name;
  if (t === 'ARRAY') {
    // _text -> text[], _int4 -> int[], etc.
    const inner = udt.replace(/^_/, '');
    const map = { text: 'TEXT', int4: 'INTEGER', int8: 'BIGINT', varchar: 'VARCHAR' };
    return (map[inner] || inner.toUpperCase()) + '[]';
  }
  if (t === 'character varying') return 'VARCHAR' + (col.character_maximum_length ? `(${col.character_maximum_length})` : '');
  if (t === 'character') return 'CHAR' + (col.character_maximum_length ? `(${col.character_maximum_length})` : '');
  if (t === 'integer') return 'INTEGER';
  if (t === 'bigint') return 'BIGINT';
  if (t === 'smallint') return 'SMALLINT';
  if (t === 'numeric') return 'NUMERIC';
  if (t === 'real') return 'REAL';
  if (t === 'double precision') return 'DOUBLE PRECISION';
  if (t === 'boolean') return 'BOOLEAN';
  if (t === 'text') return 'TEXT';
  if (t === 'date') return 'DATE';
  if (t === 'timestamp without time zone') return 'TIMESTAMP';
  if (t === 'timestamp with time zone') return 'TIMESTAMPTZ';
  if (t === 'jsonb') return 'JSONB';
  if (t === 'json') return 'JSON';
  if (t === 'uuid') return 'UUID';
  return t.toUpperCase();
}

function defaultClause(col) {
  if (col.column_default === null) return '';
  // Strip the old prefix's sequence reference (we'll auto-create new sequences via SERIAL)
  if (col.column_default.startsWith('nextval')) return ''; // handled by SERIAL replacement
  return ` DEFAULT ${col.column_default}`;
}

async function main() {
  console.log('[PR-1] Connecting...');
  await sequelize.authenticate();
  console.log('[PR-1] Connected.');

  // Step 1: chambers table + slug sequence
  console.log('[PR-1] Creating chambers table + slug sequence...');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS chambers (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      brand_domain VARCHAR(100) NOT NULL DEFAULT 'camaravirtual.app',
      primary_language VARCHAR(2) NOT NULL DEFAULT 'es',
      country VARCHAR(50),
      description TEXT,
      logo_url VARCHAR(500),
      contact_email VARCHAR(200) NOT NULL,
      owner_member_id INT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      stripe_customer_id VARCHAR(100),
      stripe_subscription_id VARCHAR(100),
      setup_fee_paid_at TIMESTAMPTZ,
      subscription_status VARCHAR(20),
      next_billing_at TIMESTAMPTZ,
      monthly_amount_cents INT DEFAULT 9900,
      setup_fee_cents INT DEFAULT 15000,
      theme_config JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chambers_slug ON chambers(slug);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chambers_brand_domain ON chambers(brand_domain);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chambers_status ON chambers(status);`);
  await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS chamber_slug_seq START 101 INCREMENT 1;`);
  console.log('[PR-1] chambers table + sequence ready.');

  // Step 2: Discover prefix tables
  const tables = await sequelize.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '${SOURCE_PREFIX}\\_%' ORDER BY tablename`,
    { type: QueryTypes.SELECT }
  );
  console.log(`[PR-1] Found ${tables.length} ${SOURCE_PREFIX}_* tables to mirror.`);

  // Step 3: For each, generate unified CREATE TABLE
  for (const { tablename } of tables) {
    const unifiedName = tablename.replace(new RegExp(`^${SOURCE_PREFIX}_`), '');
    if (unifiedName === 'members') {
      // members handled specially -- chambers FK needs members FK after
      // but to preserve order, we still create members first
    }

    // Read columns from source
    const cols = await sequelize.query(
      `SELECT column_name, data_type, udt_name, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=:t
       ORDER BY ordinal_position`,
      { replacements: { t: tablename }, type: QueryTypes.SELECT }
    );

    const colDefs = ['chamber_id INTEGER NOT NULL REFERENCES chambers(id) ON DELETE CASCADE'];
    for (const col of cols) {
      let type = pgType(col);
      // The id column uses SERIAL replacing the inherited prefix sequence
      if (col.column_name === 'id' && col.column_default && col.column_default.includes('nextval')) {
        colDefs.push(`id SERIAL PRIMARY KEY`);
        continue;
      }
      const nullable = col.is_nullable === 'NO' ? ' NOT NULL' : '';
      const def = defaultClause(col);
      colDefs.push(`${col.column_name} ${type}${nullable}${def}`);
    }

    // Skip if unified table already exists (idempotent)
    const [existing] = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = :t`,
      { replacements: { t: unifiedName }, type: QueryTypes.SELECT }
    );
    if (existing) {
      console.log(`[PR-1] SKIP ${unifiedName} -- already exists`);
      continue;
    }

    const sql = `CREATE TABLE ${unifiedName} (\n  ${colDefs.join(',\n  ')}\n);`;
    try {
      await sequelize.query(sql);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_${unifiedName}_chamber ON ${unifiedName}(chamber_id);`);
      console.log(`[PR-1] CREATED ${unifiedName} (${cols.length} cols + chamber_id)`);
    } catch (e) {
      console.error(`[PR-1] FAILED ${unifiedName}: ${e.message}`);
      console.error('SQL:', sql.substring(0, 500));
      throw e;
    }
  }

  // Add deferred FK from chambers.owner_member_id -> members.id
  await sequelize.query(`
    ALTER TABLE chambers
    DROP CONSTRAINT IF EXISTS fk_chamber_owner;
    ALTER TABLE chambers
    ADD CONSTRAINT fk_chamber_owner FOREIGN KEY (owner_member_id) REFERENCES members(id) ON DELETE SET NULL;
  `);
  console.log('[PR-1] chambers.owner_member_id FK linked to members.id');

  // Add unique constraint on (chamber_id, email) for members
  await sequelize.query(`
    ALTER TABLE members
    DROP CONSTRAINT IF EXISTS uq_members_chamber_email;
    ALTER TABLE members
    ADD CONSTRAINT uq_members_chamber_email UNIQUE (chamber_id, email);
  `).catch(e => console.warn('[PR-1] members chamber-email unique:', e.message));

  console.log('[PR-1] DONE.');
  await sequelize.close();
}

main().catch(e => {
  console.error('[PR-1] FATAL:', e.message);
  process.exit(1);
});
