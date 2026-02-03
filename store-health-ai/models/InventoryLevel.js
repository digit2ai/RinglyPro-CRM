'use strict';

module.exports = (sequelize, DataTypes) => {
  const InventoryLevel = sequelize.define('InventoryLevel', {
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
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    product_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    snapshot_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    quantity_on_hand: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    average_daily_sales: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    days_of_cover: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true
    },
    is_top_sku: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_out_of_stock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('green', 'yellow', 'red'),
      allowNull: false,
      defaultValue: 'green'
    }
  }, {
    tableName: 'inventory_levels',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'snapshot_date', 'is_top_sku']
      },
      {
        fields: ['sku']
      },
      {
        fields: ['is_out_of_stock']
      }
    ]
  });

  InventoryLevel.associate = (models) => {
    InventoryLevel.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
  };

  return InventoryLevel;
};
