'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Sponsor = sequelize.define('RoninSponsor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    contact_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    website: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    logo_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    tier: {
      type: DataTypes.ENUM('platinum', 'gold', 'silver', 'bronze', 'supporter'),
      allowNull: false,
      defaultValue: 'supporter'
    },
    sponsorship_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    sponsorship_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'financial, equipment, venue, media, etc.'
    },
    benefits: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of benefits: logo_placement, event_tickets, etc.'
    },
    contract_start: {
      type: DataTypes.DATE,
      allowNull: true
    },
    contract_end: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    notes: {
      type: DataTypes.TEXT,
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
    tableName: 'ronin_sponsors',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['tier'] },
      { fields: ['status'] },
      { fields: ['email'] }
    ]
  });

  return Sponsor;
};
