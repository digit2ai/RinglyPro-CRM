'use strict';

module.exports = (sequelize, DataTypes) => {
  const KpiMetric = sequelize.define('KpiMetric', {
    id: {
      type: DataTypes.BIGINT,
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
    metric_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    metric_timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    value: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false
    },
    comparison_value: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    },
    comparison_type: {
      type: DataTypes.ENUM('rolling_4w', 'same_period_ly', 'budget', 'absolute'),
      allowNull: true
    },
    variance_pct: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('green', 'yellow', 'red'),
      allowNull: false,
      defaultValue: 'green'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'kpi_metrics',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'kpi_definition_id', 'metric_date']
      },
      {
        fields: ['metric_date']
      },
      {
        fields: ['status']
      }
    ]
  });

  KpiMetric.associate = (models) => {
    KpiMetric.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
    KpiMetric.belongsTo(models.KpiDefinition, {
      foreignKey: 'kpi_definition_id',
      as: 'kpiDefinition'
    });
  };

  return KpiMetric;
};
