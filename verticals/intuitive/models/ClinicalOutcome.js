'use strict';

module.exports = (sequelize, DataTypes) => {
  const ClinicalOutcome = sequelize.define('IntuitiveClinicalOutcome', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    business_plan_id: { type: DataTypes.INTEGER, allowNull: false },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    // Hospital's current case data (from annual report)
    hospital_case_data: {
      type: DataTypes.JSONB, allowNull: false, defaultValue: {},
      comment: 'Per specialty: { annual_cases, open_pct, lap_pct, robotic_pct }'
    },
    // CMS data pulled for this hospital
    cms_data: { type: DataTypes.JSONB, defaultValue: {} },
    // Dollarization results
    dollarization_results: { type: DataTypes.JSONB, defaultValue: {} },
    total_clinical_savings_annual: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    // Sources/citations used
    citations: { type: DataTypes.JSONB, defaultValue: [] },
    computed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'intuitive_clinical_outcomes',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['business_plan_id'] },
      { fields: ['project_id'] }
    ]
  });

  ClinicalOutcome.associate = (models) => {
    ClinicalOutcome.belongsTo(models.IntuitiveBusinessPlan, { foreignKey: 'business_plan_id', as: 'businessPlan' });
    ClinicalOutcome.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
  };

  return ClinicalOutcome;
};
