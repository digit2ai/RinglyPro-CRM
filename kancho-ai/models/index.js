// kancho-ai/models/index.js
// Kancho Martial Arts AI - Model loader

'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const db = {};

// Use DATABASE_URL from environment (same as main app)
const sequelize = new Sequelize(process.env.DATABASE_URL, {
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
  }
});

// Import all models in this directory
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Set up associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Auto-sync tables on startup (creates tables if they don't exist)
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Kancho AI: Database connected');

    // Sync all models (creates tables if they don't exist)
    // Using alter: false to avoid modifying existing tables
    await sequelize.sync({ alter: false });
    console.log('Kancho AI: Database tables synced');

    // Bridge columns migration - add columns if they don't exist
    const bridgeMigrations = [
      `ALTER TABLE kancho_schools ADD COLUMN IF NOT EXISTS ringlypro_client_id INTEGER`,
      `ALTER TABLE kancho_schools ADD COLUMN IF NOT EXISTS ringlypro_user_id INTEGER`,
      `ALTER TABLE kancho_schools ADD COLUMN IF NOT EXISTS ronin_member_id INTEGER`,
      `ALTER TABLE clients ADD COLUMN IF NOT EXISTS elevenlabs_agent_id VARCHAR(100)`,
      `ALTER TABLE clients ADD COLUMN IF NOT EXISTS elevenlabs_phone_number_id VARCHAR(100)`
    ];
    for (const sql of bridgeMigrations) {
      try { await sequelize.query(sql); } catch (e) {}
    }
    console.log('Kancho AI: Bridge columns migration complete');
  } catch (error) {
    console.error('Kancho AI: Database sync error:', error.message);
  }
})();

module.exports = db;
