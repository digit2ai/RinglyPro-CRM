'use strict';

module.exports = (sequelize, DataTypes) => {
  const AiCall = sequelize.define('AiCall', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    alert_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    escalation_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    call_type: {
      type: DataTypes.ENUM('green', 'yellow', 'red'),
      allowNull: false
    },
    call_status: {
      type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'failed', 'no_answer'),
      allowNull: false,
      defaultValue: 'scheduled'
    },
    recipient_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    recipient_phone: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    call_initiated_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    call_connected_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    call_ended_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    call_duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    transcript: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sentiment: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    response: {
      type: DataTypes.ENUM('yes', 'later', 'no_answer', 'other'),
      allowNull: true
    },
    follow_up_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    recording_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    external_call_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'ai_calls',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'call_initiated_at']
      },
      {
        fields: ['call_status']
      },
      {
        fields: ['external_call_id']
      }
    ]
  });

  AiCall.associate = (models) => {
    AiCall.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
    AiCall.belongsTo(models.Alert, {
      foreignKey: 'alert_id',
      as: 'alert'
    });
    AiCall.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task'
    });
    AiCall.belongsTo(models.Escalation, {
      foreignKey: 'escalation_id',
      as: 'escalation'
    });
  };

  return AiCall;
};
