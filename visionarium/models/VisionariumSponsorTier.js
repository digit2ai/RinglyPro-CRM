module.exports = (sequelize, DataTypes) => {
  const VisionariumSponsorTier = sequelize.define('VisionariumSponsorTier', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    min_contribution: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    benefits: { type: DataTypes.JSONB, defaultValue: {} },
    board_observer: { type: DataTypes.BOOLEAN, defaultValue: false },
    named_fellowship: { type: DataTypes.BOOLEAN, defaultValue: false },
    demo_day_speaking: { type: DataTypes.BOOLEAN, defaultValue: false },
    custom_impact_dossier: { type: DataTypes.BOOLEAN, defaultValue: false }
  }, {
    tableName: 'visionarium_sponsor_tiers',
    timestamps: false
  });

  return VisionariumSponsorTier;
};
