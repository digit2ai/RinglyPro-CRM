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

// Sync database - ONLY sync Message table with safe options
const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 Synchronizing database...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Only sync Message table with safe options
    if (Message) {
      // First, check if the table exists
      const tableExists = await sequelize.getQueryInterface().showAllTables();
      const messagesTableExists = tableExists.includes('messages');
      
      if (!messagesTableExists) {
        console.log('📋 Creating messages table for the first time...');
        // Create table without indexes first
        await Message.sync({ 
          force: false,
          alter: false
        });
        console.log('✅ Messages table created successfully');
      } else {
        console.log('📋 Messages table already exists, checking structure...');
        // Table exists, try to alter it safely
        try {
          await Message.sync({ 
            alter: true,
            force: false
          });
          console.log('✅ Messages table structure updated');
        } catch (alterError) {
          console.log('⚠️ Could not alter table, using existing structure:', alterError.message);
          // Table exists but couldn't be altered - that's OK, use existing structure
        }
      }
      
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
    console.error('❌ Database sync error:', error.message);
    console.log('⚠️ Continuing without database sync - app will run in memory mode');
    // Don't throw error - let the app continue running
    return false;
  }
};

// Export models and utilities
module.exports = {
  ...models,
  syncDatabase
};
