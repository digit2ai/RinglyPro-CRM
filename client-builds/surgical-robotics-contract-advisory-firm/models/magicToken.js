// =====================================================
// models/magicToken.js — srcaf_magic_tokens
//
// Single-use, thirty-minute magic links. `used_at` is what makes them single
// use: verification stamps it, and a second verification of the same token is
// refused. Storing the token itself is necessary to look it up; it is never
// logged, never returned by a list endpoint, and expires quickly.
// =====================================================

'use strict';

const { DataTypes } = require('sequelize');

const TABLE = 'srcaf_magic_tokens';

function defineMagicToken(sequelize) {
  return sequelize.define('SrcafMagicToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false },
    token: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: TABLE,
    timestamps: false,
    indexes: [
      { name: 'idx_srcaf_tokens_tenant', fields: ['tenant_id'] },
      { name: 'idx_srcaf_tokens_token', fields: ['token'] },
    ],
  });
}

module.exports = { defineMagicToken, TABLE };
