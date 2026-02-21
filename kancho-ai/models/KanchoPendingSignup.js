// kancho-ai/models/KanchoPendingSignup.js
// Temporary storage for signup form data before Stripe checkout completes

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoPendingSignup = sequelize.define('KanchoPendingSignup', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    // Form data
    email: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    school_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    martial_art_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    // Location
    address: { type: DataTypes.TEXT, allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    state: { type: DataTypes.STRING(50), allowNull: true },
    zip: { type: DataTypes.STRING(20), allowNull: true },
    country: { type: DataTypes.STRING(50), defaultValue: 'USA' },
    timezone: { type: DataTypes.STRING(50), defaultValue: 'America/New_York' },
    // Business details
    website: { type: DataTypes.STRING(500), allowNull: true },
    monthly_revenue_target: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    student_capacity: { type: DataTypes.INTEGER, defaultValue: 100 },
    // Subscription
    plan: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['intelligence', 'pro']]
      }
    },
    // Stripe
    stripe_checkout_session_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    stripe_customer_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // Status tracking
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'processing', 'completed', 'failed', 'expired']]
      }
    },
    provisioning_step: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Current provisioning step for progress tracking'
    },
    provisioning_error: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Results (populated after webhook processes)
    result_user_id: { type: DataTypes.INTEGER, allowNull: true },
    result_client_id: { type: DataTypes.INTEGER, allowNull: true },
    result_school_id: { type: DataTypes.INTEGER, allowNull: true },
    result_twilio_number: { type: DataTypes.STRING(20), allowNull: true },
    result_elevenlabs_agent_id: { type: DataTypes.STRING(100), allowNull: true },
    // JWT for auto-login after completion
    result_jwt: { type: DataTypes.TEXT, allowNull: true },
    // Timestamps
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    completed_at: {
      type: DataTypes.DATE,
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
    tableName: 'kancho_pending_signups',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['stripe_checkout_session_id'] },
      { fields: ['email'] },
      { fields: ['status'] },
      { fields: ['expires_at'] }
    ]
  });

  return KanchoPendingSignup;
};
