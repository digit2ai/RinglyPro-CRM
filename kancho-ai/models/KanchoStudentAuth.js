// kancho-ai/models/KanchoStudentAuth.js
// Student portal login accounts for Kancho AI

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoStudentAuth = sequelize.define('KanchoStudentAuth', {
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
      allowNull: true,
      references: {
        model: 'kancho_students',
        key: 'id'
      }
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'active', 'suspended']]
      }
    },
    email_verification_token: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    last_login: {
      type: DataTypes.DATE,
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
    tableName: 'kancho_student_auth',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['email', 'school_id'] },
      { fields: ['school_id'] },
      { fields: ['student_id'] },
      { fields: ['status'] }
    ]
  });

  KanchoStudentAuth.associate = (models) => {
    KanchoStudentAuth.belongsTo(models.KanchoSchool, { foreignKey: 'school_id', as: 'school' });
    KanchoStudentAuth.belongsTo(models.KanchoStudent, { foreignKey: 'student_id', as: 'student' });
  };

  return KanchoStudentAuth;
};
