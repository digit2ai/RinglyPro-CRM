'use strict';

module.exports = (sequelize, DataTypes) => {
  const Store = sequelize.define('Store', {
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
    store_code: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    zip_code: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'America/New_York'
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    manager_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    manager_phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    manager_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    region_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    district_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'closed'),
      allowNull: false,
      defaultValue: 'active'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'stores',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Store.associate = (models) => {
    Store.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization'
    });
    Store.belongsTo(models.Region, {
      foreignKey: 'region_id',
      as: 'region'
    });
    Store.belongsTo(models.District, {
      foreignKey: 'district_id',
      as: 'district'
    });
    Store.hasMany(models.KpiMetric, {
      foreignKey: 'store_id',
      as: 'kpiMetrics'
    });
    Store.hasMany(models.StoreHealthSnapshot, {
      foreignKey: 'store_id',
      as: 'healthSnapshots'
    });
    Store.hasMany(models.Alert, {
      foreignKey: 'store_id',
      as: 'alerts'
    });
    Store.hasMany(models.Task, {
      foreignKey: 'store_id',
      as: 'tasks'
    });
    Store.hasMany(models.Escalation, {
      foreignKey: 'store_id',
      as: 'escalations'
    });
    Store.hasMany(models.AiCall, {
      foreignKey: 'store_id',
      as: 'aiCalls'
    });
    Store.hasMany(models.RiskPrediction, {
      foreignKey: 'store_id',
      as: 'riskPredictions'
    });
    Store.hasMany(models.LaborSchedule, {
      foreignKey: 'store_id',
      as: 'laborSchedules'
    });
    Store.hasMany(models.LaborCallout, {
      foreignKey: 'store_id',
      as: 'laborCallouts'
    });
    Store.hasMany(models.InventoryLevel, {
      foreignKey: 'store_id',
      as: 'inventoryLevels'
    });
    Store.hasMany(models.OutOfStockEvent, {
      foreignKey: 'store_id',
      as: 'outOfStockEvents'
    });
  };

  return Store;
};
