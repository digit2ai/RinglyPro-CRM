// src/models/Appointment.js - FIXED FOR EXISTING DATABASE
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
    field: 'client_id',
    comment: 'References clients table - multi-tenant isolation'
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'contact_id',
    comment: 'References contacts table - nullable for walk-ins'
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'customer_name',
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'customer_phone',
    validate: {
      notEmpty: true
    }
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'customer_email',
    validate: {
      isEmail: {
        msg: 'Must be a valid email address'
      }
    }
  },
  appointmentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'appointment_date',
    comment: 'Date of appointment (YYYY-MM-DD)'
  },
  appointmentTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'appointment_time',
    comment: 'Time of appointment (HH:MM:SS)'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 30,
    comment: 'Duration in minutes'
  },
  purpose: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: 'General consultation',
    comment: 'Purpose of appointment'
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'confirmed',
    validate: {
      isIn: [['confirmed', 'pending', 'cancelled', 'completed', 'no-show', 'scheduled']]
    }
  },
  confirmationCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'confirmation_code',
    unique: true,
    comment: 'Unique confirmation code for appointment'
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: 'voice_booking',
    validate: {
      isIn: [['voice_booking', 'online', 'manual', 'walk-in']]
    }
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  underscored: true,
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
      fields: ['client_id', 'appointment_date', 'appointment_time'],
      name: 'unique_time_slot_per_client'
    }
  ]
});

// Static method to find today's active appointments (excluding cancelled)
Appointment.findTodaysAppointments = function() {
  const { Op } = require('sequelize');
  const today = new Date().toISOString().split('T')[0];
  
  return this.findAll({
    where: {
      appointmentDate: today,
      status: {
        [Op.notIn]: ['cancelled', 'completed'] // Hide cancelled and completed
      }
    },
    order: [['appointmentTime', 'ASC']]
  });
};

module.exports = Appointment;

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
      status: ['confirmed', 'pending']
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
      status: ['confirmed', 'pending']
    },
    attributes: ['appointmentTime']
  }).then(bookedSlots => {
    const bookedTimes = bookedSlots.map(slot => slot.appointmentTime);
    return businessHours.filter(time => !bookedTimes.includes(time));
  });
};

module.exports = Appointment;
