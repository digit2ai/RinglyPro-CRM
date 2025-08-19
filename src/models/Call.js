// src/models/Call.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Call = sequelize.define('Call', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'References contacts table - nullable for unknown callers'
  },
  twilioCallSid: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Twilio call SID for tracking'
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
  status: {
    type: DataTypes.ENUM('queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'),
    defaultValue: 'queued'
  },
  callStatus: {
    type: DataTypes.ENUM('initiated', 'ringing', 'answered', 'completed', 'missed', 'failed', 'busy', 'no-answer'),
    defaultValue: 'initiated'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Call duration in seconds'
  },
  recordingUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL to call recording if available'
  },
  cost: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    comment: 'Call cost in USD'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the call started'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the call ended'
  },
  answeredBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Human or machine answered'
  },
  hangupCause: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Reason for call ending'
  },
  callerName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Caller ID name if available'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Call notes or summary'
  }
}, {
  tableName: 'calls',
  timestamps: true,
  indexes: [
    {
      fields: ['contactId']
    },
    {
      fields: ['twilioCallSid']
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
    },
    {
      fields: ['callStatus']
    }
  ]
});

// Instance methods
Call.prototype.getFormattedDuration = function() {
  if (!this.duration) return '00:00';
  
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

Call.prototype.getFormattedStartTime = function() {
  if (!this.startTime) return 'Unknown';
  
  return this.startTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

Call.prototype.isIncoming = function() {
  return this.direction === 'incoming';
};

Call.prototype.isMissed = function() {
  return this.callStatus === 'missed' || this.callStatus === 'no-answer';
};

Call.prototype.isCompleted = function() {
  return this.callStatus === 'completed' && this.duration > 0;
};

// Class methods
Call.findByTwilioSid = function(twilioCallSid) {
  return this.findOne({ where: { twilioCallSid } });
};

Call.findByContact = function(contactId, options = {}) {
  return this.findAll({
    where: { contactId },
    order: [['createdAt', options.order || 'DESC']],
    limit: options.limit || 50,
    offset: options.offset || 0
  });
};

Call.findByPhoneNumber = function(phoneNumber, options = {}) {
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

Call.getTodaysCalls = function() {
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

Call.getCallStats = function(dateRange = 'today') {
  const { Op } = require('sequelize');
  let whereClause = {};
  
  if (dateRange === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    whereClause.createdAt = {
      [Op.between]: [today, tomorrow]
    };
  }
  
  return this.findAll({
    where: whereClause,
    attributes: [
      'direction',
      'callStatus',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('duration')), 'totalDuration']
    ],
    group: ['direction', 'callStatus']
  });
};

module.exports = Call;