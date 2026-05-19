'use strict';

/**
 * IntuitiveHospital — master table of US hospitals by CMS CCN.
 *
 * Source: CMS Hospital General Information (dataset id xubh-q36u)
 *   https://data.cms.gov/provider-data/dataset/xubh-q36u
 *
 * Used to resolve hospital_name <-> CCN for the compare_hospital_procedure_volumes
 * tool. ~5,400 short-term acute care + critical access + specialty hospitals.
 */
module.exports = (sequelize, DataTypes) => {
  const Hospital = sequelize.define('IntuitiveHospital', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ccn: { type: DataTypes.STRING(10), allowNull: false },
    facility_name: { type: DataTypes.TEXT, allowNull: false },
    facility_name_normalized: { type: DataTypes.TEXT },
    address: { type: DataTypes.TEXT },
    city: { type: DataTypes.STRING(120) },
    state: { type: DataTypes.STRING(2) },
    zip: { type: DataTypes.STRING(10) },
    county: { type: DataTypes.STRING(120) },
    telephone: { type: DataTypes.STRING(30) },
    hospital_type: { type: DataTypes.STRING(80) },
    hospital_ownership: { type: DataTypes.STRING(120) },
    emergency_services: { type: DataTypes.BOOLEAN },
    overall_rating: { type: DataTypes.STRING(20) }, // CMS uses '1'-'5' or 'Not Available'
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_hospitals',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['ccn'] },
      { fields: ['facility_name_normalized'] },
      { fields: ['state'] },
    ],
  });
  return Hospital;
};
