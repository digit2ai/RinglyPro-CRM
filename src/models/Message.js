// src/models/Message.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
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
    comment: 'References contacts table - nullable for unknown senders'
  },
  twilioSid: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Twilio message SID for tracking'
  },
  recordingUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Twilio recording URL for voicemails (allows listening to actual audio)'
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
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    comment: 'Whether the message has been read by the client'
  },
  // GHL Sync Fields
  ghlMessageId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ghl_message_id',
    comment: 'GoHighLevel message ID for sync tracking'
  },
  ghlConversationId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ghl_conversation_id',
    comment: 'GoHighLevel conversation thread ID'
  },
  ghlContactId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ghl_contact_id',
    comment: 'GoHighLevel contact ID'
  },
  syncedToGhl: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'synced_to_ghl',
    comment: 'Whether this message has been synced to GHL'
  },
  syncedFromGhl: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'synced_from_ghl',
    comment: 'Whether this message originated from GHL'
  },
  ghlSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'ghl_synced_at',
    comment: 'Timestamp of last GHL sync'
  },
  messageSource: {
    type: DataTypes.ENUM('twilio', 'ghl', 'whatsapp', 'manual', 'elevenlabs'),
    defaultValue: 'twilio',
    field: 'message_source',
    comment: 'Source of the message'
  },
  messageType: {
    type: DataTypes.ENUM('sms', 'email', 'call', 'voicemail', 'whatsapp', 'note'),
    defaultValue: 'sms',
    field: 'message_type',
    comment: 'Type of message/communication'
  },
  callDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'call_duration',
    comment: 'Duration of call/voicemail in seconds'
  },
  callStartTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'call_start_time',
    comment: 'When the call started (for voicemails/calls)'
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
  underscored: true, // ADDED: Maps camelCase to snake_case in database
  indexes: [
    {
      fields: ['client_id'] // ADDED: Index for client_id
    },
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

Message.findByClient = function(clientId, options = {}) {
  return this.findAll({
    where: { clientId },
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
