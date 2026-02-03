'use strict';

module.exports = (sequelize, DataTypes) => {
  const OutOfStockEvent = sequelize.define('OutOfStockEvent', {
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
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    product_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    out_of_stock_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    restocked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration_hours: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    estimated_lost_sales: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    is_top_sku: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'out_of_stock_events',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['store_id', 'out_of_stock_at']
      },
      {
        fields: ['sku']
      }
    ]
  });

  OutOfStockEvent.associate = (models) => {
    OutOfStockEvent.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
  };

  return OutOfStockEvent;
};
