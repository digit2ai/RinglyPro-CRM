'use strict';

module.exports = (sequelize, DataTypes) => {
  const LaborSchedule = sequelize.define('LaborSchedule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    store_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    schedule_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    shift_start: {
      type: DataTypes.TIME,
      allowNull: false
    },
    shift_end: {
      type: DataTypes.TIME,
      allowNull: false
    },
    required_hours: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false
    },
    scheduled_hours: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false
    },
    available_hours: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false
    },
    coverage_ratio: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('green', 'yellow', 'red'),
      allowNull: false,
      defaultValue: 'green'
    }
  }, {
    tableName: 'labor_schedules',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'schedule_date']
      }
    ]
  });

  LaborSchedule.associate = (models) => {
    LaborSchedule.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
    LaborSchedule.hasMany(models.LaborCallout, {
      foreignKey: 'labor_schedule_id',
      as: 'callouts'
    });
  };

  return LaborSchedule;
};
