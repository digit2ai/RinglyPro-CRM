'use strict';

module.exports = (sequelize, DataTypes) => {
  const TelemetryEvent = sequelize.define('PinaxisTelemetryEvent', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    event_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'equipment_status | throughput_snapshot | fault | kpi_update'
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Equipment or system identifier (e.g. shuttle-01, conveyor-main)'
    },
    event_data: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Flexible payload — metrics, status, fault details'
    },
    severity: {
      type: DataTypes.STRING(20),
      defaultValue: 'info',
      comment: 'info | warning | critical'
    },
    recorded_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'When the event was recorded at the source'
    }
  }, {
    tableName: 'pinaxis_telemetry_events',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'event_type'] },
      { fields: ['project_id', 'source'] },
      { fields: ['recorded_at'] }
    ]
  });

  TelemetryEvent.associate = (models) => {
    TelemetryEvent.belongsTo(models.PinaxisProject, { foreignKey: 'project_id', as: 'project' });
  };

  return TelemetryEvent;
};
