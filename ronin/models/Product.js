'use strict';

/**
 * Product Model - Ronin Brotherhood Online Store
 * Uniforms (gis), gear, merchandise, training equipment
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Product = sequelize.define('RoninProduct', {
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    short_description: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    compare_at_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    cost_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'uniforms, gear, apparel, training_equipment, collectibles, patches'
    },
    subcategory: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    images: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    inventory_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    track_inventory: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    allow_backorder: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    weight: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      comment: 'Weight in grams'
    },
    has_variants: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    variant_options: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    member_only: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Requires active membership to purchase'
    },
    group_exclusive: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Exclusive to a specific group: RGRK, RPDTA, etc.'
    },
    status: {
      type: DataTypes.ENUM('active', 'draft', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_sold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
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
    tableName: 'ronin_products',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['slug'] },
      { fields: ['tenant_id', 'slug'], unique: true },
      { fields: ['category'] },
      { fields: ['status'] },
      { fields: ['featured'] },
      { fields: ['sort_order'] }
    ],
    hooks: {
      beforeUpdate: async (product) => {
        product.updated_at = new Date();
      },
      beforeCreate: async (product) => {
        if (!product.slug) {
          product.slug = product.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
    }
  });

  Product.associate = (models) => {
    Product.hasMany(models.RoninProductVariant, { foreignKey: 'product_id', as: 'variants' });
    Product.hasMany(models.RoninOrderItem, { foreignKey: 'product_id', as: 'order_items' });
  };

  return Product;
};
