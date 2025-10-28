'use strict';

/**
 * Migration: Create ghl_integrations table for multi-tenant OAuth
 *
 * This table stores GoHighLevel OAuth tokens per client for multi-tenant support.
 * Each client can connect their own GHL account via OAuth.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ghl_integrations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'clients',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to clients table - each client has their own GHL OAuth'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'User who authorized the OAuth connection'
      },
      ghl_location_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'GoHighLevel Location ID (sub-account ID)'
      },
      ghl_company_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'GoHighLevel Company ID (agency ID)'
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'OAuth access token for GHL API - encrypted in production'
      },
      refresh_token: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'OAuth refresh token to get new access tokens - encrypted in production'
      },
      token_type: {
        type: Sequelize.STRING(20),
        defaultValue: 'Bearer',
        comment: 'Token type (usually Bearer)'
      },
      scope: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Space-separated list of granted scopes'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the access token expires (null = never expires)'
      },
      user_type: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'GHL user type: Location or Company'
      },
      location_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Name of the GHL location for easy identification'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this integration is currently active'
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last time tokens were refreshed or verified'
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

    // Add indexes for performance
    await queryInterface.addIndex('ghl_integrations', ['client_id'], {
      name: 'idx_ghl_integrations_client_id'
    });

    await queryInterface.addIndex('ghl_integrations', ['user_id'], {
      name: 'idx_ghl_integrations_user_id'
    });

    await queryInterface.addIndex('ghl_integrations', ['ghl_location_id'], {
      name: 'idx_ghl_integrations_location_id'
    });

    await queryInterface.addIndex('ghl_integrations', ['is_active'], {
      name: 'idx_ghl_integrations_is_active'
    });

    // Add unique constraint: one active integration per client
    await queryInterface.addIndex('ghl_integrations', ['client_id', 'is_active'], {
      name: 'idx_ghl_integrations_client_active',
      unique: true,
      where: {
        is_active: true
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('ghl_integrations');
  }
};
