'use strict';

/**
 * Product Model - TunjoRacing Merchandise Store
 * Stores product catalog for e-commerce
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Product = sequelize.define('TunjoProduct', {
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
      allowNull: true,
      comment: 'Original price for showing discounts'
    },
    cost_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Cost to produce/acquire the product'
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'apparel, accessories, collectibles, etc.'
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
      defaultValue: [],
      comment: 'Array of image URLs'
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    barcode: {
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
      comment: 'Weight in grams for shipping'
    },
    dimensions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: '{ length, width, height } in cm'
    },
    has_variants: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    variant_options: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of variant option names: ["Size", "Color"]'
    },
    featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('active', 'draft', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    },
    seo_title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    seo_description: {
      type: DataTypes.TEXT,
      allowNull: true
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
    tableName: 'tunjo_products',
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
        // Auto-generate slug if not provided
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
    Product.hasMany(models.TunjoProductVariant, { foreignKey: 'product_id', as: 'variants' });
    Product.hasMany(models.TunjoOrderItem, { foreignKey: 'product_id', as: 'order_items' });
  };

  return Product;
};
