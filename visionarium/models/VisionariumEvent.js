module.exports = (sequelize, DataTypes) => {
  const VisionariumEvent = sequelize.define('VisionariumEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cohort_id: { type: DataTypes.INTEGER },
    title_en: { type: DataTypes.STRING(300), allowNull: false },
    title_es: { type: DataTypes.STRING(300), allowNull: false },
    description_en: { type: DataTypes.TEXT },
    description_es: { type: DataTypes.TEXT },
    type: { type: DataTypes.ENUM('immersion', 'demo_day', 'webinar', 'workshop', 'hackathon', 'showcase'), allowNull: false },
    format: { type: DataTypes.ENUM('virtual', 'in_person', 'hybrid'), defaultValue: 'virtual' },
    city: { type: DataTypes.STRING(100) },
    venue: { type: DataTypes.STRING(300) },
    start_datetime: { type: DataTypes.DATE },
    end_datetime: { type: DataTypes.DATE },
    max_attendees: { type: DataTypes.INTEGER },
    current_rsvps: { type: DataTypes.INTEGER, defaultValue: 0 },
    recording_url: { type: DataTypes.STRING(500) },
    status: { type: DataTypes.ENUM('planned', 'registration_open', 'in_progress', 'completed', 'cancelled'), defaultValue: 'planned' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_events',
    timestamps: false,
    indexes: [{ fields: ['cohort_id'] }, { fields: ['type'] }, { fields: ['status'] }]
  });

  VisionariumEvent.associate = (models) => {
    VisionariumEvent.belongsTo(models.VisionariumCohort, { foreignKey: 'cohort_id', as: 'cohort' });
  };

  return VisionariumEvent;
};
