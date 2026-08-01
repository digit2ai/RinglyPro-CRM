// models/batch.js — one daily ingest run. The audit trail for every number on
// the dashboard: which feed, how many rows, how many stockouts, when.
'use strict';

const TABLE = 'retail_out_of_stock_intelligence_platfor_batches';

module.exports = (sequelize, DataTypes) => {
  const Batch = sequelize.define('RetailOosBatch', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    batch_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    store_id: { type: DataTypes.STRING(64), allowNull: true },
    row_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    oos_detected: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_skus: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skipped: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lost_sales_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    lost_gross_profit_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    source: { type: DataTypes.STRING(32), allowNull: true },  // json | csv
    ingested_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['tenant_id', 'store_id'] }
    ]
  });

  Batch.TABLE = TABLE;
  return Batch;
};
