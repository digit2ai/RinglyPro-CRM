'use strict';

module.exports = (sequelize, DataTypes) => {
  const Project = sequelize.define('IntuitiveProject', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    project_code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    hospital_name: { type: DataTypes.STRING(255), allowNull: false },
    contact_name: { type: DataTypes.STRING(255), allowNull: true },
    contact_email: { type: DataTypes.STRING(255), allowNull: true },
    contact_title: { type: DataTypes.STRING(255), allowNull: true },
    hospital_type: {
      type: DataTypes.STRING(50), allowNull: true,
      comment: 'academic, community, rural, specialty, VA, military'
    },
    bed_count: { type: DataTypes.INTEGER, allowNull: true },
    state: { type: DataTypes.STRING(50), allowNull: true },
    country: { type: DataTypes.STRING(100), allowNull: true, defaultValue: 'United States' },

    // Surgical profile
    annual_surgical_volume: { type: DataTypes.INTEGER, allowNull: true, comment: 'Total surgeries per year' },
    current_robotic_cases: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    current_system: { type: DataTypes.STRING(50), allowNull: true, comment: 'none, dV5, Xi, X, SP, Si, competitor' },
    current_system_count: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    current_system_age_years: { type: DataTypes.FLOAT, allowNull: true },

    // Specialty mix (percentages)
    specialty_urology: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    specialty_gynecology: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    specialty_general: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    specialty_thoracic: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    specialty_colorectal: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    specialty_head_neck: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    specialty_cardiac: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },

    // Workforce
    credentialed_robotic_surgeons: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    surgeons_interested: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    convertible_lap_cases: { type: DataTypes.INTEGER, allowNull: true, comment: 'Laparoscopic cases that could go robotic' },

    // Infrastructure
    total_or_count: { type: DataTypes.INTEGER, allowNull: true },
    robot_ready_ors: { type: DataTypes.INTEGER, allowNull: true },
    or_sqft: { type: DataTypes.FLOAT, allowNull: true },
    ceiling_height_ft: { type: DataTypes.FLOAT, allowNull: true },

    // Financials
    capital_budget: { type: DataTypes.STRING(50), allowNull: true, comment: 'Budget range' },
    acquisition_preference: { type: DataTypes.STRING(50), allowNull: true, comment: 'purchase, lease, usage_based' },
    avg_los_days: { type: DataTypes.FLOAT, allowNull: true, comment: 'Average length of stay for key procedures' },
    complication_rate_pct: { type: DataTypes.FLOAT, allowNull: true },
    readmission_rate_pct: { type: DataTypes.FLOAT, allowNull: true },

    // Payer mix
    payer_medicare_pct: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    payer_commercial_pct: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    payer_medicaid_pct: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    payer_self_pay_pct: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },
    value_based_contract_pct: { type: DataTypes.FLOAT, allowNull: true, defaultValue: 0 },

    // Competitive
    competitor_robot_nearby: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    competitor_details: { type: DataTypes.STRING(500), allowNull: true },

    // Goals
    target_go_live: { type: DataTypes.DATEONLY, allowNull: true },
    primary_goal: { type: DataTypes.STRING(100), allowNull: true, comment: 'volume_growth, cost_reduction, competitive, quality, recruitment' },
    notes: { type: DataTypes.TEXT, allowNull: true },

    // Extended data (JSONB for flexibility)
    extended_data: { type: DataTypes.JSONB, defaultValue: {} },

    // Status
    status: {
      type: DataTypes.STRING(50), allowNull: false, defaultValue: 'intake',
      validate: { isIn: [['intake', 'analyzing', 'matching', 'completed', 'error']] }
    },
    analysis_started_at: { type: DataTypes.DATE, allowNull: true },
    analysis_completed_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'intuitive_projects',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { unique: true, fields: ['project_code'] }
    ]
  });

  Project.associate = (models) => {
    Project.hasMany(models.IntuitiveAnalysisResult, { foreignKey: 'project_id', as: 'results' });
    Project.hasMany(models.IntuitiveSystemRecommendation, { foreignKey: 'project_id', as: 'recommendations' });
    Project.hasMany(models.IntuitiveBusinessPlan, { foreignKey: 'project_id', as: 'businessPlans' });
    Project.hasMany(models.IntuitiveSurgeonCommitment, { foreignKey: 'project_id', as: 'surgeonCommitments' });
    Project.hasMany(models.IntuitiveSurvey, { foreignKey: 'project_id', as: 'surveys' });
    Project.hasMany(models.IntuitiveClinicalOutcome, { foreignKey: 'project_id', as: 'clinicalOutcomes' });
    if (models.IntuitiveSurgeon) {
      Project.hasMany(models.IntuitiveSurgeon, { foreignKey: 'project_id', as: 'surgeons' });
    }
  };

  return Project;
};
