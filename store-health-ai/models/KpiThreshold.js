'use strict';

module.exports = (sequelize, DataTypes) => {
  const KpiThreshold = sequelize.define('KpiThreshold', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    kpi_definition_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    green_min: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    yellow_min: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    red_threshold: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    comparison_basis: {
      type: DataTypes.ENUM('rolling_4w', 'same_period_ly', 'absolute', 'budget'),
      allowNull: false,
      defaultValue: 'rolling_4w'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    }
  }, {
    tableName: 'kpi_thresholds',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  KpiThreshold.associate = (models) => {
    KpiThreshold.belongsTo(models.KpiDefinition, {
      foreignKey: 'kpi_definition_id',
      as: 'kpiDefinition'
    });
    KpiThreshold.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });
    KpiThreshold.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
  };

  return KpiThreshold;
};
