'use strict';

module.exports = (sequelize, DataTypes) => {
  const AnalysisResult = sequelize.define('IntuitiveAnalysisResult', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    analysis_type: {
      type: DataTypes.STRING(100), allowNull: false,
      comment: 'volume_projection, model_matching, utilization_forecast, surgeon_capacity, infrastructure_assessment, roi_calculation, competitive_analysis, risk_assessment'
    },
    result_data: { type: DataTypes.JSONB, defaultValue: {} },
    computed_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'intuitive_analysis_results',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['project_id', 'analysis_type'] }
    ]
  });

  AnalysisResult.associate = (models) => {
    AnalysisResult.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
  };

  return AnalysisResult;
};
