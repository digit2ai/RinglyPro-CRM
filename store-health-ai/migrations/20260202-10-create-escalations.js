'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create escalations table
    await queryInterface.createTable('escalations', {
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
      alert_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'alerts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      task_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      from_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '0-4'
      },
      to_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '0-4'
      },
      escalation_reason: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      triggered_by: {
        type: Sequelize.ENUM('threshold', 'sla_breach', 'manual', 'predicted_risk'),
        allowNull: false
      },
      escalated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      escalated_to_role: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      escalated_to_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      escalated_to_contact: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'acknowledged', 'resolved'),
        allowNull: false,
        defaultValue: 'pending'
      },
      resolution: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true
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

    // Create escalation_rules table
    await queryInterface.createTable('escalation_rules', {
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
      kpi_definition_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'kpi_definitions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'NULL = applies to all KPIs'
      },
      trigger_condition: {
        type: Sequelize.ENUM('status_red', 'status_yellow', 'sla_breach', 'predicted_risk', 'multiple_yellow'),
        allowNull: false
      },
      duration_hours: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Hours in condition before escalating'
      },
      from_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '0-4'
      },
      to_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '0-4'
      },
      action: {
        type: Sequelize.ENUM('create_task', 'send_alert', 'ai_call', 'regional_escalation'),
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    // Add indexes
    await queryInterface.addIndex('escalations', ['store_id', 'status', 'escalated_at'], {
      name: 'idx_escalations_store_status'
    });
    await queryInterface.addIndex('escalations', ['alert_id']);
    await queryInterface.addIndex('escalations', ['task_id']);
    await queryInterface.addIndex('escalation_rules', ['organization_id']);
    await queryInterface.addIndex('escalation_rules', ['kpi_definition_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('escalation_rules');
    await queryInterface.dropTable('escalations');
  }
};
