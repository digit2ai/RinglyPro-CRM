'use strict';

module.exports = (sequelize, DataTypes) => {
  const PlanSnapshot = sequelize.define('IntuitivePlanSnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    business_plan_id: { type: DataTypes.INTEGER, allowNull: false },
    snapshot_date: { type: DataTypes.DATEONLY, allowNull: false },
    plan_data: { type: DataTypes.JSONB, allowNull: false, comment: 'Full business plan state at this point' },
    cumulative_actual_cases: { type: DataTypes.INTEGER, defaultValue: 0 },
    cumulative_projected_cases: { type: DataTypes.INTEGER, defaultValue: 0 },
    cumulative_variance_pct: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
    roi_tracking_pct: { type: DataTypes.DECIMAL(8, 2), allowNull: true, comment: 'Actual ROI achieved vs projected' },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'intuitive_plan_snapshots',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['business_plan_id'] },
      { fields: ['snapshot_date'] }
    ]
  });

  PlanSnapshot.associate = (models) => {
    PlanSnapshot.belongsTo(models.IntuitiveBusinessPlan, { foreignKey: 'business_plan_id', as: 'businessPlan' });
  };

  return PlanSnapshot;
};
