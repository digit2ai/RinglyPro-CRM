'use strict';

module.exports = (sequelize, DataTypes) => {
  const SurgeonCommitment = sequelize.define('IntuitiveSurgeonCommitment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    business_plan_id: { type: DataTypes.INTEGER, allowNull: false },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    surgeon_name: { type: DataTypes.STRING(255), allowNull: false },
    surgeon_email: { type: DataTypes.STRING(255), allowNull: true },
    surgeon_phone: { type: DataTypes.STRING(50), allowNull: true },
    surgeon_specialty: { type: DataTypes.STRING(100), allowNull: true },
    hospital_affiliation: { type: DataTypes.STRING(255), allowNull: true },
    // Per-procedure incremental volume commitments
    procedures: {
      type: DataTypes.JSONB, allowNull: false, defaultValue: [],
      comment: 'Array of { procedure_type, procedure_name, drg_code, incremental_cases_monthly, incremental_cases_annual, current_monthly_volume, competitive_leakage_cases, reimbursement_rate, notes }'
    },
    total_incremental_annual: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_revenue_impact: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    source: {
      type: DataTypes.STRING(50), defaultValue: 'manual',
      comment: 'manual, survey, voice_call'
    },
    survey_response_id: { type: DataTypes.INTEGER, allowNull: true },
    status: {
      type: DataTypes.STRING(30), defaultValue: 'draft',
      validate: { isIn: [['draft', 'confirmed', 'archived']] }
    },
    confirmed_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'intuitive_surgeon_commitments',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['business_plan_id'] },
      { fields: ['project_id'] }
    ]
  });

  SurgeonCommitment.associate = (models) => {
    SurgeonCommitment.belongsTo(models.IntuitiveBusinessPlan, { foreignKey: 'business_plan_id', as: 'businessPlan' });
    SurgeonCommitment.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
  };

  return SurgeonCommitment;
};
