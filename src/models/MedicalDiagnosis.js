const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalDiagnosis = sequelize.define('MedicalDiagnosis', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  condition_name: { type: DataTypes.STRING(500), allowNull: false },
  icd_code: { type: DataTypes.STRING(20) },
  notes: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING(30), defaultValue: 'Active' },
  diagnosed_date: { type: DataTypes.DATEONLY }
}, {
  tableName: 'medical_diagnoses',
  timestamps: true,
  underscored: true
});

module.exports = MedicalDiagnosis;
