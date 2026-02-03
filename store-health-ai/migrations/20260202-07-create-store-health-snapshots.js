'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('store_health_snapshots', {
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
      snapshot_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      overall_status: {
        type: Sequelize.ENUM('green', 'yellow', 'red'),
        allowNull: false
      },
      health_score: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 100,
        comment: '0-100 composite health score'
      },
      red_kpi_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      yellow_kpi_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      green_kpi_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      escalation_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '0-4: escalation level per spec'
      },
      risk_probability: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Predictive risk percentage (0-100)'
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'AI-generated daily summary'
      },
      action_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
    await queryInterface.addIndex('store_health_snapshots', ['store_id', 'snapshot_date'], {
      unique: true,
      name: 'idx_store_health_unique'
    });
    await queryInterface.addIndex('store_health_snapshots', ['snapshot_date']);
    await queryInterface.addIndex('store_health_snapshots', ['overall_status']);
    await queryInterface.addIndex('store_health_snapshots', ['action_required']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('store_health_snapshots');
  }
};
