'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create ai_calls table
    await queryInterface.createTable('ai_calls', {
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
        allowNull: true,
        references: {
          model: 'alerts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
      escalation_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'escalations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      call_type: {
        type: Sequelize.ENUM('green', 'yellow', 'red'),
        allowNull: false
      },
      call_status: {
        type: Sequelize.ENUM('scheduled', 'in_progress', 'completed', 'failed', 'no_answer'),
        allowNull: false,
        defaultValue: 'scheduled'
      },
      recipient_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      recipient_phone: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      call_initiated_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      call_connected_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      call_ended_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      call_duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      transcript: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      sentiment: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'positive, neutral, negative, frustrated'
      },
      response: {
        type: Sequelize.ENUM('yes', 'later', 'no_answer', 'other'),
        allowNull: true
      },
      follow_up_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      recording_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      external_call_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Twilio/Vapi/provider call ID'
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

    // Create call_scripts table
    await queryInterface.createTable('call_scripts', {
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
      script_type: {
        type: Sequelize.ENUM('green', 'yellow', 'red'),
        allowNull: false
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      script_content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      variables: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Dynamic placeholders like {store_name}, {kpi_name}, etc.'
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
    await queryInterface.addIndex('ai_calls', ['store_id', 'call_initiated_at'], {
      name: 'idx_ai_calls_store_initiated'
    });
    await queryInterface.addIndex('ai_calls', ['call_status']);
    await queryInterface.addIndex('ai_calls', ['alert_id']);
    await queryInterface.addIndex('ai_calls', ['external_call_id']);
    await queryInterface.addIndex('call_scripts', ['organization_id', 'script_type']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('call_scripts');
    await queryInterface.dropTable('ai_calls');
  }
};
