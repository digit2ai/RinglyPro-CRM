'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('appointments', 'google_event_id', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Google Calendar event ID for sync tracking'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('appointments', 'google_event_id');
  }
};
