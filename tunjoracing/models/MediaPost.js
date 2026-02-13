'use strict';

/**
 * MediaPost Model - TunjoRacing Press & Media Portal
 * Race media posts containing press releases, photos, and videos
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MediaPost = sequelize.define('TunjoMediaPost', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Multi-tenant isolation'
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    race_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    race_location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    season: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'e.g., 2026'
    },
    series: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'e.g., Formula 4, GT3'
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Short summary shown in listings'
    },
    press_release_text: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Full press release body'
    },
    driver_quotes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of {driver, quote} objects'
    },
    championship_highlights: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Championship standings or result highlights'
    },
    cover_image_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
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
    total_downloads: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_views: {
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
    tableName: 'tunjo_media_posts',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['slug'] },
      { fields: ['tenant_id', 'slug'], unique: true },
      { fields: ['status'] },
      { fields: ['race_date'] },
      { fields: ['season'] },
      { fields: ['published_at'] }
    ],
    hooks: {
      beforeCreate: (post) => {
        if (!post.slug && post.title) {
          post.slug = post.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        }
      },
      beforeUpdate: (post) => {
        post.updated_at = new Date();
      }
    }
  });

  MediaPost.associate = (models) => {
    MediaPost.hasMany(models.TunjoMediaPostAsset, { foreignKey: 'media_post_id', as: 'assets' });
  };

  return MediaPost;
};
