'use strict';

module.exports = (sequelize, DataTypes) => {
  const ProductRecommendation = sequelize.define('LogisticsProductRecommendation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    product_category: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    fit_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: '0-100 weighted match score'
    },
    reasoning: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Detailed scoring breakdown per criteria'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    highlighted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Top recommendation flag'
    },
    computed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'logistics_product_recommendations',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'fit_score'] }
    ]
  });

  ProductRecommendation.associate = (models) => {
    ProductRecommendation.belongsTo(models.LogisticsProject, { foreignKey: 'project_id', as: 'project' });
  };

  return ProductRecommendation;
};
