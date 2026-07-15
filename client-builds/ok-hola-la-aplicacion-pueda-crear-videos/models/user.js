'use strict';
const { DataTypes } = require('sequelize');

// ok_hola_la_aplicacion_pueda_crear_videos_users
// Minimal identity for magic-link auth. tenant_id === user id (one user = one tenant).
module.exports = (sequelize) => {
  const User = sequelize.define('OkHolaUser', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false, comment: 'Multi-tenant isolation' },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'ok_hola_la_aplicacion_pueda_crear_videos_users',
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }, { fields: ['email'] }]
  });
  return User;
};
