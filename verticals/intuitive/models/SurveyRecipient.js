'use strict';

module.exports = (sequelize, DataTypes) => {
  const SurveyRecipient = sequelize.define('IntuitiveSurveyRecipient', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    survey_id: { type: DataTypes.INTEGER, allowNull: false },
    surgeon_name: { type: DataTypes.STRING(255), allowNull: false },
    surgeon_email: { type: DataTypes.STRING(255), allowNull: true },
    surgeon_phone: { type: DataTypes.STRING(50), allowNull: true },
    surgeon_specialty: { type: DataTypes.STRING(100), allowNull: true },
    personal_token: {
      type: DataTypes.STRING(64), unique: true,
      defaultValue: () => require('crypto').randomBytes(32).toString('hex')
    },
    status: {
      type: DataTypes.STRING(30), defaultValue: 'pending',
      validate: { isIn: [['pending', 'sent', 'opened', 'completed', 'bounced']] }
    },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    opened_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    reminder_count: { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    tableName: 'intuitive_survey_recipients',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['survey_id'] },
      { unique: true, fields: ['personal_token'] }
    ]
  });

  SurveyRecipient.associate = (models) => {
    SurveyRecipient.belongsTo(models.IntuitiveSurvey, { foreignKey: 'survey_id', as: 'survey' });
    SurveyRecipient.hasMany(models.IntuitiveSurveyResponse, { foreignKey: 'recipient_id', as: 'responses' });
  };

  return SurveyRecipient;
};
