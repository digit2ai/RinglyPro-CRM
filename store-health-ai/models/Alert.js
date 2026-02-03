'use strict';

module.exports = (sequelize, DataTypes) => {
  const Alert = sequelize.define('Alert', {
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
    kpi_definition_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    alert_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    severity: {
      type: DataTypes.ENUM('yellow', 'red', 'critical'),
      allowNull: false
    },
    escalation_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('active', 'acknowledged', 'resolved', 'expired'),
      allowNull: false,
      defaultValue: 'active'
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    requires_acknowledgment: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    acknowledged_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    acknowledged_by: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'alerts',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'status', 'alert_date']
      },
      {
        fields: ['status']
      },
      {
        fields: ['severity']
      }
    ]
  });

  Alert.associate = (models) => {
    Alert.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
    Alert.belongsTo(models.KpiDefinition, {
      foreignKey: 'kpi_definition_id',
      as: 'kpiDefinition'
    });
    Alert.hasMany(models.Task, {
      foreignKey: 'alert_id',
      as: 'tasks'
    });
    Alert.hasMany(models.Escalation, {
      foreignKey: 'alert_id',
      as: 'escalations'
    });
    Alert.hasMany(models.AiCall, {
      foreignKey: 'alert_id',
      as: 'aiCalls'
    });
  };

  return Alert;
};
