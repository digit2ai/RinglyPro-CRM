module.exports = (sequelize, DataTypes) => {
  const VisionariumOpportunity = sequelize.define('VisionariumOpportunity', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sponsor_id: { type: DataTypes.INTEGER },
    title: { type: DataTypes.STRING(300), allowNull: false },
    description_en: { type: DataTypes.TEXT },
    description_es: { type: DataTypes.TEXT },
    type: { type: DataTypes.ENUM('internship', 'scholarship', 'incubation', 'mentorship', 'job'), allowNull: false },
    location: { type: DataTypes.STRING(200) },
    remote_eligible: { type: DataTypes.BOOLEAN, defaultValue: false },
    requirements: { type: DataTypes.JSONB, defaultValue: [] },
    compensation: { type: DataTypes.STRING(200) },
    application_url: { type: DataTypes.STRING(500) },
    deadline: { type: DataTypes.DATE },
    status: { type: DataTypes.ENUM('open', 'closed', 'filled'), defaultValue: 'open' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_opportunities',
    timestamps: false,
    indexes: [{ fields: ['sponsor_id'] }, { fields: ['type'] }, { fields: ['status'] }]
  });

  VisionariumOpportunity.associate = (models) => {
    VisionariumOpportunity.belongsTo(models.VisionariumSponsor, { foreignKey: 'sponsor_id', as: 'sponsor' });
  };

  return VisionariumOpportunity;
};
