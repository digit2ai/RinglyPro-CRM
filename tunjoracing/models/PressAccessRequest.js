'use strict';

/**
 * PressAccessRequest Model - TunjoRacing Press & Media Portal
 * Tracks journalist/media access requests pending admin approval
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const PressAccessRequest = sequelize.define('TunjoPressAccessRequest', {
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
    full_name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    media_outlet: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true
      }
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
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional info about why they need access'
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Hashed password set during request - transferred to PressUser on approval'
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending'
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    press_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Set when request is approved and press user account is created'
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
    tableName: 'tunjo_press_access_requests',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['email'] },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ],
    hooks: {
      beforeCreate: async (request) => {
        if (request.password_hash && !request.password_hash.startsWith('$2')) {
          request.password_hash = await bcrypt.hash(request.password_hash, 12);
        }
      },
      beforeUpdate: async (request) => {
        request.updated_at = new Date();
      }
    }
  });

  PressAccessRequest.associate = (models) => {
    // No associations needed
  };

  return PressAccessRequest;
};
