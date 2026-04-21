const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalPatient = sequelize.define('MedicalPatient', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  dob: { type: DataTypes.DATEONLY },
  sex: { type: DataTypes.STRING(10) },
  mrn: { type: DataTypes.STRING(50) },
  ceid: { type: DataTypes.STRING(50) },
  address: { type: DataTypes.TEXT },
  phone: { type: DataTypes.STRING(30) },
  primary_clinic: { type: DataTypes.TEXT },
  primary_doctor: { type: DataTypes.STRING(255) },
  insurance_name: { type: DataTypes.STRING(255) },
  insurance_plan: { type: DataTypes.STRING(100) },
  insurance_policy: { type: DataTypes.STRING(100) },
  insurance_group: { type: DataTypes.STRING(100) },
  insurance_address: { type: DataTypes.TEXT },
  allergies: { type: DataTypes.TEXT, defaultValue: 'No Known Allergies' },
  pharmacy_name: { type: DataTypes.STRING(255) },
  pharmacy_address: { type: DataTypes.TEXT },
  pharmacy_phone: { type: DataTypes.STRING(30) }
}, {
  tableName: 'medical_patients',
  timestamps: true,
  underscored: true
});

module.exports = MedicalPatient;
