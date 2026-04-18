module.exports = (sequelize, DataTypes) => {
  const VisionariumLinaConversation = sequelize.define('VisionariumLinaConversation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    community_member_id: { type: DataTypes.INTEGER },
    conversation_id: { type: DataTypes.STRING(255) },
    language: { type: DataTypes.ENUM('en', 'es'), defaultValue: 'en' },
    summary: { type: DataTypes.TEXT },
    topics: { type: DataTypes.JSONB, defaultValue: [] },
    sentiment: { type: DataTypes.ENUM('positive', 'neutral', 'negative') },
    escalated: { type: DataTypes.BOOLEAN, defaultValue: false },
    escalation_reason: { type: DataTypes.STRING(500) },
    duration_seconds: { type: DataTypes.INTEGER },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_lina_conversations',
    timestamps: false,
    indexes: [{ fields: ['community_member_id'] }, { fields: ['escalated'] }]
  });

  VisionariumLinaConversation.associate = (models) => {
    VisionariumLinaConversation.belongsTo(models.VisionariumCommunityMember, { foreignKey: 'community_member_id', as: 'member' });
  };

  return VisionariumLinaConversation;
};
