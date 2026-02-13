'use strict';

/**
 * PressUser Model - TunjoRacing Press & Media Portal
 * Approved journalists and media professionals
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const PressUser = sequelize.define('TunjoPressUser', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Multi-tenant isolation'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Hashed password for press login'
    },
    full_name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    media_outlet: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Publication or media organization'
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Journalist, Editor, Photographer, etc.'
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    website: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'inactive'),
      allowNull: false,
      defaultValue: 'active'
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    download_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'tunjo_press_users',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['email'] },
      { fields: ['tenant_id', 'email'], unique: true },
      { fields: ['status'] },
      { fields: ['media_outlet'] }
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.password_hash && !user.password_hash.startsWith('$2')) {
          user.password_hash = await bcrypt.hash(user.password_hash, 10);
        }
      },
      beforeUpdate: async (user) => {
        user.updated_at = new Date();
        if (user.changed('password_hash') && user.password_hash && !user.password_hash.startsWith('$2')) {
          user.password_hash = await bcrypt.hash(user.password_hash, 10);
        }
      }
    }
  });

  PressUser.prototype.validatePassword = async function(password) {
    if (!this.password_hash) return false;
    return bcrypt.compare(password, this.password_hash);
  };

  PressUser.associate = (models) => {
    // No associations needed yet
  };

  return PressUser;
};
