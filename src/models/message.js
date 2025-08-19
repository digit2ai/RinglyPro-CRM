// src/models/Message.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'References contacts table - nullable for unknown senders'
  },
  twilioSid: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Twilio message SID for tracking'
  },
  direction: {
    type: DataTypes.ENUM('incoming', 'outgoing'),
    allowNull: false
  },
  fromNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  toNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 1600] // SMS limit
    }
  },
  status: {
    type: DataTypes.ENUM('queued', 'sent', 'received', 'delivered', 'failed', 'undelivered'),
    defaultValue: 'queued'
  },
  errorCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  cost: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    comment: 'Message cost in USD'
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true
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
  tableName: 'messages',
  timestamps: true,
  indexes: [
    {
      fields: ['contactId']
    },
    {
      fields: ['twilioSid']
    },
    {
      fields: ['direction']
    },
    {
      fields: ['fromNumber']
    },
    {
      fields: ['toNumber']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['status']
    }
  ]
});

// Instance methods
Message.prototype.getFormattedDate = function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

Message.prototype.isFromContact = function() {
  return this.direction === 'incoming';
};

Message.prototype.markAsDelivered = function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

// Class methods
Message.findByTwilioSid = function(twilioSid) {
  return this.findOne({ where: { twilioSid } });
};

Message.findByContact = function(contactId, options = {}) {
  return this.findAll({
    where: { contactId },
    order: [['createdAt', options.order || 'DESC']],
    limit: options.limit || 50,
    offset: options.offset || 0
  });
};

Message.findByPhoneNumber = function(phoneNumber, options = {}) {
  const { Op } = require('sequelize');
  return this.findAll({
    where: {
      [Op.or]: [
        { fromNumber: phoneNumber },
        { toNumber: phoneNumber }
      ]
    },
    order: [['createdAt', options.order || 'DESC']],
    limit: options.limit || 50,
    offset: options.offset || 0
  });
};

Message.getTodaysMessages = function() {
  const { Op } = require('sequelize');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return this.findAll({
    where: {
      createdAt: {
        [Op.between]: [today, tomorrow]
      }
    },
    order: [['createdAt', 'DESC']]
  });
};

module.exports = Message;
