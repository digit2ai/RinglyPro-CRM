'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const OrderItem = sequelize.define('RoninOrderItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    variant_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    product_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    variant_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    unit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    total_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'ronin_order_items',
    timestamps: false,
    indexes: [
      { fields: ['order_id'] },
      { fields: ['product_id'] },
      { fields: ['tenant_id'] }
    ]
  });

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.RoninOrder, { foreignKey: 'order_id', as: 'order' });
    OrderItem.belongsTo(models.RoninProduct, { foreignKey: 'product_id', as: 'product' });
  };

  return OrderItem;
};
