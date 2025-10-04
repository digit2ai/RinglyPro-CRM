// Migration: Add password reset fields to users table
// Created: 2025-10-03
// Purpose: Add password_reset_token and password_reset_expires columns for password reset functionality

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'password_reset_token', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'email_verification_token'
    });

    await queryInterface.addColumn('users', 'password_reset_expires', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'password_reset_token'
    });

    console.log('✅ Added password_reset_token and password_reset_expires columns to users table');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'password_reset_expires');
    await queryInterface.removeColumn('users', 'password_reset_token');

    console.log('✅ Removed password reset columns from users table');
  }
};
