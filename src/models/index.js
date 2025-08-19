// src/models/index.js
const sequelize = require('../config/database');

// Import models
let Message;
let Call;
let Contact;

try {
  Message = require('./Message');
  console.log('✅ Message model imported successfully');
} catch (error) {
  console.log('⚠️ Message model not found:', error.message);
}

try {
  Call = require('./Call');
  console.log('✅ Call model imported successfully');
} catch (error) {
  console.log('⚠️ Call model not found:', error.message);
}

// Try to import existing Contact model (if it exists)
try {
  Contact = require('./contact'); // lowercase as per your structure
  console.log('✅ Contact model imported successfully');
} catch (error) {
  console.log('⚠️ Contact model not found:', error.message);
}

// Initialize models object
const models = {
  sequelize
};

// Add models if they exist
if (Message) {
  models.Message = Message;
}
if (Call) {
  models.Call = Call;
}
if (Contact) {
  models.Contact = Contact;
}

// Set up associations if models exist
if (Contact && Message) {
  try {
    // Contact to Message relationship
    Contact.hasMany(Message, {
      foreignKey: 'contactId',
      as: 'messages'
    });
    
    Message.belongsTo(Contact, {
      foreignKey: 'contactId',
      as: 'contact'
    });
    
    console.log('✅ Contact-Message associations set up successfully');
  } catch (error) {
    console.log('⚠️ Could not set up Contact-Message associations:', error.message);
  }
}

if (Contact && Call) {
  try {
    // Contact to Call relationship
    Contact.hasMany(Call, {
      foreignKey: 'contactId',
      as: 'calls'
    });
    
    Call.belongsTo(Contact, {
      foreignKey: 'contactId',
      as: 'contact'
    });
    
    console.log('✅ Contact-Call associations set up successfully');
  } catch (error) {
    console.log('⚠️ Could not set up Contact-Call associations:', error.message);
  }
}

// Sync database function
const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 Synchronizing database models...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection verified');

    // Sync models in correct order (Contact first, then Message and Call)
    if (Contact) {
      await Contact.sync({ ...options, alter: false }); // Don't alter existing contact table
      console.log('✅ Contact table verified');
    }

    if (Message) {
      await Message.sync(options);
      console.log('✅ Message table synchronized (SMS history ready)');
    }

    if (Call) {
      await Call.sync(options);
      console.log('✅ Call table synchronized (Call history ready)');
    }

    // Log available models
    const availableModels = Object.keys(models).filter(key => key !== 'sequelize');
    console.log('📋 Available models:', availableModels.join(', ') || 'None');

    console.log('✅ Database synchronized successfully');
    console.log('📱 SMS and Call history will now be stored in PostgreSQL!');
    return true;
  } catch (error) {
    console.error('❌ Database sync error:', error.message);
    console.error('❌ Full error:', error);
    throw error;
  }
};

// Export everything
module.exports = {
  sequelize,
  syncDatabase,
  ...models
};

// Also export individual models for easier imports
module.exports.Message = Message;
module.exports.Call = Call;
module.exports.Contact = Contact;
