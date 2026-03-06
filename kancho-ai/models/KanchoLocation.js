// kancho-ai/models/KanchoLocation.js
// Multi-location support for schools with multiple branches

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoLocation = sequelize.define('KanchoLocation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'kancho_schools', key: 'id' }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    zip: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    timezone: {
      type: DataTypes.STRING(50),
      defaultValue: 'America/New_York'
    },
    business_hours: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ mon: {open, close}, tue: ... }'
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 100
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'kancho_locations',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['is_active'] }
    ]
  });

  KanchoLocation.associate = (models) => {
    KanchoLocation.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return KanchoLocation;
};
