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

    // Auto-seed belt requirements for schools that don't have any
    try {
      const schools = await db.KanchoSchool.findAll({ attributes: ['id'] });
      const defaultBelts = [
        { belt_name: 'White', belt_color: '#FFFFFF', sort_order: 0, min_classes: 0, min_months: 0, requirements: ['Basic stance and movement','Front kick','Basic blocks'], testing_fee: 0 },
        { belt_name: 'Yellow', belt_color: '#FFD700', sort_order: 1, min_classes: 30, min_months: 3, requirements: ['Roundhouse kick','3 basic kata forms','Basic sparring concepts'], testing_fee: 35 },
        { belt_name: 'Orange', belt_color: '#FF8C00', sort_order: 2, min_classes: 60, min_months: 6, requirements: ['Side kick','Back kick','5 kata forms','Light sparring'], testing_fee: 45 },
        { belt_name: 'Green', belt_color: '#228B22', sort_order: 3, min_classes: 100, min_months: 9, requirements: ['Spinning kicks','8 kata forms','Controlled sparring','Self-defense combinations'], testing_fee: 55 },
        { belt_name: 'Blue', belt_color: '#1E90FF', sort_order: 4, min_classes: 150, min_months: 14, requirements: ['Jump kicks','Advanced combinations','10 kata forms','Full sparring','Board breaking'], testing_fee: 65 },
        { belt_name: 'Purple', belt_color: '#800080', sort_order: 5, min_classes: 200, min_months: 20, requirements: ['Advanced kata forms','Weapons basics','Teaching assist role','Competition participation'], testing_fee: 75 },
        { belt_name: 'Brown', belt_color: '#8B4513', sort_order: 6, min_classes: 280, min_months: 28, requirements: ['Weapons proficiency','Advanced sparring strategies','Teaching lower belts','Written exam'], testing_fee: 85 },
        { belt_name: 'Red', belt_color: '#DC143C', sort_order: 7, min_classes: 350, min_months: 36, requirements: ['Master all kata forms','Advanced weapons','Lead class sessions','Mastery of fundamentals'], testing_fee: 95 },
        { belt_name: 'Black', belt_color: '#000000', sort_order: 8, min_classes: 500, min_months: 48, requirements: ['Create original kata','Full weapons mastery','Teaching certification','Panel review','Written thesis'], testing_fee: 150 }
      ];
      let seeded = 0;
      for (const school of schools) {
        const count = await db.KanchoBeltRequirement.count({ where: { school_id: school.id } });
        if (count === 0) {
          for (const belt of defaultBelts) {
            await db.KanchoBeltRequirement.create({ school_id: school.id, ...belt });
          }
          seeded++;
        }
      }
      if (seeded > 0) console.log('Kancho AI: Seeded belt requirements for ' + seeded + ' schools');
    } catch (beltErr) {
      console.log('Kancho AI: Belt requirements seed skipped:', beltErr.message);
    }
  } catch (error) {
    console.error('Kancho AI: Database sync error:', error.message);
  }
})();

module.exports = db;
