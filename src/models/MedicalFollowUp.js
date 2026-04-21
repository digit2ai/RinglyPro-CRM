const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalFollowUp = sequelize.define('MedicalFollowUp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  item: { type: DataTypes.TEXT, allowNull: false },
  due_date: { type: DataTypes.DATEONLY },
  related_to: { type: DataTypes.STRING(255) },
  status: { type: DataTypes.STRING(30), defaultValue: 'Pending' },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'medical_followups',
  timestamps: true,
  underscored: true
});

module.exports = MedicalFollowUp;
