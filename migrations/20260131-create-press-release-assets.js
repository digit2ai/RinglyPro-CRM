'use strict';

/**
 * Press Release Assets Table
 *
 * Stores media kits, PDFs, images, and other assets associated with press releases.
 * Assets can be embedded in emails or provided as download links.
 *
 * Relationship: One press release can have multiple assets.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('press_release_assets', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },

      // Foreign Key to Press Releases
      press_release_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'press_releases',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'Foreign key to press_releases table'
      },

      // Asset Metadata
      asset_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Asset type: pdf, image, video, media_kit, document'
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Original file name'
      },
      file_url: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'S3/storage URL for the file'
      },
      file_size_bytes: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: 'File size in bytes'
      },
      mime_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'MIME type (e.g., application/pdf, image/jpeg)'
      },

      // Asset Configuration
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Asset description or caption'
      },
      is_attachment: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether to include as email attachment (vs. link only)'
      },

      // Audit Trail
      uploaded_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'User who uploaded this asset'
      },

      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('press_release_assets', ['press_release_id'], {
      name: 'idx_press_assets_release'
    });

    await queryInterface.addIndex('press_release_assets', ['asset_type'], {
      name: 'idx_press_assets_type'
    });

    console.log('✅ Press Release Assets table created successfully');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('press_release_assets');
    console.log('✅ Press Release Assets table dropped successfully');
  }
};
