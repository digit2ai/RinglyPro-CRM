'use strict';

module.exports = (sequelize, DataTypes) => {
  const OEEProductionRun = sequelize.define('PinaxisOEEProductionRun', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    machine_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    shift_start: {
      type: DataTypes.DATE,
      allowNull: false
    },
    shift_end: {
      type: DataTypes.DATE,
      allowNull: true
    },
    planned_production_time_min: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    total_parts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    good_parts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    actual_cycle_time_sec: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'pinaxis_oee_production_runs',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'machine_name'] },
      { fields: ['project_id', 'shift_start'] }
    ]
  });

  OEEProductionRun.associate = (models) => {
    OEEProductionRun.belongsTo(models.PinaxisProject, { foreignKey: 'project_id', as: 'project' });
  };

  return OEEProductionRun;
};
