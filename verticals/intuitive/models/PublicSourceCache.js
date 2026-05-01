'use strict';

module.exports = (sequelize, DataTypes) => {
  const PublicSourceCache = sequelize.define('IntuitivePublicSourceCache', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source: { type: DataTypes.STRING(64), allowNull: false, comment: 'connector name: npi-registry, cms-hcris, etc.' },
    cache_key: { type: DataTypes.STRING(256), allowNull: false },
    data: { type: DataTypes.JSONB, defaultValue: {} },
    fetched_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: 'intuitive_public_source_cache',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['source', 'cache_key'] },
      { fields: ['expires_at'] },
    ],
  });
  return PublicSourceCache;
};
