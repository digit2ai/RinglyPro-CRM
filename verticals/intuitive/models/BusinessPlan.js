'use strict';

module.exports = (sequelize, DataTypes) => {
  const BusinessPlan = sequelize.define('IntuitiveBusinessPlan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    plan_name: { type: DataTypes.STRING(255), allowNull: false },
    plan_version: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: {
      type: DataTypes.STRING(30), allowNull: false, defaultValue: 'draft',
      validate: { isIn: [['draft', 'finalized', 'tracking', 'archived']] }
    },
    // System configuration
    system_type: {
      type: DataTypes.STRING(50), allowNull: false,
      comment: 'Xi, Xi_Dual, dV5, dV5_Dual, SP, X'
    },
    system_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    annual_service_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    system_quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    acquisition_model: {
      type: DataTypes.STRING(30), defaultValue: 'purchase',
      comment: 'purchase, lease, usage_based'
    },
    // Computed totals
    total_incremental_cases_annual: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_incremental_revenue: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    total_clinical_outcome_savings: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    total_combined_roi: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    payback_months: { type: DataTypes.INTEGER, allowNull: true },
    five_year_net_benefit: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    // Metadata
    prepared_by: { type: DataTypes.STRING(255), allowNull: true },
    prepared_for: { type: DataTypes.STRING(255), allowNull: true },
    presentation_date: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    finalized_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'intuitive_business_plans',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['status'] }
    ]
  });

  BusinessPlan.associate = (models) => {
    BusinessPlan.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
    BusinessPlan.hasMany(models.IntuitiveSurgeonCommitment, { foreignKey: 'business_plan_id', as: 'surgeonCommitments' });
    BusinessPlan.hasMany(models.IntuitiveSurvey, { foreignKey: 'business_plan_id', as: 'surveys' });
    BusinessPlan.hasMany(models.IntuitiveClinicalOutcome, { foreignKey: 'business_plan_id', as: 'clinicalOutcomes' });
    BusinessPlan.hasMany(models.IntuitivePlanActual, { foreignKey: 'business_plan_id', as: 'actuals' });
    BusinessPlan.hasMany(models.IntuitivePlanSnapshot, { foreignKey: 'business_plan_id', as: 'snapshots' });
  };

  return BusinessPlan;
};
