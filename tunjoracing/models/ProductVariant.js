'use strict';

/**
 * ProductVariant Model - TunjoRacing Merchandise Store
 * Stores product variants (size, color combinations)
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProductVariant = sequelize.define('TunjoProductVariant', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Multi-tenant isolation'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'e.g., "Large / Red"'
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Override product price if different'
    },
    compare_at_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    cost_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    inventory_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    weight: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true
    },
    option1_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., "Size"'
    },
    option1_value: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., "Large"'
    },
    option2_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., "Color"'
    },
    option2_value: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., "Red"'
    },
    option3_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    option3_value: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    image_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Variant-specific image'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active'
    },
    sort_order: {
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
    tableName: 'tunjo_product_variants',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['product_id'] },
      { fields: ['sku'] },
      { fields: ['status'] }
    ],
    hooks: {
      beforeUpdate: async (variant) => {
        variant.updated_at = new Date();
      }
    }
  });

  ProductVariant.associate = (models) => {
    ProductVariant.belongsTo(models.TunjoProduct, { foreignKey: 'product_id', as: 'product' });
    ProductVariant.hasMany(models.TunjoOrderItem, { foreignKey: 'variant_id', as: 'order_items' });
  };

  return ProductVariant;
};
