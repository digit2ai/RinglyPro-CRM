// kancho-ai/models/KanchoRole.js
// Role-based access control for KanchoAI users

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KanchoRole = sequelize.define('KanchoRole', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    school_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Links to RinglyPro user or kancho_instructors'
    },
    instructor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Links to kancho_instructors for staff roles'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    role: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'viewer',
      validate: {
        isIn: [['owner', 'admin', 'manager', 'instructor', 'front_desk', 'viewer']]
      }
    },
    permissions: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Granular overrides: { students: "write", billing: "none", reports: "read" }'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_access: {
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
    tableName: 'kancho_roles',
    timestamps: false,
    indexes: [
      { fields: ['school_id'] },
      { fields: ['email'] },
      { unique: true, fields: ['school_id', 'email'] }
    ]
  });

  return KanchoRole;
};
