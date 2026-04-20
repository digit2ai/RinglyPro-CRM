'use strict';

module.exports = (sequelize, DataTypes) => {
  const SurveyResponse = sequelize.define('IntuitiveSurveyResponse', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    survey_id: { type: DataTypes.INTEGER, allowNull: false },
    recipient_id: { type: DataTypes.INTEGER, allowNull: true },
    surgeon_name: { type: DataTypes.STRING(255), allowNull: false },
    surgeon_email: { type: DataTypes.STRING(255), allowNull: true },
    surgeon_specialty: { type: DataTypes.STRING(100), allowNull: true },
    // Core response data
    answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Parsed/structured commitments
    incremental_cases_monthly: { type: DataTypes.INTEGER, allowNull: true },
    procedure_breakdown: {
      type: DataTypes.JSONB, defaultValue: [],
      comment: 'Array of { procedure_type, percentage, estimated_monthly_cases }'
    },
    barriers: { type: DataTypes.TEXT, allowNull: true },
    competitive_leakage_cases: { type: DataTypes.INTEGER, allowNull: true },
    competitive_hospitals: { type: DataTypes.TEXT, allowNull: true },
    current_robotic_cases_monthly: { type: DataTypes.INTEGER, allowNull: true },
    willing_to_commit: { type: DataTypes.BOOLEAN, defaultValue: false },
    additional_comments: { type: DataTypes.TEXT, allowNull: true },
    completed_via: {
      type: DataTypes.STRING(30), defaultValue: 'web',
      comment: 'web, voice, manual'
    },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    completed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'intuitive_survey_responses',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['survey_id'] },
      { fields: ['recipient_id'] }
    ]
  });

  SurveyResponse.associate = (models) => {
    SurveyResponse.belongsTo(models.IntuitiveSurvey, { foreignKey: 'survey_id', as: 'survey' });
    SurveyResponse.belongsTo(models.IntuitiveSurveyRecipient, { foreignKey: 'recipient_id', as: 'recipient' });
  };

  return SurveyResponse;
};
