module.exports = (sequelize, DataTypes) => {
  const VisionariumMemberBadge = sequelize.define('VisionariumMemberBadge', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    community_member_id: { type: DataTypes.INTEGER, allowNull: false },
    badge_id: { type: DataTypes.INTEGER, allowNull: false },
    earned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_member_badges',
    timestamps: false,
    indexes: [{ fields: ['community_member_id'] }, { fields: ['badge_id'] }]
  });

  VisionariumMemberBadge.associate = (models) => {
    VisionariumMemberBadge.belongsTo(models.VisionariumCommunityMember, { foreignKey: 'community_member_id', as: 'member' });
    VisionariumMemberBadge.belongsTo(models.VisionariumBadge, { foreignKey: 'badge_id', as: 'badge' });
  };

  return VisionariumMemberBadge;
};
