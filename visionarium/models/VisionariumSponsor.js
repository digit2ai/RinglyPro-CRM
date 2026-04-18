module.exports = (sequelize, DataTypes) => {
  const VisionariumSponsor = sequelize.define('VisionariumSponsor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    company_name: { type: DataTypes.STRING(255), allowNull: false },
    contact_name: { type: DataTypes.STRING(200) },
    contact_title: { type: DataTypes.STRING(200) },
    tier: { type: DataTypes.ENUM('founding', 'lead', 'program', 'supporter', 'in_kind'), defaultValue: 'supporter' },
    contribution_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    contribution_type: { type: DataTypes.ENUM('cash', 'in_kind', 'mixed'), defaultValue: 'cash' },
    logo_url: { type: DataTypes.STRING(500) },
    website_url: { type: DataTypes.STRING(500) },
    board_observer: { type: DataTypes.BOOLEAN, defaultValue: false },
    named_fellowships_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.ENUM('prospect', 'committed', 'active', 'churned'), defaultValue: 'prospect' },
    contract_start: { type: DataTypes.DATE },
    contract_end: { type: DataTypes.DATE },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'visionarium_sponsors',
    timestamps: false,
    indexes: [{ fields: ['email'] }, { fields: ['tier'] }, { fields: ['status'] }]
  });

  VisionariumSponsor.associate = (models) => {
    VisionariumSponsor.hasMany(models.VisionariumFellow, { foreignKey: 'sponsor_id', as: 'named_fellows' });
    VisionariumSponsor.hasMany(models.VisionariumOpportunity, { foreignKey: 'sponsor_id', as: 'opportunities' });
  };

  return VisionariumSponsor;
};
