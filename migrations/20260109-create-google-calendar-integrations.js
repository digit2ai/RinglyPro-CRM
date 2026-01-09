'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('google_calendar_integrations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'clients',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      google_email: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Google account email used for authorization'
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'OAuth access token (encrypted in production)'
      },
      refresh_token: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'OAuth refresh token for getting new access tokens'
      },
      token_type: {
        type: Sequelize.STRING,
        defaultValue: 'Bearer'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the access token expires'
      },
      scope: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Granted OAuth scopes'
      },
      calendar_id: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'primary',
        comment: 'Selected Google Calendar ID to sync with'
      },
      calendar_name: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Display name of selected calendar'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this integration is currently active'
      },
      sync_appointments: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether to sync RinglyPro appointments to Google'
      },
      sync_blocked_times: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether to check Google Calendar for blocked times'
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last successful sync timestamp'
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Last error message if any'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Index for quick lookups
    await queryInterface.addIndex('google_calendar_integrations', ['client_id']);
    await queryInterface.addIndex('google_calendar_integrations', ['is_active']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('google_calendar_integrations');
  }
};
