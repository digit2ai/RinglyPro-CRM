// kancho-ai/models/KanchoInstructor.js
// Staff and instructor management

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoInstructor = sequelize.define('KanchoInstructor', {
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
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    role: {
      type: DataTypes.STRING(30),
      defaultValue: 'instructor',
      comment: 'owner, head_instructor, instructor, assistant, front_desk'
    },
    belt_rank: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    specialties: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of programs/styles they teach'
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    photo_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    hire_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    pay_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'salary, hourly, per_class, volunteer'
    },
    pay_rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    schedule: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Weekly availability schedule'
    },
    certifications: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of certifications/credentials'
    },
    emergency_contact: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
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
    tableName: 'kancho_instructors',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['is_active'] },
      { fields: ['role'] }
    ]
  });

  KanchoInstructor.associate = (models) => {
    KanchoInstructor.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
  };

  return KanchoInstructor;
};
