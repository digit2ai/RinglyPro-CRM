// src/models/ProductionRun.js - OEE Tracking: Production run records (per shift/batch)
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductionRun = sequelize.define('ProductionRun', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  machineId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'machine_id',
    references: { model: 'machines', key: 'id' }
  },
  shiftStart: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'shift_start'
  },
  shiftEnd: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'shift_end'
  },
  plannedProductionTimeMin: {
    type: DataTypes.FLOAT,
    allowNull: false,
    field: 'planned_production_time_min'
  },
  totalParts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_parts'
  },
  goodParts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'good_parts'
  },
  actualCycleTimeSec: {
    type: DataTypes.FLOAT,
    allowNull: true,
    field: 'actual_cycle_time_sec'
  }
}, {
  tableName: 'production_runs',
  timestamps: true,
  underscored: true
});

module.exports = ProductionRun;
