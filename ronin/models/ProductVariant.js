'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProductVariant = sequelize.define('RoninProductVariant', {
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
      defaultValue: 1
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'e.g. "Size 4 / White" or "XL / Black"'
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Override price for this variant'
    },
    inventory_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    options: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: '{ "Size": "4", "Color": "White" }'
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'ronin_product_variants',
    timestamps: false,
    indexes: [
      { fields: ['product_id'] },
      { fields: ['tenant_id'] },
      { fields: ['sku'] }
    ]
  });

  ProductVariant.associate = (models) => {
    ProductVariant.belongsTo(models.RoninProduct, { foreignKey: 'product_id', as: 'product' });
  };

  return ProductVariant;
};
