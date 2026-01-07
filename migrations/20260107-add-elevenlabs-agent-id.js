'use strict';

/**
 * Migration: Add elevenlabs_agent_id to clients table
 *
 * Stores the ElevenLabs Conversational AI agent ID for call history sync
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add elevenlabs_agent_id column
    try {
      await queryInterface.addColumn('clients', 'elevenlabs_agent_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'ElevenLabs Conversational AI agent ID for call history sync'
      });
      console.log('Added elevenlabs_agent_id column to clients');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('elevenlabs_agent_id column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Set agent ID for Client 32 (known ElevenLabs agent)
    try {
      await queryInterface.sequelize.query(
        `UPDATE clients SET elevenlabs_agent_id = 'agent_1801kdnq8avcews9r9rrvf7k0vh1' WHERE id = 32`
      );
      console.log('Set ElevenLabs agent ID for Client 32');
    } catch (error) {
      console.log('Could not set agent ID for Client 32:', error.message);
    }

    console.log('Migration completed: Added elevenlabs_agent_id to clients table');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('clients', 'elevenlabs_agent_id');
    console.log('Removed elevenlabs_agent_id column from clients table');
  }
};
