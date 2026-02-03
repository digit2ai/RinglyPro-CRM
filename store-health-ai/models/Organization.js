'use strict';

module.exports = (sequelize, DataTypes) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'America/New_York'
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'organizations',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Organization.associate = (models) => {
    Organization.hasMany(models.Region, {
      foreignKey: 'organization_id',
      as: 'regions'
    });
    Organization.hasMany(models.District, {
      foreignKey: 'organization_id',
      as: 'districts'
    });
    Organization.hasMany(models.Store, {
      foreignKey: 'organization_id',
      as: 'stores'
    });
    Organization.hasMany(models.KpiDefinition, {
      foreignKey: 'organization_id',
      as: 'kpiDefinitions'
    });
    Organization.hasMany(models.KpiThreshold, {
      foreignKey: 'organization_id',
      as: 'kpiThresholds'
    });
    Organization.hasMany(models.EscalationRule, {
      foreignKey: 'organization_id',
      as: 'escalationRules'
    });
    Organization.hasMany(models.CallScript, {
      foreignKey: 'organization_id',
      as: 'callScripts'
    });
    Organization.hasMany(models.SystemConfig, {
      foreignKey: 'organization_id',
      as: 'configs'
    });
  };

  return Organization;
};
