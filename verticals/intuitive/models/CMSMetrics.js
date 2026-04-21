'use strict';

module.exports = (sequelize, DataTypes) => {
  const CMSMetrics = sequelize.define('IntuitiveCMSMetrics', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    cms_provider_id: { type: DataTypes.STRING(20), allowNull: true, comment: 'CMS CCN' },
    measure_id: { type: DataTypes.STRING(50), allowNull: true },
    measure_name: { type: DataTypes.STRING(255), allowNull: true },
    measure_category: {
      type: DataTypes.STRING(30), allowNull: true,
      comment: 'readmission, infection, mortality, los, complication, safety'
    },
    score: { type: DataTypes.FLOAT, allowNull: true },
    national_avg: { type: DataTypes.FLOAT, allowNull: true },
    comparison: {
      type: DataTypes.STRING(20), allowNull: true,
      comment: 'better, worse, same, not_available'
    },
    reporting_period: { type: DataTypes.STRING(50), allowNull: true },
    fetched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'intuitive_cms_metrics',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['cms_provider_id'] }
    ]
  });

  CMSMetrics.associate = (models) => {
    CMSMetrics.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
  };

  return CMSMetrics;
};
