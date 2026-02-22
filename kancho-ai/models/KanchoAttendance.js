// kancho-ai/models/KanchoAttendance.js
// Attendance tracking for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoAttendance = sequelize.define('KanchoAttendance', {
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
    student_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'kancho_students',
        key: 'id'
      }
    },
    class_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'kancho_classes',
        key: 'id'
      }
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    checked_in_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'present',
      validate: {
        isIn: [['present', 'late', 'excused', 'absent']]
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    recorded_by: {
      type: DataTypes.STRING(100),
      defaultValue: 'manual'
    }
  }, {
    tableName: 'kancho_attendance',
    timestamps: false,
    indexes: [
      { fields: ['school_id', 'date'] },
      { fields: ['student_id', 'date'] },
      { fields: ['class_id', 'date'] },
      { unique: true, fields: ['school_id', 'student_id', 'class_id', 'date'] }
    ]
  });

  KanchoAttendance.associate = (models) => {
    KanchoAttendance.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoAttendance.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
    KanchoAttendance.belongsTo(models.KanchoClass, { foreignKey: 'class_id', as: 'class' });
  };

  return KanchoAttendance;
};
