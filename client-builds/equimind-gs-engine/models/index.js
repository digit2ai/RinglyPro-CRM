// =====================================================
// Sequelize instance for the GS engine. Uses CRM_DATABASE_URL || DATABASE_URL
// (same DB as the EquiMind account/credit system, so credit ops are consistent).
// =====================================================
'use strict';

const { Sequelize } = require('sequelize');

let sequelize = null;
function getSequelize() {
  if (sequelize) return sequelize;
  const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
  sequelize = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false,
    pool: { max: 4, min: 0, idle: 10000 }
  });
  return sequelize;
}

module.exports = { getSequelize };
