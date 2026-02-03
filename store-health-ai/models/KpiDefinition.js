'use strict';

module.exports = (sequelize, DataTypes) => {
  const KpiDefinition = sequelize.define('KpiDefinition', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    kpi_code: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    calculation_method: {
      type: DataTypes.ENUM('sum', 'average', 'ratio', 'percentage', 'count', 'custom'),
      allowNull: false,
      defaultValue: 'sum'
    },
    category: {
      type: DataTypes.ENUM('sales', 'traffic', 'labor', 'inventory', 'hr', 'operations'),
      allowNull: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'kpi_definitions',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  KpiDefinition.associate = (models) => {
    KpiDefinition.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });
    KpiDefinition.hasMany(models.KpiThreshold, {
      foreignKey: 'kpi_definition_id',
      as: 'thresholds'
    });
    KpiDefinition.hasMany(models.KpiMetric, {
      foreignKey: 'kpi_definition_id',
      as: 'metrics'
    });
    KpiDefinition.hasMany(models.Alert, {
      foreignKey: 'kpi_definition_id',
      as: 'alerts'
    });
    KpiDefinition.hasMany(models.EscalationRule, {
      foreignKey: 'kpi_definition_id',
      as: 'escalationRules'
    });
  };

  return KpiDefinition;
};
