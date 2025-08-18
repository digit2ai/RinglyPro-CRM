// src/models/index.js
const sequelize = require('../config/database');
const Contact = require('./Contact');
const Message = require('./Message');  // ADD THIS LINE

// Define model associations
Contact.hasMany(Message, {
  foreignKey: 'contactId',
  as: 'messages',
  onDelete: 'SET NULL'
});

Message.belongsTo(Contact, {
  foreignKey: 'contactId',
  as: 'contact'
});

// Initialize all models
const models = {
  Contact,
  Message,  // ADD THIS LINE
  sequelize
};

// Sync database (create tables if they don't exist)
const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 Synchronizing database...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Sync models
    await sequelize.sync(options);
    console.log('✅ Database synchronized successfully');

    // Log table creation
    const tableNames = Object.keys(sequelize.models);
    console.log('📋 Active tables:', tableNames.join(', '));

    return true;
  } catch (error) {
    console.error('❌ Database sync error:', error);
    throw error;
  }
};

// Export models and utilities
module.exports = {
  ...models,
  syncDatabase
};
