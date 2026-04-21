const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalMedication = sequelize.define('MedicalMedication', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  medication_name: { type: DataTypes.STRING(255), allowNull: false },
  brand_name: { type: DataTypes.STRING(255) },
  dose: { type: DataTypes.STRING(100) },
  instructions: { type: DataTypes.TEXT },
  prescribing_doctor: { type: DataTypes.STRING(255) },
  start_date: { type: DataTypes.DATEONLY },
  end_date: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING(30), defaultValue: 'Active' },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'medical_medications',
  timestamps: true,
  underscored: true
});

module.exports = MedicalMedication;
