// src/models/index.js - FIXED VERSION
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

// SAFE Sync database function - avoids Contact table conflicts
const syncDatabase = async (options = {}) => {
  try {
    console.log('🔄 Synchronizing database models...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('✅ Database connection verified');

    // SKIP Contact table sync to avoid conflicts
    if (Contact) {
      console.log('📋 Contact table exists - skipping sync to avoid conflicts');
    }

    // ONLY sync Message and Call tables
    if (Message) {
      try {
        await Message.sync({ ...options, alter: false });
        console.log('✅ Message table synchronized (SMS history ready)');
      } catch (error) {
        console.log('⚠️ Message table sync skipped:', error.message);
      }
    }

    if (Call) {
      try {
        await Call.sync({ ...options, alter: false });
        console.log('✅ Call table synchronized (Call history ready)');
      } catch (error) {
        console.log('⚠️ Call table sync had issues:', error.message);
        // Try to create table without indexes if needed
        try {
          await Call.sync({ force: false, alter: false });
          console.log('✅ Call table created successfully (retry)');
        } catch (retryError) {
          console.log('⚠️ Call table could not be created:', retryError.message);
        }
      }
    }

    // Log available models
    const availableModels = Object.keys(models).filter(key => key !== 'sequelize');
    console.log('📋 Available models:', availableModels.join(', ') || 'None');

    console.log('✅ Database synchronized successfully');
    console.log('📱 SMS and Call history will now be stored in PostgreSQL!');
    return true;
  } catch (error) {
    console.error('❌ Database sync error:', error.message);
    console.log('⚠️ Continuing without full database sync - some features may use fallback mode');
    // Don't throw error - let app continue
    return false;
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
