'use strict';

module.exports = (sequelize, DataTypes) => {
  const GoodsOutData = sequelize.define('LogisticsGoodsOutData', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    order_id: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    orderline_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    picking_unit: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Physical unit for picking: piece, box, pallet'
    },
    unit_of_measure: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    order_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Registration date'
    },
    picking_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    picking_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    ship_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    ship_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    customer_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    shipping_method: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Freight, CEP, air freight'
    },
    shipping_load_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'logistics_goods_out_data',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'ship_date'] },
      { fields: ['project_id', 'order_id'] },
      { fields: ['project_id', 'sku'] }
    ]
  });

  GoodsOutData.associate = (models) => {
    GoodsOutData.belongsTo(models.LogisticsProject, { foreignKey: 'project_id', as: 'project' });
  };

  return GoodsOutData;
};
