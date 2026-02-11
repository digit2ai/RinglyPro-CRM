'use strict';

/**
 * MediaContent Model - TunjoRacing Media & Analytics Engine
 * Tracks all media content and sponsor exposure
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MediaContent = sequelize.define('TunjoMediaContent', {
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
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    content_type: {
      type: DataTypes.ENUM('social_post', 'video', 'photo', 'press_release', 'race_highlight', 'interview', 'behind_scenes'),
      allowNull: false
    },
    platform: {
      type: DataTypes.ENUM('instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'linkedin', 'website', 'press'),
      allowNull: false
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    media_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Direct URL to the media file'
    },
    thumbnail_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sponsor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Primary sponsor featured in this content'
    },
    sponsor_tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of sponsor IDs tagged in this content'
    },
    race_event: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Race event this content is related to'
    },
    published_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Analytics metrics
    reach: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    impressions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    engagement: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Likes + comments + shares'
    },
    likes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    comments: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    shares: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    video_views: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    watch_time_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    clicks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // Estimated value
    estimated_media_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Estimated media value in USD'
    },
    // Country breakdown
    audience_countries: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Object with country codes as keys and percentage as values'
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'published'
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
    tableName: 'tunjo_media_content',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['sponsor_id'] },
      { fields: ['content_type'] },
      { fields: ['platform'] },
      { fields: ['published_at'] },
      { fields: ['race_event'] },
      { fields: ['status'] }
    ],
    hooks: {
      beforeUpdate: async (media) => {
        media.updated_at = new Date();
        // Auto-calculate engagement
        media.engagement = (media.likes || 0) + (media.comments || 0) + (media.shares || 0);
      },
      beforeCreate: async (media) => {
        media.engagement = (media.likes || 0) + (media.comments || 0) + (media.shares || 0);
      }
    }
  });

  MediaContent.associate = (models) => {
    MediaContent.belongsTo(models.TunjoSponsor, { foreignKey: 'sponsor_id', as: 'sponsor' });
  };

  return MediaContent;
};
