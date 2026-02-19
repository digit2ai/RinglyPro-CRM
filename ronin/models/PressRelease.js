'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PressRelease = sequelize.define('RoninPressRelease', {
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    excerpt: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'news, championship, promotion, event, announcement'
    },
    author: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    featured_image: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    images: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    },
    published_at: {
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
    tableName: 'ronin_press_releases',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['slug'] },
      { fields: ['category'] },
      { fields: ['status'] },
      { fields: ['featured'] },
      { fields: ['published_at'] }
    ],
    hooks: {
      beforeCreate: async (pr) => {
        if (!pr.slug) {
          pr.slug = pr.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      },
      beforeUpdate: async (pr) => {
        pr.updated_at = new Date();
      }
    }
  });

  return PressRelease;
};
