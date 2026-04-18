module.exports = (sequelize, DataTypes) => {
  const VisionariumApplication = sequelize.define('VisionariumApplication', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    community_member_id: { type: DataTypes.INTEGER, allowNull: false },
    cohort_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('draft', 'submitted', 'under_review', 'interview', 'accepted', 'waitlisted', 'rejected'), defaultValue: 'draft' },
    track_preference: { type: DataTypes.ENUM('explorer', 'builder') },
    written_vision: { type: DataTypes.TEXT },
    video_url: { type: DataTypes.STRING(500) },
    challenge_submission: { type: DataTypes.JSONB },
    reviewer_notes: { type: DataTypes.TEXT },
    reviewer_id: { type: DataTypes.INTEGER },
    interview_date: { type: DataTypes.DATE },
    interview_score: { type: DataTypes.FLOAT },
    scholarship_requested: { type: DataTypes.BOOLEAN, defaultValue: false },
    submitted_at: { type: DataTypes.DATE },
    reviewed_at: { type: DataTypes.DATE },
    decided_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_applications',
    timestamps: false,
    indexes: [{ fields: ['community_member_id'] }, { fields: ['cohort_id'] }, { fields: ['status'] }]
  });

  VisionariumApplication.associate = (models) => {
    VisionariumApplication.belongsTo(models.VisionariumCommunityMember, { foreignKey: 'community_member_id', as: 'applicant' });
    VisionariumApplication.belongsTo(models.VisionariumCohort, { foreignKey: 'cohort_id', as: 'cohort' });
  };

  return VisionariumApplication;
};
