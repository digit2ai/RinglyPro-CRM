// kancho-ai/models/KanchoLandingPage.js
// Hosted landing pages for funnels

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoLandingPage = sequelize.define('KanchoLandingPage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    funnel_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    template: {
      type: DataTypes.STRING(50),
      defaultValue: 'trial_class',
      validate: {
        isIn: [['trial_class', 'free_week', 'kids_program', 'self_defense', 'event', 'membership', 'referral', 'blank']]
      }
    },
    headline: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    subheadline: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    hero_image_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    body_html: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Custom HTML content for the page body'
    },
    form_fields: {
      type: DataTypes.JSONB,
      defaultValue: [
        { name: 'first_name', label: 'First Name', type: 'text', required: true },
        { name: 'last_name', label: 'Last Name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: true }
      ]
    },
    cta_text: {
      type: DataTypes.STRING(100),
      defaultValue: 'Book Your Free Trial'
    },
    thank_you_message: {
      type: DataTypes.TEXT,
      defaultValue: 'Thank you! We\'ll be in touch shortly.'
    },
    redirect_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    style: {
      type: DataTypes.JSONB,
      defaultValue: {
        primary_color: '#E85A4F',
        bg_color: '#0D0D0D',
        text_color: '#FFFFFF',
        font: 'Inter'
      }
    },
    seo: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ title, description, og_image }'
    },
    stats: {
      type: DataTypes.JSONB,
      defaultValue: { views: 0, submissions: 0 }
    },
    is_published: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
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
    tableName: 'kancho_landing_pages',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['funnel_id'] },
      { unique: true, fields: ['school_id', 'slug'] }
    ]
  });

  KanchoLandingPage.associate = (models) => {
    KanchoLandingPage.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoLandingPage.belongsTo(models.KanchoFunnel, { foreignKey: 'funnel_id', as: 'funnel' });
  };

  return KanchoLandingPage;
};
