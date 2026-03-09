'use strict';

module.exports = (sequelize, DataTypes) => {
  const ItemMaster = sequelize.define('PinaxisItemMaster', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    unit_of_measure: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Base picking unit: piece, box, pallet'
    },
    length_mm: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    width_mm: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    height_mm: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    weight_kg: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: true
    },
    pieces_per_picking_unit: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    pieces_per_pallet: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    pallet_ti: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Transport units per pallet layer'
    },
    pallet_hi: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Layers per pallet'
    },
    crash_class: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Fragility classification'
    },
    batch_tracked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    dangerous_goods: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    temperature_range: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    bin_capable: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Computed: fits in standard bin type'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'pinaxis_item_master',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'sku'] }
    ]
  });

  ItemMaster.associate = (models) => {
    ItemMaster.belongsTo(models.PinaxisProject, { foreignKey: 'project_id', as: 'project' });
  };

  return ItemMaster;
};
