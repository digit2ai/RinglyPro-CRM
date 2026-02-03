'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('kpi_thresholds', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
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
      store_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'stores',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'NULL = org-level default, set = store-specific override'
      },
      green_min: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Minimum value for green status (e.g., -2%)'
      },
      yellow_min: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Minimum value for yellow status (e.g., -6%)'
      },
      red_threshold: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Below this = red status (e.g., < -6%)'
      },
      comparison_basis: {
        type: Sequelize.ENUM('rolling_4w', 'same_period_ly', 'absolute', 'budget'),
        allowNull: false,
        defaultValue: 'rolling_4w'
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: '1=highest, 5=lowest priority for escalation'
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
    await queryInterface.addIndex('kpi_thresholds', ['kpi_definition_id']);
    await queryInterface.addIndex('kpi_thresholds', ['organization_id']);
    await queryInterface.addIndex('kpi_thresholds', ['store_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('kpi_thresholds');
  }
};
