'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Order = sequelize.define('RoninOrder', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    member_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Null for guest checkout'
    },
    order_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'),
      allowNull: false,
      defaultValue: 'pending'
    },
    // Customer Info (for guest checkout)
    customer_email: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    customer_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    customer_phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    // Shipping
    shipping_address: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: '{ line1, line2, city, state, zip, country }'
    },
    shipping_method: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    shipping_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // Pricing
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    tax: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    // Payment
    payment_method: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'pending'
    },
    stripe_payment_intent_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
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
    tableName: 'ronin_orders',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['member_id'] },
      { fields: ['order_number'], unique: true },
      { fields: ['status'] },
      { fields: ['payment_status'] },
      { fields: ['created_at'] }
    ],
    hooks: {
      beforeCreate: async (order) => {
        if (!order.order_number) {
          const prefix = 'RB';
          const timestamp = Date.now().toString(36).toUpperCase();
          const random = Math.random().toString(36).substring(2, 6).toUpperCase();
          order.order_number = `${prefix}-${timestamp}-${random}`;
        }
      },
      beforeUpdate: async (order) => {
        order.updated_at = new Date();
      }
    }
  });

  Order.associate = (models) => {
    Order.belongsTo(models.RoninMember, { foreignKey: 'member_id', as: 'member' });
    Order.hasMany(models.RoninOrderItem, { foreignKey: 'order_id', as: 'items' });
  };

  return Order;
};
