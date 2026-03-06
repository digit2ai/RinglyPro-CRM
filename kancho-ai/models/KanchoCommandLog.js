// kancho-ai/models/KanchoCommandLog.js
// NLP command audit logging

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoCommandLog = sequelize.define('KanchoCommandLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'chat',
      comment: 'chat, voice'
    },
    raw_text: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    parsed_intent: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    parsed_domain: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    parsed_action: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    confidence: {
      type: DataTypes.DECIMAL(4, 3),
      allowNull: true
    },
    entities: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    parameters: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    confirmation_required: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    confirmation_received: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    execution_status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      comment: 'pending, executed, failed, awaiting_confirmation, clarification_needed'
    },
    result_summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    affected_record_ids: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_command_logs',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['channel'] },
      { fields: ['parsed_domain'] },
      { fields: ['execution_status'] },
      { fields: ['created_at'] }
    ]
  });

  return KanchoCommandLog;
};
