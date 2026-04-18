module.exports = (sequelize, DataTypes) => {
  const VisionariumCommunityMember = sequelize.define('VisionariumCommunityMember', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    first_name: { type: DataTypes.STRING(100), allowNull: false },
    last_name: { type: DataTypes.STRING(100), allowNull: false },
    age: { type: DataTypes.INTEGER },
    country: { type: DataTypes.STRING(100) },
    city: { type: DataTypes.STRING(100) },
    language_pref: { type: DataTypes.ENUM('en', 'es'), defaultValue: 'en' },
    phone: { type: DataTypes.STRING(30) },
    school_or_university: { type: DataTypes.STRING(255) },
    field_of_interest: { type: DataTypes.STRING(255) },
    registration_source: { type: DataTypes.STRING(100) },
    geo_detected_country: { type: DataTypes.STRING(100) },
    geo_detected_city: { type: DataTypes.STRING(100) },
    status: { type: DataTypes.ENUM('active', 'inactive', 'suspended'), defaultValue: 'active' },
    tier: { type: DataTypes.ENUM('community', 'active_member', 'applicant', 'fellow', 'alumni'), defaultValue: 'community' },
    total_badges: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_challenges_completed: { type: DataTypes.INTEGER, defaultValue: 0 },
    engagement_score: { type: DataTypes.FLOAT, defaultValue: 0 },
    lina_conversation_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    last_lina_interaction: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_community_members',
    timestamps: false,
    indexes: [{ fields: ['email'] }, { fields: ['tier'] }, { fields: ['country'] }, { fields: ['status'] }]
  });

  VisionariumCommunityMember.associate = (models) => {
    VisionariumCommunityMember.hasMany(models.VisionariumApplication, { foreignKey: 'community_member_id', as: 'applications' });
    VisionariumCommunityMember.hasOne(models.VisionariumFellow, { foreignKey: 'community_member_id', as: 'fellowship' });
    VisionariumCommunityMember.hasMany(models.VisionariumMemberBadge, { foreignKey: 'community_member_id', as: 'earned_badges' });
  };

  return VisionariumCommunityMember;
};
