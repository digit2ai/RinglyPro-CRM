const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalImagingOrder = sequelize.define('MedicalImagingOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  order_date: { type: DataTypes.DATEONLY },
  imaging_test: { type: DataTypes.STRING(255), allowNull: false },
  body_area: { type: DataTypes.STRING(255) },
  contrast: { type: DataTypes.STRING(100) },
  facility: { type: DataTypes.STRING(255) },
  ordering_doctor: { type: DataTypes.STRING(255) },
  order_id: { type: DataTypes.STRING(100) },
  reason: { type: DataTypes.TEXT },
  priority: { type: DataTypes.STRING(30), defaultValue: 'Routine' },
  expiration_date: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING(30), defaultValue: 'Ordered' },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'medical_imaging_orders',
  timestamps: true,
  underscored: true
});

module.exports = MedicalImagingOrder;
