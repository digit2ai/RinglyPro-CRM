'use strict';

/**
 * JobUp — database connection.
 * Self-contained Sequelize instance (mirrors the SpeakUp/Veritas/LawnCopilot
 * pattern). Uses CRM_DATABASE_URL || DATABASE_URL per project convention.
 *
 * NOTE: JobUp now shares the CRM database, so every table carries the `ju_`
 * prefix. See src/models/index.js.
 */

const { Sequelize } = require('sequelize');

const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

let sequelize = null;
if (databaseUrl) {
  const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    dialectOptions: isLocal ? {} : { ssl: { require: true, rejectUnauthorized: false } },
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  });
}

// Never fatal: a failed handshake degrades to the in-memory store so the funnel
// and /health stay up.
async function connect() {
  if (!sequelize) return { ok: false, backend: 'memory', reason: 'no CRM_DATABASE_URL/DATABASE_URL' };
  try {
    await sequelize.authenticate();
    return { ok: true, backend: 'postgres' };
  } catch (e) {
    console.warn('[jobup:db] handshake failed, degrading to in-memory:', e.message);
    sequelize = null;
    return { ok: false, backend: 'memory', reason: e.message };
  }
}

module.exports = { sequelize: () => sequelize, connect };
