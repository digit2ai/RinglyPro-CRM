'use strict';

/**
 * A2P 10DLC Business Verification Table
 *
 * Stores all A2P 10DLC onboarding requirements for each client.
 * Required for SMS enablement via Twilio/carriers.
 *
 * Linked to clients table via client_id (FK)
 * One client can have one active A2P record.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create the a2p table
    await queryInterface.createTable('a2p', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },

      // Foreign key to clients table
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'clients',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },

      // Status tracking
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'draft',
        comment: 'Status: draft | submitted | approved | rejected'
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
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      rejected_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // ========================
      // Business Identity
      // ========================
      legal_business_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Required for submission: Legal business name'
      },
      dba_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Optional: Doing Business As name'
      },
      business_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Required for submission: LLC, Corporation, Sole Proprietor, Partnership, Non-profit'
      },
      tax_id_type: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'Required for submission: EIN or SSN'
      },
      tax_id_last4: {
        type: Sequelize.STRING(4),
        allowNull: true,
        comment: 'Required for submission: Last 4 digits of EIN/SSN (security: never store full ID)'
      },
      tax_id_full_encrypted: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional: Full EIN/SSN encrypted at rest (only if encryption is available)'
      },
      business_registration_country: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'US',
        comment: 'Business registration country (default: US)'
      },
      business_address_line1: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Required for submission: Street address line 1'
      },
      business_address_line2: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Optional: Street address line 2'
      },
      business_city: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Required for submission: City'
      },
      business_state: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Required for submission: State/Province'
      },
      business_postal_code: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Required for submission: ZIP/Postal code'
      },
      business_website: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Required for submission: Business website URL'
      },
      business_vertical: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Optional: Business vertical (healthcare, home services, legal, etc.)'
      },

      // ========================
      // Authorized Representative
      // ========================
      authorized_rep_first_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Required for submission: Authorized representative first name'
      },
      authorized_rep_last_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Required for submission: Authorized representative last name'
      },
      authorized_rep_email: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Required for submission: Authorized representative email'
      },
      authorized_rep_phone_e164: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Required for submission: Authorized representative phone in E.164 format'
      },
      authorized_rep_title: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Required for submission: Authorized representative job title'
      },

      // ========================
      // Messaging Use Case
      // ========================
      use_case_categories: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Required for submission: Array of use case categories (missed_call_followups, appointment_scheduling, customer_care, lead_response, other)'
      },
      use_case_other_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional: Description if "other" use case selected'
      },
      use_case_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Required for submission: 1-2 sentence description of SMS use case'
      },

      // ========================
      // Consent & Opt-Out
      // ========================
      consent_methods: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Required for submission: Array of consent methods (inbound_text_or_call, web_form, existing_customer, verbal_consent, paper_form, other)'
      },
      consent_other_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional: Description if "other" consent method selected'
      },
      opt_out_acknowledged: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Required for submission: Client acknowledges STOP functionality'
      },
      opt_in_disclosure_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Optional: URL to SMS consent/terms disclosure page'
      },
      privacy_policy_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Optional: URL to privacy policy'
      },
      terms_of_service_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Optional: URL to terms of service'
      },

      // ========================
      // Sample Messages
      // ========================
      sample_message_1: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Required for submission: Sample SMS message 1'
      },
      sample_message_2: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional: Sample SMS message 2'
      },
      sample_message_3: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional: Sample SMS message 3'
      },

      // ========================
      // Volume Estimates
      // ========================
      estimated_sms_per_day: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Required for submission: under_50 | 50_200 | 200_1000 | over_1000'
      },
      estimated_sms_per_month: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Optional: Estimated SMS per month (numeric)'
      },

      // ========================
      // Internal Fields
      // ========================
      notes_internal: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Internal admin notes (not shown to client)'
      },
      submitted_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'User ID who submitted the form'
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('a2p', ['client_id'], {
      name: 'a2p_client_id_idx'
    });

    await queryInterface.addIndex('a2p', ['status'], {
      name: 'a2p_status_idx'
    });

    await queryInterface.addIndex('a2p', ['submitted_at'], {
      name: 'a2p_submitted_at_idx'
    });

    // Unique constraint: one A2P record per client (for simplicity)
    await queryInterface.addIndex('a2p', ['client_id'], {
      name: 'a2p_client_id_unique',
      unique: true
    });

    console.log('✅ A2P 10DLC table created successfully');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('a2p');
    console.log('✅ A2P 10DLC table dropped successfully');
  }
};
