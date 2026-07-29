// =====================================================
// models/index.js — Sequelize init for the bedtime player.
//
// Lazy, non-fatal: the sub-app must mount and serve /health and the public
// track library even if Postgres is unreachable. When DATABASE_URL is absent
// or the connection fails, the sessions store degrades to an in-memory Map
// behind the exact same interface (see models/session.js), so the routes never
// branch on storage availability.
// =====================================================

'use strict';

const { Sequelize } = require('sequelize');

const SERVICE = 'aplicacion-de-sueno-con-musica-personali';

let sequelize = null;
let initPromise = null;
const state = { ready: false, backend: 'memory', error: null };

function dbUrl() {
  return process.env.DATABASE_URL || process.env.CRM_DATABASE_URL || null;
}

function getSequelize() {
  if (sequelize) return sequelize;
  const url = dbUrl();
  if (!url) return null;
  sequelize = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false,
    pool: { max: 3, min: 0, idle: 10000, acquire: 15000 },
  });
  return sequelize;
}

// Resolves once. Never rejects — callers read `state` to know which backend won.
function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const seq = getSequelize();
    if (!seq) {
      state.error = 'DATABASE_URL not set';
      console.error(`[${SERVICE}] no DATABASE_URL — session history is in-memory only`);
      return state;
    }
    try {
      await seq.authenticate();
      const { defineSession } = require('./session');
      const model = defineSession(seq);
      await model.sync();
      // Idempotent index — sync() will not add it to a pre-existing table.
      await seq.query(
        'CREATE INDEX IF NOT EXISTS idx_aplicacion_sueno_sessions_tenant '
        + 'ON aplicacion_de_sueno_con_musica_personali_sessions (tenant_id)'
      );
      await seq.query(
        'CREATE INDEX IF NOT EXISTS idx_aplicacion_sueno_sessions_anon '
        + 'ON aplicacion_de_sueno_con_musica_personali_sessions (tenant_id, anon_token)'
      );
      state.ready = true;
      state.backend = 'postgres';
      console.log(`[${SERVICE}] postgres session store ready`);
    } catch (err) {
      state.error = err.message;
      console.error(`[${SERVICE}] postgres unavailable (${err.message}) — falling back to in-memory session store`);
    }
    return state;
  })();
  return initPromise;
}

module.exports = { init, getSequelize, state, SERVICE };
