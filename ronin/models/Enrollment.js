'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Enrollment = sequelize.define('RoninEnrollment', {
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
    member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    course_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('enrolled', 'in_progress', 'completed', 'withdrawn', 'failed'),
      allowNull: false,
      defaultValue: 'enrolled'
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'paid', 'waived', 'refunded'),
      allowNull: false,
      defaultValue: 'pending'
    },
    amount_paid: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    completion_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    certificate_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    grade: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'Pass/Fail or letter grade'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
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
    tableName: 'ronin_enrollments',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['member_id'] },
      { fields: ['course_id'] },
      { fields: ['status'] },
      { fields: ['member_id', 'course_id'], unique: true }
    ]
  });

  Enrollment.associate = (models) => {
    Enrollment.belongsTo(models.RoninMember, { foreignKey: 'member_id', as: 'member' });
    Enrollment.belongsTo(models.RoninTrainingCourse, { foreignKey: 'course_id', as: 'course' });
  };

  return Enrollment;
};
