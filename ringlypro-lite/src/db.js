'use strict';

/**
 * RinglyPro Lite — database connection (ISOLATED).
 *
 * Self-contained Sequelize instance. Intentionally does NOT read
 * CRM_DATABASE_URL so it can never touch the full-RinglyPro production
 * database. On production, LITE_DATABASE_URL MUST point at a separate
 * PostgreSQL database. DATABASE_URL is only a local-dev fallback.
 */

const { Sequelize } = require('sequelize');

const databaseUrl = process.env.LITE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('[lite:db] No LITE_DATABASE_URL/DATABASE_URL set — DB features disabled until configured.');
}

const sequelize = new Sequelize(databaseUrl || 'postgres://localhost/ringlypro_lite_dev', {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  },
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});

module.exports = sequelize;
