// =====================================================
// Sequelize bootstrap — one connection per process.
// Uses CRM_DATABASE_URL || DATABASE_URL (they point at different DBs in prod).
// SSL in production (Render Postgres). Never throws at require-time; the store
// layer calls getSequelize() lazily and falls back to memory on failure.
// =====================================================

const { Sequelize } = require('sequelize');

let sequelize = null;

function getSequelize() {
  if (sequelize) return sequelize;
  const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('CRM_DATABASE_URL / DATABASE_URL not set');
  sequelize = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false,
    pool: { max: 4, min: 0, idle: 10000, acquire: 20000 }
  });
  return sequelize;
}

module.exports = { getSequelize };
