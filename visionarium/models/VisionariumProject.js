module.exports = (sequelize, DataTypes) => {
  const VisionariumProject = sequelize.define('VisionariumProject', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fellow_id: { type: DataTypes.INTEGER, allowNull: false },
    cohort_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(300) },
    description: { type: DataTypes.TEXT },
    sponsor_brief_id: { type: DataTypes.INTEGER },
    tech_stack: { type: DataTypes.JSONB, defaultValue: [] },
    repo_url: { type: DataTypes.STRING(500) },
    demo_url: { type: DataTypes.STRING(500) },
    presentation_url: { type: DataTypes.STRING(500) },
    status: { type: DataTypes.ENUM('ideation', 'in_progress', 'review', 'presented', 'funded'), defaultValue: 'ideation' },
    seed_funding_received: { type: DataTypes.BOOLEAN, defaultValue: false },
    funding_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_projects',
    timestamps: false,
    indexes: [{ fields: ['fellow_id'] }, { fields: ['cohort_id'] }, { fields: ['status'] }]
  });

  VisionariumProject.associate = (models) => {
    VisionariumProject.belongsTo(models.VisionariumFellow, { foreignKey: 'fellow_id', as: 'fellow' });
    VisionariumProject.belongsTo(models.VisionariumCohort, { foreignKey: 'cohort_id', as: 'cohort' });
  };

  return VisionariumProject;
};
