'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create labor_schedules table
    await queryInterface.createTable('labor_schedules', {
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
      schedule_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      shift_start: {
        type: Sequelize.TIME,
        allowNull: false
      },
      shift_end: {
        type: Sequelize.TIME,
        allowNull: false
      },
      required_hours: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: false,
        comment: 'Total hours needed for coverage'
      },
      scheduled_hours: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: false,
        comment: 'Total hours scheduled'
      },
      available_hours: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: false,
        comment: 'Actual hours available (after call-outs)'
      },
      coverage_ratio: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        comment: 'available_hours / required_hours * 100'
      },
      status: {
        type: Sequelize.ENUM('green', 'yellow', 'red'),
        allowNull: false,
        defaultValue: 'green'
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

    // Create labor_callouts table
    await queryInterface.createTable('labor_callouts', {
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
      labor_schedule_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'labor_schedules',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      callout_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      employee_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      shift_affected: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      hours_lost: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: false
      },
      is_filled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      filled_by: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      is_peak_hours: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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

    // Create inventory_levels table
    await queryInterface.createTable('inventory_levels', {
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
      sku: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      product_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      snapshot_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      quantity_on_hand: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      average_daily_sales: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      days_of_cover: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true,
        comment: 'quantity_on_hand / average_daily_sales'
      },
      is_top_sku: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_out_of_stock: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      status: {
        type: Sequelize.ENUM('green', 'yellow', 'red'),
        allowNull: false,
        defaultValue: 'green'
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

    // Create out_of_stock_events table
    await queryInterface.createTable('out_of_stock_events', {
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
      sku: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      product_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      out_of_stock_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      restocked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration_hours: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Calculated when restocked'
      },
      estimated_lost_sales: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      is_top_sku: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('labor_schedules', ['store_id', 'schedule_date'], {
      name: 'idx_labor_schedules_store_date'
    });
    await queryInterface.addIndex('labor_callouts', ['store_id', 'callout_date']);
    await queryInterface.addIndex('labor_callouts', ['is_filled']);

    await queryInterface.addIndex('inventory_levels', ['store_id', 'snapshot_date', 'is_top_sku'], {
      name: 'idx_inventory_levels_store_date_top'
    });
    await queryInterface.addIndex('inventory_levels', ['sku']);
    await queryInterface.addIndex('inventory_levels', ['is_out_of_stock']);

    await queryInterface.addIndex('out_of_stock_events', ['store_id', 'out_of_stock_at']);
    await queryInterface.addIndex('out_of_stock_events', ['sku']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('out_of_stock_events');
    await queryInterface.dropTable('inventory_levels');
    await queryInterface.dropTable('labor_callouts');
    await queryInterface.dropTable('labor_schedules');
  }
};
