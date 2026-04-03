'use strict';

module.exports = (sequelize, DataTypes) => {
  const SystemRecommendation = sequelize.define('IntuitiveSystemRecommendation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    system_model: {
      type: DataTypes.STRING(50), allowNull: false,
      comment: 'dV5, Xi, X, SP'
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    fit_score: { type: DataTypes.FLOAT, allowNull: true, comment: '0-100 match score' },
    is_primary: { type: DataTypes.BOOLEAN, defaultValue: false },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    acquisition_model: {
      type: DataTypes.STRING(50), allowNull: true,
      comment: 'purchase, operating_lease, usage_based'
    },
    estimated_price: { type: DataTypes.FLOAT, allowNull: true },
    estimated_annual_cost: { type: DataTypes.FLOAT, allowNull: true, comment: 'Instruments + service + lease' },
    projected_annual_cases: { type: DataTypes.INTEGER, allowNull: true },
    projected_utilization_pct: { type: DataTypes.FLOAT, allowNull: true },
    breakeven_months: { type: DataTypes.INTEGER, allowNull: true },
    five_year_roi_pct: { type: DataTypes.FLOAT, allowNull: true },
    specialties_served: { type: DataTypes.JSONB, defaultValue: [] },
    risk_factors: { type: DataTypes.JSONB, defaultValue: [] },
    details: { type: DataTypes.JSONB, defaultValue: {} }
  }, {
    tableName: 'intuitive_system_recommendations',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'system_model'] }
    ]
  });

  SystemRecommendation.associate = (models) => {
    SystemRecommendation.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
  };

  return SystemRecommendation;
};
