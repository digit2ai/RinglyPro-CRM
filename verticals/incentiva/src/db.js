'use strict';

/**
 * BuyersLine database connection.
 *
 * INCENTIVA_DATABASE_URL first: the venture is a DIGIT2AI and agent partnership and
 * its data should be separable onto its own Postgres instance without a code
 * change. Until that instance exists it falls back to the CRM database, where
 * every table carries the nca_ prefix.
 */

const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

const url = process.env.INCENTIVA_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL || null;

const sequelize = url
  ? new Sequelize(url, {
      dialect: 'postgres',
      dialectOptions: /localhost|127\.0\.0\.1/.test(url) ? {} : { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    })
  : null;

const MIGRATION = path.join(__dirname, '..', 'migrations', '20260913_incentiva_tables.sql');
const LOCK_KEY = 913_2026_77; // advisory lock so two instances booting together don't race the DDL

let ready = null;
let lastError = null;

function ensureSchema() {
  if (!sequelize) {
    lastError = new Error('No database URL configured');
    return Promise.reject(lastError);
  }
  if (!ready) {
    ready = (async () => {
      const sql = fs.readFileSync(MIGRATION, 'utf8');
      await sequelize.query('SELECT pg_advisory_lock(' + LOCK_KEY + ')');
      try {
        await sequelize.query(sql);
      } finally {
        await sequelize.query('SELECT pg_advisory_unlock(' + LOCK_KEY + ')');
      }
      lastError = null;
      return true;
    })().catch((e) => { lastError = e; ready = null; throw e; });
  }
  return ready;
}

async function q(sql, replacements = {}) {
  await ensureSchema();
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

async function exec(sql, replacements = {}, transaction) {
  await ensureSchema();
  const [rows] = await sequelize.query(sql, { replacements, transaction });
  return rows;
}

async function one(sql, replacements = {}) {
  const rows = await q(sql, replacements);
  return rows[0] || null;
}

module.exports = { sequelize, ensureSchema, q, one, exec, dbError: () => lastError, configured: !!sequelize };
