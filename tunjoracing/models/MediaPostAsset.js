'use strict';

/**
 * MediaPostAsset Model - TunjoRacing Press & Media Portal
 * Individual photos and videos attached to media posts
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MediaPostAsset = sequelize.define('TunjoMediaPostAsset', {
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
    media_post_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    asset_type: {
      type: DataTypes.ENUM('photo', 'video'),
      allowNull: false
    },
    url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      comment: 'Direct download URL'
    },
    thumbnail_url: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      comment: 'Thumbnail for gallery/preview'
    },
    filename: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    file_size: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Size in bytes'
    },
    caption: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    credit: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Photographer or video credit'
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    download_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'tunjo_media_post_assets',
    timestamps: false,
    indexes: [
      { fields: ['tenant_id'] },
      { fields: ['media_post_id'] },
      { fields: ['asset_type'] },
      { fields: ['sort_order'] }
    ]
  });

  MediaPostAsset.associate = (models) => {
    MediaPostAsset.belongsTo(models.TunjoMediaPost, { foreignKey: 'media_post_id', as: 'mediaPost' });
  };

  return MediaPostAsset;
};
