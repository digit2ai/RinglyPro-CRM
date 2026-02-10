// spark-ai/models/SparkAiCall.js
// AI Voice Call logs for Sensei/Maestro agents

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SparkAiCall = sequelize.define('SparkAiCall', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'spark_schools', key: 'id' }
    },
    agent: {
      type: DataTypes.ENUM('sensei', 'maestro'),
      allowNull: false,
      comment: 'Which AI agent handled the call'
    },
    call_type: {
      type: DataTypes.ENUM('lead_followup', 'no_show', 'retention', 'payment_reminder', 'winback', 'appointment_confirmation', 'survey', 'other'),
      allowNull: false
    },
    direction: {
      type: DataTypes.ENUM('inbound', 'outbound'),
      allowNull: false
    },
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'spark_leads', key: 'id' }
    },
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'spark_students', key: 'id' }
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('completed', 'no_answer', 'voicemail', 'busy', 'failed', 'transferred'),
      allowNull: false
    },
    outcome: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'What was achieved (trial_booked, payment_made, callback_scheduled, etc.)'
    },
    sentiment: {
      type: DataTypes.ENUM('positive', 'neutral', 'negative'),
      defaultValue: 'neutral'
    },
    transcript: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AI-generated call summary'
    },
    action_items: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      comment: 'Follow-up actions from this call'
    },
    recording_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    external_call_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Twilio or ElevenLabs call ID'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'spark_ai_calls',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['agent'] },
      { fields: ['call_type'] },
      { fields: ['status'] },
      { fields: ['lead_id'] },
      { fields: ['student_id'] },
      { fields: ['created_at'] }
    ]
  });

  SparkAiCall.associate = (models) => {
    SparkAiCall.belongsTo(models.SparkSchool, { foreignKey: 'school_id', as: 'school' });
    SparkAiCall.belongsTo(models.SparkLead, { foreignKey: 'lead_id', as: 'lead' });
    SparkAiCall.belongsTo(models.SparkStudent, { foreignKey: 'student_id', as: 'student' });
  };

  return SparkAiCall;
};
