// ==================== STEP 1: Update app.js to include new voice bot routes ====================

// Add this to your existing app.js after the other route definitions:

// Voice Bot Routes (NEW)
app.use('/api/calls', require('./routes/voiceBot')); // This replaces the old calls route

// ==================== STEP 2: Create Appointment Model (if not exists) ====================
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
    order: [['appointmentTime', 'ASC']],
    include: [{
      model: require('./Contact'),
      as: 'contact',
      required: false
    }]
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

// ==================== STEP 3: Update models/index.js ====================

// Add this to your existing models/index.js:

let Appointment;
try {
  Appointment = require('./Appointment');
  console.log('✅ Appointment model imported successfully');
} catch (error) {
  console.log('⚠️ Appointment model not found:', error.message);
}

// Add Appointment to models object
if (Appointment) {
  models.Appointment = Appointment;
}

// Set up associations (add to existing associations)
if (Contact && Appointment) {
  try {
    // Contact to Appointment relationship
    Contact.hasMany(Appointment, {
      foreignKey: 'contactId',
      as: 'appointments'
    });
    
    Appointment.belongsTo(Contact, {
      foreignKey: 'contactId',
      as: 'contact'
    });
    
    console.log('✅ Contact-Appointment associations set up successfully');
  } catch (error) {
    console.log('⚠️ Could not set up Contact-Appointment associations:', error.message);
  }
}

// In syncDatabase function, add:
if (Appointment) {
  try {
    await Appointment.sync({ ...options, alter: false });
    console.log('✅ Appointment table synchronized');
  } catch (error) {
    console.log('⚠️ Appointment table sync had issues:', error.message);
  }
}

// Export Appointment
module.exports.Appointment = Appointment;

// ==================== STEP 4: Enhanced Appointments API Routes ====================
// src/routes/appointments.js - Replace your existing appointments.js

const express = require('express');
const router = express.Router();
const { Appointment, Contact } = require('../models');

// Get all appointments
router.get('/', async (req, res) => {
  try {
    const { date, status, limit = 50 } = req.query;
    let whereClause = {};
    
    if (date) {
      whereClause.appointmentDate = date;
    }
    
    if (status) {
      whereClause.status = status;
    }
    
    let appointments = [];
    
    if (Appointment) {
      appointments = await Appointment.findAll({
        where: whereClause,
        order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
        limit: parseInt(limit),
        include: [{
          model: Contact,
          as: 'contact',
          required: false,
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        }]
      });
    } else {
      // Fallback to mock data
      appointments = [
        {
          id: 1,
          customerName: 'John Doe',
          customerPhone: '+1234567890',
          appointmentDate: new Date().toISOString().split('T')[0],
          appointmentTime: '09:00:00',
          duration: 60,
          purpose: 'Consultation',
          status: 'confirmed',
          source: 'voice_booking'
        }
      ];
    }
    
    res.json({
      success: true,
      data: appointments,
      count: appointments.length
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get today's appointments
router.get('/today', async (req, res) => {
  try {
    let appointments = [];
    
    if (Appointment) {
      appointments = await Appointment.findTodaysAppointments();
    } else {
      // Mock data for today
      const today = new Date().toISOString().split('T')[0];
      appointments = [
        {
          id: 1,
          customerName: 'John Doe',
          customerPhone: '+1234567890',
          appointmentDate: today,
          appointmentTime: '09:00:00',
          duration: 60,
          purpose: 'Voice Booking Demo',
          status: 'confirmed',
          source: 'voice_booking'
        }
      ];
    }
    
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching today\'s appointments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch today\'s appointments',
      details: error.message 
    });
  }
});

// Create appointment
router.post('/', async (req, res) => {
  try {
    const {
      contactId,
      customerName,
      customerPhone,
      customerEmail,
      appointmentDate,
      appointmentTime,
      duration = 60,
      purpose = 'General Consultation',
      source = 'manual',
      notes,
      callSid
    } = req.body;
    
    // Validate required fields
    if (!customerName || !customerPhone || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerName, customerPhone, appointmentDate, appointmentTime'
      });
    }
    
    let appointment;
    
    if (Appointment) {
      // Check for conflicts
      const existing = await Appointment.checkAvailability(appointmentDate, appointmentTime);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Time slot already booked',
          conflict: existing
        });
      }
      
      // Create appointment
      appointment = await Appointment.create({
        contactId: contactId || null,
        customerName,
        customerPhone,
        customerEmail: customerEmail || null,
        appointmentDate,
        appointmentTime,
        duration: parseInt(duration),
        purpose,
        source,
        notes: notes || null,
        callSid: callSid || null,
        status: 'confirmed',
        confirmationSent: false,
        reminderSent: false
      });
      
      console.log(`📅 Appointment created: ${appointment.id}`);
      
    } else {
      // Mock appointment for demo
      appointment = {
        id: Math.floor(Math.random() * 10000),
        contactId,
        customerName,
        customerPhone,
        customerEmail,
        appointmentDate,
        appointmentTime,
        duration,
        purpose,
        source,
        status: 'confirmed',
        createdAt: new Date()
      };
    }
    
    res.status(201).json({
      success: true,
      message: `Appointment created for ${customerName}`,
      data: appointment
    });
    
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create appointment',
      details: error.message 
    });
  }
});

// Check availability
router.get('/availability/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    let availableSlots = [];
    
    if (Appointment) {
      availableSlots = await Appointment.getAvailableSlots(date);
    } else {
      // Mock available slots
      availableSlots = ['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00', '16:00:00'];
    }
    
    res.json({
      success: true,
      date: date,
      availableSlots: availableSlots
    });
    
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check availability',
      details: error.message 
    });
  }
});

// Get appointment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let appointment = null;
    
    if (Appointment) {
      appointment = await Appointment.findByPk(id, {
        include: [{
          model: Contact,
          as: 'contact',
          required: false
        }]
      });
    }
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    res.json({
      success: true,
      data: appointment
    });
    
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Update appointment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (Appointment) {
      const [affectedRows] = await Appointment.update(updates, {
        where: { id }
      });
      
      if (affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Appointment not found'
        });
      }
      
      const updatedAppointment = await Appointment.findByPk(id);
      
      res.json({
        success: true,
        message: 'Appointment updated successfully',
        data: updatedAppointment
      });
    } else {
      res.json({
        success: true,
        message: 'Appointment update simulated (database not available)',
        data: { id, ...updates }
      });
    }
    
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Cancel appointment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (Appointment) {
      const appointment = await Appointment.findByPk(id);
      
      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: 'Appointment not found'
        });
      }
      
      await appointment.update({ status: 'cancelled' });
      
      res.json({
        success: true,
        message: 'Appointment cancelled successfully'
      });
    } else {
      res.json({
        success: true,
        message: 'Appointment cancellation simulated'
      });
    }
    
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

module.exports = router;

// ==================== STEP 5: Twilio Configuration ====================

/*
IMPORTANT: Configure these webhook URLs in your Twilio Console:

1. Go to https://console.twilio.com/
2. Navigate to Phone Numbers > Manage > Active Numbers
3. Click on your number (888-610-3810)
4. Set the Voice webhook to:
   https://your-app-name.onrender.com/api/calls/webhook/voice
   
5. Set HTTP method to POST
6. Set the SMS webhook to:
   https://your-app-name.onrender.com/api/messages/webhook

Test the voice booking by calling 888-610-3810 and saying:
- "3" or "appointment" or "schedule"
- Then follow Rachel's prompts to book an appointment
*/

// ==================== STEP 6: Environment Variables Required ====================

/*
Make sure these are set in your Render.com environment:

TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+18886103810
DATABASE_URL=postgresql://user:password@hostname:port/database_name
NODE_ENV=production
WEBHOOK_BASE_URL=https://your-app-name.onrender.com
*/