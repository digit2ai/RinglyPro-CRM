// Migration: Add calendar_settings to clients table
// Created: 2025-10-07
// Purpose: Add JSON column to store per-day calendar configuration (start/end times, off days)

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('clients', 'calendar_settings', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Per-day calendar configuration: {monday: {enabled: true, start: "09:00", end: "17:00"}, ...}'
    });

    console.log('✅ Added calendar_settings column to clients table');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('clients', 'calendar_settings');

    console.log('✅ Removed calendar_settings column from clients table');
  }
};
