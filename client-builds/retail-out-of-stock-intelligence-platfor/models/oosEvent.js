// models/oosEvent.js — one priced + root-caused out-of-stock event.
'use strict';

const TABLE = 'retail_out_of_stock_intelligence_platfor_oos_events';

module.exports = (sequelize, DataTypes) => {
  const OosEvent = sequelize.define('RetailOosEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    batch_id: { type: DataTypes.STRING(64), allowNull: true },
    store_id: { type: DataTypes.STRING(64), allowNull: false },
    sku: { type: DataTypes.STRING(100), allowNull: false },
    product_name: { type: DataTypes.STRING(255), allowNull: true },
    category: { type: DataTypes.STRING(100), allowNull: true },

    // --- measurement ---
    on_hand: { type: DataTypes.INTEGER, allowNull: true },
    avg_velocity: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    margin: { type: DataTypes.DECIMAL(6, 4), allowNull: true },
    oos_days: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 1 },
    // true when stock exists in the building but the facing is empty — the
    // "back room" stockout Shelf-Confidence identifies as most under-detected.
    on_shelf_stockout: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // --- motivation (dollarization) ---
    lost_units: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    lost_sales_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    lost_gross_profit_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    // five-shopper-response adjustments (Gruen/Corsten/Bharadwaj 2002)
    net_retailer_loss_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    brand_loss_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    recoverable_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },

    // --- attribution ---
    root_cause: { type: DataTypes.STRING(64), allowNull: false },
    layer: { type: DataTypes.STRING(16), allowNull: true },        // shelf | store | upstream
    confidence: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
    rule: { type: DataTypes.STRING(16), allowNull: true },
    why: { type: DataTypes.TEXT, allowNull: true },
    action: { type: DataTypes.TEXT, allowNull: true },

    event_date: { type: DataTypes.DATEONLY, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['tenant_id', 'store_id'] },
      { fields: ['batch_id'] },
      { fields: ['root_cause'] }
    ]
  });

  OosEvent.TABLE = TABLE;
  return OosEvent;
};
