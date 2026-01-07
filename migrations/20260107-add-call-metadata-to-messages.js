'use strict';

/**
 * Migration: Add call metadata fields to messages table
 *
 * Adds fields to store voicemail/call details:
 * - call_duration: Duration of call/recording in seconds
 * - call_start_time: When the call started
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add call_duration column
    try {
      await queryInterface.addColumn('messages', 'call_duration', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Duration of call/voicemail in seconds'
      });
      console.log('Added call_duration column to messages');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('call_duration column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Add call_start_time column
    try {
      await queryInterface.addColumn('messages', 'call_start_time', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the call started (for voicemails/calls)'
      });
      console.log('Added call_start_time column to messages');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('call_start_time column already exists, skipping');
      } else {
        throw error;
      }
    }

    console.log('Migration completed: Added call metadata fields to messages table');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('messages', 'call_duration');
    await queryInterface.removeColumn('messages', 'call_start_time');
    console.log('Removed call metadata columns from messages table');
  }
};
