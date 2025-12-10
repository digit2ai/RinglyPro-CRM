// =====================================================
// Vagaro API Service - Multitenant OAuth Edition
// File: src/services/vagaroService.js
// Purpose: Integrate Vagaro salon/spa scheduling with RinglyPro
// Documentation: https://docs.vagaro.com/
// Architecture: Per-client credentials with OAuth 2.0 authentication
// =====================================================

const logger = require('../utils/logger');

// In-memory token cache: { merchantId: { accessToken, expiresAt } }
const tokenCache = new Map();

// Vagaro API Base URLs by region
const VAGARO_REGIONS = {
  'us01': 'https://us01-api.vagaro.com',
  'us02': 'https://us02-api.vagaro.com',
  'us03': 'https://us03-api.vagaro.com',
  'us04': 'https://us04-api.vagaro.com',
  'us05': 'https://us05-api.vagaro.com'
};

/**
 * Get Vagaro API base URL for a region
 * @param {string} region - Region code (e.g., 'us01', 'us04')
 * @returns {string} Base API URL
 */
function getApiBaseUrl(region = 'us01') {
  return VAGARO_REGIONS[region] || VAGARO_REGIONS['us01'];
}

/**
 * Generate OAuth access token for Vagaro API
 * @param {object} credentials - Client's Vagaro OAuth credentials
 * @returns {Promise<string>} Access token
 */
async function generateAccessToken(credentials) {
  const { clientId, clientSecretKey, merchantId, region } = credentials;

  if (!clientId || !clientSecretKey || !merchantId) {
    throw new Error('Missing required Vagaro OAuth credentials: clientId, clientSecretKey, and merchantId are required');
  }

  // Check token cache first
  const cached = tokenCache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info(`[VAGARO] Using cached access token for merchant ${merchantId}`);
    return cached.accessToken;
  }

  const baseUrl = getApiBaseUrl(region);
  const tokenUrl = `${baseUrl}/v1/oauth/token`;

  logger.info(`[VAGARO] Generating new access token for merchant ${merchantId} in region ${region}`);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecretKey,
        scope: 'business:read business:write appointment:read appointment:write customer:read customer:write',
        grant_type: 'client_credentials'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vagaro OAuth failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in || 3600; // Default 1 hour

    // Cache the token (subtract 5 minutes for safety margin)
    tokenCache.set(merchantId, {
      accessToken,
      expiresAt: Date.now() + ((expiresIn - 300) * 1000)
    });

    logger.info(`[VAGARO] ✅ Access token generated successfully for merchant ${merchantId}`);
    return accessToken;

  } catch (error) {
    logger.error(`[VAGARO] OAuth token generation failed for merchant ${merchantId}:`, error);
    throw error;
  }
}

/**
 * Make authenticated request to Vagaro API using OAuth
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} endpoint - API endpoint path
 * @param {object} options - Fetch options
 * @returns {Promise<object>} API response
 */
async function makeVagaroRequest(credentials, endpoint, options = {}) {
  const { merchantId, region } = credentials;

  if (!merchantId) {
    throw new Error('Vagaro merchantId is required');
  }

  // Generate or retrieve cached access token
  const accessToken = await generateAccessToken(credentials);

  const baseUrl = getApiBaseUrl(region);
  const url = `${baseUrl}/v1${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  logger.info(`[VAGARO] API Request for merchant ${merchantId}: ${options.method || 'GET'} ${endpoint}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Handle 401 - token might be expired, clear cache and retry once
    if (response.status === 401) {
      logger.warn(`[VAGARO] 401 Unauthorized - clearing token cache for merchant ${merchantId}`);
      tokenCache.delete(merchantId);

      // Retry once with fresh token
      const newAccessToken = await generateAccessToken(credentials);
      headers['Authorization'] = `Bearer ${newAccessToken}`;

      const retryResponse = await fetch(url, {
        ...options,
        headers
      });

      if (!retryResponse.ok) {
        const error = await retryResponse.text();
        throw new Error(`Vagaro API error (retry): ${retryResponse.status} - ${error}`);
      }

      return await retryResponse.json();
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vagaro API error: ${response.status} - ${error}`);
    }

    return await response.json();

  } catch (error) {
    logger.error(`[VAGARO] API Request failed for merchant ${merchantId}: ${error.message}`);
    throw error;
  }
}

// =====================================================
// BUSINESS / LOCATION APIs
// =====================================================

/**
 * Retrieve business locations from Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @returns {Promise<Array>} List of business locations
 */
async function getLocations(credentials) {
  const response = await makeVagaroRequest(credentials, '/business/locations');
  logger.info(`[VAGARO] Retrieved ${response.data?.length || 0} locations for merchant ${credentials.merchantId}`);
  return response.data || [];
}

/**
 * Retrieve services offered by the business
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} locationId - Optional location ID to filter services
 * @returns {Promise<Array>} List of services
 */
async function getServices(credentials, locationId = null) {
  const endpoint = locationId
    ? `/business/services?locationId=${locationId}`
    : '/business/services';

  const response = await makeVagaroRequest(credentials, endpoint);
  logger.info(`[VAGARO] Retrieved ${response.data?.length || 0} services for merchant ${credentials.merchantId}`);
  return response.data || [];
}

// =====================================================
// EMPLOYEE APIs
// =====================================================

/**
 * Get employees (providers/doctors) from Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} locationId - Optional location ID to filter employees
 * @returns {Promise<Array>} List of employees
 */
async function getEmployees(credentials, locationId = null) {
  const endpoint = locationId
    ? `/business/employees?locationId=${locationId}`
    : '/business/employees';

  const response = await makeVagaroRequest(credentials, endpoint);
  logger.info(`[VAGARO] Retrieved ${response.data?.length || 0} employees for merchant ${credentials.merchantId}`);
  return response.data || [];
}

/**
 * Get specific employee by ID
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} employeeId - Vagaro employee ID
 * @returns {Promise<object>} Employee details
 */
async function getEmployee(credentials, employeeId) {
  const response = await makeVagaroRequest(credentials, `/business/employees/${employeeId}`);
  return response.data;
}

// =====================================================
// CUSTOMER APIs
// =====================================================

/**
 * Search for customers in Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @param {object} searchParams - Search parameters (phone, email, name)
 * @returns {Promise<Array>} List of matching customers
 */
async function searchCustomers(credentials, searchParams = {}) {
  const queryParams = new URLSearchParams(searchParams).toString();
  const endpoint = `/customers/search${queryParams ? `?${queryParams}` : ''}`;

  const response = await makeVagaroRequest(credentials, endpoint);
  logger.info(`[VAGARO] Found ${response.data?.length || 0} customers matching search for merchant ${credentials.merchantId}`);
  return response.data || [];
}

/**
 * Get specific customer by ID
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} customerId - Vagaro customer ID
 * @returns {Promise<object>} Customer details
 */
async function getCustomer(credentials, customerId) {
  const response = await makeVagaroRequest(credentials, `/customers/${customerId}`);
  return response.data;
}

/**
 * Create new customer in Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @param {object} customerData - Customer details
 * @returns {Promise<object>} Created customer
 */
async function createCustomer(credentials, customerData) {
  const response = await makeVagaroRequest(credentials, '/customers', {
    method: 'POST',
    body: JSON.stringify(customerData)
  });

  logger.info(`[VAGARO] Created customer: ${response.data.id} for merchant ${credentials.merchantId}`);
  return response.data;
}

/**
 * Update existing customer in Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} customerId - Vagaro customer ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated customer
 */
async function updateCustomer(credentials, customerId, updates) {
  const response = await makeVagaroRequest(credentials, `/customers/${customerId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });

  logger.info(`[VAGARO] Updated customer: ${customerId} for merchant ${credentials.merchantId}`);
  return response.data;
}

// =====================================================
// APPOINTMENT APIs
// =====================================================

/**
 * Search for available appointment slots
 * @param {object} credentials - Client's Vagaro credentials
 * @param {object} searchParams - Search parameters
 * @returns {Promise<Array>} List of available time slots
 */
async function searchAppointmentAvailability(credentials, searchParams) {
  const { serviceId, employeeId, locationId, date, duration } = searchParams;

  const queryParams = new URLSearchParams({
    serviceId,
    ...(employeeId && { employeeId }),
    ...(locationId && { locationId }),
    date,
    ...(duration && { duration })
  }).toString();

  const endpoint = `/appointments/availability?${queryParams}`;

  const response = await makeVagaroRequest(credentials, endpoint);
  logger.info(`[VAGARO] Found ${response.data?.length || 0} available slots for merchant ${credentials.merchantId}`);
  return response.data || [];
}

/**
 * Get specific appointment by ID
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} appointmentId - Vagaro appointment ID
 * @returns {Promise<object>} Appointment details
 */
async function getAppointment(credentials, appointmentId) {
  const response = await makeVagaroRequest(credentials, `/appointments/${appointmentId}`);
  return response.data;
}

/**
 * Get appointments for a date range
 * @param {object} credentials - Client's Vagaro credentials
 * @param {object} params - Query parameters (startDate, endDate, status, customerId, etc.)
 * @returns {Promise<Array>} List of appointments
 */
async function getAppointments(credentials, params = {}) {
  const queryParams = new URLSearchParams(params).toString();
  const endpoint = `/appointments${queryParams ? `?${queryParams}` : ''}`;

  const response = await makeVagaroRequest(credentials, endpoint);
  logger.info(`[VAGARO] Retrieved ${response.data?.length || 0} appointments for merchant ${credentials.merchantId}`);
  return response.data || [];
}

/**
 * Create new appointment in Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @param {object} appointmentData - Appointment details
 * @returns {Promise<object>} Created appointment
 */
async function createAppointment(credentials, appointmentData) {
  const response = await makeVagaroRequest(credentials, '/appointments', {
    method: 'POST',
    body: JSON.stringify(appointmentData)
  });

  logger.info(`[VAGARO] ✅ Created appointment: ${response.data.id} for merchant ${credentials.merchantId}`);
  return response.data;
}

/**
 * Update existing appointment in Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} appointmentId - Vagaro appointment ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated appointment
 */
async function updateAppointment(credentials, appointmentId, updates) {
  const response = await makeVagaroRequest(credentials, `/appointments/${appointmentId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });

  logger.info(`[VAGARO] Updated appointment: ${appointmentId} for merchant ${credentials.merchantId}`);
  return response.data;
}

/**
 * Cancel appointment in Vagaro
 * @param {object} credentials - Client's Vagaro credentials
 * @param {string} appointmentId - Vagaro appointment ID
 * @returns {Promise<boolean>} Success status
 */
async function cancelAppointment(credentials, appointmentId) {
  await makeVagaroRequest(credentials, `/appointments/${appointmentId}/cancel`, {
    method: 'POST'
  });

  logger.info(`[VAGARO] Cancelled appointment: ${appointmentId} for merchant ${credentials.merchantId}`);
  return true;
}

// =====================================================
// SYNC FUNCTIONS (RinglyPro ↔ Vagaro)
// =====================================================

/**
 * Sync Vagaro appointment to RinglyPro database
 * @param {object} vagaroAppointment - Vagaro appointment data
 * @param {object} sequelize - Database connection
 * @returns {Promise<object>} Synced appointment
 */
async function syncAppointmentToRinglyPro(vagaroAppointment, sequelize) {
  const { QueryTypes } = require('sequelize');

  try {
    // Check if appointment already exists by Vagaro ID
    const [existingAppointment] = await sequelize.query(
      'SELECT id FROM appointments WHERE vagaro_id = :vagaroId',
      {
        replacements: { vagaroId: vagaroAppointment.id },
        type: QueryTypes.SELECT
      }
    );

    if (existingAppointment) {
      // Update existing appointment
      await sequelize.query(
        `UPDATE appointments
         SET appointment_date = :date,
             appointment_time = :time,
             service_type = :service,
             status = :status,
             notes = :notes,
             updated_at = NOW()
         WHERE vagaro_id = :vagaroId`,
        {
          replacements: {
            date: vagaroAppointment.date,
            time: vagaroAppointment.time,
            service: vagaroAppointment.service?.name || 'Service',
            status: mapVagaroStatus(vagaroAppointment.status),
            notes: vagaroAppointment.notes || '',
            vagaroId: vagaroAppointment.id
          },
          type: QueryTypes.UPDATE
        }
      );

      logger.info(`[VAGARO] Updated RinglyPro appointment for Vagaro ID ${vagaroAppointment.id}`);
      return existingAppointment;
    } else {
      // Create new appointment
      const [newAppointment] = await sequelize.query(
        `INSERT INTO appointments (
          contact_id, appointment_date, appointment_time, service_type,
          status, notes, vagaro_id, created_at, updated_at
         )
         VALUES (
          (SELECT id FROM contacts WHERE phone_number = :phone LIMIT 1),
          :date, :time, :service, :status, :notes, :vagaroId, NOW(), NOW()
         )
         RETURNING id`,
        {
          replacements: {
            phone: vagaroAppointment.customer?.phone || '',
            date: vagaroAppointment.date,
            time: vagaroAppointment.time,
            service: vagaroAppointment.service?.name || 'Service',
            status: mapVagaroStatus(vagaroAppointment.status),
            notes: vagaroAppointment.notes || '',
            vagaroId: vagaroAppointment.id
          },
          type: QueryTypes.INSERT
        }
      );

      logger.info(`[VAGARO] Created new RinglyPro appointment for Vagaro ID ${vagaroAppointment.id}`);
      return newAppointment[0];
    }
  } catch (error) {
    logger.error(`[VAGARO] Failed to sync appointment: ${error.message}`);
    throw error;
  }
}

/**
 * Sync Vagaro customer to RinglyPro database
 * @param {object} vagaroCustomer - Vagaro customer data
 * @param {object} sequelize - Database connection
 * @returns {Promise<object>} Synced contact
 */
async function syncCustomerToRinglyPro(vagaroCustomer, sequelize) {
  const { QueryTypes } = require('sequelize');

  try {
    // Check if contact already exists by Vagaro ID or phone
    const [existingContact] = await sequelize.query(
      `SELECT id FROM contacts
       WHERE vagaro_id = :vagaroId OR phone_number = :phone
       LIMIT 1`,
      {
        replacements: {
          vagaroId: vagaroCustomer.id,
          phone: vagaroCustomer.phone || ''
        },
        type: QueryTypes.SELECT
      }
    );

    if (existingContact) {
      // Update existing contact
      await sequelize.query(
        `UPDATE contacts
         SET first_name = :firstName,
             last_name = :lastName,
             email = :email,
             phone_number = :phone,
             vagaro_id = :vagaroId,
             updated_at = NOW()
         WHERE id = :contactId`,
        {
          replacements: {
            firstName: vagaroCustomer.firstName || '',
            lastName: vagaroCustomer.lastName || '',
            email: vagaroCustomer.email || '',
            phone: vagaroCustomer.phone || '',
            vagaroId: vagaroCustomer.id,
            contactId: existingContact.id
          },
          type: QueryTypes.UPDATE
        }
      );

      logger.info(`[VAGARO] Updated RinglyPro contact for Vagaro customer ${vagaroCustomer.id}`);
      return existingContact;
    } else {
      // Create new contact
      const [newContact] = await sequelize.query(
        `INSERT INTO contacts (
          first_name, last_name, email, phone_number, vagaro_id,
          created_at, updated_at
         )
         VALUES (
          :firstName, :lastName, :email, :phone, :vagaroId,
          NOW(), NOW()
         )
         RETURNING id`,
        {
          replacements: {
            firstName: vagaroCustomer.firstName || '',
            lastName: vagaroCustomer.lastName || '',
            email: vagaroCustomer.email || '',
            phone: vagaroCustomer.phone || '',
            vagaroId: vagaroCustomer.id
          },
          type: QueryTypes.INSERT
        }
      );

      logger.info(`[VAGARO] Created new RinglyPro contact for Vagaro customer ${vagaroCustomer.id}`);
      return newContact[0];
    }
  } catch (error) {
    logger.error(`[VAGARO] Failed to sync customer: ${error.message}`);
    throw error;
  }
}

/**
 * Map Vagaro appointment status to RinglyPro status
 * @param {string} vagaroStatus - Vagaro status
 * @returns {string} RinglyPro status
 */
function mapVagaroStatus(vagaroStatus) {
  const statusMap = {
    'confirmed': 'confirmed',
    'pending': 'pending',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'no_show': 'no-show',
    'noshow': 'no-show'
  };

  return statusMap[vagaroStatus?.toLowerCase()] || 'pending';
}

/**
 * Check if Vagaro integration is configured for a client
 * @param {object} credentials - Client's Vagaro credentials
 * @returns {boolean} Configuration status
 */
function isConfigured(credentials) {
  return !!(
    credentials?.clientId &&
    credentials?.clientSecretKey &&
    credentials?.merchantId
  );
}

/**
 * Get Vagaro integration status for a client
 * @param {object} credentials - Client's Vagaro credentials
 * @returns {object} Status information
 */
async function getIntegrationStatus(credentials) {
  if (!isConfigured(credentials)) {
    return {
      configured: false,
      message: 'Vagaro OAuth credentials not configured. Please add clientId, clientSecretKey, and merchantId in Settings.'
    };
  }

  try {
    // Test connection by generating access token
    await generateAccessToken(credentials);

    // Test API access by fetching locations
    await getLocations(credentials);

    return {
      configured: true,
      connected: true,
      message: 'Vagaro integration is active and working'
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      message: `Connection error: ${error.message}`
    };
  }
}

/**
 * Clear token cache for a merchant (useful for testing or manual refresh)
 * @param {string} merchantId - Merchant ID to clear cache for
 */
function clearTokenCache(merchantId) {
  if (merchantId) {
    tokenCache.delete(merchantId);
    logger.info(`[VAGARO] Cleared token cache for merchant ${merchantId}`);
  } else {
    tokenCache.clear();
    logger.info('[VAGARO] Cleared entire token cache');
  }
}

module.exports = {
  // Authentication
  generateAccessToken,
  clearTokenCache,

  // Business / Locations
  getLocations,
  getServices,

  // Employees
  getEmployees,
  getEmployee,

  // Customers
  searchCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,

  // Appointments
  searchAppointmentAvailability,
  getAppointment,
  getAppointments,
  createAppointment,
  updateAppointment,
  cancelAppointment,

  // Sync
  syncAppointmentToRinglyPro,
  syncCustomerToRinglyPro,

  // Status
  isConfigured,
  getIntegrationStatus
};
