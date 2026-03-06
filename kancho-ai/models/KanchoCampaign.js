// kancho-ai/models/KanchoCampaign.js
// Marketing campaign management

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoCampaign = sequelize.define('KanchoCampaign', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'kancho_schools', key: 'id' }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(30),
      defaultValue: 'sms',
      comment: 'sms, email, voice, multi_channel'
    },
    goal: {
      type: DataTypes.STRING(50),
      defaultValue: 'engagement',
      comment: 'lead_generation, trial_booking, retention, reactivation, upsell, engagement, referral, promotion'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'draft',
      comment: 'draft, scheduled, active, paused, completed'
    },
    audience: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Target audience filters: { target: leads|students|all, filters: {} }'
    },
    content: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ sms_template, email_subject, email_body, voice_script }'
    },
    schedule: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: '{ start_date, end_date, send_time, days_of_week }'
    },
    stats: {
      type: DataTypes.JSONB,
      defaultValue: { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0, failed: 0 }
    },
    budget: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    spent: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    automation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_automations', key: 'id' }
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
    tableName: 'kancho_campaigns',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['status'] },
      { fields: ['goal'] }
    ]
  });

  KanchoCampaign.associate = (models) => {
    KanchoCampaign.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoCampaign.belongsTo(models.KanchoAutomation, { foreignKey: 'automation_id', as: 'automation' });
  };

  return KanchoCampaign;
};
