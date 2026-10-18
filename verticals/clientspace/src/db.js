'use strict';
/**
 * Client Workspace — database connection.
 * CRM_DATABASE_URL || DATABASE_URL, the house convention, which is also the
 * database that holds the CRM `users` table the owner signs in against.
 */
const { Sequelize } = require('sequelize');
const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const sequelize = new Sequelize(url, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});
module.exports = sequelize;
