'use strict';
/** NeoHaul — conexión. NEOHAUL_DATABASE_URL || CRM_DATABASE_URL || DATABASE_URL. */
const { Sequelize } = require('sequelize');
const url = process.env.NEOHAUL_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const sequelize = new Sequelize(url, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});
module.exports = sequelize;
