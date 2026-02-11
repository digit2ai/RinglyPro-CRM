'use strict';

/**
 * Sponsor Model - TunjoRacing Sponsorship Platform
 * Stores sponsor accounts and their dashboard access
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const Sponsor = sequelize.define('TunjoSponsor', {
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
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    contact_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    logo_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sponsorship_level: {
      type: DataTypes.ENUM('title', 'primary', 'supporting', 'media'),
      allowNull: false,
      defaultValue: 'supporting'
    },
    contract_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    contract_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    total_investment: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'inactive', 'expired'),
      allowNull: false,
      defaultValue: 'pending'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true
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
    tableName: 'tunjo_sponsors',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['email'], unique: true },
      { fields: ['sponsorship_level'] },
      { fields: ['status'] }
    ],
    hooks: {
      beforeCreate: async (sponsor) => {
        if (sponsor.password_hash && !sponsor.password_hash.startsWith('$2')) {
          sponsor.password_hash = await bcrypt.hash(sponsor.password_hash, 10);
        }
      },
      beforeUpdate: async (sponsor) => {
        sponsor.updated_at = new Date();
        if (sponsor.changed('password_hash') && !sponsor.password_hash.startsWith('$2')) {
          sponsor.password_hash = await bcrypt.hash(sponsor.password_hash, 10);
        }
      }
    }
  });

  Sponsor.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password_hash);
  };

  Sponsor.associate = (models) => {
    Sponsor.hasMany(models.TunjoMediaContent, { foreignKey: 'sponsor_id', as: 'media' });
    Sponsor.hasMany(models.TunjoSponsorshipDeal, { foreignKey: 'sponsor_id', as: 'deals' });
  };

  return Sponsor;
};
