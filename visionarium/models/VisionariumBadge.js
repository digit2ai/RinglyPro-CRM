module.exports = (sequelize, DataTypes) => {
  const VisionariumBadge = sequelize.define('VisionariumBadge', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name_en: { type: DataTypes.STRING(200), allowNull: false },
    name_es: { type: DataTypes.STRING(200), allowNull: false },
    description_en: { type: DataTypes.TEXT },
    description_es: { type: DataTypes.TEXT },
    icon_url: { type: DataTypes.STRING(500) },
    category: { type: DataTypes.ENUM('technology', 'leadership', 'community', 'execution'), allowNull: false },
    criteria: { type: DataTypes.JSONB, defaultValue: {} },
    points: { type: DataTypes.INTEGER, defaultValue: 10 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_badges',
    timestamps: false,
    indexes: [{ fields: ['category'] }]
  });

  VisionariumBadge.associate = (models) => {
    VisionariumBadge.hasMany(models.VisionariumMemberBadge, { foreignKey: 'badge_id', as: 'awards' });
  };

  return VisionariumBadge;
};
