module.exports = (sequelize, DataTypes) => {
  const VisionariumMentor = sequelize.define('VisionariumMentor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    first_name: { type: DataTypes.STRING(100), allowNull: false },
    last_name: { type: DataTypes.STRING(100), allowNull: false },
    bio: { type: DataTypes.TEXT },
    expertise_areas: { type: DataTypes.JSONB, defaultValue: [] },
    languages: { type: DataTypes.JSONB, defaultValue: ['en'] },
    country: { type: DataTypes.STRING(100) },
    city: { type: DataTypes.STRING(100) },
    company: { type: DataTypes.STRING(255) },
    title: { type: DataTypes.STRING(255) },
    linkedin_url: { type: DataTypes.STRING(500) },
    availability_hours_per_month: { type: DataTypes.INTEGER, defaultValue: 2 },
    status: { type: DataTypes.ENUM('active', 'inactive', 'onboarding'), defaultValue: 'onboarding' },
    total_fellows_mentored: { type: DataTypes.INTEGER, defaultValue: 0 },
    avg_fellow_rating: { type: DataTypes.FLOAT },
    onboarded_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_mentors',
    timestamps: false,
    indexes: [{ fields: ['email'] }, { fields: ['status'] }]
  });

  VisionariumMentor.associate = (models) => {
    VisionariumMentor.hasMany(models.VisionariumFellow, { foreignKey: 'mentor_id', as: 'fellows' });
    VisionariumMentor.hasMany(models.VisionariumMentorMatch, { foreignKey: 'mentor_id', as: 'matches' });
  };

  return VisionariumMentor;
};
