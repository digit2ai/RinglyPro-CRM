'use strict';

module.exports = (sequelize, DataTypes) => {
  const OEEMachineEvent = sequelize.define('LogisticsOEEMachineEvent', {
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
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['running', 'stopped', 'idle', 'fault']]
      }
    },
    reason: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    recorded_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'logistics_oee_machine_events',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'machine_name'] },
      { fields: ['recorded_at'] }
    ]
  });

  OEEMachineEvent.associate = (models) => {
    OEEMachineEvent.belongsTo(models.LogisticsProject, { foreignKey: 'project_id', as: 'project' });
  };

  return OEEMachineEvent;
};
