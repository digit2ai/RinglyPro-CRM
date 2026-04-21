const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalLabOrder = sequelize.define('MedicalLabOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  order_date: { type: DataTypes.DATEONLY },
  test_name: { type: DataTypes.STRING(255), allowNull: false },
  test_code: { type: DataTypes.STRING(50) },
  facility: { type: DataTypes.STRING(255) },
  facility_account: { type: DataTypes.STRING(100) },
  lab_ref: { type: DataTypes.STRING(100) },
  ordering_doctor: { type: DataTypes.STRING(255) },
  diagnosis_reason: { type: DataTypes.TEXT },
  specimen_source: { type: DataTypes.STRING(100) },
  expected_date: { type: DataTypes.STRING(100) },
  status: { type: DataTypes.STRING(30), defaultValue: 'Ordered' },
  result_value: { type: DataTypes.TEXT },
  result_date: { type: DataTypes.DATEONLY },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'medical_lab_orders',
  timestamps: true,
  underscored: true
});

module.exports = MedicalLabOrder;
