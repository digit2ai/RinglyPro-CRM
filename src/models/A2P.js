// =====================================================
// A2P 10DLC Business Verification Model
// File: src/models/A2P.js
// Purpose: Store A2P 10DLC onboarding requirements per client
// Updated: 2026-01-13 - Added Twilio/GHL compliance fields
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
    field: 'business_type'
  },
  companyType: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'company_type',
    comment: 'private, public, non_profit, government'
  },
  businessVertical: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'business_vertical'
  },
  regionsOfOperation: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'regions_of_operation',
    comment: 'US_ONLY, US_AND_CANADA, INTERNATIONAL'
  },
  stockExchange: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'stock_exchange',
    comment: 'Required for public companies'
  },
  stockTicker: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'stock_ticker',
    comment: 'Required for public companies'
  },
  taxIdType: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'tax_id_type',
    comment: 'EIN, DUNS, GIIN, LEI, CBN, OTHER'
  },
  taxIdNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'tax_id_number',
    comment: 'Full EIN/registration number - required for TCR verification'
  },
  // Keep legacy field for backwards compatibility
  taxIdLast4: {
    type: DataTypes.STRING(4),
    allowNull: true,
    field: 'tax_id_last4'
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
    field: 'business_website'
  },
  supportContactInfo: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'support_contact_info',
    comment: 'Support email or URL for customer inquiries'
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
    field: 'authorized_rep_email'
  },
  businessContactEmail: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'business_contact_email',
    comment: 'Business email for OTP verification'
  },
  authorizedRepPhoneE164: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'authorized_rep_phone_e164'
  },
  authorizedRepTitle: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'authorized_rep_title'
  },
  jobPosition: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'job_position',
    comment: 'CEO, CFO, VP, Director, Manager, etc.'
  },

  // ========================
  // Messaging Use Case
  // ========================
  campaignUseCase: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'campaign_use_case',
    comment: 'Primary campaign use case - CUSTOMER_CARE, MARKETING, MIXED, etc.'
  },
  useCaseCategories: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'use_case_categories',
    comment: 'Array of additional use case categories'
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
  contentAttributes: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'content_attributes',
    comment: 'Array: embedded_links, embedded_phone, age_gated, loan_lending'
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
  consentProcessDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'consent_process_description',
    comment: 'Detailed description of how consent is obtained'
  },
  optInConfirmationMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'opt_in_confirmation_message',
    comment: 'The message sent to confirm SMS opt-in'
  },
  messageFrequency: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'message_frequency',
    comment: 'varies, 1_per_week, 2_4_per_month, etc.'
  },
  helpKeywordResponse: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'help_keyword_response',
    comment: 'Response sent when user texts HELP'
  },
  stopKeywordResponse: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'stop_keyword_response',
    comment: 'Response sent when user texts STOP'
  },
  useDoubleOptIn: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    field: 'use_double_opt_in',
    comment: 'Whether double opt-in is used'
  },
  doubleOptInMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'double_opt_in_message',
    comment: 'Confirmation message sent for double opt-in'
  },
  optInCheckboxDefault: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    field: 'opt_in_checkbox_default',
    comment: 'Attestation that opt-in checkbox is unchecked by default'
  },
  noDataSharing: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    field: 'no_data_sharing',
    comment: 'Attestation that phone data is not shared with third parties'
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
    field: 'estimated_sms_per_day'
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
  if (!this.companyType) errors.push('Company type is required');
  if (!this.businessVertical) errors.push('Business industry is required');
  if (!this.regionsOfOperation) errors.push('Regions of operation is required');
  if (!this.taxIdType) errors.push('Business registration ID type is required');
  if (!this.taxIdNumber) errors.push('Business registration number is required');
  if (!this.businessAddressLine1) errors.push('Business address is required');
  if (!this.businessCity) errors.push('Business city is required');
  if (!this.businessState) errors.push('Business state is required');
  if (!this.businessPostalCode) errors.push('Business postal code is required');
  if (!this.businessWebsite) errors.push('Business website is required');

  // Public company requirements
  if (this.companyType === 'public') {
    if (!this.stockExchange) errors.push('Stock exchange is required for public companies');
    if (!this.stockTicker) errors.push('Stock ticker is required for public companies');
  }

  // Authorized Representative (required)
  if (!this.authorizedRepFirstName) errors.push('Authorized representative first name is required');
  if (!this.authorizedRepLastName) errors.push('Authorized representative last name is required');
  if (!this.authorizedRepEmail) errors.push('Authorized representative email is required');
  if (!this.businessContactEmail) errors.push('Business contact email is required');
  if (!this.authorizedRepPhoneE164) errors.push('Authorized representative phone is required');
  if (!this.authorizedRepTitle) errors.push('Authorized representative title is required');
  if (!this.jobPosition) errors.push('Job position is required');

  // Messaging Use Case (required)
  if (!this.campaignUseCase) errors.push('Primary campaign use case is required');
  if (!this.useCaseDescription) errors.push('Use case description is required');

  // Consent & Opt-Out (required)
  if (!this.consentMethods || this.consentMethods.length === 0) {
    errors.push('At least one consent method is required');
  }
  if (!this.consentProcessDescription) errors.push('Consent process description is required');
  if (!this.optInConfirmationMessage) errors.push('Opt-in confirmation message is required');
  if (!this.messageFrequency) errors.push('Message frequency is required');
  if (!this.helpKeywordResponse) errors.push('HELP keyword response is required');
  if (!this.privacyPolicyUrl) errors.push('Privacy policy URL is required');
  if (!this.termsOfServiceUrl) errors.push('Terms of service URL is required');
  if (!this.optOutAcknowledged) errors.push('Compliance acknowledgement is required');

  // Sample Messages (required - now 2)
  if (!this.sampleMessage1) errors.push('Sample message 1 is required');
  if (!this.sampleMessage2) errors.push('Sample message 2 is required');

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
