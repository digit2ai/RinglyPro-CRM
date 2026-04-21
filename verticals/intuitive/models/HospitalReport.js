'use strict';

module.exports = (sequelize, DataTypes) => {
  const HospitalReport = sequelize.define('IntuitiveHospitalReport', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    report_type: {
      type: DataTypes.STRING(30), allowNull: false, defaultValue: 'annual_report',
      comment: 'annual_report, cms_snapshot, uploaded_pdf'
    },
    source_url: { type: DataTypes.STRING(500), allowNull: true },
    file_path: { type: DataTypes.STRING(500), allowNull: true },
    raw_text: { type: DataTypes.TEXT, allowNull: true },
    extracted_procedures: {
      type: DataTypes.JSONB, defaultValue: [],
      comment: 'Array of { procedure, open_count, lap_count, robotic_count, total_count, year }'
    },
    extraction_confidence: { type: DataTypes.FLOAT, allowNull: true },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'intuitive_hospital_reports',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['project_id'] }]
  });

  HospitalReport.associate = (models) => {
    HospitalReport.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
  };

  return HospitalReport;
};
