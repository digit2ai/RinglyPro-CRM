'use strict';

/**
 * SponsorshipDeal Model - TunjoRacing Sponsorship Platform
 * Stores sponsorship packages and deal builder configurations
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SponsorshipDeal = sequelize.define('TunjoSponsorshipDeal', {
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
    sponsor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Linked sponsor if deal is assigned'
    },
    deal_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    sponsorship_level: {
      type: DataTypes.ENUM('title', 'primary', 'supporting', 'media'),
      allowNull: false
    },
    // Package details
    number_of_races: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    logo_placements: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of placement locations: helmet, suit, car, etc.'
    },
    content_campaigns: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of dedicated content campaigns'
    },
    social_mentions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    vip_experiences: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of VIP track day passes'
    },
    hospitality_passes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // Estimated values
    estimated_exposure: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Estimated impressions/reach'
    },
    estimated_media_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Estimated media value in USD'
    },
    package_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    // Contract details
    contract_duration_months: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 12
    },
    payment_terms: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'e.g., "50% upfront, 50% mid-season"'
    },
    // Status
    status: {
      type: DataTypes.ENUM('template', 'proposal', 'negotiation', 'accepted', 'active', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'template'
    },
    // Custom inclusions
    custom_inclusions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of custom package inclusions'
    },
    exclusions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of items excluded from package'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    proposal_pdf_url: {
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
    tableName: 'tunjo_sponsorship_deals',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['sponsor_id'] },
      { fields: ['sponsorship_level'] },
      { fields: ['status'] }
    ],
    hooks: {
      beforeUpdate: async (deal) => {
        deal.updated_at = new Date();
      }
    }
  });

  SponsorshipDeal.associate = (models) => {
    SponsorshipDeal.belongsTo(models.TunjoSponsor, { foreignKey: 'sponsor_id', as: 'sponsor' });
  };

  return SponsorshipDeal;
};
