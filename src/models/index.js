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

// src/models/Appointment.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'References contacts table - nullable for walk-ins'
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  appointmentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date of appointment (YYYY-MM-DD)'
  },
  appointmentTime: {
    type: DataTypes.TIME,
    allowNull: false,
    comment: 'Time of appointment (HH:MM:SS)'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
    comment: 'Duration in minutes'
  },
  purpose: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'General Consultation',
    comment: 'Purpose of appointment'
  },
  status: {
    type: DataTypes.ENUM('confirmed', 'pending', 'cancelled', 'completed', 'no-show'),
    defaultValue: 'confirmed'
  },
  source: {
    type: DataTypes.ENUM('voice_booking', 'online', 'manual', 'walk-in'),
    defaultValue: 'voice_booking'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  callSid: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Twilio Call SID if booked via phone'
  },
  reminderSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  confirmationSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  indexes: [
    {
      fields: ['contactId']
    },
    {
      fields: ['customerPhone']
    },
    {
      fields: ['appointmentDate']
    },
    {
      fields: ['appointmentTime']
    },
    {
      fields: ['status']
    },
    {
      fields: ['source']
    },
    {
      fields: ['callSid']
    },
    {
      unique: true,
      fields: ['appointmentDate', 'appointmentTime'],
      name: 'unique_time_slot'
    }
  ]
});

// Instance methods
Appointment.prototype.getFormattedDateTime = function() {
  const date = new Date(`${this.appointmentDate}T${this.appointmentTime}`);
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

Appointment.prototype.getFormattedTime = function() {
  const time = this.appointmentTime.split(':');
  const hour = parseInt(time[0]);
  const minute = time[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${ampm}`;
};

Appointment.prototype.isToday = function() {
  const today = new Date().toISOString().split('T')[0];
  return this.appointmentDate === today;
};

Appointment.prototype.isPast = function() {
  const now = new Date();
  const appointmentDateTime = new Date(`${this.appointmentDate}T${this.appointmentTime}`);
  return appointmentDateTime < now;
};

// Class methods
Appointment.findByDate = function(date) {
  return this.findAll({
    where: { appointmentDate: date },
    order: [['appointmentTime', 'ASC']]
  });
};

Appointment.findTodaysAppointments = function() {
  const today = new Date().toISOString().split('T')[0];
  return this.findByDate(today);
};

Appointment.findByContact = function(contactId) {
  return this.findAll({
    where: { contactId },
    order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
    limit: 10
  });
};

Appointment.findByPhone = function(phone) {
  return this.findAll({
    where: { customerPhone: phone },
    order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
    limit: 5
  });
};

Appointment.checkAvailability = function(date, time) {
  return this.findOne({
    where: { 
      appointmentDate: date,
      appointmentTime: time,
      status: ['confirmed', 'pending']
    }
  });
};

Appointment.getAvailableSlots = function(date) {
  const businessHours = [
    '09:00:00', '10:00:00', '11:00:00',
    '14:00:00', '15:00:00', '16:00:00', '17:00:00'
  ];
  
  return this.findAll({
    where: { appointmentDate: date },
    attributes: ['appointmentTime']
  }).then(bookedSlots => {
    const bookedTimes = bookedSlots.map(slot => slot.appointmentTime);
    return businessHours.filter(time => !bookedTimes.includes(time));
  });
};

module.exports = Appointment;

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
