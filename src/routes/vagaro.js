// =====================================================
// Vagaro Integration Routes - Multitenant Edition
// File: src/routes/vagaro.js
// Purpose: Webhook handlers and API routes for Vagaro integration
// Architecture: Per-client credentials (multitenant)
// =====================================================

const express = require('express');
const router = express.Router();
const vagaroService = require('../services/vagaroService');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get client's Vagaro credentials from database
 * @param {number} userId - User ID from JWT token
 * @returns {Promise<object>} Vagaro credentials {apiKey, merchantId, webhookToken}
 */
async function getClientVagaroCredentials(userId) {
  try {
    // Get user's client ID
    const [user] = await sequelize.query(
      'SELECT client_id FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user || !user.client_id) {
      throw new Error('Client not found for user');
    }

    // Get client's Vagaro settings
    const [client] = await sequelize.query(
      'SELECT settings FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: user.client_id },
        type: QueryTypes.SELECT
      }
    );

    const vagaroSettings = client?.settings?.integration?.vagaro || {};

    return {
      ringlyProClientId: user.client_id,
      enabled: vagaroSettings.enabled === true,
      clientId: vagaroSettings.clientId || null,
      clientSecretKey: vagaroSettings.clientSecretKey || null,
      merchantId: vagaroSettings.merchantId || null,
      webhookToken: vagaroSettings.webhookToken || null,
      region: vagaroSettings.region || 'us01'
    };
  } catch (error) {
    logger.error('[VAGARO] Error fetching client credentials:', error);
    throw error;
  }
}

/**
 * Get client ID from Vagaro merchant ID (for webhooks)
 * @param {string} merchantId - Vagaro merchant ID from webhook
 * @returns {Promise<number>} Client ID
 */
async function getClientIdFromMerchantId(merchantId) {
  try {
    const [client] = await sequelize.query(
      `SELECT id FROM clients WHERE settings->'integration'->'vagaro'->>'merchantId' = :merchantId`,
      {
        replacements: { merchantId },
        type: QueryTypes.SELECT
      }
    );

    if (!client) {
      throw new Error(`No client found with merchant ID: ${merchantId}`);
    }

    return client.id;
  } catch (error) {
    logger.error('[VAGARO] Error finding client by merchant ID:', error);
    throw error;
  }
}

// =====================================================
// WEBHOOK HANDLERS
// =====================================================

/**
 * Verify Vagaro webhook signature
 * @param {string} providedToken - Token from webhook header
 * @param {string} expectedToken - Token from client settings
 * @returns {boolean} Verification result
 */
function verifyVagaroWebhook(providedToken, expectedToken) {
  if (!expectedToken) {
    logger.warn('[VAGARO] Webhook verification token not configured for client');
    return true; // Allow webhook if no token configured (for testing)
  }

  return providedToken === expectedToken;
}

/**
 * POST /api/vagaro/webhooks/appointment
 * Handle appointment webhook events from Vagaro
 */
router.post('/webhooks/appointment', async (req, res) => {
  try {
    const { event, appointment, merchantId } = req.body;
    const providedToken = req.headers['x-vagaro-verification-token'];

    logger.info(`[VAGARO] Received appointment webhook: ${event} for appointment ${appointment?.id} from merchant ${merchantId}`);

    // Find client by merchant ID
    const clientId = await getClientIdFromMerchantId(merchantId);

    // Get client's webhook token to verify
    const [client] = await sequelize.query(
      'SELECT settings FROM clients WHERE id = :clientId',
      {
        replacements: { clientId },
        type: QueryTypes.SELECT
      }
    );

    const webhookToken = client?.settings?.integration?.vagaro?.webhookToken;

    // Verify webhook signature
    if (!verifyVagaroWebhook(providedToken, webhookToken)) {
      logger.warn(`[VAGARO] Webhook verification failed for client ${clientId}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Handle different event types
    switch (event) {
      case 'appointment.created':
      case 'appointment.updated':
        // Sync appointment to RinglyPro
        await vagaroService.syncAppointmentToRinglyPro(appointment, sequelize);

        // Note: Vagaro handles SMS confirmations automatically
        // We don't send SMS here to avoid duplicates
        break;

      case 'appointment.cancelled':
        // Update appointment status in RinglyPro
        await vagaroService.syncAppointmentToRinglyPro({
          ...appointment,
          status: 'cancelled'
        }, sequelize);
        break;

      default:
        logger.info(`[VAGARO] Unhandled appointment event: ${event}`);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    logger.error('[VAGARO] Appointment webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/vagaro/webhooks/customer
 * Handle customer webhook events from Vagaro
 */
router.post('/webhooks/customer', async (req, res) => {
  try {
    const { event, customer, merchantId } = req.body;
    const providedToken = req.headers['x-vagaro-verification-token'];

    logger.info(`[VAGARO] Received customer webhook: ${event} for customer ${customer?.id} from merchant ${merchantId}`);

    // Find client by merchant ID
    const clientId = await getClientIdFromMerchantId(merchantId);

    // Get client's webhook token to verify
    const [client] = await sequelize.query(
      'SELECT settings FROM clients WHERE id = :clientId',
      {
        replacements: { clientId },
        type: QueryTypes.SELECT
      }
    );

    const webhookToken = client?.settings?.integration?.vagaro?.webhookToken;

    // Verify webhook signature
    if (!verifyVagaroWebhook(providedToken, webhookToken)) {
      logger.warn(`[VAGARO] Webhook verification failed for client ${clientId}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Handle different event types
    switch (event) {
      case 'customer.created':
      case 'customer.updated':
        // Sync customer to RinglyPro
        await vagaroService.syncCustomerToRinglyPro(customer, sequelize);
        break;

      default:
        logger.info(`[VAGARO] Unhandled customer event: ${event}`);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    logger.error('[VAGARO] Customer webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/vagaro/webhooks/transaction
 * Handle transaction webhook events from Vagaro
 */
router.post('/webhooks/transaction', async (req, res) => {
  try {
    const { event, transaction, merchantId } = req.body;
    const providedToken = req.headers['x-vagaro-verification-token'];

    logger.info(`[VAGARO] Received transaction webhook: ${event} for transaction ${transaction?.id} from merchant ${merchantId}`);

    // Find client by merchant ID
    const clientId = await getClientIdFromMerchantId(merchantId);

    // Get client's webhook token to verify
    const [client] = await sequelize.query(
      'SELECT settings FROM clients WHERE id = :clientId',
      {
        replacements: { clientId },
        type: QueryTypes.SELECT
      }
    );

    const webhookToken = client?.settings?.integration?.vagaro?.webhookToken;

    // Verify webhook signature
    if (!verifyVagaroWebhook(providedToken, webhookToken)) {
      logger.warn(`[VAGARO] Webhook verification failed for client ${clientId}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Log transaction for record keeping
    logger.info(`[VAGARO] Transaction processed for client ${clientId}: ${JSON.stringify(transaction)}`);

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    logger.error('[VAGARO] Transaction webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// API ROUTES (Authenticated)
// =====================================================

/**
 * GET /api/vagaro/status
 * Get Vagaro integration status for current client
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled) {
      return res.json({
        success: true,
        configured: false,
        connected: false,
        message: 'Vagaro integration is disabled'
      });
    }

    const status = await vagaroService.getIntegrationStatus({
      clientId: credentials.clientId,
      clientSecretKey: credentials.clientSecretKey,
      merchantId: credentials.merchantId,
      region: credentials.region
    });

    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    logger.error('[VAGARO] Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/vagaro/appointments
 * Get appointments from Vagaro for current client
 */
router.get('/appointments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const { startDate, endDate, status } = req.query;

    const appointments = await vagaroService.getAppointments(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      },
      { startDate, endDate, status }
    );

    res.json({
      success: true,
      appointments
    });

  } catch (error) {
    logger.error('[VAGARO] Get appointments error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/vagaro/appointments/:id
 * Get specific appointment from Vagaro for current client
 */
router.get('/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const { id } = req.params;

    const appointment = await vagaroService.getAppointment(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      },
      id
    );

    res.json({
      success: true,
      appointment
    });

  } catch (error) {
    logger.error('[VAGARO] Get appointment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/vagaro/appointments
 * Create appointment in Vagaro for current client
 */
router.post('/appointments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const appointmentData = req.body;

    const appointment = await vagaroService.createAppointment(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      },
      appointmentData
    );

    res.json({
      success: true,
      appointment
    });

  } catch (error) {
    logger.error('[VAGARO] Create appointment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/vagaro/appointments/:id
 * Update appointment in Vagaro for current client
 */
router.put('/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const { id } = req.params;
    const updates = req.body;

    const appointment = await vagaroService.updateAppointment(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      },
      id,
      updates
    );

    res.json({
      success: true,
      appointment
    });

  } catch (error) {
    logger.error('[VAGARO] Update appointment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/vagaro/appointments/:id
 * Cancel appointment in Vagaro for current client
 */
router.delete('/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const { id } = req.params;

    await vagaroService.cancelAppointment(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      },
      id
    );

    res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });

  } catch (error) {
    logger.error('[VAGARO] Cancel appointment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/vagaro/customers
 * Get customers from Vagaro for current client
 */
router.get('/customers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const customers = await vagaroService.getCustomers(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      },
      req.query
    );

    res.json({
      success: true,
      customers
    });

  } catch (error) {
    logger.error('[VAGARO] Get customers error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/vagaro/employees
 * Get employees from Vagaro for current client
 */
router.get('/employees', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const employees = await vagaroService.getEmployees(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      }
    );

    res.json({
      success: true,
      employees
    });

  } catch (error) {
    logger.error('[VAGARO] Get employees error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/vagaro/locations
 * Get locations from Vagaro for current client
 */
router.get('/locations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const locations = await vagaroService.getLocations(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      }
    );

    res.json({
      success: true,
      locations
    });

  } catch (error) {
    logger.error('[VAGARO] Get locations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/vagaro/sync/appointments
 * Manually sync all appointments from Vagaro to RinglyPro for current client
 */
router.post('/sync/appointments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const appointments = await vagaroService.getAppointments(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      }
    );

    let syncCount = 0;
    for (const appointment of appointments) {
      try {
        await vagaroService.syncAppointmentToRinglyPro(appointment, sequelize);
        syncCount++;
      } catch (error) {
        logger.error(`[VAGARO] Failed to sync appointment ${appointment.id}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `Synced ${syncCount} of ${appointments.length} appointments`,
      synced: syncCount,
      total: appointments.length
    });

  } catch (error) {
    logger.error('[VAGARO] Sync appointments error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/vagaro/sync/customers
 * Manually sync all customers from Vagaro to RinglyPro for current client
 */
router.post('/sync/customers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const credentials = await getClientVagaroCredentials(userId);

    if (!credentials.enabled || !credentials.clientId || !credentials.clientSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Vagaro integration not configured. Please add OAuth credentials.'
      });
    }

    const customers = await vagaroService.getCustomers(
      {
        clientId: credentials.clientId,
        clientSecretKey: credentials.clientSecretKey,
        merchantId: credentials.merchantId,
        region: credentials.region
      }
    );

    let syncCount = 0;
    for (const customer of customers) {
      try {
        await vagaroService.syncCustomerToRinglyPro(customer, sequelize);
        syncCount++;
      } catch (error) {
        logger.error(`[VAGARO] Failed to sync customer ${customer.id}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `Synced ${syncCount} of ${customers.length} customers`,
      synced: syncCount,
      total: customers.length
    });

  } catch (error) {
    logger.error('[VAGARO] Sync customers error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
