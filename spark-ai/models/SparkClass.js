// spark-ai/models/SparkClass.js
// Class/Program entity for martial arts schools

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SparkClass = sequelize.define('SparkClass', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'spark_schools', key: 'id' }
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
      allowNull: true,
      comment: 'Kids, Adults, Teens, Competition, etc.'
    },
    martial_art: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'BJJ, Karate, Kickboxing, MMA, etc.'
    },
    level: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Beginner, Intermediate, Advanced, All Levels'
    },
    schedule: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Weekly schedule { monday: ["6:00 PM", "7:30 PM"], ... }'
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
      defaultValue: 0,
      comment: 'Average students per class'
    },
    fill_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: 'Percentage of capacity typically filled'
    },
    popularity_score: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
      comment: '0-100 popularity based on attendance trends'
    },
    price: {
      type: DataTypes.DECIMAL(8, 2),
      defaultValue: 0,
      comment: 'Price per class if drop-in available'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
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
    tableName: 'spark_classes',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['external_id'] },
      { fields: ['program_type'] },
      { fields: ['is_active'] }
    ]
  });

  SparkClass.associate = (models) => {
    SparkClass.belongsTo(models.SparkSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return SparkClass;
};
