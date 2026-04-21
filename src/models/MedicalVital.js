const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalVital = sequelize.define('MedicalVital', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  measured_date: { type: DataTypes.DATEONLY },
  blood_pressure: { type: DataTypes.STRING(20) },
  pulse: { type: DataTypes.INTEGER },
  oxygen_saturation: { type: DataTypes.STRING(10) },
  weight: { type: DataTypes.STRING(30) },
  height: { type: DataTypes.STRING(20) },
  bmi: { type: DataTypes.DECIMAL(5, 2) },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'medical_vitals',
  timestamps: true,
  underscored: true
});

module.exports = MedicalVital;
