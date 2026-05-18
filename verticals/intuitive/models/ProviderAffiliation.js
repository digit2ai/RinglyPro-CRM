'use strict';

module.exports = (sequelize, DataTypes) => {
  const ProviderAffiliation = sequelize.define('IntuitiveProviderAffiliation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    npi: { type: DataTypes.STRING(15), allowNull: false },
    // Provider name as listed in CMS (used to validate identity matches across sources)
    full_name: { type: DataTypes.STRING(255) },
    credential: { type: DataTypes.STRING(50) },
    primary_specialty: { type: DataTypes.STRING(120) },
    secondary_specialty: { type: DataTypes.STRING(120) },
    // Group / practice
    group_pac_id: { type: DataTypes.STRING(20) },
    group_legal_name: { type: DataTypes.STRING(255) },
    group_member_count: { type: DataTypes.INTEGER },
    // Hospital affiliation (Care Compare lists up to 5; we store the primary + JSONB of all)
    hospital_ccn: { type: DataTypes.STRING(10) },
    hospital_name: { type: DataTypes.STRING(255) },
    hospital_state: { type: DataTypes.STRING(2) },
    all_hospital_affiliations: { type: DataTypes.JSONB, defaultValue: [] },
    // License / education
    medical_school: { type: DataTypes.STRING(255) },
    graduation_year: { type: DataTypes.INTEGER },
    // Practice state (from Care Compare practice location)
    practice_state: { type: DataTypes.STRING(2) },
    practice_city: { type: DataTypes.STRING(100) },
    practice_zip: { type: DataTypes.STRING(10) },
    // Sex (sometimes useful for identity disambiguation)
    sex: { type: DataTypes.STRING(1) },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_provider_affiliations',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['npi'] },
      { fields: ['hospital_ccn'] },
      { fields: ['primary_specialty'] },
      { fields: ['practice_state'] },
    ],
  });
  return ProviderAffiliation;
};
