'use strict';

/**
 * Press Releases Table
 *
 * Stores press release metadata for Client IDs 15 and 43 (TunjoRacing) ONLY.
 * Manages state transitions (draft → approved → scheduled → sent).
 * Enforces approval requirements before sending.
 *
 * Multi-tenant: client_id CHECK constraint enforces scope to clients 15 and 43.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('press_releases', {
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

      // Metadata
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Press release title'
      },
      race_event: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Associated race event (e.g., "2024 Monaco Grand Prix")'
      },
      race_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'Date of the race event'
      },
      embargo_until: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Embargo timestamp - press release cannot be sent before this time'
      },

      // State Management
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'draft',
        comment: 'Status: draft, pending_approval, approved, scheduled, sending, sent, failed'
      },

      // Content Source Tracking
      content_source: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Content source: manual, text_upload, audio_transcription, ai_generated'
      },
      original_audio_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'S3/storage URL if audio was uploaded for transcription'
      },
      transcription_text: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Raw AI transcription from audio upload'
      },

      // Approval & Audit
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment: 'User who created this press release'
      },
      approved_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'User who approved this press release'
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of approval'
      },

      // Scheduling
      scheduled_send_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Scheduled send timestamp (if scheduling is used)'
      },
      actual_send_started_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Actual timestamp when send process started'
      },
      actual_send_completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Actual timestamp when send process completed'
      },

      // Send Statistics (Cached)
      total_recipients_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total recipients targeted'
      },
      sent_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of emails sent'
      },
      delivered_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of emails delivered'
      },
      opened_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of emails opened'
      },
      clicked_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of emails clicked'
      },
      bounced_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of emails bounced'
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

    // Add CHECK constraint to enforce client_id IN (15, 43)
    await queryInterface.sequelize.query(`
      ALTER TABLE press_releases
      ADD CONSTRAINT press_releases_client_id_check
      CHECK (client_id IN (15, 43))
    `);

    // Add CHECK constraint for valid status values
    await queryInterface.sequelize.query(`
      ALTER TABLE press_releases
      ADD CONSTRAINT press_releases_status_check
      CHECK (status IN ('draft', 'pending_approval', 'approved', 'scheduled', 'sending', 'sent', 'failed'))
    `);

    // Add CHECK constraint: approved status requires approved_by
    await queryInterface.sequelize.query(`
      ALTER TABLE press_releases
      ADD CONSTRAINT press_releases_approved_requires_approver
      CHECK (
        (status IN ('approved', 'scheduled', 'sending', 'sent') AND approved_by IS NOT NULL)
        OR status IN ('draft', 'pending_approval', 'failed')
      )
    `);

    // Create indexes
    await queryInterface.addIndex('press_releases', ['client_id', 'status'], {
      name: 'idx_press_releases_client_status'
    });

    await queryInterface.addIndex('press_releases', ['scheduled_send_at'], {
      name: 'idx_press_releases_scheduled',
      where: {
        status: 'scheduled'
      }
    });

    await queryInterface.addIndex('press_releases', ['created_by'], {
      name: 'idx_press_releases_created_by'
    });

    await queryInterface.addIndex('press_releases', ['race_date'], {
      name: 'idx_press_releases_race_date'
    });

    console.log('✅ Press Releases table created successfully (clients 15 & 43 only)');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('press_releases');
    console.log('✅ Press Releases table dropped successfully');
  }
};
