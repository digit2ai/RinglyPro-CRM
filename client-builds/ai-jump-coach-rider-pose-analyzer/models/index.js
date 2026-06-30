// =====================================================
// Sequelize init from DATABASE_URL — AI Jump Coach Rider Pose Analyzer.
//
// Dedicated Sequelize instance against process.env.DATABASE_URL. If the DB is
// unreachable (or AIJUMP_FORCE_MEMORY=1 for SIT), the model layer falls back to
// an in-memory store behind the same interface so the sprint is never blocked.
// =====================================================

'use strict';

const { Sequelize } = require('sequelize');

let sequelize = null;

function getSequelize() {
  if (sequelize) return sequelize;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  sequelize = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false,
    pool: { max: 3, min: 0, idle: 10000 }
  });
  return sequelize;
}

module.exports = { getSequelize };
