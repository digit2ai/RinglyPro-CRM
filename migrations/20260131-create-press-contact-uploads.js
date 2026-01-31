'use strict';

/**
 * Press Contact Uploads Table
 *
 * Audit trail for all contact upload operations (CSV, manual, API).
 * Tracks success/failure counts and errors for debugging and compliance.
 *
 * Multi-tenant: client_id CHECK constraint enforces scope to clients 15 and 43.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('press_contact_uploads', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },

      // Multi-tenant enforcement (ONLY clients 15 and 43)
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'clients',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'Foreign key to clients table - ONLY 15 or 43 allowed (enforced by CHECK constraint)'
      },

      // Upload Metadata
      uploaded_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment: 'User who performed the upload'
      },
      upload_source: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Upload source: csv, xlsx, manual, api'
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Original file name (if file upload)'
      },
      file_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'S3 storage URL of original file (for audit)'
      },

      // Upload Results
      total_rows: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Total rows in upload file'
      },
      successful_imports: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of contacts successfully imported'
      },
      duplicate_skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of duplicates skipped'
      },
      invalid_skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of invalid emails skipped'
      },
      suppressed_skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of suppressed/unsubscribed contacts rejected'
      },

      // Error Logging
      error_log: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Array of error details: [{row: N, email: X, reason: Y}, ...]'
      },

      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add CHECK constraint to enforce client_id IN (15, 43)
    await queryInterface.sequelize.query(`
      ALTER TABLE press_contact_uploads
      ADD CONSTRAINT press_contact_uploads_client_id_check
      CHECK (client_id IN (15, 43))
    `);

    // Create indexes
    await queryInterface.addIndex('press_contact_uploads', ['client_id'], {
      name: 'idx_press_uploads_client'
    });

    await queryInterface.addIndex('press_contact_uploads', ['uploaded_by'], {
      name: 'idx_press_uploads_user'
    });

    await queryInterface.addIndex('press_contact_uploads', ['created_at'], {
      name: 'idx_press_uploads_created'
    });

    console.log('✅ Press Contact Uploads table created successfully (clients 15 & 43 only)');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('press_contact_uploads');
    console.log('✅ Press Contact Uploads table dropped successfully');
  }
};
