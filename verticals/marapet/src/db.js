'use strict';
/**
 * MaraPet: its own connection and its own schema.
 *
 * THE MIGRATION IS THE SCHEMA. Every file in ../migrations runs in filename
 * order on first use, inside a Postgres advisory lock so two instances booting
 * together cannot race, which is why every statement in them is idempotent.
 *
 * Every query here is raw SQL. There are no models on purpose: a column created
 * by a migration and not declared on a model reads as `undefined` and fails
 * silently rather than throwing, which is how eight outbound_* columns went
 * unread in RinglyPro Lite for a week. With no model there is nothing to
 * forget to declare.
 */
const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

const URL = () =>
  process.env.MARAPET_DATABASE_URL ||
  process.env.CRM_DATABASE_URL ||
  process.env.DATABASE_URL ||
  '';

const LOCK_ID = 0x4d415250; // 'MARP'

let sequelize = null;
let migrated = null;

function configured() {
  return Boolean(URL());
}

function db() {
  if (!sequelize) {
    const url = URL();
    if (!url) throw new Error('marapet: no database configured');
    sequelize = new Sequelize(url, {
      dialect: 'postgres',
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });
  }
  return sequelize;
}

/** Test seam: the SIT swaps in an in-memory store rather than reaching Postgres. */
function _setSequelize(s) {
  sequelize = s;
  migrated = Promise.resolve();
}

async function migrate() {
  if (migrated) return migrated;
  migrated = (async () => {
    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const s = db();
    await s.query('SELECT pg_advisory_lock(:id)', { replacements: { id: LOCK_ID }, logging: false });
    try {
      for (const f of files) {
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        await s.query(sql, { logging: false });
      }
    } finally {
      await s.query('SELECT pg_advisory_unlock(:id)', { replacements: { id: LOCK_ID }, logging: false });
    }
  })().catch((e) => {
    migrated = null; // a failed migration must be retried, not cached as done
    throw e;
  });
  return migrated;
}

async function q(sql, replacements = {}) {
  await migrate();
  return db().query(sql, { replacements, type: QueryTypes.SELECT, logging: false });
}

async function one(sql, replacements = {}) {
  const rows = await q(sql, replacements);
  return rows[0] || null;
}

/** INSERT/UPDATE/DELETE ... RETURNING -> rows. */
async function run(sql, replacements = {}) {
  await migrate();
  const [rows] = await db().query(sql, { replacements, logging: false });
  return Array.isArray(rows) ? rows : [];
}

async function event(tenant_id, account_id, kind, detail) {
  try {
    await run(
      `INSERT INTO mp_events (tenant_id, account_id, kind, detail)
       VALUES (:tenant_id, :account_id, :kind, CAST(:detail AS JSONB))`,
      { tenant_id, account_id: account_id || null, kind, detail: JSON.stringify(detail || {}) }
    );
  } catch (_) {
    /* an audit write must never fail the request it is auditing */
  }
}

module.exports = { configured, db, migrate, q, one, run, event, _setSequelize };
