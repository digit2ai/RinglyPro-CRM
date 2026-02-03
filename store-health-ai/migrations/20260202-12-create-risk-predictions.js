'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('risk_predictions', {
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
      prediction_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date prediction was made'
      },
      target_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date being predicted'
      },
      prediction_type: {
        type: Sequelize.ENUM('sales', 'labor', 'inventory', 'overall'),
        allowNull: false
      },
      predicted_status: {
        type: Sequelize.ENUM('green', 'yellow', 'red'),
        allowNull: false
      },
      confidence_score: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        comment: '0-100 confidence percentage'
      },
      contributing_factors: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'What signals drove this prediction (trends, staffing, etc.)'
      },
      model_version: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'ML model version used'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('risk_predictions', ['store_id', 'target_date', 'prediction_type'], {
      name: 'idx_risk_predictions_lookup'
    });
    await queryInterface.addIndex('risk_predictions', ['prediction_date']);
    await queryInterface.addIndex('risk_predictions', ['predicted_status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('risk_predictions');
  }
};
