'use strict';

/**
 * IntuitiveSurgeonHospitalAffiliation
 *
 * Many-to-many surgeon ↔ hospital mapping from CMS Care Compare's
 * "Facility Affiliation Data" (dataset id 27ea-46a8).
 *
 * Each row is one (surgeon NPI, facility CCN) pair. A surgeon at 3 hospitals = 3 rows.
 * Distinct from IntuitiveProviderAffiliation which is one-row-per-NPI surgeon master data.
 *
 * Source URL:
 *   https://data.cms.gov/provider-data/sites/default/files/resources/.../Facility_Affiliation.csv
 *
 * Powers compareHospitalProcedureVolumes — given a hospital_ccn, find all affiliated NPIs.
 */
module.exports = (sequelize, DataTypes) => {
  const SurgeonHospitalAffiliation = sequelize.define('IntuitiveSurgeonHospitalAffiliation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    npi: { type: DataTypes.STRING(15), allowNull: false },
    ind_pac_id: { type: DataTypes.STRING(20) },
    facility_ccn: { type: DataTypes.STRING(10), allowNull: false },
    facility_type: { type: DataTypes.STRING(80) }, // 'Hospital', 'Long-term care', etc.
    surgeon_last_name: { type: DataTypes.STRING(120) },
    surgeon_first_name: { type: DataTypes.STRING(120) },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_surgeon_hospital_affiliations',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['npi', 'facility_ccn'] },
      { fields: ['npi'] },
      { fields: ['facility_ccn'] },
      { fields: ['facility_type'] },
    ],
  });
  return SurgeonHospitalAffiliation;
};
