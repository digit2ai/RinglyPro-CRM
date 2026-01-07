'use strict';

/**
 * Migration: Add 'elevenlabs' to message_source ENUM
 *
 * Adds elevenlabs as a valid source for messages synced from ElevenLabs Conversational AI
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add elevenlabs to the message_source enum
    try {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_messages_message_source" ADD VALUE IF NOT EXISTS 'elevenlabs'`
      );
      console.log('Added elevenlabs to message_source enum');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('elevenlabs value already exists in message_source enum');
      } else {
        console.log('Note: May need to manually add elevenlabs to enum:', error.message);
      }
    }

    console.log('Migration completed: Added elevenlabs to message_source enum');
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't easily support removing enum values
    console.log('Down migration not supported for enum removal');
  }
};
