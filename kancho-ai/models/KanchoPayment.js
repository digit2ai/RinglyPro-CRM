// kancho-ai/models/KanchoPayment.js
// Payment and invoice tracking

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoPayment = sequelize.define('KanchoPayment', {
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
      allowNull: true,
      references: { model: 'kancho_students', key: 'id' }
    },
    subscription_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_subscriptions', key: 'id' }
    },
    family_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'kancho_families', key: 'id' }
    },
    type: {
      type: DataTypes.STRING(30),
      defaultValue: 'membership',
      comment: 'membership, retail, testing_fee, event, private_lesson, registration, other'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    tax: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'completed',
      comment: 'completed, pending, failed, refunded, partial_refund'
    },
    payment_method: {
      type: DataTypes.STRING(30),
      defaultValue: 'card',
      comment: 'card, cash, check, bank_transfer, other'
    },
    payment_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    invoice_number: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    stripe_payment_intent_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    stripe_charge_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    refund_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    refund_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
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
    tableName: 'kancho_payments',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['student_id'] },
      { fields: ['subscription_id'] },
      { fields: ['payment_date'] },
      { fields: ['status'] },
      { fields: ['type'] }
    ]
  });

  KanchoPayment.associate = (models) => {
    KanchoPayment.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoPayment.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
    KanchoPayment.belongsTo(models.KanchoSubscription, { foreignKey: 'subscription_id', as: 'subscription' });
    KanchoPayment.belongsTo(models.KanchoFamily, { foreignKey: 'family_id', as: 'family' });
  };

  return KanchoPayment;
};
