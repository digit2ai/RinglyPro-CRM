'use strict';

/**
 * Press Release Content Table
 *
 * Stores language-specific content variants for press releases.
 * Supports English (en) and Spanish (es) versions.
 * Tracks AI generation metadata and version history.
 *
 * Relationship: One press release can have multiple content variants (one per language).
 * Only one variant per language can be active (is_active = true).
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('press_release_content', {
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

      // Language
      language: {
        type: Sequelize.STRING(2),
        allowNull: false,
        comment: 'ISO 639-1 language code: en or es'
      },

      // Content
      subject_line: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Email subject line'
      },
      body_html: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Full HTML email body'
      },
      body_plaintext: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Plain text email body (fallback)'
      },

      // AI Generation Metadata
      ai_generated: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether this content was AI-generated'
      },
      ai_model_used: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'AI model used (e.g., claude-opus-4-5, gpt-4)'
      },
      ai_generation_timestamp: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When AI generated this content'
      },
      ai_prompt_version: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Prompt engineering version (for A/B testing)'
      },
      human_edited: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether human edited AI-generated content'
      },

      // Version Control
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Content version number'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Only one version per language can be active'
      },

      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add CHECK constraint for valid language values
    await queryInterface.sequelize.query(`
      ALTER TABLE press_release_content
      ADD CONSTRAINT press_release_content_language_check
      CHECK (language IN ('en', 'es'))
    `);

    // Create indexes
    await queryInterface.addIndex('press_release_content', ['press_release_id', 'language', 'is_active'], {
      name: 'idx_press_content_release_lang'
    });

    await queryInterface.addIndex('press_release_content', ['press_release_id'], {
      name: 'idx_press_content_release'
    });

    // Create partial unique index: only one active version per language per press release
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX press_content_active_language_unique
      ON press_release_content (press_release_id, language)
      WHERE is_active = true
    `);

    console.log('✅ Press Release Content table created successfully');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('press_release_content');
    console.log('✅ Press Release Content table dropped successfully');
  }
};
