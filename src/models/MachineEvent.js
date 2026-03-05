// src/models/MachineEvent.js - OEE Tracking: Machine status events (heartbeat stream)
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MachineEvent = sequelize.define('MachineEvent', {
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
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['running', 'stopped', 'idle', 'fault']]
    }
  },
  reason: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  recordedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'recorded_at'
  }
}, {
  tableName: 'machine_events',
  timestamps: false,
  underscored: true
});

module.exports = MachineEvent;
