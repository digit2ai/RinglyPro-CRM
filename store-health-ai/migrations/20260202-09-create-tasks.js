'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tasks', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      alert_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'alerts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
        allowNull: true,
        references: {
          model: 'kpi_definitions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      task_type: {
        type: Sequelize.ENUM('review', 'action', 'escalation', 'follow_up'),
        allowNull: false,
        defaultValue: 'review'
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: '1=highest, 5=lowest'
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      assigned_to_role: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'store_manager, shift_lead, regional_manager, etc.'
      },
      assigned_to_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      assigned_to_contact: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Phone or email'
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_by: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      outcome: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Resolution notes'
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

    // Add indexes
    await queryInterface.addIndex('tasks', ['store_id', 'status', 'due_date'], {
      name: 'idx_tasks_store_status_due'
    });
    await queryInterface.addIndex('tasks', ['alert_id']);
    await queryInterface.addIndex('tasks', ['status']);
    await queryInterface.addIndex('tasks', ['priority', 'status']);
    await queryInterface.addIndex('tasks', ['due_date']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tasks');
  }
};
