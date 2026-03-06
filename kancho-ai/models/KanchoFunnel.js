// kancho-ai/models/KanchoFunnel.js
// Marketing funnels with multi-step landing pages

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoFunnel = sequelize.define('KanchoFunnel', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'URL-safe identifier for public access'
    },
    type: {
      type: DataTypes.STRING(30),
      defaultValue: 'lead_capture',
      validate: {
        isIn: [['lead_capture', 'trial_booking', 'event_registration', 'membership_signup', 'referral', 'custom']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'draft',
      validate: {
        isIn: [['draft', 'active', 'paused', 'archived']]
      }
    },
    steps: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of funnel steps: [{ order, type, page_id, action }]'
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ redirect_url, thank_you_message, auto_tag, notification_email }'
    },
    stats: {
      type: DataTypes.JSONB,
      defaultValue: { views: 0, submissions: 0, conversions: 0 }
    },
    campaign_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    automation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Trigger this automation on form submission'
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
    tableName: 'kancho_funnels',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { unique: true, fields: ['school_id', 'slug'] },
      { fields: ['status'] }
    ]
  });

  KanchoFunnel.associate = (models) => {
    KanchoFunnel.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoFunnel.hasMany(models.KanchoLandingPage, { foreignKey: 'funnel_id', as: 'pages' });
  };

  return KanchoFunnel;
};
