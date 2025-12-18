/**
 * Vagaro MCP Proxy
 * Handles Vagaro salon/spa scheduling API integration for MCP Copilot
 *
 * This proxy wraps the vagaroService for MCP command operations.
 * Uses OAuth 2.0 with client credentials for authentication.
 *
 * Supported Operations:
 * - Customer search/create/update
 * - Appointment listing/booking/cancellation
 * - Employee listing
 * - Service listing
 * - Location info
 */

const vagaroService = require('../../src/services/vagaroService');

// Error codes for AI-friendly error handling
const VAGARO_ERRORS = {
  AUTH_FAILED: 'VAGARO_AUTH_FAILED',
  CREDENTIALS_MISSING: 'VAGARO_CREDENTIALS_MISSING',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_AVAILABILITY: 'NO_AVAILABILITY',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  API_ERROR: 'VAGARO_API_ERROR'
};

class VagaroMCPProxy {
  /**
   * Initialize Vagaro MCP Proxy
   * @param {object} credentials - Vagaro OAuth credentials
   * @param {string} credentials.clientId - OAuth Client ID
   * @param {string} credentials.clientSecretKey - OAuth Client Secret
   * @param {string} credentials.merchantId - Vagaro Merchant ID
   * @param {string} credentials.region - API region (us01-us05)
   */
  constructor(credentials) {
    this.credentials = credentials;
    this.merchantId = credentials.merchantId;

    // Validate required credentials
    if (!credentials.clientId || !credentials.clientSecretKey || !credentials.merchantId) {
      const error = new Error('Missing required Vagaro credentials: clientId, clientSecretKey, and merchantId are required');
      error.code = VAGARO_ERRORS.CREDENTIALS_MISSING;
      throw error;
    }

    console.log(`[VagaroMCPProxy] Initialized for merchant ${this.merchantId}`);
  }

  // ===========================================
  // CUSTOMER OPERATIONS
  // ===========================================

  /**
   * Search customers by phone, email, or name
   * @param {string} query - Search query (phone, email, or name)
   * @param {number} limit - Max results to return
   * @returns {Promise<Array>} Matching customers
   */
  async searchCustomers(query, limit = 10) {
    try {
      // Determine search type based on query format
      const searchParams = {};

      if (query.includes('@')) {
        searchParams.email = query;
      } else if (/^\d+$/.test(query.replace(/\D/g, '')) && query.replace(/\D/g, '').length >= 10) {
        searchParams.phone = query.replace(/\D/g, '');
      } else {
        searchParams.name = query;
      }

      const customers = await vagaroService.searchCustomers(this.credentials, searchParams);
      return customers.slice(0, limit);
    } catch (error) {
      console.error('[VagaroMCPProxy] Search customers error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Get customer by ID
   * @param {string} customerId - Vagaro customer ID
   * @returns {Promise<object>} Customer details
   */
  async getCustomer(customerId) {
    try {
      return await vagaroService.getCustomer(this.credentials, customerId);
    } catch (error) {
      console.error('[VagaroMCPProxy] Get customer error:', error.message);
      if (error.message.includes('404')) {
        error.code = VAGARO_ERRORS.CUSTOMER_NOT_FOUND;
      }
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Create a new customer
   * @param {object} customerData - Customer information
   * @returns {Promise<object>} Created customer
   */
  async createCustomer(customerData) {
    try {
      // Normalize phone to digits only
      if (customerData.phone) {
        customerData.phone = customerData.phone.replace(/\D/g, '');
      }

      return await vagaroService.createCustomer(this.credentials, customerData);
    } catch (error) {
      console.error('[VagaroMCPProxy] Create customer error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Update customer information
   * @param {string} customerId - Customer ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated customer
   */
  async updateCustomer(customerId, updates) {
    try {
      return await vagaroService.updateCustomer(this.credentials, customerId, updates);
    } catch (error) {
      console.error('[VagaroMCPProxy] Update customer error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Find or create customer by phone/email
   * @param {object} customerInfo - { phone, email, firstName, lastName }
   * @returns {Promise<object>} { customer, isNew }
   */
  async findOrCreateCustomer(customerInfo) {
    const { phone, email, firstName, lastName } = customerInfo;

    // Try to find by phone first
    if (phone) {
      const existing = await this.searchCustomers(phone, 1);
      if (existing.length > 0) {
        return { customer: existing[0], isNew: false };
      }
    }

    // Try email next
    if (email) {
      const existing = await this.searchCustomers(email, 1);
      if (existing.length > 0) {
        return { customer: existing[0], isNew: false };
      }
    }

    // Create new customer
    const newCustomer = await this.createCustomer({
      firstName: firstName || '',
      lastName: lastName || '',
      phone: phone || '',
      email: email || ''
    });

    return { customer: newCustomer, isNew: true };
  }

  // ===========================================
  // APPOINTMENT OPERATIONS
  // ===========================================

  /**
   * Get appointments within date range
   * @param {object} params - Query parameters
   * @param {string} params.startDate - Start date (ISO string or YYYY-MM-DD)
   * @param {string} params.endDate - End date (ISO string or YYYY-MM-DD)
   * @param {string} params.status - Filter by status
   * @param {string} params.customerId - Filter by customer
   * @returns {Promise<Array>} List of appointments
   */
  async getAppointments(params = {}) {
    try {
      // Default to today + 30 days if no dates provided
      if (!params.startDate) {
        const today = new Date();
        params.startDate = today.toISOString().split('T')[0];
      }
      if (!params.endDate) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        params.endDate = endDate.toISOString().split('T')[0];
      }

      return await vagaroService.getAppointments(this.credentials, params);
    } catch (error) {
      console.error('[VagaroMCPProxy] Get appointments error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Get specific appointment by ID
   * @param {string} appointmentId - Vagaro appointment ID
   * @returns {Promise<object>} Appointment details
   */
  async getAppointment(appointmentId) {
    try {
      return await vagaroService.getAppointment(this.credentials, appointmentId);
    } catch (error) {
      console.error('[VagaroMCPProxy] Get appointment error:', error.message);
      if (error.message.includes('404')) {
        error.code = VAGARO_ERRORS.APPOINTMENT_NOT_FOUND;
      }
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Get available time slots for booking
   * @param {object} params - Search parameters
   * @param {string} params.serviceId - Service ID (required)
   * @param {string} params.date - Date to check (YYYY-MM-DD)
   * @param {string} params.employeeId - Specific employee (optional)
   * @param {string} params.locationId - Location (optional)
   * @returns {Promise<Array>} Available time slots
   */
  async getAvailability(params) {
    try {
      const slots = await vagaroService.searchAppointmentAvailability(this.credentials, params);

      if (!slots || slots.length === 0) {
        console.warn(`[VagaroMCPProxy] No availability found for date ${params.date}`);
      }

      return slots;
    } catch (error) {
      console.error('[VagaroMCPProxy] Get availability error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Create appointment
   * @param {object} appointmentData - Appointment details
   * @returns {Promise<object>} Created appointment
   */
  async createAppointment(appointmentData) {
    try {
      return await vagaroService.createAppointment(this.credentials, appointmentData);
    } catch (error) {
      console.error('[VagaroMCPProxy] Create appointment error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Update appointment
   * @param {string} appointmentId - Appointment ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated appointment
   */
  async updateAppointment(appointmentId, updates) {
    try {
      return await vagaroService.updateAppointment(this.credentials, appointmentId, updates);
    } catch (error) {
      console.error('[VagaroMCPProxy] Update appointment error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Cancel appointment
   * @param {string} appointmentId - Appointment ID
   * @returns {Promise<boolean>} Success status
   */
  async cancelAppointment(appointmentId) {
    try {
      await vagaroService.cancelAppointment(this.credentials, appointmentId);
      return true;
    } catch (error) {
      console.error('[VagaroMCPProxy] Cancel appointment error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  // ===========================================
  // BUSINESS DATA OPERATIONS
  // ===========================================

  /**
   * Get business locations
   * @returns {Promise<Array>} List of locations
   */
  async getLocations() {
    try {
      return await vagaroService.getLocations(this.credentials);
    } catch (error) {
      console.error('[VagaroMCPProxy] Get locations error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Get services offered
   * @param {string} locationId - Optional location filter
   * @returns {Promise<Array>} List of services
   */
  async getServices(locationId = null) {
    try {
      return await vagaroService.getServices(this.credentials, locationId);
    } catch (error) {
      console.error('[VagaroMCPProxy] Get services error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Get employees/providers
   * @param {string} locationId - Optional location filter
   * @returns {Promise<Array>} List of employees
   */
  async getEmployees(locationId = null) {
    try {
      return await vagaroService.getEmployees(this.credentials, locationId);
    } catch (error) {
      console.error('[VagaroMCPProxy] Get employees error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  /**
   * Get specific employee
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Employee details
   */
  async getEmployee(employeeId) {
    try {
      return await vagaroService.getEmployee(this.credentials, employeeId);
    } catch (error) {
      console.error('[VagaroMCPProxy] Get employee error:', error.message);
      this._enhanceError(error);
      throw error;
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  /**
   * Test connection to Vagaro
   * @returns {Promise<object>} Connection status
   */
  async testConnection() {
    try {
      // Try to get locations as a simple connection test
      const locations = await vagaroService.getLocations(this.credentials);
      return {
        success: true,
        connected: true,
        merchantId: this.merchantId,
        locationCount: locations.length,
        message: `Connected to Vagaro (${locations.length} location(s))`
      };
    } catch (error) {
      return {
        success: false,
        connected: false,
        error: error.code || 'CONNECTION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get integration status
   * @returns {Promise<object>} Status info
   */
  async getStatus() {
    try {
      const status = await vagaroService.getIntegrationStatus(this.credentials);
      return status;
    } catch (error) {
      return {
        configured: false,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Enhance error with standard error codes
   * @param {Error} error - Error to enhance
   */
  _enhanceError(error) {
    if (!error.code) {
      if (error.message.includes('401') || error.message.includes('auth')) {
        error.code = VAGARO_ERRORS.AUTH_FAILED;
      } else if (error.message.includes('429')) {
        error.code = VAGARO_ERRORS.RATE_LIMITED;
      } else if (error.message.includes('400') || error.message.includes('validation')) {
        error.code = VAGARO_ERRORS.VALIDATION_ERROR;
      } else {
        error.code = VAGARO_ERRORS.API_ERROR;
      }
    }
  }
}

// Export error codes for consumers
VagaroMCPProxy.ERRORS = VAGARO_ERRORS;

module.exports = VagaroMCPProxy;
