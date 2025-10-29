/**
 * EMERGENCY Migration: Add BAD_NUMBER status and mark problematic number
 *
 * This migration adds a BAD_NUMBER status to prevent calling numbers that:
 * - Twilio can't update status for
 * - Cause repeated calling issues
 * - Are invalid or problematic
 *
 * Also marks +14243242113 as BAD_NUMBER (called 49 times on 2025-10-29)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚨 EMERGENCY: Adding BAD_NUMBER status and marking problematic numbers...');

    try {
      // Mark the problematic number that was called 49 times
      const problematicNumber = '+14243242113';

      const [updateResult] = await queryInterface.sequelize.query(
        `UPDATE business_directory
         SET call_status = 'BAD_NUMBER',
             call_notes = 'EMERGENCY BLOCK: Called 49 times on 2025-10-29 due to webhook failure. NEVER CALL AGAIN.',
             updated_at = CURRENT_TIMESTAMP
         WHERE phone_number IN (
           :phone1,
           :phone2,
           :phone3,
           :phone4
         )`,
        {
          replacements: {
            phone1: problematicNumber,
            phone2: problematicNumber.replace(/^\+/, ''),
            phone3: problematicNumber.replace(/^\+1/, ''),
            phone4: '+' + problematicNumber.replace(/^\+1/, '')
          }
        }
      );

      console.log(`✅ Marked ${problematicNumber} as BAD_NUMBER`);

      // Add constraint to ensure BAD_NUMBER status is respected
      await queryInterface.sequelize.query(
        `CREATE OR REPLACE FUNCTION prevent_bad_number_calls()
         RETURNS TRIGGER AS $$
         BEGIN
           IF NEW.call_status = 'TO_BE_CALLED' AND OLD.call_status = 'BAD_NUMBER' THEN
             RAISE EXCEPTION 'Cannot change BAD_NUMBER status back to TO_BE_CALLED. This number is permanently blocked.';
           END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql;`
      );

      await queryInterface.sequelize.query(
        `DROP TRIGGER IF EXISTS protect_bad_numbers ON business_directory;
         CREATE TRIGGER protect_bad_numbers
         BEFORE UPDATE ON business_directory
         FOR EACH ROW
         EXECUTE FUNCTION prevent_bad_number_calls();`
      );

      console.log('✅ Added database trigger to prevent calling BAD_NUMBER entries');
      console.log('✅ Emergency migration completed successfully');

    } catch (error) {
      console.error('❌ Error during emergency migration:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Rolling back BAD_NUMBER status...');

    try {
      // Remove trigger
      await queryInterface.sequelize.query(
        `DROP TRIGGER IF EXISTS protect_bad_numbers ON business_directory;`
      );
      await queryInterface.sequelize.query(
        `DROP FUNCTION IF EXISTS prevent_bad_number_calls();`
      );

      // Optionally revert the problematic number (but safer to leave it blocked)
      console.log('⚠️  Leaving +14243242113 as BAD_NUMBER for safety');
      console.log('✅ Rollback completed');

    } catch (error) {
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};
