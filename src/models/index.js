// src/models/index.js
const sequelize = require('../config/database');

// Import Message model only (avoid Contact model schema conflicts)
let Message;

try {
  Message = require('./Message');
  console.log('✅ Message model imported successfully');
} catch (error) {
  console.log('⚠️ Message model not found:', error.message);
}

// Initialize models object
const models = {
  sequelize
};

// Add Message model if it exists
if (Message) {
  models.Message = Message;
}

// Sync database - ONLY sync Message table
const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 Synchronizing database...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Only sync Message table (avoid touching existing contacts table)
    if (Message) {
      await Message.sync(options);
      console.log('✅ Message table synchronized (SMS history ready)');
    } else {
      console.log('⚠️ No Message model to sync');
    }

    // Log available models
    const availableModels = Object.keys(models).filter(key => key !== 'sequelize');
    console.log('📋 Available models:', availableModels.join(', ') || 'None');

    console.log('✅ Database synchronized successfully');
    console.log('📱 SMS messages will now be stored in PostgreSQL!');
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
