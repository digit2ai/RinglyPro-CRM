'use strict';

module.exports = (sequelize, DataTypes) => {
  const Surgeon = sequelize.define('IntuitiveSurgeon', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    project_id: { type: DataTypes.INTEGER, allowNull: false },
    full_name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true, comment: 'E.164 format' },
    specialty: { type: DataTypes.STRING(100), allowNull: true },
    primary_hospital: { type: DataTypes.STRING(255), allowNull: true },
    currently_credentialed_robotic: { type: DataTypes.BOOLEAN, defaultValue: false },
    current_annual_volume: { type: DataTypes.INTEGER, allowNull: true },
    competitive_hospitals: {
      type: DataTypes.JSONB, defaultValue: [],
      comment: 'Array of hospital names where surgeon also operates'
    },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'intuitive_surgeons',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['email'] }
    ]
  });

  Surgeon.associate = (models) => {
    Surgeon.belongsTo(models.IntuitiveProject, { foreignKey: 'project_id', as: 'project' });
  };

  return Surgeon;
};
