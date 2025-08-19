// src/models/index.js
const sequelize = require('../config/database');

// Import models - adjust paths to match your actual files
let Contact, Message;

try {
  // Try to import Contact (adjust case if needed)
  Contact = require('./Contact');
  console.log('✅ Contact model imported successfully');
} catch (error) {
  try {
    // Try lowercase version
    Contact = require('./contact');
    console.log('✅ Contact model imported successfully (lowercase)');
  } catch (error2) {
    console.log('⚠️ Contact model not found, continuing without it');
  }
}

try {
  // Try to import Message
  Message = require('./Message');
  console.log('✅ Message model imported successfully');
} catch (error) {
  console.log('⚠️ Message model not found, continuing without it');
}

// Define model associations only if both models exist
if (Contact && Message) {
  Contact.hasMany(Message, {
    foreignKey: 'contactId',
    as: 'messages',
    onDelete: 'SET NULL'
  });

  Message.belongsTo(Contact, {
    foreignKey: 'contactId',
    as: 'contact'
  });
  console.log('✅ Model relationships established');
}

// Initialize models object
const models = {
  sequelize
};

// Add models if they exist
if (Contact) models.Contact = Contact;
if (Message) models.Message = Message;

// Sync database (create tables if they don't exist)
const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 Synchronizing database...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Sync models that exist
    if (Contact) {
      await Contact.sync(options);
      console.log('✅ Contact table synchronized');
    }
    
    if (Message) {
      await Message.sync(options);
      console.log('✅ Message table synchronized');
    }

    // Log available models
    const availableModels = Object.keys(models).filter(key => key !== 'sequelize');
    console.log('📋 Available models:', availableModels.join(', '));

    console.log('✅ Database synchronized successfully');
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
