'use strict';

/**
 * AgroMercadoDigital — database connection
 * Self-contained Sequelize instance (mirrors the verticals/veritas db pattern).
 * Uses CRM_DATABASE_URL || DATABASE_URL per project convention.
 */

const { Sequelize } = require('sequelize');

const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  },
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});

module.exports = sequelize;
