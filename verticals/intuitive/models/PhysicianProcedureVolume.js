'use strict';

module.exports = (sequelize, DataTypes) => {
  const PhysicianProcedureVolume = sequelize.define('IntuitivePhysicianProcedureVolume', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    npi: { type: DataTypes.STRING(15), allowNull: false },
    fiscal_year: { type: DataTypes.INTEGER, allowNull: false },
    hcpcs_code: { type: DataTypes.STRING(10), allowNull: false },
    hcpcs_description: { type: DataTypes.TEXT },
    place_of_service: { type: DataTypes.STRING(20) },
    total_services: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_beneficiaries: { type: DataTypes.INTEGER, defaultValue: 0 },
    avg_submitted_charge: { type: DataTypes.DECIMAL(12, 2) },
    avg_medicare_payment: { type: DataTypes.DECIMAL(12, 2) },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_physician_procedure_volume',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['npi', 'fiscal_year', 'hcpcs_code'] },
      { fields: ['npi'] },
      { fields: ['hcpcs_code'] },
    ],
  });
  return PhysicianProcedureVolume;
};
