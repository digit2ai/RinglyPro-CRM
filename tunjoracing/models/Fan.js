'use strict';

/**
 * Fan Model - TunjoRacing Fan Engagement Platform
 * Stores fan database for email marketing and engagement
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const Fan = sequelize.define('TunjoFan', {
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
      comment: 'Hashed password for fan login'
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    membership_tier: {
      type: DataTypes.ENUM('free', 'premium', 'vip'),
      allowNull: false,
      defaultValue: 'free'
    },
    interests: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of interests: racing, merchandise, vip_experiences, etc.'
    },
    engagement_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Calculated engagement score based on interactions'
    },
    email_subscribed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    sms_subscribed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Where the fan signed up: website, race_event, social_media, etc.'
    },
    utm_source: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    utm_medium: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    utm_campaign: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    last_email_opened_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_email_clicked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    total_orders: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_spent: {
      type: DataTypes.DECIMAL(12, 2),
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
    tableName: 'tunjo_fans',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['email'] },
      { fields: ['tenant_id', 'email'], unique: true },
      { fields: ['country'] },
      { fields: ['membership_tier'] },
      { fields: ['engagement_score'] },
      { fields: ['created_at'] }
    ],
    hooks: {
      beforeCreate: async (fan) => {
        if (fan.password_hash && !fan.password_hash.startsWith('$2')) {
          fan.password_hash = await bcrypt.hash(fan.password_hash, 10);
        }
      },
      beforeUpdate: async (fan) => {
        fan.updated_at = new Date();
        if (fan.changed('password_hash') && fan.password_hash && !fan.password_hash.startsWith('$2')) {
          fan.password_hash = await bcrypt.hash(fan.password_hash, 10);
        }
      }
    }
  });

  // Instance method to validate password
  Fan.prototype.validatePassword = async function(password) {
    if (!this.password_hash) return false;
    return bcrypt.compare(password, this.password_hash);
  };

  Fan.associate = (models) => {
    Fan.hasMany(models.TunjoOrder, { foreignKey: 'fan_id', as: 'orders' });
  };

  return Fan;
};
