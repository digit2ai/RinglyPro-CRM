'use strict';

module.exports = (sequelize, DataTypes) => {
  const HospitalDrgVolume = sequelize.define('IntuitiveHospitalDrgVolume', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    hospital_ccn: { type: DataTypes.STRING(10), allowNull: false },
    fiscal_year: { type: DataTypes.INTEGER, allowNull: false },
    drg_cd: { type: DataTypes.STRING(10), allowNull: false },
    drg_desc: { type: DataTypes.TEXT },
    total_discharges: { type: DataTypes.INTEGER, defaultValue: 0 },
    avg_covered_charges: { type: DataTypes.DECIMAL(12, 2) },
    avg_total_payment: { type: DataTypes.DECIMAL(12, 2) },
    avg_medicare_payment: { type: DataTypes.DECIMAL(12, 2) },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_hospital_drg_volume',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['hospital_ccn', 'fiscal_year', 'drg_cd'] },
      { fields: ['hospital_ccn'] },
      { fields: ['drg_cd'] },
    ],
  });
  return HospitalDrgVolume;
};
