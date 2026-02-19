'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CartItem = sequelize.define('RoninCartItem', {
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
      allowNull: true
    },
    session_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'For guest cart tracking'
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
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'ronin_cart_items',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['member_id'] },
      { fields: ['session_id'] },
      { fields: ['product_id'] }
    ]
  });

  CartItem.associate = (models) => {
    CartItem.belongsTo(models.RoninProduct, { foreignKey: 'product_id', as: 'product' });
    CartItem.belongsTo(models.RoninProductVariant, { foreignKey: 'variant_id', as: 'variant' });
    CartItem.belongsTo(models.RoninMember, { foreignKey: 'member_id', as: 'member' });
  };

  return CartItem;
};
