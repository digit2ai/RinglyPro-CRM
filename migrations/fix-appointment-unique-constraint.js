// Migration to fix appointment unique constraint to include client_id
// This prevents double-booking within a client, but allows different clients
// to book the same time slot

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Remove old constraint if it exists (without client_id)
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE appointments
        DROP CONSTRAINT IF EXISTS unique_time_slot;
      `);
      console.log('✓ Removed old unique_time_slot constraint');
    } catch (error) {
      console.log('⚠️ Old constraint does not exist (this is okay)');
    }

    // Add new constraint with client_id
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE appointments
        ADD CONSTRAINT unique_time_slot_per_client
        UNIQUE (client_id, appointment_date, appointment_time);
      `);
      console.log('✓ Added new unique_time_slot_per_client constraint');
    } catch (error) {
      console.log('⚠️ Constraint may already exist:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the new constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
      DROP CONSTRAINT IF EXISTS unique_time_slot_per_client;
    `);

    // Optionally restore the old constraint (without client_id)
    // Note: This is NOT recommended as it breaks multi-tenant functionality
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
      ADD CONSTRAINT unique_time_slot
      UNIQUE (appointment_date, appointment_time);
    `);
  }
};
