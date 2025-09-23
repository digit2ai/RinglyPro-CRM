// src/models/index.js - COMPLETE UPDATED VERSION FOR RINGLYPRO CRM + RACHEL INTEGRATION
const sequelize = require('../config/database');

// Import models with error handling
let Message;
let Call;
let Contact;
let Appointment;
let User;

try {
  Message = require('./Message');
  console.log('Message model imported successfully');
} catch (error) {
  console.log('Message model not found:', error.message);
}

try {
  Call = require('./Call');
  console.log('Call model imported successfully');
} catch (error) {
  console.log('Call model not found:', error.message);
}

try {
  Contact = require('./contact'); // lowercase as per existing structure
  console.log('Contact model imported successfully');
} catch (error) {
  console.log('Contact model not found:', error.message);
}

try {
  Appointment = require('./Appointment');
  console.log('Appointment model imported successfully');
} catch (error) {
  console.log('Appointment model not found:', error.message);
  console.log('Note: Appointment model needed for Rachel voice booking integration');
}

try {
  User = require('./User')(sequelize);
  console.log('User model imported successfully');
} catch (error) {
  console.log('User model not found:', error.message);
  console.log('Note: User model needed for authentication system');
}

// Initialize models object
const models = {
  sequelize
};

// Add models if they exist
if (Message) models.Message = Message;
if (Call) models.Call = Call;
if (Contact) models.Contact = Contact;
if (Appointment) models.Appointment = Appointment;
if (User) models.User = User;

// Set up associations if models exist
if (Contact && Message) {
  try {
    Contact.hasMany(Message, {
      foreignKey: 'contactId',
      as: 'messages',
      constraints: false // Allow messages without contacts (from Rachel)
    });
    
    Message.belongsTo(Contact, {
      foreignKey: 'contactId',
      as: 'contact',
      constraints: false
    });
    
    console.log('Contact-Message associations configured');
  } catch (error) {
    console.log('Could not set up Contact-Message associations:', error.message);
  }
}

if (Contact && Call) {
  try {
    Contact.hasMany(Call, {
      foreignKey: 'contactId',
      as: 'calls',
      constraints: false // Allow calls without contacts (from Rachel)
    });
    
    Call.belongsTo(Contact, {
      foreignKey: 'contactId',
      as: 'contact',
      constraints: false
    });
    
    console.log('Contact-Call associations configured');
  } catch (error) {
    console.log('Could not set up Contact-Call associations:', error.message);
  }
}

if (Contact && Appointment) {
  try {
    Contact.hasMany(Appointment, {
      foreignKey: 'contactId',
      as: 'appointments',
      constraints: false // Rachel creates appointments without existing contacts
    });
    
    Appointment.belongsTo(Contact, {
      foreignKey: 'contactId',
      as: 'contact',
      constraints: false
    });
    
    console.log('Contact-Appointment associations configured');
  } catch (error) {
    console.log('Could not set up Contact-Appointment associations:', error.message);
  }
}

// Database synchronization function - safe for production
const syncDatabase = async (options = {}) => {
  try {
    console.log('Synchronizing database models...');
    
    // Test connection first
    await sequelize.authenticate();
    console.log('Database connection verified');

    // Sync User table for authentication - CRITICAL FOR MVP
    if (User) {
      try {
        await User.sync({ ...options, alter: false });
        console.log('User table synchronized - Authentication system ready');
      } catch (error) {
        console.log('User table sync issues:', error.message);
        // Try creating manually for User authentication
        try {
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS "users" (
              id SERIAL PRIMARY KEY,
              email VARCHAR(255) UNIQUE NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              first_name VARCHAR(100),
              last_name VARCHAR(100),
              business_name VARCHAR(255),
              business_phone VARCHAR(20),
              email_verified BOOLEAN DEFAULT false,
              email_verification_token VARCHAR(255),
              password_reset_token VARCHAR(255),
              password_reset_expires TIMESTAMP,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          
          // Create indexes for performance
          await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
            CREATE INDEX IF NOT EXISTS idx_users_verification ON users (email_verification_token);
            CREATE INDEX IF NOT EXISTS idx_users_reset ON users (password_reset_token);
          `);
          
          console.log('User table created with manual SQL - Authentication system ready');
        } catch (sqlError) {
          console.log('Manual User table creation failed:', sqlError.message);
          console.log('WARNING: User authentication may not work without User table');
        }
      }
    }

    // Sync Contact table for CRM functionality - ENHANCED WITH MANUAL SQL FALLBACK
    if (Contact) {
      try {
        await Contact.sync({ ...options, alter: false });
        console.log('Contact table synchronized - CRM contact management ready');
      } catch (error) {
        console.log('Contact table sync issues:', error.message);
        // Try creating manually for Contact management
        try {
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS "contacts" (
              id SERIAL PRIMARY KEY,
              "firstName" VARCHAR(50) NOT NULL,
              "lastName" VARCHAR(50) NOT NULL,
              phone VARCHAR(20) UNIQUE NOT NULL,
              email VARCHAR(255) UNIQUE NOT NULL,
              notes TEXT,
              status VARCHAR(20) DEFAULT 'active',
              source VARCHAR(50) DEFAULT 'manual',
              "lastContactedAt" TIMESTAMP,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          
          // Create indexes for performance
          await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts (phone);
            CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (email);
            CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts ("firstName", "lastName");
            CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts ("createdAt");
            CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status);
            CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts (source);
          `);
          
          console.log('Contact table created with manual SQL - CRM contact management ready');
        } catch (sqlError) {
          console.log('Manual Contact table creation failed:', sqlError.message);
          console.log('WARNING: Contact management may not work without Contact table');
        }
      }
    }

    // Sync Message table for SMS history
    if (Message) {
      try {
        await Message.sync({ ...options, alter: false });
        console.log('Message table synchronized - SMS history ready');
      } catch (error) {
        console.log('Message table sync issues:', error.message);
        // Try without foreign key constraints
        try {
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS "Messages" (
              id SERIAL PRIMARY KEY,
              "phoneNumber" VARCHAR(20) NOT NULL,
              message TEXT NOT NULL,
              direction VARCHAR(10) NOT NULL,
              status VARCHAR(20) DEFAULT 'sent',
              "messageSid" VARCHAR(100),
              "contactId" INTEGER,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          console.log('Message table created with manual SQL');
        } catch (sqlError) {
          console.log('Manual Message table creation failed:', sqlError.message);
        }
      }
    }

    // Sync Call table for call history
    if (Call) {
      try {
        await Call.sync({ ...options, alter: false });
        console.log('Call table synchronized - Call history ready');
      } catch (error) {
        console.log('Call table sync issues:', error.message);
        // Try without foreign key constraints
        try {
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS "Calls" (
              id SERIAL PRIMARY KEY,
              "callSid" VARCHAR(100) UNIQUE,
              "fromNumber" VARCHAR(20) NOT NULL,
              "toNumber" VARCHAR(20) NOT NULL,
              direction VARCHAR(10) NOT NULL,
              status VARCHAR(20) DEFAULT 'completed',
              duration INTEGER DEFAULT 0,
              "recordingUrl" TEXT,
              "contactId" INTEGER,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          console.log('Call table created with manual SQL');
        } catch (sqlError) {
          console.log('Manual Call table creation failed:', sqlError.message);
        }
      }
    }

    // Sync Appointment table for Rachel voice booking - CRITICAL FOR INTEGRATION
    if (Appointment) {
      try {
        await Appointment.sync({ ...options, alter: false });
        console.log('Appointment table synchronized - Rachel voice booking ready');
      } catch (error) {
        console.log('Appointment table sync issues:', error.message);
        // Try creating manually for Rachel integration
        try {
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS "appointments" (
              id SERIAL PRIMARY KEY,
              "customerName" VARCHAR(100) NOT NULL,
              "customerEmail" VARCHAR(255) NOT NULL,
              "customerPhone" VARCHAR(20) NOT NULL,
              "appointmentDate" DATE NOT NULL,
              "appointmentTime" TIME NOT NULL,
              duration INTEGER DEFAULT 30,
              purpose TEXT DEFAULT 'General consultation',
              status VARCHAR(20) DEFAULT 'scheduled',
              "confirmationCode" VARCHAR(20) UNIQUE NOT NULL,
              source VARCHAR(20) DEFAULT 'web',
              timezone VARCHAR(50) DEFAULT 'America/New_York',
              "zoomMeetingUrl" VARCHAR(500),
              "zoomMeetingId" VARCHAR(50),
              "zoomPassword" VARCHAR(50),
              "hubspotContactId" VARCHAR(50),
              "hubspotMeetingId" VARCHAR(50),
              "emailSent" BOOLEAN DEFAULT false,
              "smsSent" BOOLEAN DEFAULT false,
              "reminderSent" BOOLEAN DEFAULT false,
              notes TEXT,
              "cancelReason" VARCHAR(255),
              "rescheduleCount" INTEGER DEFAULT 0,
              "contactId" INTEGER,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT unique_scheduled_slot UNIQUE ("appointmentDate", "appointmentTime")
            );
          `);
          
          // Create indexes for performance
          await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments ("appointmentDate", "appointmentTime");
            CREATE INDEX IF NOT EXISTS idx_appointments_confirmation ON appointments ("confirmationCode");
            CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);
            CREATE INDEX IF NOT EXISTS idx_appointments_email ON appointments ("customerEmail");
          `);
          
          console.log('Appointment table created with manual SQL - Rachel integration ready');
        } catch (sqlError) {
          console.log('Manual Appointment table creation failed:', sqlError.message);
          console.log('WARNING: Rachel voice booking may not work without Appointment table');
        }
      }
    } else {
      console.log('WARNING: Appointment model not found - Rachel voice booking will not work');
    }

    // Log available models
    const availableModels = Object.keys(models).filter(key => key !== 'sequelize');
    console.log('Available models:', availableModels.join(', ') || 'None');

    console.log('Database synchronization completed');
    
    if (User) console.log('User authentication system active');
    if (Message) console.log('SMS messaging system active');
    if (Call) console.log('Call logging system active');
    if (Contact) console.log('Contact management system active');
    if (Appointment) console.log('Rachel voice appointment booking system active');
    
    return true;
  } catch (error) {
    console.error('Database sync error:', error.message);
    console.log('Continuing without full database sync - some features may be limited');
    return false;
  }
};

// Test database connectivity
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL connection established successfully');
    return true;
  } catch (error) {
    console.error('Unable to connect to PostgreSQL:', error.message);
    return false;
  }
};

// Get appointment statistics for dashboard
const getAppointmentStats = async () => {
  if (!Appointment) return null;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const stats = await Appointment.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN status = 'scheduled' THEN 1 END")), 'scheduled'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN status = 'completed' THEN 1 END")), 'completed'],
        [sequelize.fn('COUNT', sequelize.literal(`CASE WHEN "appointmentDate" = '${today}' THEN 1 END`)), 'today']
      ],
      raw: true
    });
    
    return stats[0];
  } catch (error) {
    console.log('Error getting appointment stats:', error.message);
    return null;
  }
};

// Export everything
module.exports = {
  sequelize,
  syncDatabase,
  testConnection,
  getAppointmentStats,
  ...models
};

// Export individual models for easier imports
module.exports.Message = Message;
module.exports.Call = Call;
module.exports.Contact = Contact;
module.exports.Appointment = Appointment;
module.exports.User = User;

console.log('Models index loaded - RinglyPro CRM + Rachel Voice AI integration ready');