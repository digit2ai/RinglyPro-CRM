'use strict';
const { DataTypes } = require('sequelize');

// ok_hola_la_aplicacion_pueda_crear_videos_magic_links
// One-time login tokens for passwordless email auth.
module.exports = (sequelize) => {
  const MagicLink = sequelize.define('OkHolaMagicLink', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false, comment: 'Multi-tenant isolation' },
    email: { type: DataTypes.STRING, allowNull: false },
    token: { type: DataTypes.STRING, allowNull: false, unique: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'ok_hola_la_aplicacion_pueda_crear_videos_magic_links',
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }, { fields: ['token'] }]
  });
  return MagicLink;
};
