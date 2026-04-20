'use strict';
const crypto = require('crypto');

module.exports = (sequelize, DataTypes) => {
  const Survey = sequelize.define('IntuitiveSurvey', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    business_plan_id: { type: DataTypes.INTEGER, allowNull: true },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    hospital_name: { type: DataTypes.STRING(255), allowNull: true },
    system_type: { type: DataTypes.STRING(50), allowNull: true },
    status: {
      type: DataTypes.STRING(30), defaultValue: 'draft',
      validate: { isIn: [['draft', 'active', 'closed', 'archived']] }
    },
    distribution_method: {
      type: DataTypes.STRING(30), defaultValue: 'email',
      comment: 'email, sms, voice, link'
    },
    survey_url_token: {
      type: DataTypes.STRING(64), unique: true,
      defaultValue: () => crypto.randomBytes(32).toString('hex')
    },
    questions: {
      type: DataTypes.JSONB, allowNull: false,
      defaultValue: [
        { id: 'incremental_volume', type: 'number', text: 'If you had unfettered access to the {system_type} system at {hospital_name}, how many MORE procedures would you perform at this hospital per month?', required: true },
        { id: 'procedure_breakdown', type: 'procedure_mix', text: 'What is your procedure type breakdown? Please estimate the percentage for each type:', required: true },
        { id: 'barriers', type: 'checkbox_text', text: 'What currently prevents you from performing more procedures at {hospital_name}?', options: ['Scheduling access', 'Equipment availability', 'Support staff training', 'Patient volume', 'Insurance coverage', 'OR block time', 'Other'], required: true },
        { id: 'competitive_leakage', type: 'number', text: 'How many cases per month are you currently bringing to competitive hospitals in this market?', required: false },
        { id: 'competitive_hospitals', type: 'text', text: 'Which competitive hospitals are you currently performing cases at?', required: false },
        { id: 'current_robotic_volume', type: 'number', text: 'How many robotic cases do you currently perform per month at {hospital_name}?', required: true },
        { id: 'commit', type: 'boolean', text: 'Would you formally commit to these incremental volumes if the {system_type} were available?', required: true },
        { id: 'comments', type: 'textarea', text: 'Additional comments or notes:', required: false }
      ]
    },
    welcome_message: { type: DataTypes.TEXT, allowNull: true },
    thank_you_message: { type: DataTypes.TEXT, allowNull: true },
    sent_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    response_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    last_reminder_at: { type: DataTypes.DATE, allowNull: true },
    closes_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'intuitive_surveys',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['business_plan_id'] },
      { unique: true, fields: ['survey_url_token'] }
    ]
  });

  Survey.associate = (models) => {
    Survey.belongsTo(models.IntuitiveBusinessPlan, { foreignKey: 'business_plan_id', as: 'businessPlan' });
    Survey.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
    Survey.hasMany(models.IntuitiveSurveyRecipient, { foreignKey: 'survey_id', as: 'recipients' });
    Survey.hasMany(models.IntuitiveSurveyResponse, { foreignKey: 'survey_id', as: 'responses' });
  };

  return Survey;
};
