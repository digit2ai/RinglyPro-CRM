'use strict';
/**
 * Valle Milagro: conexión propia y esquema.
 *
 * La migración ES el esquema: se ejecuta en cada arranque bajo un candado de
 * Postgres, así que no puede quedar distinta de lo que corre. Todas las
 * consultas son SQL directo (sin modelos), para que una columna creada por la
 * migración no pueda quedar sin declarar y leerse como undefined.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');

const URL = process.env.VALLEMILAGRO_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const TENANT = () => parseInt(process.env.VALLEMILAGRO_TENANT_ID || '1', 10);

let sequelize = null;
function db() {
  if (!sequelize) {
    if (!URL) throw new Error('vallemilagro: no hay base de datos configurada');
    sequelize = new Sequelize(URL, {
      dialect: 'postgres',
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });
  }
  return sequelize;
}

async function q(sql, replacements = {}, opts = {}) {
  return db().query(sql, { replacements, type: QueryTypes.SELECT, logging: false, ...opts });
}
async function one(sql, replacements = {}, opts = {}) {
  const rows = await q(sql, replacements, opts);
  return rows[0] || null;
}
/** INSERT/UPDATE/DELETE ... RETURNING: devuelve las filas. */
async function run(sql, replacements = {}, opts = {}) {
  const [rows] = await db().query(sql, { replacements, type: QueryTypes.RAW, logging: false, ...opts });
  return Array.isArray(rows) ? rows : [];
}

let ready = null;
function init() {
  if (!ready) {
    ready = (async () => {
      const dir = path.join(__dirname, '..', 'migrations');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
      const t = await db().transaction();
      try {
        await db().query('SELECT pg_advisory_xact_lock(771009)', { transaction: t, logging: false });
        for (const f of files) {
          await db().query(fs.readFileSync(path.join(dir, f), 'utf8'), { transaction: t, logging: false, raw: true });
        }
        await t.commit();
      } catch (e) {
        await t.rollback();
        ready = null;
        throw e;
      }
      return true;
    })();
  }
  return ready;
}

const secret = () => process.env.VALLEMILAGRO_SESSION_SECRET || process.env.JWT_SECRET || '';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', secret()).update(String(s)).digest('hex');
const ipHash = (req) => {
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();
  return ip ? hmac('ip:' + ip).slice(0, 32) : null;
};

async function audit(tenantId, actorId, action, ref, detail) {
  try {
    await run('INSERT INTO vm_audit (tenant_id, actor_id, action, ref, detail) VALUES (:t, :a, :ac, :r, :d)',
      { t: tenantId, a: actorId || null, ac: action, r: ref == null ? null : String(ref), d: detail ? JSON.stringify(detail) : null });
  } catch (e) { /* la auditoría nunca tumba la operación */ }
}

module.exports = { db, q, one, run, init, TENANT, secret, sha, hmac, ipHash, audit };
