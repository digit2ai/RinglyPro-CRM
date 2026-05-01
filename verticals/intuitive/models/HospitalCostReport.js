'use strict';

module.exports = (sequelize, DataTypes) => {
  const HospitalCostReport = sequelize.define('IntuitiveHospitalCostReport', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider_id: { type: DataTypes.STRING(20), allowNull: false, comment: 'CMS Certification Number (CCN)' },
    fiscal_year: { type: DataTypes.INTEGER, allowNull: false },
    total_revenue: { type: DataTypes.DECIMAL(20, 2) },
    total_expenses: { type: DataTypes.DECIMAL(20, 2) },
    surgical_revenue: { type: DataTypes.DECIMAL(20, 2) },
    total_surgical_cases: { type: DataTypes.INTEGER },
    payer_medicare_pct: { type: DataTypes.DECIMAL(5, 2) },
    payer_medicaid_pct: { type: DataTypes.DECIMAL(5, 2) },
    payer_self_pay_pct: { type: DataTypes.DECIMAL(5, 2) },
    payer_other_pct: { type: DataTypes.DECIMAL(5, 2) },
    total_or_count: { type: DataTypes.INTEGER },
    beds_available: { type: DataTypes.INTEGER },
    beds_staffed: { type: DataTypes.INTEGER },
    raw_filing_url: { type: DataTypes.TEXT },
    ingested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'intuitive_hospital_cost_reports',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['provider_id', 'fiscal_year'] },
      { fields: ['provider_id'] },
    ],
  });
  return HospitalCostReport;
};
