# Vagaro Integration Completion Guide

## Overview

This document provides complete instructions for finishing the ElevenLabs → RinglyPro → Vagaro booking integration. Use this guide once a RinglyPro client has provided their Vagaro API credentials.

**Current Status:**
- [x] Vagaro settings form (`/settings/vagaro`) - COMPLETE
- [x] Vagaro settings card in dashboard - COMPLETE
- [x] Multi-tenant webhook endpoint (`/api/mcp/webhooks/vagaro`) - COMPLETE & TESTED
- [x] Webhook token registration (`/api/mcp/vagaro/register-webhook`) - COMPLETE & TESTED
- [x] Vagaro API proxy in mcp-integrations - COMPLETE
- [ ] ElevenLabs tools → Vagaro booking connection - **NEEDS IMPLEMENTATION**
- [ ] Vagaro availability checking - **NEEDS IMPLEMENTATION**
- [ ] End-to-end testing with real credentials - **PENDING CREDENTIALS**

---

## Part 1: Database Schema for Vagaro Settings

### 1.1 Check if Vagaro columns exist in clients table

```sql
-- Check current schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients'
AND column_name LIKE '%vagaro%';
```

### 1.2 Add Vagaro columns if missing

```sql
-- Add Vagaro integration columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_enabled BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_client_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_client_secret_key TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_merchant_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_webhook_token TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_region VARCHAR(10) DEFAULT 'us01';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_access_token TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vagaro_token_expires_at TIMESTAMP;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_vagaro_merchant_id ON clients(vagaro_merchant_id);
```

---

## Part 2: Vagaro Service Implementation

### 2.1 Create Vagaro Booking Service

Create file: `src/services/vagaroBookingService.js`

```javascript
/**
 * Vagaro Booking Service
 *
 * Handles all Vagaro API interactions for booking appointments,
 * checking availability, and managing customers.
 *
 * API Documentation: https://docs.vagaro.com/public/docs/
 */

const axios = require('axios');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');

// Vagaro API base URLs by region
const VAGARO_API_URLS = {
  'us01': 'https://api.vagaro.com',
  'us02': 'https://api-us02.vagaro.com',
  'ca01': 'https://api-ca01.vagaro.com',
  'uk01': 'https://api-uk01.vagaro.com',
  'au01': 'https://api-au01.vagaro.com'
};

class VagaroBookingService {

  /**
   * Get Vagaro credentials for a client
   */
  async getClientVagaroCredentials(clientId) {
    const [client] = await sequelize.query(`
      SELECT
        vagaro_enabled,
        vagaro_client_id,
        vagaro_client_secret_key,
        vagaro_merchant_id,
        vagaro_webhook_token,
        vagaro_region,
        vagaro_access_token,
        vagaro_token_expires_at
      FROM clients
      WHERE id = :clientId AND active = true
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    if (!client) {
      throw new Error(`Client ${clientId} not found or inactive`);
    }

    if (!client.vagaro_enabled) {
      throw new Error(`Vagaro integration not enabled for client ${clientId}`);
    }

    if (!client.vagaro_client_id || !client.vagaro_client_secret_key || !client.vagaro_merchant_id) {
      throw new Error(`Vagaro credentials incomplete for client ${clientId}`);
    }

    return {
      clientId: client.vagaro_client_id,
      clientSecretKey: client.vagaro_client_secret_key,
      merchantId: client.vagaro_merchant_id,
      webhookToken: client.vagaro_webhook_token,
      region: client.vagaro_region || 'us01',
      accessToken: client.vagaro_access_token,
      tokenExpiresAt: client.vagaro_token_expires_at
    };
  }

  /**
   * Get API base URL for region
   */
  getApiUrl(region) {
    return VAGARO_API_URLS[region] || VAGARO_API_URLS['us01'];
  }

  /**
   * Get OAuth access token (with caching)
   */
  async getAccessToken(clientId) {
    const creds = await this.getClientVagaroCredentials(clientId);

    // Check if existing token is still valid (with 5 min buffer)
    if (creds.accessToken && creds.tokenExpiresAt) {
      const expiresAt = new Date(creds.tokenExpiresAt);
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      if (expiresAt.getTime() - Date.now() > bufferTime) {
        return creds.accessToken;
      }
    }

    // Get new token
    const apiUrl = this.getApiUrl(creds.region);

    try {
      const response = await axios.post(`${apiUrl}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecretKey
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const { access_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + (expires_in * 1000));

      // Store token in database
      await sequelize.query(`
        UPDATE clients
        SET vagaro_access_token = :accessToken,
            vagaro_token_expires_at = :expiresAt
        WHERE id = :clientId
      `, {
        replacements: {
          accessToken: access_token,
          expiresAt: expiresAt.toISOString(),
          clientId
        },
        type: QueryTypes.UPDATE
      });

      logger.info(`[Vagaro] Refreshed access token for client ${clientId}`);
      return access_token;

    } catch (error) {
      logger.error(`[Vagaro] OAuth token error for client ${clientId}:`, error.response?.data || error.message);
      throw new Error(`Failed to authenticate with Vagaro: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Make authenticated API request to Vagaro
   */
  async apiRequest(clientId, method, endpoint, data = null) {
    const creds = await this.getClientVagaroCredentials(clientId);
    const accessToken = await this.getAccessToken(clientId);
    const apiUrl = this.getApiUrl(creds.region);

    const config = {
      method,
      url: `${apiUrl}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Merchant-Id': creds.merchantId
      }
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`[Vagaro] API error ${method} ${endpoint}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get available services for the business
   */
  async getServices(clientId) {
    try {
      const response = await this.apiRequest(clientId, 'GET', '/v1/services');
      return {
        success: true,
        services: response.data || response
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get staff/employees
   */
  async getStaff(clientId) {
    try {
      const response = await this.apiRequest(clientId, 'GET', '/v1/employees');
      return {
        success: true,
        staff: response.data || response
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Check availability for a service
   * @param {number} clientId - RinglyPro client ID
   * @param {object} params - { serviceId, staffId, date, days }
   */
  async checkAvailability(clientId, params) {
    const { serviceId, staffId, date, days = 7 } = params;

    try {
      const queryParams = new URLSearchParams({
        service_id: serviceId,
        date: date, // YYYY-MM-DD format
        days: days
      });

      if (staffId) {
        queryParams.append('employee_id', staffId);
      }

      const response = await this.apiRequest(
        clientId,
        'GET',
        `/v1/availability?${queryParams.toString()}`
      );

      // Transform Vagaro response to standard format
      const slots = [];
      if (response.data || response.availability) {
        const availability = response.data || response.availability;
        for (const day of availability) {
          for (const slot of day.slots || []) {
            slots.push({
              date: day.date,
              time: slot.start_time,
              endTime: slot.end_time,
              staffId: slot.employee_id,
              staffName: slot.employee_name,
              available: slot.available !== false
            });
          }
        }
      }

      return {
        success: true,
        available_slots: slots,
        total_slots: slots.length
      };

    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        available_slots: []
      };
    }
  }

  /**
   * Create or find customer in Vagaro
   */
  async findOrCreateCustomer(clientId, customerData) {
    const { firstName, lastName, phone, email } = customerData;

    try {
      // First, try to find existing customer by phone
      const searchResponse = await this.apiRequest(
        clientId,
        'GET',
        `/v1/customers?phone=${encodeURIComponent(phone)}`
      );

      const customers = searchResponse.data || searchResponse.customers || [];
      if (customers.length > 0) {
        logger.info(`[Vagaro] Found existing customer: ${customers[0].id}`);
        return {
          success: true,
          customer: customers[0],
          isNew: false
        };
      }

      // Create new customer
      const createResponse = await this.apiRequest(clientId, 'POST', '/v1/customers', {
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        email: email,
        send_notifications: true
      });

      logger.info(`[Vagaro] Created new customer: ${createResponse.id}`);
      return {
        success: true,
        customer: createResponse.data || createResponse,
        isNew: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Book an appointment in Vagaro
   * @param {number} clientId - RinglyPro client ID
   * @param {object} bookingData - Appointment details
   */
  async bookAppointment(clientId, bookingData) {
    const {
      customerName,
      customerPhone,
      customerEmail,
      serviceId,
      staffId,
      startTime,    // ISO 8601 format: 2026-01-15T14:00:00
      date,         // Alternative: YYYY-MM-DD
      time,         // Alternative: HH:MM
      duration,
      notes
    } = bookingData;

    try {
      // Parse customer name
      const nameParts = customerName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || 'Customer';

      // Find or create customer
      const customerResult = await this.findOrCreateCustomer(clientId, {
        firstName,
        lastName,
        phone: customerPhone,
        email: customerEmail
      });

      if (!customerResult.success) {
        return {
          success: false,
          error: `Failed to create customer: ${customerResult.error}`
        };
      }

      const customerId = customerResult.customer.id;

      // Build appointment datetime
      let appointmentDateTime;
      if (startTime) {
        appointmentDateTime = startTime;
      } else if (date && time) {
        appointmentDateTime = `${date}T${time}:00`;
      } else {
        return {
          success: false,
          error: 'Missing appointment date/time'
        };
      }

      // Create appointment
      const appointmentData = {
        customer_id: customerId,
        service_id: serviceId,
        start_time: appointmentDateTime,
        notes: notes || 'Booked via RinglyPro AI Assistant'
      };

      if (staffId) {
        appointmentData.employee_id = staffId;
      }

      if (duration) {
        appointmentData.duration = duration;
      }

      const response = await this.apiRequest(clientId, 'POST', '/v1/appointments', appointmentData);

      const appointment = response.data || response;

      logger.info(`[Vagaro] Appointment booked successfully: ${appointment.id}`);

      return {
        success: true,
        booked: true,
        appointment: {
          id: appointment.id,
          confirmationCode: appointment.confirmation_code || appointment.id,
          startTime: appointment.start_time,
          endTime: appointment.end_time,
          service: appointment.service_name,
          staff: appointment.employee_name,
          customer: {
            id: customerId,
            name: customerName,
            phone: customerPhone
          }
        },
        message: `Appointment booked for ${customerName} on ${appointmentDateTime}`
      };

    } catch (error) {
      logger.error(`[Vagaro] Booking error:`, error.response?.data || error.message);

      return {
        success: false,
        booked: false,
        error: error.response?.data?.message || error.message,
        code: error.response?.data?.code || 'BOOKING_ERROR'
      };
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(clientId, appointmentId, reason = 'Cancelled via RinglyPro') {
    try {
      await this.apiRequest(clientId, 'DELETE', `/v1/appointments/${appointmentId}`, {
        cancellation_reason: reason
      });

      logger.info(`[Vagaro] Appointment ${appointmentId} cancelled`);
      return {
        success: true,
        message: `Appointment ${appointmentId} cancelled`
      };

    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(clientId, appointmentId, newStartTime) {
    try {
      const response = await this.apiRequest(
        clientId,
        'PATCH',
        `/v1/appointments/${appointmentId}`,
        { start_time: newStartTime }
      );

      logger.info(`[Vagaro] Appointment ${appointmentId} rescheduled to ${newStartTime}`);
      return {
        success: true,
        appointment: response.data || response,
        message: `Appointment rescheduled to ${newStartTime}`
      };

    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Test connection to Vagaro API
   */
  async testConnection(clientId) {
    try {
      await this.getAccessToken(clientId);
      const services = await this.getServices(clientId);

      return {
        success: true,
        message: 'Successfully connected to Vagaro API',
        servicesCount: services.services?.length || 0
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new VagaroBookingService();
```

---

## Part 3: Update ElevenLabs Tools Route

### 3.1 Modify `src/routes/elevenlabs-tools.js`

Add Vagaro support to the existing booking handler. Add these imports at the top:

```javascript
const vagaroBookingService = require('../services/vagaroBookingService');
```

### 3.2 Update the `handleBookAppointment` function

Replace the existing `handleBookAppointment` function with this enhanced version that supports both GHL and Vagaro:

```javascript
/**
 * Book an appointment - supports both GHL and Vagaro
 */
async function handleBookAppointment(params) {
  const {
    client_id,
    customer_name,
    first_name,
    last_name,
    customer_phone,
    phone,
    customer_email,
    email,
    appointment_date,
    date,
    appointment_time,
    time,
    start_time,
    startTime,
    duration = 30,
    purpose = 'Phone booking via AI Assistant',
    service_id,
    service_name,
    staff_id,
    ghl_calendar_id,
    ghl_contact_id
  } = params;

  if (!client_id) {
    return { success: false, error: 'Missing client_id' };
  }

  try {
    // Normalize input
    const name = customer_name || `${first_name || ''} ${last_name || ''}`.trim();
    const phoneNum = customer_phone || phone;
    const emailAddr = customer_email || email;
    const aptDate = appointment_date || date;
    const aptTime = appointment_time || time || start_time || startTime;

    if (!name || !phoneNum) {
      return { success: false, error: 'Missing required fields: customer_name/first_name and phone' };
    }

    if (!aptDate && !aptTime && !startTime) {
      return { success: false, error: 'Missing appointment date/time' };
    }

    // Parse datetime
    let finalDate = aptDate;
    let finalTime = aptTime;

    if (startTime && startTime.includes('T')) {
      const dt = new Date(startTime);
      finalDate = dt.toISOString().split('T')[0];
      finalTime = dt.toISOString().split('T')[1].substring(0, 5);
    }

    // Check which booking system the client uses
    const [client] = await sequelize.query(`
      SELECT
        vagaro_enabled,
        vagaro_merchant_id,
        settings->'integration'->'ghl' as ghl_settings
      FROM clients
      WHERE id = :clientId AND active = true
    `, {
      replacements: { clientId: client_id },
      type: QueryTypes.SELECT
    });

    if (!client) {
      return { success: false, error: `Client ${client_id} not found` };
    }

    // ========== VAGARO BOOKING ==========
    if (client.vagaro_enabled && client.vagaro_merchant_id) {
      logger.info(`[ElevenLabs Tools] Using VAGARO for client ${client_id}`);

      const vagaroResult = await vagaroBookingService.bookAppointment(client_id, {
        customerName: name,
        customerPhone: phoneNum,
        customerEmail: emailAddr || `${phoneNum.replace(/\D/g, '')}@phone.ringlypro.com`,
        serviceId: service_id,
        staffId: staff_id,
        date: finalDate,
        time: finalTime,
        duration: parseInt(duration),
        notes: purpose
      });

      if (vagaroResult.success) {
        return {
          success: true,
          booking_system: 'vagaro',
          message: `Appointment booked successfully for ${name}`,
          appointment_id: vagaroResult.appointment?.id,
          confirmation_code: vagaroResult.appointment?.confirmationCode,
          appointment_date: finalDate,
          appointment_time: finalTime,
          customer_name: name,
          customer_phone: phoneNum
        };
      } else {
        return {
          success: false,
          booking_system: 'vagaro',
          error: vagaroResult.error
        };
      }
    }

    // ========== GHL/RINGLYPRO BOOKING (existing logic) ==========
    logger.info(`[ElevenLabs Tools] Using GHL/RinglyPro for client ${client_id}`);

    const appointmentData = {
      customer_name: name,
      customer_phone: phoneNum,
      customer_email: emailAddr || `${phoneNum.replace(/\D/g, '')}@phone.ringlypro.com`,
      appointment_date: finalDate,
      appointment_time: finalTime,
      duration: parseInt(duration),
      purpose,
      source: 'voice_booking'
    };

    // Use the appointment service to create in RinglyPro
    const result = await appointmentService.bookAppointment(client_id, appointmentData);

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to book appointment' };
    }

    // Also sync to GHL if configured
    const ghlSettings = client.ghl_settings;
    if (ghlSettings && ghlSettings.locationId) {
      try {
        const ghlResult = await ghlBookingService.bookFromWhatsApp(client_id, {
          customerName: name,
          customerPhone: phoneNum,
          customerEmail: emailAddr,
          appointmentDate: finalDate,
          appointmentTime: finalTime,
          duration,
          calendarId: ghl_calendar_id
        });

        if (ghlResult.success) {
          logger.info(`[ElevenLabs Tools] GHL sync SUCCESS: ${ghlResult.appointment?.id}`);
        } else {
          logger.error(`[ElevenLabs Tools] GHL sync FAILED: ${ghlResult.error}`);
        }
      } catch (ghlError) {
        logger.error('[ElevenLabs Tools] GHL sync error:', ghlError);
      }
    }

    return {
      success: true,
      booking_system: 'ringlypro_ghl',
      message: `Appointment booked successfully for ${name}`,
      appointment_id: result.appointment?.id,
      confirmation_code: result.confirmation_code || result.appointment?.confirmation_code,
      appointment_date: finalDate,
      appointment_time: finalTime,
      customer_name: name,
      customer_phone: phoneNum
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] book_appointment error:', error);
    return { success: false, error: error.message };
  }
}
```

### 3.3 Add Vagaro-specific availability handler

Add this new function to `elevenlabs-tools.js`:

```javascript
/**
 * Check Vagaro availability specifically
 */
async function handleCheckVagaroAvailability(params) {
  const { client_id, service_id, staff_id, date, days = 7 } = params;

  if (!client_id) {
    return { success: false, error: 'Missing client_id' };
  }

  try {
    // Check if client uses Vagaro
    const [client] = await sequelize.query(`
      SELECT vagaro_enabled, vagaro_merchant_id
      FROM clients
      WHERE id = :clientId AND active = true
    `, {
      replacements: { clientId: client_id },
      type: QueryTypes.SELECT
    });

    if (!client?.vagaro_enabled) {
      return { success: false, error: 'Vagaro not enabled for this client' };
    }

    const result = await vagaroBookingService.checkAvailability(client_id, {
      serviceId: service_id,
      staffId: staff_id,
      date: date || new Date().toISOString().split('T')[0],
      days
    });

    return result;

  } catch (error) {
    logger.error('[ElevenLabs Tools] check_vagaro_availability error:', error);
    return { success: false, error: error.message };
  }
}
```

### 3.4 Update the tool router switch statement

Add these cases to the switch statement in the main POST handler:

```javascript
case 'check_vagaro_availability':
  result = await handleCheckVagaroAvailability(params);
  break;

case 'get_vagaro_services':
  result = await vagaroBookingService.getServices(params.client_id);
  break;

case 'get_vagaro_staff':
  result = await vagaroBookingService.getStaff(params.client_id);
  break;
```

---

## Part 4: Update Client Settings Routes

### 4.1 Verify the Vagaro settings endpoints exist in `src/routes/client-settings.js`

The following endpoints should exist:
- `GET /api/client-settings/vagaro` - Get settings (masked)
- `POST /api/client-settings/vagaro` - Save settings
- `POST /api/client-settings/vagaro/test` - Test connection

If they don't exist, add them:

```javascript
// GET Vagaro settings (masked)
router.get('/vagaro', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.clientId;

    const [client] = await sequelize.query(`
      SELECT
        vagaro_enabled,
        vagaro_client_id,
        vagaro_client_secret_key,
        vagaro_merchant_id,
        vagaro_webhook_token,
        vagaro_region
      FROM clients WHERE id = :clientId
    `, {
      replacements: { clientId },
      type: QueryTypes.SELECT
    });

    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({
      success: true,
      vagaro: {
        enabled: client.vagaro_enabled || false,
        clientIdSet: !!client.vagaro_client_id,
        clientSecretKeySet: !!client.vagaro_client_secret_key,
        merchantId: client.vagaro_merchant_id || '',
        webhookTokenSet: !!client.vagaro_webhook_token,
        region: client.vagaro_region || 'us01',
        credentialsSet: !!(client.vagaro_client_id && client.vagaro_client_secret_key && client.vagaro_merchant_id)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Save Vagaro settings
router.post('/vagaro', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.clientId;
    const { enabled, clientId: vagaroClientId, clientSecretKey, merchantId, webhookToken, region } = req.body;

    // Build update query dynamically (only update provided fields)
    const updates = ['vagaro_enabled = :enabled'];
    const replacements = { clientId, enabled: enabled || false };

    if (vagaroClientId) {
      updates.push('vagaro_client_id = :vagaroClientId');
      replacements.vagaroClientId = vagaroClientId;
    }
    if (clientSecretKey) {
      updates.push('vagaro_client_secret_key = :clientSecretKey');
      replacements.clientSecretKey = clientSecretKey;
    }
    if (merchantId) {
      updates.push('vagaro_merchant_id = :merchantId');
      replacements.merchantId = merchantId;
    }
    if (webhookToken) {
      updates.push('vagaro_webhook_token = :webhookToken');
      replacements.webhookToken = webhookToken;
    }
    if (region) {
      updates.push('vagaro_region = :region');
      replacements.region = region;
    }

    await sequelize.query(`
      UPDATE clients SET ${updates.join(', ')} WHERE id = :clientId
    `, {
      replacements,
      type: QueryTypes.UPDATE
    });

    // Register webhook token with MCP server if provided
    const finalMerchantId = merchantId || (await getClientMerchantId(clientId));
    const finalWebhookToken = webhookToken || (await getClientWebhookToken(clientId));

    if (finalMerchantId && finalWebhookToken) {
      try {
        const mcpUrl = process.env.MCP_SERVER_URL || 'https://aiagent.ringlypro.com';
        await fetch(`${mcpUrl}/api/mcp/vagaro/register-webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessId: finalMerchantId,
            webhookToken: finalWebhookToken,
            apiKey: process.env.RINGLYPRO_ADMIN_API_KEY
          })
        });
        console.log(`[Vagaro] Registered webhook token for merchant ${finalMerchantId}`);
      } catch (webhookError) {
        console.error('[Vagaro] Failed to register webhook token:', webhookError.message);
      }
    }

    res.json({ success: true, message: 'Vagaro settings saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Test Vagaro connection
router.post('/vagaro/test', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.clientId;
    const vagaroBookingService = require('../services/vagaroBookingService');

    const result = await vagaroBookingService.testConnection(clientId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## Part 5: Webhook Handler Updates

### 5.1 Update the webhook handler to process Vagaro events

In `mcp-integrations/webhooks/vagaro-webhooks.js`, ensure these event handlers exist:

```javascript
/**
 * Process Vagaro webhook events
 */
async function processVagaroWebhook(event, payload) {
  const eventType = event || payload.type;
  const businessId = payload.payload?.businessId || payload.businessId;

  console.log(`[Vagaro Webhook] Processing ${eventType} for business ${businessId}`);

  switch (eventType) {
    case 'AppointmentCreated':
    case 'appointment.created':
      return handleAppointmentCreated(payload);

    case 'AppointmentUpdated':
    case 'appointment.updated':
      return handleAppointmentUpdated(payload);

    case 'AppointmentCancelled':
    case 'AppointmentCanceled':
    case 'appointment.cancelled':
      return handleAppointmentCancelled(payload);

    case 'CustomerCreated':
    case 'customer.created':
      return handleCustomerCreated(payload);

    case 'CustomerUpdated':
    case 'customer.updated':
      return handleCustomerUpdated(payload);

    default:
      console.log(`[Vagaro Webhook] Unhandled event type: ${eventType}`);
      return { handled: false, event: eventType };
  }
}

async function handleAppointmentCreated(payload) {
  const appointment = payload.payload || payload;
  console.log(`[Vagaro] New appointment: ${appointment.appointmentId}`);

  // TODO: Sync to RinglyPro database if needed
  // TODO: Send confirmation SMS/notification

  return { handled: true, appointmentId: appointment.appointmentId };
}

async function handleAppointmentUpdated(payload) {
  const appointment = payload.payload || payload;
  console.log(`[Vagaro] Appointment updated: ${appointment.appointmentId}`);

  // TODO: Update in RinglyPro database
  // TODO: Notify customer of changes

  return { handled: true, appointmentId: appointment.appointmentId };
}

async function handleAppointmentCancelled(payload) {
  const appointment = payload.payload || payload;
  console.log(`[Vagaro] Appointment cancelled: ${appointment.appointmentId}`);

  // TODO: Mark as cancelled in RinglyPro
  // TODO: Notify customer

  return { handled: true, appointmentId: appointment.appointmentId };
}

async function handleCustomerCreated(payload) {
  const customer = payload.payload || payload;
  console.log(`[Vagaro] New customer: ${customer.customerId}`);
  return { handled: true, customerId: customer.customerId };
}

async function handleCustomerUpdated(payload) {
  const customer = payload.payload || payload;
  console.log(`[Vagaro] Customer updated: ${customer.customerId}`);
  return { handled: true, customerId: customer.customerId };
}

module.exports = {
  processVagaroWebhook,
  handleAppointmentCreated,
  handleAppointmentUpdated,
  handleAppointmentCancelled,
  handleCustomerCreated,
  handleCustomerUpdated
};
```

---

## Part 6: ElevenLabs Agent Configuration

### 6.1 Update the ElevenLabs agent tools definition

In your ElevenLabs agent configuration, add/update the booking tool:

```json
{
  "name": "book_appointment",
  "description": "Book an appointment for the customer. Collects customer name, phone, preferred date/time, and service type.",
  "parameters": {
    "type": "object",
    "properties": {
      "client_id": {
        "type": "integer",
        "description": "The RinglyPro client ID (provided in system prompt)"
      },
      "customer_name": {
        "type": "string",
        "description": "Full name of the customer"
      },
      "customer_phone": {
        "type": "string",
        "description": "Customer phone number"
      },
      "customer_email": {
        "type": "string",
        "description": "Customer email (optional)"
      },
      "appointment_date": {
        "type": "string",
        "description": "Date in YYYY-MM-DD format"
      },
      "appointment_time": {
        "type": "string",
        "description": "Time in HH:MM format (24-hour)"
      },
      "service_id": {
        "type": "string",
        "description": "Vagaro service ID (if known)"
      },
      "service_name": {
        "type": "string",
        "description": "Name of service requested"
      },
      "staff_id": {
        "type": "string",
        "description": "Preferred staff member ID (optional)"
      },
      "duration": {
        "type": "integer",
        "description": "Appointment duration in minutes (default 30)"
      },
      "purpose": {
        "type": "string",
        "description": "Purpose or notes for the appointment"
      }
    },
    "required": ["client_id", "customer_name", "customer_phone", "appointment_date", "appointment_time"]
  }
}
```

---

## Part 7: Testing Checklist

### 7.1 Unit Tests

Create test file: `tests/vagaro-integration.test.js`

```javascript
/**
 * Vagaro Integration Tests
 * Run with: npm test -- --grep "Vagaro"
 */

const vagaroBookingService = require('../src/services/vagaroBookingService');

describe('Vagaro Integration', () => {
  const TEST_CLIENT_ID = process.env.TEST_VAGARO_CLIENT_ID;

  describe('Authentication', () => {
    it('should get access token', async () => {
      if (!TEST_CLIENT_ID) return console.log('Skipping - no test client');
      const token = await vagaroBookingService.getAccessToken(TEST_CLIENT_ID);
      expect(token).toBeDefined();
    });
  });

  describe('Services', () => {
    it('should fetch services list', async () => {
      if (!TEST_CLIENT_ID) return console.log('Skipping - no test client');
      const result = await vagaroBookingService.getServices(TEST_CLIENT_ID);
      expect(result.success).toBe(true);
    });
  });

  describe('Availability', () => {
    it('should check availability', async () => {
      if (!TEST_CLIENT_ID) return console.log('Skipping - no test client');
      const result = await vagaroBookingService.checkAvailability(TEST_CLIENT_ID, {
        date: new Date().toISOString().split('T')[0],
        days: 7
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Booking', () => {
    it('should create test booking', async () => {
      if (!TEST_CLIENT_ID) return console.log('Skipping - no test client');

      const result = await vagaroBookingService.bookAppointment(TEST_CLIENT_ID, {
        customerName: 'Test Customer',
        customerPhone: '+15551234567',
        customerEmail: 'test@example.com',
        date: '2026-01-20',
        time: '14:00',
        notes: 'Integration test - please cancel'
      });

      expect(result.success).toBe(true);
      expect(result.appointment).toBeDefined();

      // Clean up - cancel the test booking
      if (result.appointment?.id) {
        await vagaroBookingService.cancelAppointment(
          TEST_CLIENT_ID,
          result.appointment.id,
          'Integration test cleanup'
        );
      }
    });
  });
});
```

### 7.2 Manual Testing Steps

1. **Test credentials storage:**
   ```bash
   curl -X POST https://aiagent.ringlypro.com/api/client-settings/vagaro \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"enabled": true, "merchantId": "TEST123"}'
   ```

2. **Test connection:**
   ```bash
   curl -X POST https://aiagent.ringlypro.com/api/client-settings/vagaro/test \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Test booking via ElevenLabs tools:**
   ```bash
   curl -X POST https://aiagent.ringlypro.com/api/elevenlabs/tools \
     -H "Content-Type: application/json" \
     -d '{
       "tool_name": "book_appointment",
       "parameters": {
         "client_id": 1,
         "customer_name": "Test Customer",
         "customer_phone": "+15551234567",
         "appointment_date": "2026-01-20",
         "appointment_time": "14:00"
       }
     }'
   ```

4. **Test webhook reception:**
   ```bash
   curl -X POST https://aiagent.ringlypro.com/api/mcp/webhooks/vagaro \
     -H "Content-Type: application/json" \
     -H "X-Vagaro-Signature: test-token" \
     -d '{
       "type": "AppointmentCreated",
       "payload": {
         "businessId": "TEST123",
         "appointmentId": "apt-001"
       }
     }'
   ```

---

## Part 8: Deployment Checklist

### 8.1 Environment Variables

Add to Render/production environment:

```
VAGARO_WEBHOOK_TOKEN=<fallback-global-token>
VAGARO_ENFORCE_IP_WHITELIST=false
```

### 8.2 Database Migration

Run the SQL from Part 1 to add Vagaro columns.

### 8.3 Commit Sequence

```bash
# 1. Database migration
git add migrations/add-vagaro-columns.sql
git commit -m "Add Vagaro integration columns to clients table"

# 2. Vagaro service
git add src/services/vagaroBookingService.js
git commit -m "Add Vagaro booking service with OAuth and appointment APIs"

# 3. Update ElevenLabs tools
git add src/routes/elevenlabs-tools.js
git commit -m "Add Vagaro booking support to ElevenLabs tools"

# 4. Update client settings (if needed)
git add src/routes/client-settings.js
git commit -m "Add Vagaro settings endpoints"

# 5. Push and deploy
git push origin main
```

---

## Part 9: Troubleshooting

### Common Issues

1. **"Failed to authenticate with Vagaro"**
   - Verify Client ID and Client Secret Key are correct
   - Check if credentials are for the correct region
   - Ensure OAuth app is approved in Vagaro Developer Portal

2. **"Vagaro credentials incomplete"**
   - All three required fields must be set: clientId, clientSecretKey, merchantId
   - Check database: `SELECT vagaro_* FROM clients WHERE id = X`

3. **"Service not found"**
   - Get list of services first: Use `get_vagaro_services` tool
   - Service IDs are specific to each Vagaro business

4. **Webhook not receiving events**
   - Verify webhook URL in Vagaro matches: `https://aiagent.ringlypro.com/api/mcp/webhooks/vagaro`
   - Check webhook token is registered: Hit `/api/mcp/vagaro/register-webhook`
   - Check Render logs for incoming webhook requests

5. **Token expired errors**
   - The service auto-refreshes tokens, but check `vagaro_token_expires_at` in DB
   - Force refresh: Set `vagaro_access_token = NULL` in database

---

## Summary

Once all parts are implemented:

1. Client enters Vagaro credentials at `/settings/vagaro`
2. Credentials are stored in the `clients` table
3. When a call comes in, ElevenLabs collects booking info
4. ElevenLabs calls `book_appointment` tool
5. RinglyPro checks if client has Vagaro enabled
6. If yes → `vagaroBookingService.bookAppointment()` books in Vagaro
7. If no → Falls back to GHL/RinglyPro booking
8. Vagaro sends webhook updates to `/api/mcp/webhooks/vagaro`
9. RinglyPro processes updates (sync, notify, etc.)

**Key Files:**
- `src/services/vagaroBookingService.js` - Core Vagaro API integration
- `src/routes/elevenlabs-tools.js` - ElevenLabs booking handler
- `src/routes/client-settings.js` - Settings API
- `src/routes/mcp.js` - Webhook endpoints
- `views/settings-vagaro.ejs` - Settings UI
