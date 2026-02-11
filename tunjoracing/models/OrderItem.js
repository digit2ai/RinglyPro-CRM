'use strict';

/**
 * OrderItem Model - TunjoRacing Merchandise Store
 * Stores individual line items for orders
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const OrderItem = sequelize.define('TunjoOrderItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Multi-tenant isolation'
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    variant_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // Snapshot of product at time of order
    product_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    variant_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'e.g., "Large / Red"'
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    image_url: {
      type: DataTypes.TEXT,
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
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    // Fulfillment
    fulfilled_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    refunded_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'tunjo_order_items',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['order_id'] },
      { fields: ['product_id'] },
      { fields: ['variant_id'] }
    ],
    hooks: {
      beforeCreate: async (item) => {
        // Auto-calculate total
        item.total_price = (item.unit_price * item.quantity) - (item.discount_amount || 0);
      }
    }
  });

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.TunjoOrder, { foreignKey: 'order_id', as: 'order' });
    OrderItem.belongsTo(models.TunjoProduct, { foreignKey: 'product_id', as: 'product' });
    OrderItem.belongsTo(models.TunjoProductVariant, { foreignKey: 'variant_id', as: 'variant' });
  };

  return OrderItem;
};
