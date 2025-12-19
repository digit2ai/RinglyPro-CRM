'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // =====================================================
      // Add deposit tracking fields to appointments table
      // =====================================================

      // Deposit status: not_required (default), pending, confirmed
      await queryInterface.addColumn('appointments', 'deposit_status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'not_required',
        comment: 'Deposit collection status: not_required, pending, confirmed'
      }, { transaction });

      // When deposit was confirmed
      await queryInterface.addColumn('appointments', 'deposit_confirmed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp when deposit was confirmed'
      }, { transaction });

      // How deposit was confirmed
      await queryInterface.addColumn('appointments', 'deposit_confirmation_method', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Method of confirmation: manual, zelle, email, etc.'
      }, { transaction });

      // Notes about the deposit
      await queryInterface.addColumn('appointments', 'deposit_notes', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Additional notes about the deposit'
      }, { transaction });

      // =====================================================
      // Add deposit settings to clients table
      // =====================================================

      // Whether this client requires deposits
      await queryInterface.addColumn('clients', 'deposit_required', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether this client requires deposits for appointments'
      }, { transaction });

      // Default deposit amount
      await queryInterface.addColumn('clients', 'deposit_amount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Default deposit amount for appointments'
      }, { transaction });

      // Add index for filtering pending deposits
      await queryInterface.addIndex('appointments', ['deposit_status'], {
        name: 'idx_appointments_deposit_status',
        transaction
      });

      // Add composite index for client + pending deposits
      await queryInterface.addIndex('appointments', ['client_id', 'deposit_status'], {
        name: 'idx_appointments_client_deposit_status',
        transaction
      });

      await transaction.commit();
      console.log('Migration completed: Added deposit tracking fields');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove indexes
      await queryInterface.removeIndex('appointments', 'idx_appointments_client_deposit_status', { transaction });
      await queryInterface.removeIndex('appointments', 'idx_appointments_deposit_status', { transaction });

      // Remove client columns
      await queryInterface.removeColumn('clients', 'deposit_amount', { transaction });
      await queryInterface.removeColumn('clients', 'deposit_required', { transaction });

      // Remove appointment columns
      await queryInterface.removeColumn('appointments', 'deposit_notes', { transaction });
      await queryInterface.removeColumn('appointments', 'deposit_confirmation_method', { transaction });
      await queryInterface.removeColumn('appointments', 'deposit_confirmed_at', { transaction });
      await queryInterface.removeColumn('appointments', 'deposit_status', { transaction });

      await transaction.commit();
      console.log('Migration rolled back: Removed deposit tracking fields');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
