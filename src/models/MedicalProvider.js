const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalProvider = sequelize.define('MedicalProvider', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  provider_name: { type: DataTypes.STRING(255), allowNull: false },
  specialty: { type: DataTypes.STRING(100) },
  clinic: { type: DataTypes.STRING(500) },
  phone: { type: DataTypes.STRING(30) },
  fax: { type: DataTypes.STRING(30) },
  npi: { type: DataTypes.STRING(20) },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'medical_providers',
  timestamps: true,
  underscored: true
});

module.exports = MedicalProvider;
