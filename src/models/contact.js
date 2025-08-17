const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 50]
    }
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 50]
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      is: /^\+[1-9]\d{1,14}$/ // E.164 format
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'blocked'),
    defaultValue: 'active'
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: 'manual',
    comment: 'How the contact was created (manual, voice_call, sms, etc.)'
  },
  lastContactedAt: {
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
  tableName: 'contacts',
  timestamps: true,
  indexes: [
    {
      fields: ['phone']
    },
    {
      fields: ['email']
    },
    {
      fields: ['firstName', 'lastName']
    },
    {
      fields: ['createdAt']
    }
  ]
});

// Instance methods
Contact.prototype.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

Contact.prototype.updateLastContacted = function() {
  this.lastContactedAt = new Date();
  return this.save();
};

// Class methods
Contact.findByPhone = function(phone) {
  return this.findOne({ where: { phone } });
};

Contact.findByEmail = function(email) {
  return this.findOne({ where: { email } });
};

Contact.getRecentContacts = function(limit = 10) {
  return this.findAll({
    order: [['createdAt', 'DESC']],
    limit
  });
};

Contact.searchContacts = function(query) {
  const { Op } = require('sequelize');
  return this.findAll({
    where: {
      [Op.or]: [
        { firstName: { [Op.iLike]: `%${query}%` } },
        { lastName: { [Op.iLike]: `%${query}%` } },
        { email: { [Op.iLike]: `%${query}%` } },
        { phone: { [Op.like]: `%${query}%` } }
      ]
    },
    order: [['firstName', 'ASC'], ['lastName', 'ASC']]
  });
};

module.exports = Contact;