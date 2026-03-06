// kancho-ai/models/KanchoMembershipPlan.js
// Membership plan definitions for martial arts schools

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoMembershipPlan = sequelize.define('KanchoMembershipPlan', {
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.STRING(30),
      defaultValue: 'recurring',
      comment: 'recurring, drop_in, trial, annual, family'
    },
    billing_frequency: {
      type: DataTypes.STRING(20),
      defaultValue: 'monthly',
      comment: 'monthly, quarterly, semi_annual, annual, one_time'
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    setup_fee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    trial_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    classes_per_week: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'null = unlimited'
    },
    allowed_programs: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Array of program types this plan covers, null = all'
    },
    family_discount_percent: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    max_family_members: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    contract_months: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '0 = month-to-month, no contract'
    },
    cancellation_notice_days: {
      type: DataTypes.INTEGER,
      defaultValue: 30
    },
    stripe_price_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    features: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'List of included features/perks'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    active_subscribers: {
      type: DataTypes.INTEGER,
      defaultValue: 0
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
    tableName: 'kancho_membership_plans',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['is_active'] },
      { fields: ['type'] }
    ]
  });

  KanchoMembershipPlan.associate = (models) => {
    KanchoMembershipPlan.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoMembershipPlan.hasMany(models.KanchoSubscription, { foreignKey: 'plan_id', as: 'subscriptions' });
  };

  return KanchoMembershipPlan;
};
