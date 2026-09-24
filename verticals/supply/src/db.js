'use strict';

/**
 * RinglyPro Supply — database.
 *
 * SUPPLY_DATABASE_URL first, so the product can move to its own Postgres with
 * no code change; until then it lives in the CRM database under the sup_
 * prefix. Every migrations/*.sql runs on boot, in filename order, under one
 * advisory lock, so the migration IS the schema.
 *
 * TENANT ISOLATION IS ENFORCED HERE, NOT IN THE ROUTES. Business code reaches
 * tenant data only through tq / tone / trun, which refuse to run unless the
 * tenant id is a positive integer AND the SQL itself filters on
 * `tenant_id = :tenant`. A query that forgets the predicate throws instead of
 * quietly returning another supplier's rows. The unscoped q / one / run exist
 * for the platform layer (auth, super-admin aggregates, webhook tenant
 * resolution) and SIT greps src/services to keep them out of business code.
 */

const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

const url = process.env.SUPPLY_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL || null;

const sequelize = url
  ? new Sequelize(url, {
      dialect: 'postgres',
      dialectOptions: /localhost|127\.0\.0\.1/.test(url) ? {} : { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    })
  : null;

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const LOCK_KEY = 923_2026_17;
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

// ── Platform (unscoped) ──────────────────────────────────────────────────────
async function q(sql, replacements = {}) {
  await ensureSchema();
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}
async function one(sql, replacements = {}) { return (await q(sql, replacements))[0] || null; }
async function run(sql, replacements = {}) {
  await ensureSchema();
  const [rows] = await sequelize.query(sql, { replacements });
  return Array.isArray(rows) ? rows : [];
}

// ── Tenant-scoped ────────────────────────────────────────────────────────────
const TENANT_PREDICATE = /tenant_id\s*=\s*:tenant\b/;
function guard(tenantId, sql) {
  const t = Number(tenantId);
  if (!Number.isInteger(t) || t <= 0) throw Object.assign(new Error('Tenant scope missing'), { status: 500, code: 'TENANT_SCOPE' });
  // An INSERT carries the tenant as a value, not a predicate.
  if (!/^\s*INSERT\b/i.test(sql) && !TENANT_PREDICATE.test(sql)) {
    throw Object.assign(new Error('Tenant predicate missing from query'), { status: 500, code: 'TENANT_PREDICATE' });
  }
  if (/^\s*INSERT\b/i.test(sql) && !/:tenant\b/.test(sql)) {
    throw Object.assign(new Error('Tenant value missing from insert'), { status: 500, code: 'TENANT_PREDICATE' });
  }
  return t;
}
async function tq(tenantId, sql, params = {}) {
  const t = guard(tenantId, sql);
  return q(sql, Object.assign({}, params, { tenant: t }));
}
async function tone(tenantId, sql, params = {}) { return (await tq(tenantId, sql, params))[0] || null; }
async function trun(tenantId, sql, params = {}) {
  const t = guard(tenantId, sql);
  return run(sql, Object.assign({}, params, { tenant: t }));
}

function status() { return { configured: !!sequelize, error: lastError ? lastError.message : null }; }

module.exports = { sequelize, ensureSchema, q, one, run, tq, tone, trun, guard, status };
