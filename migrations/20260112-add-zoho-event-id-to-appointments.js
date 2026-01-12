'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add zoho_event_id column if it doesn't exist
    const tableInfo = await queryInterface.describeTable('appointments');

    if (!tableInfo.zoho_event_id) {
      await queryInterface.addColumn('appointments', 'zoho_event_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Zoho CRM event ID for sync tracking'
      });
      console.log('Added zoho_event_id column');
    } else {
      console.log('zoho_event_id column already exists');
    }

    // Also add google_event_id if it doesn't exist (in case previous migration didn't run)
    if (!tableInfo.google_event_id) {
      await queryInterface.addColumn('appointments', 'google_event_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Google Calendar event ID for sync tracking'
      });
      console.log('Added google_event_id column');
    } else {
      console.log('google_event_id column already exists');
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('appointments', 'zoho_event_id');
    // Don't remove google_event_id in down since it has its own migration
  }
};
