'use strict';

module.exports = (sequelize, DataTypes) => {
  const StoreHealthSnapshot = sequelize.define('StoreHealthSnapshot', {
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
    snapshot_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    overall_status: {
      type: DataTypes.ENUM('green', 'yellow', 'red'),
      allowNull: false
    },
    health_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 100
    },
    red_kpi_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    yellow_kpi_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    green_kpi_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    escalation_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    risk_probability: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    action_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'store_health_snapshots',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['store_id', 'snapshot_date']
      },
      {
        fields: ['snapshot_date']
      },
      {
        fields: ['overall_status']
      }
    ]
  });

  StoreHealthSnapshot.associate = (models) => {
    StoreHealthSnapshot.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
  };

  return StoreHealthSnapshot;
};
