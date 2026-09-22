'use strict';

/**
 * LevelUp Media Marketing — database.
 *
 * LEVELUP_DATABASE_URL first so the product can move to its own Postgres with
 * no code change; until then it lives in the CRM database under the lu_ prefix.
 * Every migrations/*.sql runs on boot, in filename order, under one advisory
 * lock, so the migration IS the schema and cannot drift. Each file must stay
 * idempotent.
 */

const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

const url = process.env.LEVELUP_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL || null;

const sequelize = url
  ? new Sequelize(url, {
      dialect: 'postgres',
      dialectOptions: /localhost|127\.0\.0\.1/.test(url) ? {} : { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    })
  : null;

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const LOCK_KEY = 922_2026_31;
let ready = null;
let lastError = null;

function ensureSchema() {
  if (!sequelize) { lastError = new Error('No database URL configured'); return Promise.reject(lastError); }
  if (!ready) {
    ready = (async () => {
      await sequelize.query('SELECT pg_advisory_lock(' + LOCK_KEY + ')');
      try {
        const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{8}_.*\.sql$/.test(f)).sort();
        for (const f of files) await sequelize.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      } finally {
        await sequelize.query('SELECT pg_advisory_unlock(' + LOCK_KEY + ')');
      }
      lastError = null;
      return true;
    })().catch((e) => { lastError = e; ready = null; throw e; });
  }
  return ready;
}

/** SELECT — returns rows. */
async function q(sql, replacements = {}) {
  await ensureSchema();
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}
/** First row or null. */
async function one(sql, replacements = {}) {
  const rows = await q(sql, replacements);
  return rows[0] || null;
}
/** INSERT/UPDATE/DELETE ... RETURNING — returns rows. */
async function run(sql, replacements = {}) {
  await ensureSchema();
  const [rows] = await sequelize.query(sql, { replacements });
  return Array.isArray(rows) ? rows : [];
}

function status() { return { configured: !!sequelize, error: lastError ? lastError.message : null }; }

module.exports = { sequelize, ensureSchema, q, one, run, status };
