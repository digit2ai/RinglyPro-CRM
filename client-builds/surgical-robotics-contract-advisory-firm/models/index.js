// =====================================================
// models/index.js — Sequelize init, lazy and never fatal.
//
// WHICH DATABASE: `DATABASE_URL`. On production `CRM_DATABASE_URL` points at a
// DIFFERENT database, and the client-builds convention in this repo is
// `DATABASE_URL`. The fallback to `CRM_DATABASE_URL` exists only so a laptop
// with one of the two configured still gets Postgres; production has both, and
// `DATABASE_URL` wins there deliberately.
//
// DEGRADE, NEVER DIE. No connection string, or a failed handshake, drops the
// store to an in-memory implementation behind an identical interface. The
// calculator is the product; persistence is a convenience. `/health` reports
// which backend actually won, so "it saved" and "it did not save" are never
// ambiguous.
// =====================================================

'use strict';

const { Sequelize } = require('sequelize');

const SERVICE = 'surgical-robotics-contract-advisory-firm';

let sequelize = null;
let initPromise = null;
const models = { Scenario: null, MagicToken: null };
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

function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const seq = getSequelize();
    if (!seq) {
      state.error = 'DATABASE_URL not set';
      console.error(`[${SERVICE}] no DATABASE_URL — scenarios are in-memory only for this process`);
      return state;
    }
    try {
      await seq.authenticate();
      const { defineScenario } = require('./scenario');
      const { defineMagicToken } = require('./magicToken');
      models.Scenario = defineScenario(seq);
      models.MagicToken = defineMagicToken(seq);
      await models.Scenario.sync();
      await models.MagicToken.sync();

      // sync() will not add indexes to a table that already exists, so they are
      // created idempotently and by explicit name. Auto-generated names built
      // from the full slug would have overflowed the 63-byte identifier limit.
      await seq.query('CREATE INDEX IF NOT EXISTS idx_srcaf_scenarios_tenant ON srcaf_scenarios (tenant_id)');
      await seq.query('CREATE INDEX IF NOT EXISTS idx_srcaf_tokens_tenant ON srcaf_magic_tokens (tenant_id)');
      await seq.query('CREATE INDEX IF NOT EXISTS idx_srcaf_tokens_token ON srcaf_magic_tokens (token)');

      state.ready = true;
      state.backend = 'postgres';
      console.log(`[${SERVICE}] postgres store ready`);
    } catch (err) {
      state.error = err.message;
      console.error(`[${SERVICE}] postgres unavailable (${err.message}) — falling back to in-memory store`);
    }
    return state;
  })();
  return initPromise;
}

module.exports = { init, getSequelize, models, state, SERVICE };
