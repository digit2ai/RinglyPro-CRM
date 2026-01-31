'use strict';

/**
 * Press Release Sends Table
 *
 * Audit log of every email sent for every press release.
 * Enforces idempotency: prevents duplicate sends to the same contact.
 * Tracks delivery, open, click, and bounce events per recipient.
 *
 * Relationship:
 * - One press_release_id can have many sends (one per recipient)
 * - One press_contact_id can have many sends (one per press release)
 * - UNIQUE constraint on (press_release_id, press_contact_id) enforces idempotency
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('press_release_sends', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },

      // Foreign Keys
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
      press_contact_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'press_contacts',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'Foreign key to press_contacts table'
      },

      // Content Snapshot (immutable record of what was sent)
      content_variant_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'press_release_content',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'Content variant that was sent'
      },
      language_sent: {
        type: Sequelize.STRING(2),
        allowNull: false,
        comment: 'Language that was sent (en or es)'
      },
      subject_sent: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Subject line snapshot (immutable)'
      },

      // SendGrid Integration
      sendgrid_message_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
        comment: 'SendGrid message ID for webhook correlation'
      },
      batch_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Batch ID for grouping sends in analytics'
      },

      // Delivery Status
      send_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Status: pending, sent, delivered, bounced, failed'
      },

      // Event Timestamps
      sent_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When the email was sent'
      },
      delivered_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the email was delivered (SendGrid webhook)'
      },
      opened_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'First open timestamp (SendGrid webhook)'
      },
      clicked_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'First click timestamp (SendGrid webhook)'
      },
      bounced_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Bounce timestamp (SendGrid webhook)'
      },
      bounce_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Bounce reason from SendGrid'
      },

      // Idempotency & Retry
      retry_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of retry attempts'
      },
      last_retry_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last retry timestamp'
      },

      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add CHECK constraint for valid send_status values
    await queryInterface.sequelize.query(`
      ALTER TABLE press_release_sends
      ADD CONSTRAINT press_release_sends_status_check
      CHECK (send_status IN ('pending', 'sent', 'delivered', 'bounced', 'failed'))
    `);

    // Create indexes
    await queryInterface.addIndex('press_release_sends', ['press_release_id'], {
      name: 'idx_press_sends_release'
    });

    await queryInterface.addIndex('press_release_sends', ['press_contact_id'], {
      name: 'idx_press_sends_contact'
    });

    await queryInterface.addIndex('press_release_sends', ['sendgrid_message_id'], {
      name: 'idx_press_sends_sendgrid_id'
    });

    await queryInterface.addIndex('press_release_sends', ['batch_id'], {
      name: 'idx_press_sends_batch'
    });

    await queryInterface.addIndex('press_release_sends', ['send_status'], {
      name: 'idx_press_sends_status'
    });

    await queryInterface.addIndex('press_release_sends', ['sent_at'], {
      name: 'idx_press_sends_sent_at'
    });

    // CRITICAL: Unique constraint to prevent duplicate sends
    await queryInterface.addIndex('press_release_sends', ['press_release_id', 'press_contact_id'], {
      name: 'press_release_sends_unique',
      unique: true,
      comment: 'Prevents duplicate sends to the same contact for the same press release'
    });

    console.log('✅ Press Release Sends table created successfully (with idempotency enforcement)');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('press_release_sends');
    console.log('✅ Press Release Sends table dropped successfully');
  }
};
