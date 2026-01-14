// =====================================================
// A2P 10DLC Business Verification Model
// File: src/models/A2P.js
// Purpose: Store A2P 10DLC onboarding requirements per client
// =====================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const A2P = sequelize.define('A2P', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // Foreign key to clients table
  clientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'client_id',
    comment: 'References clients table - multi-tenant isolation'
  },

  // Status tracking
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'draft',
    validate: {
      isIn: [['draft', 'submitted', 'approved', 'rejected']]
    },
    comment: 'Status: draft | submitted | approved | rejected'
  },

  // Timestamps
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_at'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'rejected_at'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },

  // ========================
  // Business Identity
  // ========================
  legalBusinessName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'legal_business_name'
  },
  dbaName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'dba_name'
  },
  businessType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'business_type',
    validate: {
      isIn: {
        args: [['LLC', 'Corporation', 'Sole Proprietor', 'Partnership', 'Non-profit', 'Government', 'Other']],
        msg: 'Invalid business type'
      }
    }
  },
  taxIdType: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'tax_id_type',
    validate: {
      isIn: {
        args: [['EIN', 'SSN']],
        msg: 'Tax ID type must be EIN or SSN'
      }
    }
  },
  taxIdLast4: {
    type: DataTypes.STRING(4),
    allowNull: true,
    field: 'tax_id_last4',
    validate: {
      is: {
        args: /^\d{4}$/,
        msg: 'Tax ID last 4 must be exactly 4 digits'
      }
    }
  },
  taxIdFullEncrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'tax_id_full_encrypted',
    comment: 'Encrypted full EIN/SSN - optional'
  },
  businessRegistrationCountry: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'US',
    field: 'business_registration_country'
  },
  businessAddressLine1: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'business_address_line1'
  },
  businessAddressLine2: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'business_address_line2'
  },
  businessCity: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'business_city'
  },
  businessState: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'business_state'
  },
  businessPostalCode: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'business_postal_code'
  },
  businessWebsite: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'business_website',
    validate: {
      isUrl: {
        msg: 'Invalid website URL format'
      }
    }
  },
  businessVertical: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'business_vertical'
  },

  // ========================
  // Authorized Representative
  // ========================
  authorizedRepFirstName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'authorized_rep_first_name'
  },
  authorizedRepLastName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'authorized_rep_last_name'
  },
  authorizedRepEmail: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'authorized_rep_email',
    validate: {
      isEmail: {
        msg: 'Invalid email address format'
      }
    }
  },
  authorizedRepPhoneE164: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'authorized_rep_phone_e164',
    validate: {
      is: {
        args: /^\+[1-9]\d{1,14}$/,
        msg: 'Phone must be in E.164 format (e.g., +15551234567)'
      }
    }
  },
  authorizedRepTitle: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'authorized_rep_title'
  },

  // ========================
  // Messaging Use Case
  // ========================
  useCaseCategories: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'use_case_categories',
    comment: 'Array of use case categories'
  },
  useCaseOtherDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'use_case_other_description'
  },
  useCaseDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'use_case_description'
  },

  // ========================
  // Consent & Opt-Out
  // ========================
  consentMethods: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'consent_methods',
    comment: 'Array of consent methods'
  },
  consentOtherDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'consent_other_description'
  },
  optOutAcknowledged: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'opt_out_acknowledged'
  },
  optInDisclosureUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'opt_in_disclosure_url'
  },
  privacyPolicyUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'privacy_policy_url'
  },
  termsOfServiceUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'terms_of_service_url'
  },

  // ========================
  // Sample Messages
  // ========================
  sampleMessage1: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sample_message_1'
  },
  sampleMessage2: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sample_message_2'
  },
  sampleMessage3: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sample_message_3'
  },

  // ========================
  // Volume Estimates
  // ========================
  estimatedSmsPerDay: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'estimated_sms_per_day',
    validate: {
      isIn: {
        args: [['under_50', '50_200', '200_1000', 'over_1000']],
        msg: 'Invalid SMS volume selection'
      }
    }
  },
  estimatedSmsPerMonth: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_sms_per_month'
  },

  // ========================
  // Internal Fields
  // ========================
  notesInternal: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'notes_internal'
  },
  submittedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'submitted_by_user_id'
  }
}, {
  tableName: 'a2p',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['client_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['submitted_at']
    }
  ]
});

// ========================
// Instance Methods
// ========================

/**
 * Check if the A2P record is editable (only draft status)
 */
A2P.prototype.isEditable = function() {
  return this.status === 'draft';
};

/**
 * Check if all required fields are filled for submission
 * Returns { valid: boolean, errors: string[] }
 */
A2P.prototype.validateForSubmission = function() {
  const errors = [];

  // Business Identity (required)
  if (!this.legalBusinessName) errors.push('Legal business name is required');
  if (!this.businessType) errors.push('Business type is required');
  if (!this.taxIdType) errors.push('Tax ID type is required');
  if (!this.taxIdLast4) errors.push('Tax ID last 4 digits is required');
  if (!this.businessAddressLine1) errors.push('Business address line 1 is required');
  if (!this.businessCity) errors.push('Business city is required');
  if (!this.businessState) errors.push('Business state is required');
  if (!this.businessPostalCode) errors.push('Business postal code is required');
  if (!this.businessWebsite) errors.push('Business website is required');

  // Authorized Representative (required)
  if (!this.authorizedRepFirstName) errors.push('Authorized representative first name is required');
  if (!this.authorizedRepLastName) errors.push('Authorized representative last name is required');
  if (!this.authorizedRepEmail) errors.push('Authorized representative email is required');
  if (!this.authorizedRepPhoneE164) errors.push('Authorized representative phone is required');
  if (!this.authorizedRepTitle) errors.push('Authorized representative title is required');

  // Messaging Use Case (required)
  if (!this.useCaseCategories || this.useCaseCategories.length === 0) {
    errors.push('At least one use case category is required');
  }
  if (!this.useCaseDescription) errors.push('Use case description is required');

  // Consent & Opt-Out (required)
  if (!this.consentMethods || this.consentMethods.length === 0) {
    errors.push('At least one consent method is required');
  }
  if (!this.optOutAcknowledged) errors.push('STOP opt-out acknowledgement is required');

  // Sample Messages (required)
  if (!this.sampleMessage1) errors.push('At least one sample message is required');

  // Volume (required)
  if (!this.estimatedSmsPerDay) errors.push('Estimated SMS volume per day is required');

  // Warning: Check if any sample message includes STOP language
  const allMessages = [this.sampleMessage1, this.sampleMessage2, this.sampleMessage3]
    .filter(m => m)
    .join(' ')
    .toLowerCase();

  const hasStopLanguage = allMessages.includes('stop') ||
                          allMessages.includes('opt out') ||
                          allMessages.includes('unsubscribe') ||
                          allMessages.includes('text stop');

  return {
    valid: errors.length === 0,
    errors,
    warnings: hasStopLanguage ? [] : ['Warning: Sample messages should include STOP language (e.g., "Reply STOP to unsubscribe")']
  };
};

// ========================
// Class Methods
// ========================

/**
 * Find A2P record by client ID
 */
A2P.findByClientId = function(clientId) {
  return this.findOne({
    where: { clientId }
  });
};

/**
 * Create or update A2P record for a client
 */
A2P.upsertForClient = async function(clientId, data) {
  const existing = await this.findByClientId(clientId);

  if (existing) {
    // Only update if still in draft status
    if (existing.status !== 'draft') {
      throw new Error('Cannot update A2P record that has already been submitted');
    }
    await existing.update(data);
    return existing;
  }

  // Create new record
  return this.create({
    clientId,
    ...data
  });
};

module.exports = A2P;
