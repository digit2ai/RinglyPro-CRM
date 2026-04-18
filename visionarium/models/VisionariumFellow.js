module.exports = (sequelize, DataTypes) => {
  const VisionariumFellow = sequelize.define('VisionariumFellow', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    community_member_id: { type: DataTypes.INTEGER, allowNull: false },
    cohort_id: { type: DataTypes.INTEGER, allowNull: false },
    track: { type: DataTypes.ENUM('explorer_16_18', 'builder_18_22'), allowNull: false },
    status: { type: DataTypes.ENUM('selected', 'active', 'on_leave', 'completed', 'withdrawn'), defaultValue: 'selected' },
    mentor_id: { type: DataTypes.INTEGER },
    capstone_project_id: { type: DataTypes.INTEGER },
    scholarship_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    travel_funded: { type: DataTypes.BOOLEAN, defaultValue: false },
    completion_rate: { type: DataTypes.FLOAT, defaultValue: 0 },
    bilingual_proficiency_score: { type: DataTypes.FLOAT },
    ai_fluency_score: { type: DataTypes.FLOAT },
    nps_score: { type: DataTypes.INTEGER },
    internship_placed: { type: DataTypes.BOOLEAN, defaultValue: false },
    internship_company: { type: DataTypes.STRING(255) },
    demo_day_presented: { type: DataTypes.BOOLEAN, defaultValue: false },
    sponsor_id: { type: DataTypes.INTEGER },
    notes_admin: { type: DataTypes.TEXT },
    started_at: { type: DataTypes.DATE },
    completed_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_fellows',
    timestamps: false,
    indexes: [{ fields: ['community_member_id'] }, { fields: ['cohort_id'] }, { fields: ['mentor_id'] }, { fields: ['status'] }]
  });

  VisionariumFellow.associate = (models) => {
    VisionariumFellow.belongsTo(models.VisionariumCommunityMember, { foreignKey: 'community_member_id', as: 'member' });
    VisionariumFellow.belongsTo(models.VisionariumCohort, { foreignKey: 'cohort_id', as: 'cohort' });
    VisionariumFellow.belongsTo(models.VisionariumMentor, { foreignKey: 'mentor_id', as: 'mentor' });
    VisionariumFellow.belongsTo(models.VisionariumSponsor, { foreignKey: 'sponsor_id', as: 'sponsor' });
    VisionariumFellow.hasOne(models.VisionariumProject, { foreignKey: 'fellow_id', as: 'project' });
    VisionariumFellow.hasMany(models.VisionariumMentorMatch, { foreignKey: 'fellow_id', as: 'mentor_matches' });
  };

  return VisionariumFellow;
};
