'use strict';

/**
 * Migration: Fix unique_time_slot constraint to be per-client
 *
 * ISSUE: The current unique_time_slot constraint is on (appointment_date, appointment_time)
 * which means only ONE appointment can exist at any given time across ALL clients.
 * This is wrong for a multi-tenant system.
 *
 * FIX: Change the constraint to (client_id, appointment_date, appointment_time)
 * so each client can have their own appointments at the same times.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Drop the old global constraint
      await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS unique_time_slot;
      `);
      console.log('Dropped old unique_time_slot constraint');
    } catch (error) {
      console.log('Old constraint may not exist:', error.message);
    }

    try {
      // Also try dropping by constraint name (in case it's a constraint not index)
      await queryInterface.sequelize.query(`
        ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_time_slot;
      `);
      console.log('Dropped old unique_time_slot constraint (as constraint)');
    } catch (error) {
      console.log('Constraint removal note:', error.message);
    }

    try {
      // Drop the old unique_scheduled_slot constraint if it exists
      await queryInterface.sequelize.query(`
        ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_scheduled_slot;
      `);
      console.log('Dropped old unique_scheduled_slot constraint');
    } catch (error) {
      console.log('unique_scheduled_slot note:', error.message);
    }

    try {
      // Create new per-client unique constraint
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS unique_time_slot_per_client
        ON appointments (client_id, appointment_date, appointment_time)
        WHERE status NOT IN ('cancelled', 'completed');
      `);
      console.log('Created new unique_time_slot_per_client constraint');
    } catch (error) {
      console.log('New constraint creation note:', error.message);
    }

    console.log('Migration completed: Fixed unique_time_slot to be per-client');
  },

  async down(queryInterface, Sequelize) {
    try {
      // Drop the new per-client constraint
      await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS unique_time_slot_per_client;
      `);

      // Recreate the old global constraint (not recommended)
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX unique_time_slot
        ON appointments (appointment_date, appointment_time)
        WHERE status NOT IN ('cancelled', 'completed');
      `);
      console.log('Rollback: Restored original unique_time_slot constraint');
    } catch (error) {
      console.log('Rollback error:', error.message);
    }
  }
};
