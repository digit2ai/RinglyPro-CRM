const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalAppointment = sequelize.define('MedicalAppointment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  appointment_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'doctor' },
  appointment_date: { type: DataTypes.DATEONLY },
  appointment_time: { type: DataTypes.STRING(20) },
  arrive_by: { type: DataTypes.STRING(20) },
  doctor_name: { type: DataTypes.STRING(255) },
  specialty: { type: DataTypes.STRING(100) },
  location: { type: DataTypes.TEXT },
  reason: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING(30), defaultValue: 'Scheduled' },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'medical_appointments',
  timestamps: true,
  underscored: true
});

module.exports = MedicalAppointment;
