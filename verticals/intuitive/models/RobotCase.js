'use strict';

module.exports = (sequelize, DataTypes) => {
  const RobotCase = sequelize.define('IntuitiveRobotCase', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    robot_serial: { type: DataTypes.STRING(100), allowNull: false, comment: 'da Vinci robot serial number' },
    robot_model: { type: DataTypes.STRING(50), allowNull: true, comment: 'Xi, dV5, SP, X, etc.' },
    hospital_name: { type: DataTypes.STRING(500), allowNull: true },
    facility_id: { type: DataTypes.STRING(100), allowNull: true, comment: 'Intuitive internal facility ID' },
    case_date: { type: DataTypes.DATEONLY, allowNull: false },
    surgeon_name: { type: DataTypes.STRING(255), allowNull: false },
    surgeon_id: { type: DataTypes.STRING(100), allowNull: true, comment: 'Intuitive internal surgeon ID' },
    procedure_type: { type: DataTypes.STRING(255), defaultValue: 'unspecified' },
    procedure_category: { type: DataTypes.STRING(100), allowNull: true, comment: 'Urology, GYN, General, etc.' },
    console_time_minutes: { type: DataTypes.INTEGER, allowNull: true },
    total_procedure_minutes: { type: DataTypes.INTEGER, allowNull: true },
    instruments_used: { type: DataTypes.JSONB, allowNull: true, comment: 'Array of instrument names/IDs' },
    case_id: { type: DataTypes.STRING(100), allowNull: true, comment: 'Intuitive internal case ID' },
    metadata: { type: DataTypes.JSONB, allowNull: true, comment: 'Any additional telemetry data' }
  }, {
    tableName: 'intuitive_robot_cases',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['robot_serial'] },
      { fields: ['hospital_name'] },
      { fields: ['surgeon_name'] },
      { fields: ['case_date'] },
      { fields: ['robot_serial', 'case_date', 'surgeon_name', 'procedure_type'], unique: true }
    ]
  });

  return RobotCase;
};
