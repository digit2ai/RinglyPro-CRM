// kancho-ai/models/KanchoAiCall.js
// AI Call logs for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoAiCall = sequelize.define('KanchoAiCall', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'kancho_schools',
        key: 'id'
      }
    },
    agent: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['kancho', 'maestro']]
      }
    },
    call_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [['lead_followup', 'no_show', 'retention', 'payment_reminder', 'winback', 'appointment_confirmation', 'survey', 'other']]
      }
    },
    direction: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [['inbound', 'outbound']]
      }
    },
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'kancho_leads',
        key: 'id'
      }
    },
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'kancho_students',
        key: 'id'
      }
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['completed', 'no_answer', 'voicemail', 'busy', 'failed', 'transferred', 'queued', 'ringing', 'in_progress', 'initiated']]
      }
    },
    outcome: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sentiment: {
      type: DataTypes.STRING(20),
      defaultValue: 'neutral',
      validate: {
        isIn: [['positive', 'neutral', 'negative']]
      }
    },
    transcript: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    action_items: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: []
    },
    recording_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    external_call_id: {
      type: DataTypes.STRING(255),
      allowNull: true
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
    tableName: 'kancho_ai_calls',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['agent'] },
      { fields: ['call_type'] },
      { fields: ['status'] },
      { fields: ['lead_id'] },
      { fields: ['student_id'] },
      { fields: ['created_at'] },
      { fields: ['external_call_id'] }
    ]
  });

  KanchoAiCall.associate = (models) => {
    KanchoAiCall.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoAiCall.belongsTo(models.KanchoLead, { foreignKey: 'lead_id', as: 'lead' });
    KanchoAiCall.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
  };

  return KanchoAiCall;
};
