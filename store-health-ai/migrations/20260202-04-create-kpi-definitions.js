'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('kpi_definitions', {
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
      kpi_code: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Unique identifier: sales, traffic, conversion_rate, labor_coverage, etc.'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '%, $, count, ratio, hours'
      },
      calculation_method: {
        type: Sequelize.ENUM('sum', 'average', 'ratio', 'percentage', 'count', 'custom'),
        allowNull: false,
        defaultValue: 'sum'
      },
      category: {
        type: Sequelize.ENUM('sales', 'traffic', 'labor', 'inventory', 'hr', 'operations'),
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

    // Add indexes and constraints
    await queryInterface.addIndex('kpi_definitions', ['organization_id']);
    await queryInterface.addIndex('kpi_definitions', ['organization_id', 'kpi_code'], { unique: true });
    await queryInterface.addIndex('kpi_definitions', ['category']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('kpi_definitions');
  }
};
