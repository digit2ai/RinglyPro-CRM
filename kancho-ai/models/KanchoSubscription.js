// kancho-ai/models/KanchoSubscription.js
// Student subscription/membership billing

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoSubscription = sequelize.define('KanchoSubscription', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'kancho_schools', key: 'id' }
    },
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'kancho_students', key: 'id' }
    },
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'kancho_membership_plans', key: 'id' }
    },
    family_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_families', key: 'id' }
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      comment: 'active, paused, cancelled, past_due, trial, expired'
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Contract end date, null for month-to-month'
    },
    trial_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    next_billing_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Current billing amount (may differ from plan if discounted)'
    },
    discount_percent: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    discount_reason: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    payment_method: {
      type: DataTypes.STRING(50),
      defaultValue: 'card',
      comment: 'card, bank, cash, check'
    },
    stripe_subscription_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    auto_renew: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    pause_start: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    pause_end: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    cancellation_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    cancellation_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_subscriptions',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['student_id'] },
      { fields: ['plan_id'] },
      { fields: ['status'] },
      { fields: ['next_billing_date'] }
    ]
  });

  KanchoSubscription.associate = (models) => {
    KanchoSubscription.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoSubscription.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
    KanchoSubscription.belongsTo(models.KanchoMembershipPlan, { foreignKey: 'plan_id', as: 'plan' });
    KanchoSubscription.belongsTo(models.KanchoFamily, { foreignKey: 'family_id', as: 'family' });
    KanchoSubscription.hasMany(models.KanchoPayment, { foreignKey: 'subscription_id', as: 'payments' });
  };

  return KanchoSubscription;
};
