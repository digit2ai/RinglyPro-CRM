'use strict';

/**
 * Press Email Events Table
 *
 * Stores SendGrid webhook events for press release emails.
 * Used for analytics, suppression enforcement, and compliance.
 *
 * Events: delivered, open, click, bounce, dropped, spamreport, unsubscribe
 *
 * Multi-tenant: client_id CHECK constraint enforces scope to clients 15 and 43.
 * Idempotency: sendgrid_event_id is unique to prevent duplicate event processing.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('press_email_events', {
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

      // SendGrid Event Data
      event_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Event type: delivered, open, click, bounce, dropped, spamreport, unsubscribe'
      },
      sendgrid_event_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'SendGrid unique event ID (for deduplication)'
      },
      sendgrid_message_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'SendGrid message ID (correlates to press_release_sends)'
      },

      // Recipient Data
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Recipient email address'
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Event timestamp from SendGrid'
      },

      // Press Release Correlation
      press_release_send_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'press_release_sends',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'Foreign key to press_release_sends table'
      },

      // Event Details
      bounce_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Bounce type: hard, soft, blocked'
      },
      bounce_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Bounce reason from SendGrid'
      },
      click_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL clicked (for click events)'
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'User agent string'
      },
      ip_address: {
        type: Sequelize.INET,
        allowNull: true,
        comment: 'IP address of recipient'
      },

      // Raw Payload (for debugging and compliance)
      raw_payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Full JSON payload from SendGrid webhook'
      },

      // Processing Status
      received_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When webhook was received'
      },
      processed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether event has been processed'
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When event was processed'
      }
    });

    // Add CHECK constraint to enforce client_id IN (15, 43)
    await queryInterface.sequelize.query(`
      ALTER TABLE press_email_events
      ADD CONSTRAINT press_email_events_client_id_check
      CHECK (client_id IN (15, 43))
    `);

    // Create indexes for performance
    await queryInterface.addIndex('press_email_events', ['client_id'], {
      name: 'idx_press_events_client'
    });

    await queryInterface.addIndex('press_email_events', ['email'], {
      name: 'idx_press_events_email'
    });

    await queryInterface.addIndex('press_email_events', ['sendgrid_message_id'], {
      name: 'idx_press_events_message_id'
    });

    await queryInterface.addIndex('press_email_events', ['event_type'], {
      name: 'idx_press_events_type'
    });

    await queryInterface.addIndex('press_email_events', ['timestamp'], {
      name: 'idx_press_events_timestamp'
    });

    await queryInterface.addIndex('press_email_events', ['press_release_send_id'], {
      name: 'idx_press_events_send_id'
    });

    // Partial index for unprocessed events
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_press_events_unprocessed
      ON press_email_events (processed)
      WHERE processed = false
    `);

    console.log('✅ Press Email Events table created successfully (clients 15 & 43 only)');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('press_email_events');
    console.log('✅ Press Email Events table dropped successfully');
  }
};
