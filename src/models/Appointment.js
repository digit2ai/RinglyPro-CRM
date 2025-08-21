// src/models/Appointment.js - FIXED FOR EXISTING DATABASE
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
    field: 'contact_id', // Map to snake_case column
    comment: 'References contacts table - nullable for walk-ins'
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'customer_name', // Map to snake_case column
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'customer_phone', // Map to snake_case column
    validate: {
      notEmpty: true
    }
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: false, // Changed to match database
    field: 'customer_email', // Map to snake_case column
    validate: {
      isEmail: true
    }
  },
  appointmentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'appointment_date', // Map to snake_case column
    comment: 'Date of appointment (YYYY-MM-DD)'
  },
  appointmentTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'appointment_time', // Map to snake_case column
    comment: 'Time of appointment (HH:MM:SS)'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 30, // Changed from 60 to match database
    comment: 'Duration in minutes'
  },
  purpose: {
    type: DataTypes.TEXT, // Changed from STRING to TEXT
    allowNull: true,
    defaultValue: 'General consultation', // Match database default
    comment: 'Purpose of appointment'
  },
  status: {
    type: DataTypes.STRING, // Use STRING instead of ENUM to match existing
    defaultValue: 'scheduled', // Match database default
    validate: {
      isIn: [['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']]
    }
  },
  confirmationCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'confirmation_code', // Map to snake_case column
    unique: true,
    comment: 'Unique confirmation code for appointment'
  },
  source: {
    type: DataTypes.STRING, // Use STRING instead of ENUM to match existing
    defaultValue: 'voice_booking', // Match database default
    validate: {
      isIn: [['voice_booking', 'online', 'manual', 'walk-in']]
    }
  },
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'America/New_York'
  },
  zoomMeetingUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'zoom_meeting_url'
  },
  zoomMeetingId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'zoom_meeting_id'
  },
  zoomPassword: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'zoom_password'
  },
  hubspotContactId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'hubspot_contact_id'
  },
  hubspotMeetingId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'hubspot_meeting_id'
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'email_sent'
  },
  smsSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'sms_sent'
  },
  reminderSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'reminder_sent'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  cancelReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'cancel_reason'
  },
  rescheduleCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'reschedule_count'
  },
  callSid: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'call_sid',
    comment: 'Twilio Call SID if booked via phone'
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  underscored: true, // Use snake_case for timestamps
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['contact_id']
    },
    {
      fields: ['customer_phone']
    },
    {
      fields: ['appointment_date']
    },
    {
      fields: ['appointment_time']
    },
    {
      fields: ['status']
    },
    {
      fields: ['source']
    },
    {
      fields: ['confirmation_code']
    },
    {
      unique: true,
      fields: ['appointment_date', 'appointment_time'],
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

Appointment.findByConfirmationCode = function(confirmationCode) {
  return this.findOne({
    where: { confirmationCode }
  });
};

Appointment.checkAvailability = function(date, time) {
  return this.findOne({
    where: { 
      appointmentDate: date,
      appointmentTime: time,
      status: ['confirmed', 'scheduled']
    }
  });
};

Appointment.getAvailableSlots = function(date) {
  const businessHours = [
    '09:00:00', '09:30:00', '10:00:00', '10:30:00', '11:00:00', '11:30:00',
    '14:00:00', '14:30:00', '15:00:00', '15:30:00', '16:00:00', '16:30:00', '17:00:00'
  ];
  
  return this.findAll({
    where: { 
      appointmentDate: date,
      status: ['scheduled', 'confirmed']
    },
    attributes: ['appointmentTime']
  }).then(bookedSlots => {
    const bookedTimes = bookedSlots.map(slot => slot.appointmentTime);
    return businessHours.filter(time => !bookedTimes.includes(time));
  });
};

module.exports = Appointment;
