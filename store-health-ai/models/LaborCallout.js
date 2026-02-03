'use strict';

module.exports = (sequelize, DataTypes) => {
  const LaborCallout = sequelize.define('LaborCallout', {
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
    labor_schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    callout_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    employee_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    shift_affected: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    hours_lost: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false
    },
    is_filled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    filled_by: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_peak_hours: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'labor_callouts',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['store_id', 'callout_date']
      },
      {
        fields: ['is_filled']
      }
    ]
  });

  LaborCallout.associate = (models) => {
    LaborCallout.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store'
    });
    LaborCallout.belongsTo(models.LaborSchedule, {
      foreignKey: 'labor_schedule_id',
      as: 'laborSchedule'
    });
  };

  return LaborCallout;
};
