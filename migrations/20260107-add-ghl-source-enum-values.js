'use strict';

/**
 * Migration: Add GHL-related ENUM values to appointments source
 *
 * Adds values needed for GHL calendar sync:
 * - ghl_sync: Regular appointments synced from GHL
 * - ghl_blocked_slot: Blocked/busy time derived from GHL availability
 * - dashboard: Appointments created from RinglyPro dashboard
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sourceValues = [
      'ghl_sync',
      'ghl_blocked_slot',
      'dashboard'
    ];

    for (const value of sourceValues) {
      try {
        await queryInterface.sequelize.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_enum
              WHERE enumlabel = '${value}'
              AND enumtypid = (
                SELECT oid FROM pg_type WHERE typname = 'enum_appointments_source'
              )
            ) THEN
              ALTER TYPE enum_appointments_source ADD VALUE '${value}';
            END IF;
          END$$;
        `);
        console.log(`Added source enum value: ${value}`);
      } catch (error) {
        console.log(`Source enum ${value}: ${error.message}`);
      }
    }

    console.log('Migration completed: Added GHL source ENUM values');
  },

  async down(queryInterface, Sequelize) {
    console.log('Note: PostgreSQL does not support removing ENUM values.');
  }
};
