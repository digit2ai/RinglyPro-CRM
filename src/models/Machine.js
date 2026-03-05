// src/models/Machine.js - OEE Tracking: Shop floor machines
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Machine = sequelize.define('Machine', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  tenantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'tenant_id'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  line: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  expectedCycleTimeSec: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 30,
    field: 'expected_cycle_time_sec'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'machines',
  timestamps: true,
  underscored: true
});

module.exports = Machine;
