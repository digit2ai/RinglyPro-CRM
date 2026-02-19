'use strict';

/**
 * TrainingCourse Model - RPDTA Tactical Training Programs
 * Vehicle Ops, Structural Entry, Executive Protection, Ground Defense, etc.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TrainingCourse = sequelize.define('RoninTrainingCourse', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    short_description: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'tactical, martial_arts, self_defense, fitness, certification'
    },
    group: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'RPDTA, RGRK, IRMAF, MMA, Red Belt'
    },
    duration_hours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 40,
      comment: 'Total course hours'
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    max_enrollment: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Max number of students'
    },
    current_enrollment: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    prerequisites: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Required certifications or rank'
    },
    requires_clearance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Requires law enforcement/military clearance'
    },
    certification_awarded: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Name of certification upon completion'
    },
    syllabus: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of course modules/topics'
    },
    schedule: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: '{ start_date, end_date, days, times }'
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    instructor_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    images: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('upcoming', 'open', 'in_progress', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'upcoming'
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
    tableName: 'ronin_training_courses',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['slug'] },
      { fields: ['category'] },
      { fields: ['group'] },
      { fields: ['status'] },
      { fields: ['featured'] }
    ],
    hooks: {
      beforeCreate: async (course) => {
        if (!course.slug) {
          course.slug = course.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      },
      beforeUpdate: async (course) => {
        course.updated_at = new Date();
      }
    }
  });

  TrainingCourse.associate = (models) => {
    TrainingCourse.hasMany(models.RoninEnrollment, { foreignKey: 'course_id', as: 'enrollments' });
  };

  return TrainingCourse;
};
