'use strict';

module.exports = (sequelize, DataTypes) => {
  const OEEMachine = sequelize.define('LogisticsOEEMachine', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    line: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    expected_cycle_time_sec: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 30
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'logistics_oee_machines',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'name'] }
    ]
  });

  OEEMachine.associate = (models) => {
    OEEMachine.belongsTo(models.LogisticsProject, { foreignKey: 'project_id', as: 'project' });
  };

  return OEEMachine;
};
