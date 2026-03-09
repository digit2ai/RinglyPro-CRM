'use strict';

module.exports = (sequelize, DataTypes) => {
  const InventoryData = sequelize.define('PinaxisInventoryData', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    stock: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Storage area'
    },
    storage_space: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Individual bin identifier'
    },
    unit_of_measure: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    snapshot_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'pinaxis_inventory_data',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'sku'] }
    ]
  });

  InventoryData.associate = (models) => {
    InventoryData.belongsTo(models.PinaxisProject, { foreignKey: 'project_id', as: 'project' });
  };

  return InventoryData;
};
