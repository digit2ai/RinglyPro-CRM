'use strict';

/**
 * CartItem Model - TunjoRacing Merchandise Store
 * Stores shopping cart items (persistent cart)
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CartItem = sequelize.define('TunjoCartItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Multi-tenant isolation'
    },
    session_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Session ID for guest checkout'
    },
    fan_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Optional: linked fan account'
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    variant_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    price_at_add: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Price when added to cart'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'tunjo_cart_items',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['session_id'] },
      { fields: ['fan_id'] },
      { fields: ['product_id'] },
      { fields: ['created_at'] }
    ],
    hooks: {
      beforeUpdate: async (item) => {
        item.updated_at = new Date();
      }
    }
  });

  CartItem.associate = (models) => {
    CartItem.belongsTo(models.TunjoProduct, { foreignKey: 'product_id', as: 'product' });
    CartItem.belongsTo(models.TunjoProductVariant, { foreignKey: 'variant_id', as: 'variant' });
    CartItem.belongsTo(models.TunjoFan, { foreignKey: 'fan_id', as: 'fan' });
  };

  return CartItem;
};
