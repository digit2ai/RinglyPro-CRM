// kancho-ai/models/KanchoClass.js
// Class/program entity for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoClass = sequelize.define('KanchoClass', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'kancho_schools',
        key: 'id'
      }
    },
    external_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    program_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    martial_art: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    level: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    schedule: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    duration_minutes: {
      type: DataTypes.INTEGER,
      defaultValue: 60
    },
    capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 20
    },
    instructor: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    instructor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    average_attendance: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
    },
    fill_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
    },
    popularity_score: {
      type: DataTypes.INTEGER,
      defaultValue: 50
    },
    price: {
      type: DataTypes.DECIMAL(8, 2),
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: []
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
    tableName: 'kancho_classes',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['external_id'] },
      { fields: ['program_type'] },
      { fields: ['is_active'] }
    ]
  });

  KanchoClass.associate = (models) => {
    KanchoClass.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return KanchoClass;
};
