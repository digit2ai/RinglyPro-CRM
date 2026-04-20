'use strict';

module.exports = (sequelize, DataTypes) => {
  const PlanActual = sequelize.define('IntuitivePlanActual', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    business_plan_id: { type: DataTypes.INTEGER, allowNull: false },
    period_start: { type: DataTypes.DATEONLY, allowNull: false },
    period_end: { type: DataTypes.DATEONLY, allowNull: false },
    period_label: { type: DataTypes.STRING(50), allowNull: true, comment: 'Q1 2026, Jan 2026, Week 15' },
    // Surgeon-level actual volumes
    surgeon_actuals: {
      type: DataTypes.JSONB, allowNull: false, defaultValue: [],
      comment: 'Array of { surgeon_name, procedure_type, actual_cases, projected_cases, variance, variance_pct }'
    },
    // Aggregate totals
    total_actual_cases: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_projected_cases: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_variance: { type: DataTypes.INTEGER, defaultValue: 0 },
    variance_pct: { type: DataTypes.DECIMAL(8, 2), defaultValue: 0 },
    // Revenue tracking
    actual_revenue: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    projected_revenue: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    revenue_variance: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    // Clinical outcome actuals
    clinical_actuals: { type: DataTypes.JSONB, defaultValue: {} },
    // Import metadata
    imported_by: { type: DataTypes.STRING(255), allowNull: true },
    import_source: { type: DataTypes.STRING(100), defaultValue: 'manual', comment: 'manual, report_upload, api' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'intuitive_plan_actuals',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['business_plan_id'] },
      { fields: ['period_start', 'period_end'] }
    ]
  });

  PlanActual.associate = (models) => {
    PlanActual.belongsTo(models.IntuitiveBusinessPlan, { foreignKey: 'business_plan_id', as: 'businessPlan' });
  };

  return PlanActual;
};
