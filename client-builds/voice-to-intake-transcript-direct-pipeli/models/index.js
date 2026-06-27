// =====================================================
// Sequelize init from DATABASE_URL
// Voice-to-Intake Transcript Direct Pipeline
//
// Initializes a dedicated Sequelize instance against process.env.DATABASE_URL
// and exposes the intake model. If the DB connection or table sync fails,
// the caller (services/store-backed model) falls back to an in-memory store
// behind the same interface so the sprint is never blocked on the DB.
// =====================================================

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
