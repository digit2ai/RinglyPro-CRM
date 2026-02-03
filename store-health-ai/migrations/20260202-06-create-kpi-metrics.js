'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('kpi_metrics', {
      id: {
        type: Sequelize.BIGINT,
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
      metric_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      metric_timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'Actual metric value'
      },
      comparison_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Baseline value for comparison (rolling 4w avg or LY)'
      },
      comparison_type: {
        type: Sequelize.ENUM('rolling_4w', 'same_period_ly', 'budget', 'absolute'),
        allowNull: true
      },
      variance_pct: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Calculated variance percentage'
      },
      status: {
        type: Sequelize.ENUM('green', 'yellow', 'red'),
        allowNull: false,
        defaultValue: 'green'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional context like day of week, weather, events'
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

    // Add composite indexes for time-series queries
    await queryInterface.addIndex('kpi_metrics', ['store_id', 'kpi_definition_id', 'metric_date'], {
      name: 'idx_kpi_metrics_store_kpi_date'
    });
    await queryInterface.addIndex('kpi_metrics', ['metric_date']);
    await queryInterface.addIndex('kpi_metrics', ['status']);
    await queryInterface.addIndex('kpi_metrics', ['store_id', 'status', 'metric_date']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('kpi_metrics');
  }
};
