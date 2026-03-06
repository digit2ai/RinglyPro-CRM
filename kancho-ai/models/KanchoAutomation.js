// kancho-ai/models/KanchoAutomation.js
// AI-powered automation workflows

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoAutomation = sequelize.define('KanchoAutomation', {
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
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'lead_followup, trial_booking, retention, reactivation, payment_reminder, welcome, birthday, belt_promotion, attendance_alert, custom'
    },
    trigger_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'event, schedule, condition'
    },
    trigger_config: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Trigger conditions: { event, delay, conditions, schedule }'
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Array of actions: [{ type: sms|email|call|task|update, config }]'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    runs_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    last_run_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    success_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    failure_count: {
      type: DataTypes.INTEGER,
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
    tableName: 'kancho_automations',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['type'] },
      { fields: ['is_active'] }
    ]
  });

  KanchoAutomation.associate = (models) => {
    KanchoAutomation.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoAutomation.hasMany(models.KanchoTask, { foreignKey: 'automation_id', as: 'tasks' });
  };

  return KanchoAutomation;
};
