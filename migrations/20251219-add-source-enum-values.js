'use strict';

/**
 * Migration: Add missing ENUM values to appointments table
 *
 * ISSUE: The Sequelize model allows values that weren't in the original PostgreSQL ENUMs.
 * This causes INSERT failures with "Validation error".
 *
 * This migration adds required values to both:
 * - enum_appointments_source (source column)
 * - enum_appointments_status (status column - if needed in future)
 *
 * IMMEDIATE FIX: The code now maps app-level source values to existing DB ENUM values:
 * - voice_booking -> rachel_voice_ai
 * - whatsapp -> api
 * - etc.
 *
 * This migration is for future-proofing when we want to use the actual values.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Source values to add to enum_appointments_source
    const sourceValues = [
      'voice_booking',
      'voice_booking_spanish',
      'online',
      'walk-in',
      'whatsapp',
      'whatsapp_ghl',
      'whatsapp_vagaro',
      'whatsapp_hubspot'
    ];

    // Status values to add to enum_appointments_status (if not already there)
    const statusValues = [
      'pending'  // For future use
    ];

    // Add source enum values
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

    // Add status enum values
    for (const value of statusValues) {
      try {
        await queryInterface.sequelize.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_enum
              WHERE enumlabel = '${value}'
              AND enumtypid = (
                SELECT oid FROM pg_type WHERE typname = 'enum_appointments_status'
              )
            ) THEN
              ALTER TYPE enum_appointments_status ADD VALUE '${value}';
            END IF;
          END$$;
        `);
        console.log(`Added status enum value: ${value}`);
      } catch (error) {
        console.log(`Status enum ${value}: ${error.message}`);
      }
    }

    console.log('Migration completed: Added missing ENUM values');
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does not support removing values from ENUM types
    console.log('Note: PostgreSQL does not support removing ENUM values. Manual cleanup required if needed.');
  }
};
