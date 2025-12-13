// Migration: Add Stripe subscription fields to users table
// Created: 2025-12-12
// Purpose: Add fields for recurring subscription management with 14-day free trial

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add Stripe customer ID
    await queryInterface.addColumn('users', 'stripe_customer_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Stripe customer ID for payment processing'
    });

    // Add Stripe subscription ID
    await queryInterface.addColumn('users', 'stripe_subscription_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Stripe subscription ID for recurring billing'
    });

    // Add subscription status
    await queryInterface.addColumn('users', 'subscription_status', {
      type: Sequelize.ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete'),
      allowNull: true,
      defaultValue: null,
      comment: 'Current subscription status from Stripe'
    });

    // Add billing frequency
    await queryInterface.addColumn('users', 'billing_frequency', {
      type: Sequelize.ENUM('monthly', 'annual'),
      allowNull: true,
      defaultValue: 'monthly',
      comment: 'Billing frequency: monthly or annual'
    });

    // Add trial end date
    await queryInterface.addColumn('users', 'trial_ends_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '14-day free trial end date'
    });

    // Add subscription plan (update token_package to include enterprise)
    // First, we need to check if we should update the ENUM for token_package
    // Note: Altering ENUM in PostgreSQL requires recreating the type
    // For safety, we'll add a new column instead
    await queryInterface.addColumn('users', 'subscription_plan', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'free',
      comment: 'Subscription plan: free, starter, growth, professional, enterprise'
    });

    // Add monthly token allocation
    await queryInterface.addColumn('users', 'monthly_token_allocation', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 100,
      comment: 'Token allocation per billing cycle'
    });

    console.log('✅ Added subscription fields to users table');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'monthly_token_allocation');
    await queryInterface.removeColumn('users', 'subscription_plan');
    await queryInterface.removeColumn('users', 'trial_ends_at');
    await queryInterface.removeColumn('users', 'billing_frequency');
    await queryInterface.removeColumn('users', 'subscription_status');
    await queryInterface.removeColumn('users', 'stripe_subscription_id');
    await queryInterface.removeColumn('users', 'stripe_customer_id');

    // Drop the ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_subscription_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_billing_frequency";');

    console.log('✅ Removed subscription fields from users table');
  }
};
