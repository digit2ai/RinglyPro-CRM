'use strict';

/**
 * Group Model - The 5 Ronin Brotherhood Organizations
 * RGRK, IRMAF, RPDTA, Red Belt Society, Ronin MMA
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Group = sequelize.define('RoninGroup', {
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
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'RGRK, IRMAF, RPDTA, RBS, MMA'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    full_name: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    mission: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    founded_year: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    focus: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Primary martial arts focus'
    },
    requirements: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Membership requirements'
    },
    leadership: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of { name, title, rank }'
    },
    countries_active: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    member_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    logo_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    images: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    website_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active'
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
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
    tableName: 'ronin_groups',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['code'] },
      { fields: ['tenant_id', 'code'], unique: true },
      { fields: ['status'] },
      { fields: ['sort_order'] }
    ]
  });

  return Group;
};
