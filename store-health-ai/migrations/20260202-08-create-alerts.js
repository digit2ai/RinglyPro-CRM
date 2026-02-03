'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('alerts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      store_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'stores',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      kpi_definition_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'kpi_definitions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      alert_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      severity: {
        type: Sequelize.ENUM('yellow', 'red', 'critical'),
        allowNull: false
      },
      escalation_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '0-4 per escalation model'
      },
      status: {
        type: Sequelize.ENUM('active', 'acknowledged', 'resolved', 'expired'),
        allowNull: false,
        defaultValue: 'active'
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      requires_acknowledgment: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      acknowledged_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      acknowledged_by: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'User name/ID who acknowledged'
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'SLA deadline for action'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for queries
    await queryInterface.addIndex('alerts', ['store_id', 'status', 'alert_date'], {
      name: 'idx_alerts_store_status_date'
    });
    await queryInterface.addIndex('alerts', ['alert_date']);
    await queryInterface.addIndex('alerts', ['status']);
    await queryInterface.addIndex('alerts', ['severity']);
    await queryInterface.addIndex('alerts', ['expires_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('alerts');
  }
};
