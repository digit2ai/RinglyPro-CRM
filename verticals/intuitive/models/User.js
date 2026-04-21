'use strict';
const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('IntuitiveUser', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    role: {
      type: DataTypes.STRING(30), allowNull: false, defaultValue: 'user',
      validate: { isIn: [['admin', 'manager', 'user', 'viewer']] }
    },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    failed_login_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    last_login_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'intuitive_users',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['email'] }
    ]
  });

  return User;
};
