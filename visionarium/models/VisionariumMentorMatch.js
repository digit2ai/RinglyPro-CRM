module.exports = (sequelize, DataTypes) => {
  const VisionariumMentorMatch = sequelize.define('VisionariumMentorMatch', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fellow_id: { type: DataTypes.INTEGER, allowNull: false },
    mentor_id: { type: DataTypes.INTEGER, allowNull: false },
    cohort_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('proposed', 'active', 'paused', 'completed'), defaultValue: 'proposed' },
    total_sessions: { type: DataTypes.INTEGER, defaultValue: 0 },
    avg_rating_by_fellow: { type: DataTypes.FLOAT },
    avg_rating_by_mentor: { type: DataTypes.FLOAT },
    matched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    ended_at: { type: DataTypes.DATE }
  }, {
    tableName: 'visionarium_mentor_matches',
    timestamps: false,
    indexes: [{ fields: ['fellow_id'] }, { fields: ['mentor_id'] }, { fields: ['cohort_id'] }]
  });

  VisionariumMentorMatch.associate = (models) => {
    VisionariumMentorMatch.belongsTo(models.VisionariumFellow, { foreignKey: 'fellow_id', as: 'fellow' });
    VisionariumMentorMatch.belongsTo(models.VisionariumMentor, { foreignKey: 'mentor_id', as: 'mentor' });
    VisionariumMentorMatch.belongsTo(models.VisionariumCohort, { foreignKey: 'cohort_id', as: 'cohort' });
  };

  return VisionariumMentorMatch;
};
