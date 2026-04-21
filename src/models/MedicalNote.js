const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MedicalNote = sequelize.define('MedicalNote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  note_text: { type: DataTypes.TEXT, allowNull: false },
  category: { type: DataTypes.STRING(50), defaultValue: 'General' },
  source_document: { type: DataTypes.STRING(255) }
}, {
  tableName: 'medical_notes',
  timestamps: true,
  underscored: true
});

module.exports = MedicalNote;
