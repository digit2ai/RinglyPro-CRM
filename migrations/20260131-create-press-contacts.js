'use strict';

/**
 * Press Contacts Table
 *
 * Stores press contacts for Client IDs 15 and 43 (TunjoRacing) ONLY.
 * Supports multi-language segmentation, consent management, and suppression enforcement.
 *
 * Multi-tenant: client_id CHECK constraint enforces scope to clients 15 and 43.
 * Uniqueness: email must be unique per client_id.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('press_contacts', {
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

      // Contact Identity
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Contact email address (unique per client_id)'
      },
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Contact first name'
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Contact last name'
      },
      organization: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Media outlet or organization name'
      },

      // Segmentation
      country: {
        type: Sequelize.STRING(2),
        allowNull: true,
        comment: 'ISO 3166-1 alpha-2 country code (e.g., US, ES, MX)'
      },
      language: {
        type: Sequelize.STRING(2),
        allowNull: false,
        defaultValue: 'en',
        comment: 'ISO 639-1 language code: en (English) or es (Spanish)'
      },
      contact_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'press',
        comment: 'Contact type: press, sponsor, partner, etc.'
      },

      // Consent & Compliance
      consent_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'opted_in',
        comment: 'Consent status: opted_in, unsubscribed, hard_bounced, suppressed'
      },
      consent_timestamp: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When consent was given'
      },
      consent_source: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Source of consent: manual_upload, csv_upload, api, web_form'
      },

      // Suppression Tracking
      unsubscribe_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Reason for unsubscription'
      },
      unsubscribe_timestamp: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the contact unsubscribed'
      },
      bounce_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of bounces (hard bounces permanently suppress)'
      },
      last_bounce_timestamp: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp of last bounce event'
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
        comment: 'User who uploaded this contact'
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Import source: manual, csv_bulk_2024-03-15, api_import'
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
      ALTER TABLE press_contacts
      ADD CONSTRAINT press_contacts_client_id_check
      CHECK (client_id IN (15, 43))
    `);

    // Add CHECK constraint for valid consent_status values
    await queryInterface.sequelize.query(`
      ALTER TABLE press_contacts
      ADD CONSTRAINT press_contacts_consent_status_check
      CHECK (consent_status IN ('opted_in', 'unsubscribed', 'hard_bounced', 'suppressed'))
    `);

    // Add CHECK constraint for valid language values
    await queryInterface.sequelize.query(`
      ALTER TABLE press_contacts
      ADD CONSTRAINT press_contacts_language_check
      CHECK (language IN ('en', 'es'))
    `);

    // Create indexes for performance
    await queryInterface.addIndex('press_contacts', ['client_id', 'consent_status'], {
      name: 'idx_press_contacts_client_consent',
      where: {
        consent_status: 'opted_in'
      },
      comment: 'Partial index for active contacts (most common query)'
    });

    await queryInterface.addIndex('press_contacts', ['client_id', 'language', 'consent_status'], {
      name: 'idx_press_contacts_language'
    });

    await queryInterface.addIndex('press_contacts', ['client_id', 'country'], {
      name: 'idx_press_contacts_country'
    });

    await queryInterface.addIndex('press_contacts', ['email'], {
      name: 'idx_press_contacts_email'
    });

    await queryInterface.addIndex('press_contacts', ['updated_at'], {
      name: 'idx_press_contacts_updated'
    });

    // Unique constraint: email must be unique per client_id
    await queryInterface.addIndex('press_contacts', ['client_id', 'email'], {
      name: 'press_contacts_client_email_unique',
      unique: true
    });

    console.log('✅ Press Contacts table created successfully (clients 15 & 43 only)');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('press_contacts');
    console.log('✅ Press Contacts table dropped successfully');
  }
};
