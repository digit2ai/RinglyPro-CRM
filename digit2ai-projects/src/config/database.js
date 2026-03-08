'use strict';

const { Sequelize } = require('sequelize');
require('dotenv').config();

// Use dedicated projects database URL, fallback to main CRM database
const databaseUrl = process.env.PROJECTS_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[D2AI-Projects] No database URL found. Set PROJECTS_DATABASE_URL, CRM_DATABASE_URL, or DATABASE_URL.');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  }
});

const dbSource = process.env.PROJECTS_DATABASE_URL ? 'PROJECTS_DATABASE_URL' : (process.env.CRM_DATABASE_URL ? 'CRM_DATABASE_URL' : 'DATABASE_URL');
console.log(`[D2AI-Projects] Database: ${dbSource}`);

module.exports = sequelize;
