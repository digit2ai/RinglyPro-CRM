'use strict';

module.exports = (sequelize, DataTypes) => {
  const AnalysisResult = sequelize.define('LogisticsAnalysisResult', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    analysis_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        isIn: [[
          'overview_kpis',
          'order_structure',
          'order_time_series',
          'throughput_monthly',
          'throughput_weekday',
          'throughput_hourly',
          'abc_classification',
          'fit_analysis',
          'benefit_projections',
          'system_architecture'
        ]]
      }
    },
    result_data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    computed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'logistics_analysis_results',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { unique: true, fields: ['project_id', 'analysis_type'] }
    ]
  });

  AnalysisResult.associate = (models) => {
    AnalysisResult.belongsTo(models.LogisticsProject, { foreignKey: 'project_id', as: 'project' });
  };

  return AnalysisResult;
};
