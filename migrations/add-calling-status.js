/**
 * Migration: Add CALLING status for immediate database updates
 *
 * This prevents duplicate calls by marking prospects as CALLING
 * immediately when a call is initiated, before waiting for Twilio webhook.
 *
 * Status workflow:
 * TO_BE_CALLED → CALLING (immediate) → CALLED (webhook) OR FAILED (webhook)
 *
 * If webhook fails, the CALLING status prevents retries.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 Adding CALLING status and updating call_status comments...');

    try {
      // Update the comment on call_status column to reflect new statuses
      await queryInterface.sequelize.query(
        `COMMENT ON COLUMN business_directory.call_status IS 'Call status: TO_BE_CALLED, CALLING, CALLED, FAILED, BAD_NUMBER, SKIPPED'`
      );

      console.log('✅ Updated call_status column comments');

      // Update any stale CALLING statuses to FAILED (in case of previous crashes)
      await queryInterface.sequelize.query(
        `UPDATE business_directory
         SET call_status = 'FAILED',
             call_notes = COALESCE(call_notes, '') || ' [Auto-recovered from stale CALLING status]'
         WHERE call_status = 'CALLING'
           AND last_called_at < NOW() - INTERVAL '5 minutes'`
      );

      console.log('✅ Cleaned up any stale CALLING statuses');
      console.log('✅ CALLING status migration completed successfully');

    } catch (error) {
      console.error('❌ Error during migration:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Rolling back CALLING status...');

    try {
      // Revert comment
      await queryInterface.sequelize.query(
        `COMMENT ON COLUMN business_directory.call_status IS 'Call status: TO_BE_CALLED, CALLED, FAILED, SKIPPED'`
      );

      // Convert any CALLING back to TO_BE_CALLED
      await queryInterface.sequelize.query(
        `UPDATE business_directory
         SET call_status = 'TO_BE_CALLED'
         WHERE call_status = 'CALLING'`
      );

      console.log('✅ Rollback completed');

    } catch (error) {
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};
