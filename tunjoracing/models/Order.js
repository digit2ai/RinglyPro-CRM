'use strict';

/**
 * Order Model - TunjoRacing Merchandise Store
 * Stores orders with Stripe integration
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Order = sequelize.define('TunjoOrder', {
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
    order_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    fan_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Optional: linked fan account'
    },
    // Customer info (for guest checkout)
    customer_email: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    customer_first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    customer_last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    customer_phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    // Shipping address
    shipping_address_line1: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    shipping_address_line2: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    shipping_city: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    shipping_state: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    shipping_postal_code: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    shipping_country: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'United States'
    },
    // Billing address (if different)
    billing_same_as_shipping: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    billing_address_line1: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    billing_city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    billing_state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    billing_postal_code: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    billing_country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    // Totals
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    shipping_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    tax_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount_code: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    // Stripe
    stripe_checkout_session_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    stripe_payment_intent_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // Status
    payment_status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded'),
      allowNull: false,
      defaultValue: 'pending'
    },
    fulfillment_status: {
      type: DataTypes.ENUM('unfulfilled', 'partial', 'fulfilled', 'cancelled'),
      allowNull: false,
      defaultValue: 'unfulfilled'
    },
    // Shipping info
    shipping_method: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    tracking_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    shipped_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    delivered_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Notes
    customer_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    internal_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Metadata
    ip_address: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Emails
    confirmation_email_sent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    shipping_email_sent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelled_at: {
      type: DataTypes.DATE,
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
    tableName: 'tunjo_orders',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['order_number'], unique: true },
      { fields: ['fan_id'] },
      { fields: ['customer_email'] },
      { fields: ['payment_status'] },
      { fields: ['fulfillment_status'] },
      { fields: ['stripe_checkout_session_id'] },
      { fields: ['stripe_payment_intent_id'] },
      { fields: ['created_at'] }
    ],
    hooks: {
      beforeUpdate: async (order) => {
        order.updated_at = new Date();
      },
      beforeCreate: async (order) => {
        // Generate order number if not provided
        if (!order.order_number) {
          const prefix = 'TR';
          const timestamp = Date.now().toString(36).toUpperCase();
          const random = Math.random().toString(36).substring(2, 6).toUpperCase();
          order.order_number = `${prefix}-${timestamp}-${random}`;
        }
      }
    }
  });

  Order.associate = (models) => {
    Order.belongsTo(models.TunjoFan, { foreignKey: 'fan_id', as: 'fan' });
    Order.hasMany(models.TunjoOrderItem, { foreignKey: 'order_id', as: 'items' });
  };

  return Order;
};
