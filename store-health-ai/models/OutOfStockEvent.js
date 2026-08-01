'use strict';

module.exports = (sequelize, DataTypes) => {
  const OutOfStockEvent = sequelize.define('OutOfStockEvent', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    product_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    out_of_stock_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    restocked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration_hours: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    estimated_lost_sales: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    is_top_sku: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // --- OOS intelligence (Shelf-Confidence attribution layer) ---
    // Populated by src/services/oos-intelligence.js. Added via idempotent
    // ALTER TABLE (see migrations/20260801-oos-intelligence.sql) because
    // sync({alter:false}) never adds columns to an existing table.
    lost_gross_profit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    root_cause: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'One of the seven root-cause categories'
    },
    oos_layer: {
      type: DataTypes.STRING(16),
      allowNull: true,
      comment: 'shelf | store | upstream — the Store vs Shelf split'
    },
    root_cause_confidence: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: true
    },
    root_cause_why: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'The evidence sentence shown to the store manager'
    },
    recommended_action: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'out_of_stock_events',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['store_id', 'out_of_stock_at']
      },
      {
        fields: ['sku']
      }
    ]
  });

  OutOfStockEvent.associate = (models) => {
    OutOfStockEvent.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
  };

  return OutOfStockEvent;
};
