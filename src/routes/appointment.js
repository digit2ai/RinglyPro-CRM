// src/models/Appointment.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  clientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'References clients table - required for multi-tenant'
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
  confirmationCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Unique confirmation code for appointment'
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
  underscored: true, // ADDED: Maps camelCase to snake_case in database
  indexes: [
    {
      fields: ['client_id'] // ADDED: Index for client_id
    },
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
      fields: ['appointmentDate', 'appointmentTime', 'client_id'], // FIXED: Added client_id to unique constraint
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

Appointment.findByClient = function(clientId, options = {}) {
  return this.findAll({
    where: { clientId },
    order: [['appointmentDate', options.order || 'DESC'], ['appointmentTime', 'DESC']],
    limit: options.limit || 50,
    offset: options.offset || 0
  });
};

Appointment.findByPhone = function(phone) {
  return this.findAll({
    where: { customerPhone: phone },
    order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']],
    limit: 5
  });
};

Appointment.checkAvailability = function(date, time, clientId) {
  return this.findOne({
    where: { 
      clientId: clientId,
      appointmentDate: date,
      appointmentTime: time,
      status: ['confirmed', 'pending']
    }
  });
};

Appointment.getAvailableSlots = function(date, clientId) {
  const businessHours = [
    '09:00:00', '10:00:00', '11:00:00',
    '14:00:00', '15:00:00', '16:00:00', '17:00:00'
  ];
  
  return this.findAll({
    where: { 
      appointmentDate: date,
      clientId: clientId
    },
    attributes: ['appointmentTime']
  }).then(bookedSlots => {
    const bookedTimes = bookedSlots.map(slot => slot.appointmentTime);
    return businessHours.filter(time => !bookedTimes.includes(time));
  });
};

module.exports = Appointment;
