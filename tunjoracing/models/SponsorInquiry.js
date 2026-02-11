'use strict';

/**
 * SponsorInquiry Model - TunjoRacing Sponsorship Platform
 * Stores sponsor inquiry form submissions
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SponsorInquiry = sequelize.define('TunjoSponsorInquiry', {
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
      validate: {
        isEmail: true
      }
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    company_size: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'e.g., 1-10, 11-50, 51-200, 200+'
    },
    interested_level: {
      type: DataTypes.ENUM('title', 'primary', 'supporting', 'media', 'undecided'),
      allowNull: true
    },
    budget_range: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., $5K-$10K, $10K-$25K, $25K+'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    how_found_us: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'How they heard about TunjoRacing'
    },
    // UTM tracking
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
    // Status tracking
    status: {
      type: DataTypes.ENUM('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'),
      allowNull: false,
      defaultValue: 'new'
    },
    assigned_to: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Sales rep assigned to this lead'
    },
    follow_up_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    converted_to_sponsor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Link to sponsor record if converted'
    },
    // Metadata
    ip_address: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    user_agent: {
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
    tableName: 'tunjo_sponsor_inquiries',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['email'] },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ],
    hooks: {
      beforeUpdate: async (inquiry) => {
        inquiry.updated_at = new Date();
      }
    }
  });

  SponsorInquiry.associate = (models) => {
    SponsorInquiry.belongsTo(models.TunjoSponsor, { foreignKey: 'converted_to_sponsor_id', as: 'sponsor' });
  };

  return SponsorInquiry;
};
