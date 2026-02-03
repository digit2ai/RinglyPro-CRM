'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('system_config', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      config_key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'e.g., voice_provider, alert_channels, sla_hours, etc.'
      },
      config_value: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      updated_by: {
        type: Sequelize.STRING(255),
        allowNull: true
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

    // Add constraint and indexes
    await queryInterface.addConstraint('system_config', {
      fields: ['organization_id', 'config_key'],
      type: 'unique',
      name: 'unique_org_config_key'
    });
    await queryInterface.addIndex('system_config', ['organization_id']);
    await queryInterface.addIndex('system_config', ['config_key']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('system_config');
  }
};
