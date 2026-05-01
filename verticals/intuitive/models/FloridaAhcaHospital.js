'use strict';

module.exports = (sequelize, DataTypes) => {
  const FloridaAhcaHospital = sequelize.define('IntuitiveFloridaAhcaHospital', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider_id: { type: DataTypes.STRING(20) },
    license_number: { type: DataTypes.STRING(30) },
    hospital_name: { type: DataTypes.TEXT },
    hospital_name_normalized: { type: DataTypes.TEXT },
    licensed_beds: { type: DataTypes.INTEGER },
    staffed_beds: { type: DataTypes.INTEGER },
    hospital_type: { type: DataTypes.STRING(40) },
    ownership: { type: DataTypes.STRING(40) },
    total_or_count: { type: DataTypes.INTEGER },
    total_admissions: { type: DataTypes.INTEGER },
    fiscal_year: { type: DataTypes.INTEGER },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_florida_ahca_hospitals',
    underscored: true,
    timestamps: false,
    indexes: [
      { fields: ['hospital_name_normalized'] },
      { fields: ['license_number'] },
    ],
  });
  return FloridaAhcaHospital;
};
