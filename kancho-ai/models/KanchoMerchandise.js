// kancho-ai/models/KanchoMerchandise.js
// Merchandise/products for school store

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoMerchandise = sequelize.define('KanchoMerchandise', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'kancho_schools',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false
    },
    image_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      defaultValue: 'other',
      validate: {
        isIn: [['gi', 'gear', 'apparel', 'accessories', 'supplements', 'other']]
      }
    },
    sizes: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    in_stock: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    stripe_price_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_merchandise',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['category'] },
      { fields: ['in_stock'] }
    ]
  });

  KanchoMerchandise.associate = (models) => {
    KanchoMerchandise.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return KanchoMerchandise;
};
