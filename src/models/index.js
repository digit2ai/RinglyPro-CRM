// src/models/index.js - COMPLETE UPDATED VERSION FOR RINGLYPRO CRM + RACHEL INTEGRATION + AI SERVICES
const sequelize = require('../config/database');

// Import models with error handling
let Message;
let Call;
let Contact;
let Appointment;
let User;
let Client;
let CreditAccount;
let AdminCommunication;
let AdminNote;

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

try {
  Client = require('./Client')(sequelize);
  console.log('Client model imported successfully');
} catch (error) {
  console.log('Client model not found:', error.message);
  console.log('Note: Client model needed for multi-tenant Rachel AI system');
}

try {
  CreditAccount = require('./CreditAccount')(sequelize);
  console.log('CreditAccount model imported successfully');
} catch (error) {
  console.log('CreditAccount model not found:', error.message);
  console.log('Note: CreditAccount model needed for billing system');
}

try {
  AdminCommunication = require('./AdminCommunication')(sequelize);
  console.log('AdminCommunication model imported successfully');
} catch (error) {
  console.log('AdminCommunication model not found:', error.message);
  console.log('Note: AdminCommunication model needed for admin portal');
}

try {
  AdminNote = require('./AdminNote')(sequelize);
  console.log('AdminNote model imported successfully');
} catch (error) {
  console.log('AdminNote model not found:', error.message);
  console.log('Note: AdminNote model needed for admin portal');
}

// Import Project Tracker models
let Project;
let ProjectMilestone;
let ProjectMessage;

try {
  Project = require('./Project');
  Project.init(sequelize);
  console.log('Project model imported successfully');
} catch (error) {
  console.log('Project model not found:', error.message);
}

try {
  ProjectMilestone = require('./ProjectMilestone');
  ProjectMilestone.init(sequelize);
  console.log('ProjectMilestone model imported successfully');
} catch (error) {
  console.log('ProjectMilestone model not found:', error.message);
}

try {
  ProjectMessage = require('./ProjectMessage');
  ProjectMessage.init(sequelize);
  console.log('ProjectMessage model imported successfully');
} catch (error) {
  console.log('ProjectMessage model not found:', error.message);
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
if (Client) models.Client = Client;
if (CreditAccount) models.CreditAccount = CreditAccount;
if (AdminCommunication) models.AdminCommunication = AdminCommunication;
if (AdminNote) models.AdminNote = AdminNote;
if (Project) models.Project = Project;
if (ProjectMilestone) models.ProjectMilestone = ProjectMilestone;
if (ProjectMessage) models.ProjectMessage = ProjectMessage;

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

if (User && Client) {
  try {
    User.hasOne(Client, {
      foreignKey: 'user_id',
      as: 'client'
    });
    
    Client.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    
    console.log('User-Client associations configured');
  } catch (error) {
    console.log('Could not set up User-Client associations:', error.message);
  }
}

if (Client && CreditAccount) {
  try {
    Client.hasOne(CreditAccount, {
      foreignKey: 'client_id',
      as: 'creditAccount'
    });

    CreditAccount.belongsTo(Client, {
      foreignKey: 'client_id',
      as: 'client'
    });

    console.log('Client-CreditAccount associations configured');
  } catch (error) {
    console.log('Could not set up Client-CreditAccount associations:', error.message);
  }
}

if (User && AdminCommunication) {
  try {
    User.hasMany(AdminCommunication, {
      foreignKey: 'admin_user_id',
      as: 'adminCommunications'
    });

    AdminCommunication.belongsTo(User, {
      foreignKey: 'admin_user_id',
      as: 'admin'
    });

    console.log('User-AdminCommunication associations configured');
  } catch (error) {
    console.log('Could not set up User-AdminCommunication associations:', error.message);
  }
}

if (Client && AdminCommunication) {
  try {
    Client.hasMany(AdminCommunication, {
      foreignKey: 'client_id',
      as: 'adminCommunications'
    });

    AdminCommunication.belongsTo(Client, {
      foreignKey: 'client_id',
      as: 'client'
    });

    console.log('Client-AdminCommunication associations configured');
  } catch (error) {
    console.log('Could not set up Client-AdminCommunication associations:', error.message);
  }
}

if (User && AdminNote) {
  try {
    User.hasMany(AdminNote, {
      foreignKey: 'admin_user_id',
      as: 'adminNotes'
    });

    AdminNote.belongsTo(User, {
      foreignKey: 'admin_user_id',
      as: 'admin'
    });

    console.log('User-AdminNote associations configured');
  } catch (error) {
    console.log('Could not set up User-AdminNote associations:', error.message);
  }
}

if (Client && AdminNote) {
  try {
    Client.hasMany(AdminNote, {
      foreignKey: 'client_id',
      as: 'adminNotes'
    });

    AdminNote.belongsTo(Client, {
      foreignKey: 'client_id',
      as: 'client'
    });

    console.log('Client-AdminNote associations configured');
  } catch (error) {
    console.log('Could not set up Client-AdminNote associations:', error.message);
  }
}

// Project Tracker associations
if (User && Project) {
  try {
    User.hasMany(Project, {
      foreignKey: 'user_id',
      as: 'projects'
    });

    Project.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'owner'
    });

    Project.belongsTo(User, {
      foreignKey: 'created_by_admin',
      as: 'creator'
    });

    console.log('User-Project associations configured');
  } catch (error) {
    console.log('Could not set up User-Project associations:', error.message);
  }
}

if (Project && ProjectMilestone) {
  try {
    Project.hasMany(ProjectMilestone, {
      foreignKey: 'project_id',
      as: 'milestones'
    });

    ProjectMilestone.belongsTo(Project, {
      foreignKey: 'project_id',
      as: 'project'
    });

    console.log('Project-ProjectMilestone associations configured');
  } catch (error) {
    console.log('Could not set up Project-ProjectMilestone associations:', error.message);
  }
}

if (ProjectMilestone && ProjectMessage) {
  try {
    ProjectMilestone.hasMany(ProjectMessage, {
      foreignKey: 'milestone_id',
      as: 'messages'
    });

    ProjectMessage.belongsTo(ProjectMilestone, {
      foreignKey: 'milestone_id',
      as: 'milestone'
    });

    console.log('ProjectMilestone-ProjectMessage associations configured');
  } catch (error) {
    console.log('Could not set up ProjectMilestone-ProjectMessage associations:', error.message);
  }
}

if (User && ProjectMessage) {
  try {
    User.hasMany(ProjectMessage, {
      foreignKey: 'user_id',
      as: 'projectMessages'
    });

    ProjectMessage.belongsTo(User, {
      foreignKey: 'user_id',
      as: 'author'
    });

    console.log('User-ProjectMessage associations configured');
  } catch (error) {
    console.log('Could not set up User-ProjectMessage associations:', error.message);
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
      }
    }

    // Sync Client table for multi-tenant system - CRITICAL FOR MVP
    if (Client) {
      try {
        await Client.sync({ ...options, alter: false });
        console.log('Client table synchronized - Multi-tenant system ready');
      } catch (error) {
        console.log('Client table sync issues:', error.message);
      }
    }

    // Sync CreditAccount table for billing - CRITICAL FOR MVP
    if (CreditAccount) {
      try {
        await CreditAccount.sync({ ...options, alter: false });
        console.log('CreditAccount table synchronized - Billing system ready');
      } catch (error) {
        console.log('CreditAccount table sync issues:', error.message);
      }
    }

    // Sync Contact table for CRM functionality
    if (Contact) {
      try {
        await Contact.sync({ ...options, alter: false });
        console.log('Contact table synchronized - CRM contact management ready');
      } catch (error) {
        console.log('Contact table sync issues:', error.message);
      }
    }

    // Sync Message table for SMS history
    if (Message) {
      try {
        await Message.sync({ ...options, alter: false });
        console.log('Message table synchronized - SMS history ready');
      } catch (error) {
        console.log('Message table sync issues:', error.message);
      }
    }

    // Sync Call table for call history
    if (Call) {
      try {
        await Call.sync({ ...options, alter: false });
        console.log('Call table synchronized - Call history ready');
      } catch (error) {
        console.log('Call table sync issues:', error.message);
      }
    }

    // Sync Appointment table for Rachel voice booking - CRITICAL FOR INTEGRATION
    if (Appointment) {
      try {
        await Appointment.sync({ ...options, alter: false });
        console.log('Appointment table synchronized - Rachel voice booking ready');
      } catch (error) {
        console.log('Appointment table sync issues:', error.message);
      }
    }

    // Log available models
    const availableModels = Object.keys(models).filter(key => key !== 'sequelize');
    console.log('Available models:', availableModels.join(', ') || 'None');

    console.log('Database synchronization completed');
    
    if (User) console.log('User authentication system active');
    if (Client) console.log('Multi-tenant client system active');
    if (CreditAccount) console.log('Credit/billing system active');
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

// Import AI Services with error handling
let BusinessAICustomizer;
let AIResponseGenerator;

try {
  BusinessAICustomizer = require('../services/aiCustomization');
  console.log('BusinessAICustomizer service imported successfully');
} catch (error) {
  console.log('BusinessAICustomizer service not found:', error.message);
  console.log('Note: AI customization service needed for personalized responses');
}

try {
  AIResponseGenerator = require('../services/aiResponseGenerator');
  console.log('AIResponseGenerator service imported successfully');
} catch (error) {
  console.log('AIResponseGenerator service not found:', error.message);
  console.log('Note: AI response generator needed for voice call responses');
}

// Import Rachel Voice Service with error handling
let RachelVoiceService;

try {
  RachelVoiceService = require('../services/voiceService');
  console.log('RachelVoiceService imported successfully');
} catch (error) {
  console.log('RachelVoiceService not found:', error.message);
  console.log('Note: Rachel voice service needed for Twilio call handling with ElevenLabs TTS');
}

// Initialize AI services
let aiCustomizer;
let aiResponseGenerator;
let rachelVoice;

if (BusinessAICustomizer) {
  try {
    aiCustomizer = new BusinessAICustomizer();
    console.log('AI Customization service initialized');
  } catch (error) {
    console.log('Failed to initialize AI Customization service:', error.message);
  }
}

if (AIResponseGenerator) {
  try {
    aiResponseGenerator = new AIResponseGenerator();
    console.log('AI Response Generator service initialized');
  } catch (error) {
    console.log('Failed to initialize AI Response Generator service:', error.message);
  }
}

if (RachelVoiceService) {
  try {
    rachelVoice = new RachelVoiceService();
    console.log('Rachel Voice Service initialized');
    console.log('- ElevenLabs integration:', process.env.ELEVENLABS_API_KEY ? 'Configured' : 'Missing (will use Twilio TTS fallback)');
    console.log('- Rachel Voice ID: 21m00Tcm4TlvDq8ikWAM');
    console.log('- Twilio phone number:', process.env.TWILIO_PHONE_NUMBER || 'Not configured');
  } catch (error) {
    console.log('Failed to initialize Rachel Voice Service:', error.message);
    console.log('Note: Voice call handling will not work without Rachel service');
  }
}

// Appointment booking helper functions for Rachel integration
const createAppointmentForRachel = async (appointmentData) => {
  if (!Appointment) {
    console.log('Appointment model not available for Rachel booking');
    return { success: false, message: 'Appointment system not available' };
  }

  try {
    // Generate unique confirmation code
    const confirmationCode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
    
    const appointment = await Appointment.create({
      ...appointmentData,
      confirmationCode,
      source: 'rachel_voice',
      status: 'scheduled'
    });

    console.log(`Rachel created appointment: ${confirmationCode}`);
    
    return {
      success: true,
      appointment: appointment.toJSON(),
      confirmationCode
    };
  } catch (error) {
    console.error('Rachel appointment creation failed:', error.message);
    return {
      success: false,
      message: error.message
    };
  }
};

const getAvailableSlots = async (date) => {
  if (!Appointment) {
    // Return default slots if no Appointment model
    return ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
  }

  try {
    const bookedSlots = await Appointment.findAll({
      where: {
        appointmentDate: date,
        status: ['scheduled', 'confirmed']
      },
      attributes: ['appointmentTime']
    });

    const bookedTimes = bookedSlots.map(slot => slot.appointmentTime);
    const allSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
    
    return allSlots.filter(slot => !bookedTimes.includes(slot));
  } catch (error) {
    console.error('Error getting available slots:', error.message);
    return [];
  }
};

// Call logging function for Rachel
const logCallForRachel = async (callData) => {
  if (!Call) {
    console.log('Call model not available for Rachel logging');
    return false;
  }

  try {
    await Call.create({
      ...callData,
      source: 'rachel_voice'
    });
    
    console.log(`Call logged by Rachel: ${callData.callSid}`);
    return true;
  } catch (error) {
    console.error('Rachel call logging failed:', error.message);
    return false;
  }
};

// Contact lookup/creation for Rachel
const findOrCreateContactForRachel = async (phoneNumber, additionalData = {}) => {
  if (!Contact) {
    console.log('Contact model not available for Rachel');
    return null;
  }

  try {
    let contact = await Contact.findOne({
      where: { phone: phoneNumber }
    });

    if (!contact && additionalData.firstName) {
      contact = await Contact.create({
        phone: phoneNumber,
        firstName: additionalData.firstName || 'Unknown',
        lastName: additionalData.lastName || '',
        email: additionalData.email || `phone.${phoneNumber.replace(/\D/g, '')}@rachel.voice`,
        source: 'rachel_voice',
        notes: 'Contact created by Rachel voice assistant'
      });
      
      console.log(`Rachel created new contact: ${phoneNumber}`);
    }

    return contact;
  } catch (error) {
    console.error('Rachel contact lookup/creation failed:', error.message);
    return null;
  }
};

// Export everything
module.exports = {
  sequelize,
  syncDatabase,
  testConnection,
  getAppointmentStats,
  createAppointmentForRachel,
  getAvailableSlots,
  logCallForRachel,
  findOrCreateContactForRachel,
  ...models
};

// Export individual models for easier imports
module.exports.Message = Message;
module.exports.Call = Call;
module.exports.Contact = Contact;
module.exports.Appointment = Appointment;
module.exports.User = User;
module.exports.Client = Client;
module.exports.CreditAccount = CreditAccount;
module.exports.AdminCommunication = AdminCommunication;
module.exports.AdminNote = AdminNote;

// Export Project Tracker models
module.exports.Project = Project;
module.exports.ProjectMilestone = ProjectMilestone;
module.exports.ProjectMessage = ProjectMessage;

// Export AI services
module.exports.BusinessAICustomizer = BusinessAICustomizer;
module.exports.AIResponseGenerator = AIResponseGenerator;
module.exports.aiCustomizer = aiCustomizer;
module.exports.aiResponseGenerator = aiResponseGenerator;

// Export Rachel Voice Service
module.exports.RachelVoiceService = RachelVoiceService;
module.exports.rachelVoice = rachelVoice;

console.log('Models index loaded - RinglyPro CRM + Rachel Voice AI integration ready');

// Log comprehensive system status
console.log('\n========== RINGLYPRO SYSTEM STATUS ==========');

// Database models status
const modelStatus = [];
if (User) modelStatus.push('User Authentication');
if (Client) modelStatus.push('Multi-Tenant Clients');
if (CreditAccount) modelStatus.push('Billing System');
if (Contact) modelStatus.push('Contact Management');
if (Message) modelStatus.push('SMS History'); 
if (Call) modelStatus.push('Call Logging');
if (Appointment) modelStatus.push('Appointment Booking');

console.log('Database Models:', modelStatus.length > 0 ? modelStatus.join(', ') : 'None available');

// AI services status
if (aiCustomizer && aiResponseGenerator) {
  console.log('AI Voice Customization System: ACTIVE');
  console.log('- Business context generation: Ready');
  console.log('- AI response generation: Ready');
  console.log('- OpenAI integration: ' + (process.env.OPENAI_API_KEY ? 'Configured' : 'Mock mode'));
} else {
  console.log('AI Voice Customization System: PARTIAL');
  console.log('- Missing AI services - some features may be limited');
}

// Rachel Voice Service status
if (rachelVoice) {
  console.log('Rachel Voice Assistant: ACTIVE');
  console.log('- ElevenLabs TTS: ' + (process.env.ELEVENLABS_API_KEY ? 'Configured (Rachel Voice)' : 'Missing (Twilio fallback)'));
  console.log('- Twilio Integration: ' + (process.env.TWILIO_ACCOUNT_SID ? 'Configured' : 'Missing'));
  console.log('- Appointment Booking: ' + (Appointment ? 'Ready' : 'Model Missing'));
  console.log('- Call Logging: ' + (Call ? 'Ready' : 'Model Missing'));
} else {
  console.log('Rachel Voice Assistant: INACTIVE');
  console.log('- Voice service not available - create /src/services/voiceService.js');
}

// Integration readiness
const integrationChecks = [];
if (process.env.ELEVENLABS_API_KEY) integrationChecks.push('ElevenLabs');
if (process.env.TWILIO_ACCOUNT_SID) integrationChecks.push('Twilio');
if (process.env.OPENAI_API_KEY) integrationChecks.push('OpenAI');

console.log('External Integrations:', integrationChecks.length > 0 ? integrationChecks.join(', ') : 'None configured');
console.log('==========================================\n');

// Ready for Rachel integration
if (rachelVoice && Appointment && Call && Client) {
  console.log('✅ SYSTEM READY: Rachel Voice Assistant with full multi-tenant CRM integration');
  console.log('   Next: Configure Twilio webhook to /voice/incoming');
} else {
  console.log('⚠️  PARTIAL SETUP: Some components missing for full Rachel integration');
  if (!rachelVoice) console.log('   - Create RachelVoiceService in /src/services/voiceService.js');
  if (!Appointment) console.log('   - Create Appointment model for booking functionality');
  if (!Call) console.log('   - Create Call model for call logging');
  if (!Client) console.log('   - Create Client model for multi-tenant system');
}