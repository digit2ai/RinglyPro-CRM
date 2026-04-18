module.exports = (sequelize, DataTypes) => {
  const VisionariumCohort = sequelize.define('VisionariumCohort', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    season: { type: DataTypes.ENUM('fall', 'spring'), defaultValue: 'fall' },
    status: { type: DataTypes.ENUM('planning', 'applications_open', 'selection', 'active', 'completed'), defaultValue: 'planning' },
    max_fellows: { type: DataTypes.INTEGER, defaultValue: 40 },
    current_fellows_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    application_open_date: { type: DataTypes.DATE },
    application_close_date: { type: DataTypes.DATE },
    start_date: { type: DataTypes.DATE },
    end_date: { type: DataTypes.DATE },
    demo_day_date: { type: DataTypes.DATE },
    city: { type: DataTypes.STRING(100), defaultValue: 'Miami' },
    total_applicants: { type: DataTypes.INTEGER, defaultValue: 0 },
    acceptance_rate: { type: DataTypes.FLOAT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_cohorts',
    timestamps: false,
    indexes: [{ fields: ['year'] }, { fields: ['status'] }]
  });

  VisionariumCohort.associate = (models) => {
    VisionariumCohort.hasMany(models.VisionariumFellow, { foreignKey: 'cohort_id', as: 'fellows' });
    VisionariumCohort.hasMany(models.VisionariumApplication, { foreignKey: 'cohort_id', as: 'applications' });
    VisionariumCohort.hasMany(models.VisionariumEvent, { foreignKey: 'cohort_id', as: 'events' });
    VisionariumCohort.hasMany(models.VisionariumImpactMetric, { foreignKey: 'cohort_id', as: 'metrics' });
  };

  return VisionariumCohort;
};
