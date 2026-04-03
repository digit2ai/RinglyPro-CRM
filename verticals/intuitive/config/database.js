/**
 * INTUITIVE SURGICAL Database Configuration
 * Uses the same PostgreSQL database as RinglyPro CRM
 */

require('dotenv').config();

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    pool: { max: 10, min: 2, acquire: 30000, idle: 10000 }
  }
};
