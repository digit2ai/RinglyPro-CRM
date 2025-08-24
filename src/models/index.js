// src/models/index.js - FIXED VERSION
const sequelize = require('../config/database');

// Initialize models object first
const models = {
  sequelize
};

// Import models safely
let Message, Call, Contact, Appointment;

try {
  Message = require('./Message');
  models.Message = Message;
  console.log('Message model imported successfully');
} catch (error) {
  console.log('Message model not found:', error.message);
}

try {
  Call = require('./Call');
  models.Call = Call;
  console.log('Call model imported successfully');
} catch (error) {
  console.log('Call model not found:', error.message);
}

try {
  Contact = require('./contact');
  models.Contact = Contact;
  console.log('Contact model imported successfully');
} catch (error) {
  console.log('Contact model not found:', error.message);
}

try {
  Appointment = require('./Appointment');
  models.Appointment = Appointment;
  console.log('Appointment model imported successfully');
} catch (error) {
  console.log('Appointment model not found:', error.message);
}

// Database sync function - PROPERLY EXPORTED
const syncDatabase = async (options = {}) => {
  try {
    console.log('Synchronizing database models...');
    await sequelize.authenticate();
    console.log('Database connection verified');

    // Sync each model that exists
    if (Contact) {
      await Contact.sync({ alter: false });
      console.log('Contact table synchronized');
    }

    if (Message) {
      await Message.sync({ alter: false });
      console.log('Message table synchronized');
    }

    if (Call) {
      await Call.sync({ alter: false });
      console.log('Call table synchronized - Call history ready');
    }

    if (Appointment) {
      await Appointment.sync({ alter: false });
      console.log('Appointment table synchronized');
    }

    return true;
  } catch (error) {
    console.error('Database sync error:', error.message);
    return false;
  }
};

// Export everything properly
module.exports = {
  sequelize,
  syncDatabase,  // Make sure this is exported
  ...models
};
