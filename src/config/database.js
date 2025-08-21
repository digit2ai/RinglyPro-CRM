const { Sequelize } = require('sequelize');
require('dotenv').config();

// Database configuration - prioritize CRM database for appointments
const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('No database URL found. Please set CRM_DATABASE_URL or DATABASE_URL environment variable.');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
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

// Log which database is being used
console.log(`Database connection: ${process.env.CRM_DATABASE_URL ? 'CRM_DATABASE_URL' : 'DATABASE_URL'} (${process.env.NODE_ENV || 'development'})`);

module.exports = sequelize;
