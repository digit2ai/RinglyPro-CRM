'use strict';

module.exports = (sequelize, DataTypes) => {
  const Escalation = sequelize.define('Escalation', {
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
      allowNull: false
    },
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    from_level: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    to_level: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    escalation_reason: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    triggered_by: {
      type: DataTypes.ENUM('threshold', 'sla_breach', 'manual', 'predicted_risk'),
      allowNull: false
    },
    escalated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    escalated_to_role: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    escalated_to_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    escalated_to_contact: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'acknowledged', 'resolved'),
      allowNull: false,
      defaultValue: 'pending'
    },
    resolution: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'escalations',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'status', 'escalated_at']
      },
      {
        fields: ['alert_id']
      },
      {
        fields: ['task_id']
      }
    ]
  });

  Escalation.associate = (models) => {
    Escalation.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
    Escalation.belongsTo(models.Alert, {
      foreignKey: 'alert_id',
      as: 'alert'
    });
    Escalation.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task'
    });
    Escalation.hasMany(models.AiCall, {
      foreignKey: 'escalation_id',
      as: 'aiCalls'
    });
  };

  return Escalation;
};
