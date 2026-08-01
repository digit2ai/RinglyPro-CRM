// models/inventorySnapshot.js — the raw ingested POS + inventory row.
// Kept verbatim (minus any payload logging) so an attribution can be re-derived
// later when better rules ship, without re-requesting the feed.
'use strict';

const TABLE = 'retail_out_of_stock_intelligence_platfor_inventory';

module.exports = (sequelize, DataTypes) => {
  const InventorySnapshot = sequelize.define('RetailInventorySnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    batch_id: { type: DataTypes.STRING(64), allowNull: true },
    store_id: { type: DataTypes.STRING(64), allowNull: false },
    sku: { type: DataTypes.STRING(100), allowNull: false },
    product_name: { type: DataTypes.STRING(255), allowNull: true },
    category: { type: DataTypes.STRING(100), allowNull: true },

    on_hand: { type: DataTypes.INTEGER, allowNull: true },
    unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    margin: { type: DataTypes.DECIMAL(6, 4), allowNull: true },
    // trailing average daily velocity, measured BEFORE the stockout so the
    // figure is not censored by the outage it is used to price
    avg_velocity: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    forecast_velocity: { type: DataTypes.DECIMAL(12, 3), allowNull: true },

    shelf_capacity: { type: DataTypes.INTEGER, allowNull: true },
    min_shelf_qty: { type: DataTypes.INTEGER, allowNull: true },
    shelf_empty: { type: DataTypes.BOOLEAN, allowNull: true },
    po_open: { type: DataTypes.BOOLEAN, allowNull: true },
    po_filled: { type: DataTypes.BOOLEAN, allowNull: true },
    recent_delivery: { type: DataTypes.BOOLEAN, allowNull: true },

    is_out_of_stock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    snapshot_date: { type: DataTypes.DATEONLY, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['tenant_id', 'store_id'] },
      { fields: ['batch_id'] }
    ]
  });

  InventorySnapshot.TABLE = TABLE;
  return InventorySnapshot;
};
