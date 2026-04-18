module.exports = (sequelize, DataTypes) => {
  const VisionariumImpactMetric = sequelize.define('VisionariumImpactMetric', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cohort_id: { type: DataTypes.INTEGER, allowNull: false },
    metric_name: { type: DataTypes.STRING(200), allowNull: false },
    metric_value: { type: DataTypes.FLOAT },
    target_value: { type: DataTypes.FLOAT },
    category: { type: DataTypes.ENUM('completion', 'placement', 'capstone', 'bilingual', 'ai_fluency', 'sponsor_engagement', 'funding', 'nps'), allowNull: false },
    measured_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_impact_metrics',
    timestamps: false,
    indexes: [{ fields: ['cohort_id'] }, { fields: ['category'] }]
  });

  VisionariumImpactMetric.associate = (models) => {
    VisionariumImpactMetric.belongsTo(models.VisionariumCohort, { foreignKey: 'cohort_id', as: 'cohort' });
  };

  return VisionariumImpactMetric;
};
