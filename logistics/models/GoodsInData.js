'use strict';

module.exports = (sequelize, DataTypes) => {
  const GoodsInData = sequelize.define('LogisticsGoodsInData', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    receipt_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Delivery note number'
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    unit_of_measure: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    receipt_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    receipt_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    supplier: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'logistics_goods_in_data',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'receipt_date'] }
    ]
  });

  GoodsInData.associate = (models) => {
    GoodsInData.belongsTo(models.LogisticsProject, { foreignKey: 'project_id', as: 'project' });
  };

  return GoodsInData;
};
