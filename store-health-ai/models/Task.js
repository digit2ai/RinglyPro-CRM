'use strict';

module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    alert_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    kpi_definition_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    task_type: {
      type: DataTypes.ENUM('review', 'action', 'escalation', 'follow_up'),
      allowNull: false,
      defaultValue: 'review'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    assigned_to_role: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    assigned_to_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    assigned_to_contact: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    due_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_by: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    outcome: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'tasks',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'status', 'due_date']
      },
      {
        fields: ['alert_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['priority', 'status']
      }
    ]
  });

  Task.associate = (models) => {
    Task.belongsTo(models.Alert, {
      foreignKey: 'alert_id',
      as: 'alert'
    });
    Task.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
    Task.belongsTo(models.KpiDefinition, {
      foreignKey: 'kpi_definition_id',
      as: 'kpiDefinition'
    });
    Task.hasMany(models.Escalation, {
      foreignKey: 'task_id',
      as: 'escalations'
    });
    Task.hasMany(models.AiCall, {
      foreignKey: 'task_id',
      as: 'aiCalls'
    });
  };

  return Task;
};
