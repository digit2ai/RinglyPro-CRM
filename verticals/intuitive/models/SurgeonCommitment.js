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
      comment: 'Array of { procedure_type, procedure_name, drg_code, patient_source, pct_converted_from_open, incremental_cases_monthly, incremental_cases_annual, current_monthly_volume, competitive_leakage_cases, reimbursement_rate, notes }'
    },
    total_incremental_annual: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_revenue_impact: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    // CFO-grade commitment categorization (Deck 3 Slides 9/10/11 pattern)
    commitment_category: {
      type: DataTypes.STRING(30), defaultValue: 'open_to_mis',
      comment: 'open_to_mis (existing open volume converting) | pull_forward (proficient surgeons blocked by access) | training_pipeline (untrained surgeons needing TR200)',
      validate: { isIn: [['open_to_mis', 'pull_forward', 'training_pipeline']] }
    },
    trained: { type: DataTypes.BOOLEAN, defaultValue: true, comment: 'Slide 11 Trained column' },
    training_needs: { type: DataTypes.STRING(255), allowNull: true, comment: 'e.g. Advanced Colorectal, Luminary Training, TR200' },
    proctoring_needed: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'Yes/No in Slide 11' },
    current_weekly_volume: { type: DataTypes.INTEGER, allowNull: true, comment: 'Pull-forward: current cases/wk before access expansion' },
    target_weekly_volume: { type: DataTypes.INTEGER, allowNull: true, comment: 'Pull-forward: target cases/wk if granted additional access' },
    backlog_weeks: { type: DataTypes.INTEGER, allowNull: true, comment: 'Pull-forward: weeks of patient backlog (urgency signal)' },
    free_text_intel: { type: DataTypes.TEXT, allowNull: true, comment: 'Free-text intelligence the CSR has gathered offline (Slide 12 pattern)' },
    source: {
      type: DataTypes.STRING(50), defaultValue: 'manual',
      comment: 'manual, survey, voice_call, auto_seed'
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
