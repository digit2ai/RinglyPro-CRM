// kancho-ai/models/KanchoClassEnrollment.js
// Class enrollment tracking for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoClassEnrollment = sequelize.define('KanchoClassEnrollment', {
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
      allowNull: false,
      references: {
        model: 'kancho_classes',
        key: 'id'
      }
    },
    enrolled_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'dropped']]
      }
    }
  }, {
    tableName: 'kancho_class_enrollments',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['student_id', 'class_id'] },
      { fields: ['school_id'] },
      { fields: ['student_id'] },
      { fields: ['class_id'] },
      { fields: ['status'] }
    ]
  });

  KanchoClassEnrollment.associate = (models) => {
    KanchoClassEnrollment.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoClassEnrollment.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
    KanchoClassEnrollment.belongsTo(models.KanchoClass, { foreignKey: 'class_id', as: 'class' });
  };

  return KanchoClassEnrollment;
};
