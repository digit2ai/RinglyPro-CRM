// =====================================================
// A2P 10DLC Business Verification Routes
// File: src/routes/a2p.js
// Purpose: REST API endpoints for A2P onboarding
// =====================================================

const express = require('express');
const router = express.Router();
const { A2P, Client } = require('../models');
const { authenticateToken, getUserClient } = require('../middleware/auth');
const validator = require('validator');

// ========================
// Middleware for Client ID Validation
// ========================

/**
 * Middleware to validate clientId param and check access
 * Supports both authenticated users and public access with clientId query param
 */
const validateClientAccess = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId || req.query.clientId);

    if (!clientId || isNaN(clientId)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid clientId'
      });
    }

    // Check if client exists
    const client = await Client.findByPk(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Attach client info to request
    req.clientId = clientId;
    req.clientRecord = client;

    // If user is authenticated, verify they have access to this client
    if (req.user) {
      // Admin users can access any client
      if (req.user.isAdmin) {
        return next();
      }

      // Regular users can only access their own client
      if (req.user.clientId && req.user.clientId !== clientId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You can only access your own A2P record'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Client access validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate client access'
    });
  }
};

// ========================
// Validation Helpers
// ========================

/**
 * Sanitize and validate A2P form data
 */
const sanitizeA2PData = (data) => {
  const sanitized = {};

  // Business Identity
  if (data.legalBusinessName !== undefined) {
    sanitized.legalBusinessName = validator.trim(String(data.legalBusinessName || ''));
  }
  if (data.dbaName !== undefined) {
    sanitized.dbaName = data.dbaName ? validator.trim(String(data.dbaName)) : null;
  }
  if (data.businessType !== undefined) {
    sanitized.businessType = validator.trim(String(data.businessType || ''));
  }
  if (data.taxIdType !== undefined) {
    sanitized.taxIdType = validator.trim(String(data.taxIdType || '')).toUpperCase();
  }
  if (data.taxIdLast4 !== undefined) {
    // Only store last 4 digits - strip any non-digits
    const digits = String(data.taxIdLast4 || '').replace(/\D/g, '');
    sanitized.taxIdLast4 = digits.slice(-4) || null;
  }
  if (data.businessRegistrationCountry !== undefined) {
    sanitized.businessRegistrationCountry = validator.trim(String(data.businessRegistrationCountry || 'US')).toUpperCase();
  }
  if (data.businessAddressLine1 !== undefined) {
    sanitized.businessAddressLine1 = validator.trim(String(data.businessAddressLine1 || ''));
  }
  if (data.businessAddressLine2 !== undefined) {
    sanitized.businessAddressLine2 = data.businessAddressLine2 ? validator.trim(String(data.businessAddressLine2)) : null;
  }
  if (data.businessCity !== undefined) {
    sanitized.businessCity = validator.trim(String(data.businessCity || ''));
  }
  if (data.businessState !== undefined) {
    sanitized.businessState = validator.trim(String(data.businessState || ''));
  }
  if (data.businessPostalCode !== undefined) {
    sanitized.businessPostalCode = validator.trim(String(data.businessPostalCode || ''));
  }
  if (data.businessWebsite !== undefined) {
    sanitized.businessWebsite = data.businessWebsite ? validator.trim(String(data.businessWebsite)) : null;
  }
  if (data.businessVertical !== undefined) {
    sanitized.businessVertical = data.businessVertical ? validator.trim(String(data.businessVertical)) : null;
  }

  // Authorized Representative
  if (data.authorizedRepFirstName !== undefined) {
    sanitized.authorizedRepFirstName = validator.trim(String(data.authorizedRepFirstName || ''));
  }
  if (data.authorizedRepLastName !== undefined) {
    sanitized.authorizedRepLastName = validator.trim(String(data.authorizedRepLastName || ''));
  }
  if (data.authorizedRepEmail !== undefined) {
    sanitized.authorizedRepEmail = data.authorizedRepEmail ? validator.normalizeEmail(String(data.authorizedRepEmail)) || null : null;
  }
  if (data.authorizedRepPhoneE164 !== undefined) {
    // Normalize phone to E.164 format
    let phone = String(data.authorizedRepPhoneE164 || '').replace(/\D/g, '');
    if (phone && !phone.startsWith('+')) {
      phone = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;
    }
    sanitized.authorizedRepPhoneE164 = phone || null;
  }
  if (data.authorizedRepTitle !== undefined) {
    sanitized.authorizedRepTitle = validator.trim(String(data.authorizedRepTitle || ''));
  }

  // Messaging Use Case
  if (data.useCaseCategories !== undefined) {
    sanitized.useCaseCategories = Array.isArray(data.useCaseCategories) ? data.useCaseCategories : [];
  }
  if (data.useCaseOtherDescription !== undefined) {
    sanitized.useCaseOtherDescription = data.useCaseOtherDescription ? validator.trim(String(data.useCaseOtherDescription)) : null;
  }
  if (data.useCaseDescription !== undefined) {
    sanitized.useCaseDescription = validator.trim(String(data.useCaseDescription || ''));
  }

  // Consent & Opt-Out
  if (data.consentMethods !== undefined) {
    sanitized.consentMethods = Array.isArray(data.consentMethods) ? data.consentMethods : [];
  }
  if (data.consentOtherDescription !== undefined) {
    sanitized.consentOtherDescription = data.consentOtherDescription ? validator.trim(String(data.consentOtherDescription)) : null;
  }
  if (data.optOutAcknowledged !== undefined) {
    sanitized.optOutAcknowledged = Boolean(data.optOutAcknowledged);
  }
  if (data.optInDisclosureUrl !== undefined) {
    sanitized.optInDisclosureUrl = data.optInDisclosureUrl ? validator.trim(String(data.optInDisclosureUrl)) : null;
  }
  if (data.privacyPolicyUrl !== undefined) {
    sanitized.privacyPolicyUrl = data.privacyPolicyUrl ? validator.trim(String(data.privacyPolicyUrl)) : null;
  }
  if (data.termsOfServiceUrl !== undefined) {
    sanitized.termsOfServiceUrl = data.termsOfServiceUrl ? validator.trim(String(data.termsOfServiceUrl)) : null;
  }

  // Sample Messages
  if (data.sampleMessage1 !== undefined) {
    sanitized.sampleMessage1 = validator.trim(String(data.sampleMessage1 || ''));
  }
  if (data.sampleMessage2 !== undefined) {
    sanitized.sampleMessage2 = data.sampleMessage2 ? validator.trim(String(data.sampleMessage2)) : null;
  }
  if (data.sampleMessage3 !== undefined) {
    sanitized.sampleMessage3 = data.sampleMessage3 ? validator.trim(String(data.sampleMessage3)) : null;
  }

  // Volume Estimates
  if (data.estimatedSmsPerDay !== undefined) {
    sanitized.estimatedSmsPerDay = validator.trim(String(data.estimatedSmsPerDay || ''));
  }
  if (data.estimatedSmsPerMonth !== undefined) {
    sanitized.estimatedSmsPerMonth = data.estimatedSmsPerMonth ? parseInt(data.estimatedSmsPerMonth) : null;
  }

  return sanitized;
};

/**
 * Server-side validation for A2P data
 */
const validateA2PData = (data, requireAll = false) => {
  const errors = [];

  // Email validation
  if (data.authorizedRepEmail && !validator.isEmail(data.authorizedRepEmail)) {
    errors.push('Invalid email address format');
  }

  // Phone E.164 validation
  if (data.authorizedRepPhoneE164) {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(data.authorizedRepPhoneE164)) {
      errors.push('Phone must be in E.164 format (e.g., +15551234567)');
    }
  }

  // URL validations
  const urlFields = ['businessWebsite', 'optInDisclosureUrl', 'privacyPolicyUrl', 'termsOfServiceUrl'];
  urlFields.forEach(field => {
    if (data[field] && !validator.isURL(data[field], { protocols: ['http', 'https'], require_protocol: true })) {
      errors.push(`${field} must be a valid URL starting with http:// or https://`);
    }
  });

  // Tax ID last 4 validation
  if (data.taxIdLast4 && !/^\d{4}$/.test(data.taxIdLast4)) {
    errors.push('Tax ID last 4 must be exactly 4 digits');
  }

  // Business type validation
  const validBusinessTypes = ['LLC', 'Corporation', 'Sole Proprietor', 'Partnership', 'Non-profit', 'Government', 'Other'];
  if (data.businessType && !validBusinessTypes.includes(data.businessType)) {
    errors.push('Invalid business type');
  }

  // Tax ID type validation
  if (data.taxIdType && !['EIN', 'SSN'].includes(data.taxIdType)) {
    errors.push('Tax ID type must be EIN or SSN');
  }

  // SMS volume validation
  const validVolumes = ['under_50', '50_200', '200_1000', 'over_1000'];
  if (data.estimatedSmsPerDay && !validVolumes.includes(data.estimatedSmsPerDay)) {
    errors.push('Invalid SMS volume selection');
  }

  return errors;
};

// ========================
// API Routes
// ========================

/**
 * GET /api/clients/:clientId/a2p
 * Get A2P record for a client
 */
router.get('/clients/:clientId/a2p', validateClientAccess, async (req, res) => {
  try {
    const a2p = await A2P.findByClientId(req.clientId);

    if (!a2p) {
      return res.status(404).json({
        success: false,
        error: 'No A2P record found for this client',
        clientId: req.clientId
      });
    }

    // Don't expose sensitive internal fields to non-admins
    const response = a2p.toJSON();
    if (!req.user?.isAdmin) {
      delete response.notesInternal;
      delete response.taxIdFullEncrypted;
    }

    res.json({
      success: true,
      data: response,
      client: {
        id: req.clientRecord.id,
        businessName: req.clientRecord.business_name
      }
    });
  } catch (error) {
    console.error('Error fetching A2P record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch A2P record'
    });
  }
});

/**
 * POST /api/clients/:clientId/a2p
 * Create or upsert A2P record (draft mode)
 */
router.post('/clients/:clientId/a2p', validateClientAccess, async (req, res) => {
  try {
    // Sanitize input data
    const sanitizedData = sanitizeA2PData(req.body);

    // Validate data
    const validationErrors = validateA2PData(sanitizedData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors
      });
    }

    // Check if record already exists
    let a2p = await A2P.findByClientId(req.clientId);

    if (a2p) {
      // Update existing record (only if still in draft)
      if (a2p.status !== 'draft') {
        return res.status(400).json({
          success: false,
          error: 'Cannot update A2P record that has already been submitted'
        });
      }

      await a2p.update(sanitizedData);
    } else {
      // Create new record
      a2p = await A2P.create({
        clientId: req.clientId,
        ...sanitizedData
      });
    }

    res.json({
      success: true,
      message: a2p.isNewRecord ? 'A2P record created' : 'A2P record updated',
      data: a2p.toJSON()
    });
  } catch (error) {
    console.error('Error creating/updating A2P record:', error);

    // Handle validation errors from Sequelize
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        errors: error.errors.map(e => e.message)
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create/update A2P record'
    });
  }
});

/**
 * PUT /api/clients/:clientId/a2p
 * Update A2P record (partial updates allowed, draft mode only)
 */
router.put('/clients/:clientId/a2p', validateClientAccess, async (req, res) => {
  try {
    const a2p = await A2P.findByClientId(req.clientId);

    if (!a2p) {
      return res.status(404).json({
        success: false,
        error: 'No A2P record found for this client'
      });
    }

    // Only allow updates in draft status
    if (a2p.status !== 'draft') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update A2P record that has already been submitted'
      });
    }

    // Sanitize input data
    const sanitizedData = sanitizeA2PData(req.body);

    // Validate data
    const validationErrors = validateA2PData(sanitizedData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors
      });
    }

    await a2p.update(sanitizedData);

    res.json({
      success: true,
      message: 'A2P record updated',
      data: a2p.toJSON()
    });
  } catch (error) {
    console.error('Error updating A2P record:', error);

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        errors: error.errors.map(e => e.message)
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update A2P record'
    });
  }
});

/**
 * POST /api/clients/:clientId/a2p/submit
 * Submit A2P record for verification
 * Validates all required fields before submission
 */
router.post('/clients/:clientId/a2p/submit', validateClientAccess, async (req, res) => {
  try {
    const a2p = await A2P.findByClientId(req.clientId);

    if (!a2p) {
      return res.status(404).json({
        success: false,
        error: 'No A2P record found for this client. Please save a draft first.'
      });
    }

    // Only allow submission from draft status
    if (a2p.status !== 'draft') {
      return res.status(400).json({
        success: false,
        error: `A2P record is already ${a2p.status}. Cannot submit again.`
      });
    }

    // Validate all required fields for submission
    const validation = a2p.validateForSubmission();

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'A2P record is incomplete. Please fill in all required fields.',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Update status to submitted
    await a2p.update({
      status: 'submitted',
      submittedAt: new Date(),
      submittedByUserId: req.user?.userId || null
    });

    res.json({
      success: true,
      message: 'A2P record submitted successfully for verification',
      warnings: validation.warnings,
      data: a2p.toJSON()
    });
  } catch (error) {
    console.error('Error submitting A2P record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit A2P record'
    });
  }
});

/**
 * POST /api/clients/:clientId/a2p/reset-to-draft
 * Reset A2P record to draft status (admin only)
 */
router.post('/clients/:clientId/a2p/reset-to-draft', authenticateToken, validateClientAccess, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can reset A2P records to draft'
      });
    }

    const a2p = await A2P.findByClientId(req.clientId);

    if (!a2p) {
      return res.status(404).json({
        success: false,
        error: 'No A2P record found for this client'
      });
    }

    // Reset to draft
    await a2p.update({
      status: 'draft',
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null
    });

    res.json({
      success: true,
      message: 'A2P record reset to draft status',
      data: a2p.toJSON()
    });
  } catch (error) {
    console.error('Error resetting A2P record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset A2P record'
    });
  }
});

/**
 * POST /api/clients/:clientId/a2p/approve
 * Approve A2P record (admin only)
 */
router.post('/clients/:clientId/a2p/approve', authenticateToken, validateClientAccess, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can approve A2P records'
      });
    }

    const a2p = await A2P.findByClientId(req.clientId);

    if (!a2p) {
      return res.status(404).json({
        success: false,
        error: 'No A2P record found for this client'
      });
    }

    if (a2p.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        error: 'Only submitted A2P records can be approved'
      });
    }

    await a2p.update({
      status: 'approved',
      approvedAt: new Date(),
      notesInternal: req.body.notes || a2p.notesInternal
    });

    res.json({
      success: true,
      message: 'A2P record approved',
      data: a2p.toJSON()
    });
  } catch (error) {
    console.error('Error approving A2P record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve A2P record'
    });
  }
});

/**
 * POST /api/clients/:clientId/a2p/reject
 * Reject A2P record (admin only)
 */
router.post('/clients/:clientId/a2p/reject', authenticateToken, validateClientAccess, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can reject A2P records'
      });
    }

    const a2p = await A2P.findByClientId(req.clientId);

    if (!a2p) {
      return res.status(404).json({
        success: false,
        error: 'No A2P record found for this client'
      });
    }

    if (a2p.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        error: 'Only submitted A2P records can be rejected'
      });
    }

    const rejectionReason = req.body.reason || 'No reason provided';

    await a2p.update({
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason,
      notesInternal: req.body.notes || a2p.notesInternal
    });

    res.json({
      success: true,
      message: 'A2P record rejected',
      data: a2p.toJSON()
    });
  } catch (error) {
    console.error('Error rejecting A2P record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject A2P record'
    });
  }
});

/**
 * GET /api/admin/a2p
 * List all A2P records (admin only)
 */
router.get('/admin/a2p', authenticateToken, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { status } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }

    const records = await A2P.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Client,
        as: 'client',
        attributes: ['id', 'business_name', 'owner_email']
      }]
    });

    res.json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error listing A2P records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list A2P records'
    });
  }
});

module.exports = router;
