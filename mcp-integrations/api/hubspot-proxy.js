/**
 * HubSpot MCP Proxy
 * Handles HubSpot CRM and Meetings API integration
 *
 * IMPORTANT: This proxy is used for MCP Copilot operations.
 * For WhatsApp booking flow, use hubspotBookingService.js instead.
 */
const axios = require('axios');

// Error codes for AI-friendly error handling
const HUBSPOT_ERRORS = {
  AUTH_FAILED: 'HUBSPOT_AUTH_FAILED',
  SCOPE_MISSING: 'HUBSPOT_SCOPE_MISSING',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_MEETING_LINK: 'NO_MEETING_LINK_CONFIGURED',
  NO_AVAILABILITY: 'NO_AVAILABILITY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  API_ERROR: 'HUBSPOT_API_ERROR'
};

class HubSpotMCPProxy {
  constructor(accessToken) {
    this.baseURL = 'https://api.hubapi.com';
    this.accessToken = accessToken;
    // Note: Token is stored in memory only, never logged
  }

  /**
   * Make API call to HubSpot
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {object} data - Request body for POST/PATCH
   * @param {object} params - Query parameters for GET
   * @returns {Promise<object>} API response
   */
  async callAPI(endpoint, method = 'GET', data = null, params = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) config.data = data;
      if (params) config.params = params;

      const response = await axios(config);
      return response.data;
    } catch (error) {
      // Map HubSpot errors to AI-friendly codes
      const status = error.response?.status;
      const errorData = error.response?.data;

      let errorCode = HUBSPOT_ERRORS.API_ERROR;
      if (status === 401) errorCode = HUBSPOT_ERRORS.AUTH_FAILED;
      else if (status === 403) errorCode = HUBSPOT_ERRORS.SCOPE_MISSING;
      else if (status === 429) errorCode = HUBSPOT_ERRORS.RATE_LIMITED;
      else if (status === 400) errorCode = HUBSPOT_ERRORS.VALIDATION_ERROR;

      // Log error without exposing token
      console.error(`[HubSpot] API Error (${errorCode}):`, {
        endpoint,
        status,
        message: errorData?.message || error.message,
        category: errorData?.category
      });

      const enhancedError = new Error(errorData?.message || error.message);
      enhancedError.code = errorCode;
      enhancedError.status = status;
      enhancedError.details = errorData;
      throw enhancedError;
    }
  }

  // ===========================================
  // CONTACT OPERATIONS
  // ===========================================

  /**
   * Search contacts by email or query
   */
  async searchContacts(query, limit = 10) {
    const response = await this.callAPI('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'CONTAINS_TOKEN',
          value: query
        }]
      }],
      limit,
      properties: ['email', 'firstname', 'lastname', 'phone', 'company']
    });
    return response.results || [];
  }

  /**
   * Search contacts by phone number
   */
  async searchContactsByPhone(phone, limit = 10) {
    // Normalize phone for search
    const cleanPhone = phone.replace(/\D/g, '');
    const response = await this.callAPI('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{
        filters: [{
          propertyName: 'phone',
          operator: 'CONTAINS_TOKEN',
          value: cleanPhone
        }]
      }],
      limit,
      properties: ['email', 'firstname', 'lastname', 'phone', 'company']
    });
    return response.results || [];
  }

  /**
   * Create a new contact
   */
  async createContact(contactData) {
    return await this.callAPI('/crm/v3/objects/contacts', 'POST', {
      properties: contactData
    });
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId) {
    return await this.callAPI(`/crm/v3/objects/contacts/${contactId}`, 'GET', null, {
      properties: 'email,firstname,lastname,phone,company,lifecyclestage'
    });
  }

  /**
   * Update contact properties
   */
  async updateContact(contactId, updates) {
    return await this.callAPI(`/crm/v3/objects/contacts/${contactId}`, 'PATCH', {
      properties: updates
    });
  }

  /**
   * Find or create contact by email
   * @param {object} contactInfo - { email, firstName, lastName, phone }
   * @returns {Promise<object>} { contact, isNew }
   */
  async findOrCreateContact(contactInfo) {
    const { email, firstName, lastName, phone } = contactInfo;

    if (!email) {
      throw new Error('Email is required to find or create contact');
    }

    // Search by email first
    const existing = await this.searchContacts(email, 1);
    if (existing.length > 0) {
      // Optionally update with new info
      if (phone || firstName || lastName) {
        const updates = {};
        if (phone) updates.phone = phone;
        if (firstName) updates.firstname = firstName;
        if (lastName) updates.lastname = lastName;

        if (Object.keys(updates).length > 0) {
          await this.updateContact(existing[0].id, updates);
        }
      }
      return { contact: existing[0], isNew: false };
    }

    // Create new contact
    const newContact = await this.createContact({
      email,
      firstname: firstName || '',
      lastname: lastName || '',
      phone: phone || '',
      lifecyclestage: 'lead',
      hs_lead_status: 'NEW'
    });

    return { contact: newContact, isNew: true };
  }

  // ===========================================
  // DEAL OPERATIONS
  // ===========================================

  async getDeals(filters = {}) {
    const response = await this.callAPI('/crm/v3/objects/deals', 'GET');
    return response.results || [];
  }

  async createDeal(dealData) {
    return await this.callAPI('/crm/v3/objects/deals', 'POST', {
      properties: dealData
    });
  }

  // ===========================================
  // TASK OPERATIONS
  // ===========================================

  async createTask(taskData) {
    return await this.callAPI('/crm/v3/objects/tasks', 'POST', {
      properties: taskData
    });
  }

  // ===========================================
  // NOTE OPERATIONS
  // ===========================================

  async addNote(contactId, note) {
    return await this.callAPI('/crm/v3/objects/notes', 'POST', {
      properties: {
        hs_note_body: note,
        hs_timestamp: new Date().toISOString()
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
      }]
    });
  }

  // ===========================================
  // MEETING SCHEDULING OPERATIONS (NEW)
  // ===========================================

  /**
   * List all meeting scheduling pages (meeting links) for the user
   * Requires: crm.objects.custom.read scope
   * @returns {Promise<Array>} List of meeting links
   */
  async listMeetingLinks() {
    try {
      const response = await this.callAPI('/scheduler/v3/meetings/meeting-links', 'GET');
      return response.results || [];
    } catch (error) {
      if (error.code === HUBSPOT_ERRORS.SCOPE_MISSING) {
        console.warn('[HubSpot] Meeting links requires scheduler scope');
      }
      throw error;
    }
  }

  /**
   * Get details of a specific meeting link by slug
   * @param {string} slug - Meeting link slug (e.g., "john-smith")
   * @returns {Promise<object>} Meeting link details
   */
  async getMeetingLink(slug) {
    const links = await this.listMeetingLinks();
    const link = links.find(l => l.slug === slug || l.link?.includes(slug));
    if (!link) {
      const error = new Error(`Meeting link not found: ${slug}`);
      error.code = HUBSPOT_ERRORS.NO_MEETING_LINK;
      throw error;
    }
    return link;
  }

  /**
   * Get available time slots for a meeting link
   * Uses HubSpot's public scheduling API
   * @param {object} params - { slug, startDate, endDate, timezone }
   * @returns {Promise<Array>} Available time slots
   */
  async getAvailability({ slug, startDate, endDate, timezone = 'America/New_York' }) {
    // HubSpot public availability endpoint
    // Format: GET /scheduler/v3/meetings/{meetingSlug}/availability
    const start = new Date(startDate);
    const end = new Date(endDate);

    try {
      const response = await this.callAPI(
        `/scheduler/v3/meetings/${slug}/availability`,
        'GET',
        null,
        {
          startDatetime: start.toISOString(),
          endDatetime: end.toISOString(),
          timezone
        }
      );

      // Transform to standardized slot format
      const slots = (response.availableTimes || response.times || []).map(slot => ({
        startTime: slot.startTime || slot.start,
        endTime: slot.endTime || slot.end,
        timezone,
        durationMinutes: slot.duration || 30
      }));

      if (slots.length === 0) {
        console.warn(`[HubSpot] No availability found for ${slug} from ${startDate} to ${endDate}`);
      }

      return slots;
    } catch (error) {
      // If scheduler API fails, try CRM meetings approach
      console.warn('[HubSpot] Scheduler API unavailable, returning empty slots');
      return [];
    }
  }

  /**
   * Book a meeting using HubSpot's scheduling link
   * Creates a meeting engagement associated with the contact
   * @param {object} params - Booking parameters
   * @returns {Promise<object>} Booking result
   */
  async bookMeeting({
    slug,
    startTime,
    endTime,
    timezone = 'America/New_York',
    contactId,
    attendeeEmail,
    attendeeName,
    notes = ''
  }) {
    // Option 1: Try HubSpot's booking API if available
    try {
      const bookingResult = await this.callAPI(
        `/scheduler/v3/meetings/${slug}/book`,
        'POST',
        {
          startTime,
          endTime,
          timezone,
          formFields: {
            email: attendeeEmail,
            firstName: attendeeName?.split(' ')[0] || '',
            lastName: attendeeName?.split(' ').slice(1).join(' ') || ''
          }
        }
      );

      return {
        success: true,
        meetingId: bookingResult.id || bookingResult.meetingId,
        meetingLink: bookingResult.meetingUrl || bookingResult.link,
        startTime,
        endTime,
        timezone,
        source: 'scheduler_api'
      };
    } catch (schedulerError) {
      // Option 2: Fall back to creating a meeting engagement directly
      console.log('[HubSpot] Scheduler booking unavailable, creating meeting engagement');
    }

    // Fallback: Create meeting engagement in CRM
    const meetingProperties = {
      hs_meeting_title: `Appointment - ${attendeeName}`,
      hs_meeting_body: notes || `WhatsApp Booking\nContact: ${attendeeName}\nEmail: ${attendeeEmail}`,
      hs_meeting_start_time: new Date(startTime).getTime(),
      hs_meeting_end_time: endTime ? new Date(endTime).getTime() : new Date(startTime).getTime() + 30 * 60 * 1000,
      hs_meeting_outcome: 'SCHEDULED',
      hs_meeting_location: 'To be confirmed',
      hs_timestamp: new Date(startTime).getTime()
    };

    const meetingResult = await this.callAPI('/crm/v3/objects/meetings', 'POST', {
      properties: meetingProperties,
      associations: contactId ? [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 200 }]
      }] : []
    });

    return {
      success: true,
      meetingId: meetingResult.id,
      meetingLink: null,
      startTime,
      endTime: endTime || new Date(new Date(startTime).getTime() + 30 * 60 * 1000).toISOString(),
      timezone,
      source: 'crm_engagement'
    };
  }

  /**
   * Create meeting engagement (simpler version for direct booking)
   * @deprecated Use bookMeeting() instead for full flow
   */
  async createAppointment(appointmentData) {
    return await this.callAPI('/crm/v3/objects/meetings', 'POST', {
      properties: appointmentData
    });
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  /**
   * Test connection to HubSpot
   * @returns {Promise<object>} Connection status
   */
  async testConnection() {
    try {
      // Try to get account info
      const response = await this.callAPI('/account-info/v3/api-usage/daily/private-apps', 'GET');
      return {
        success: true,
        connected: true,
        usage: response
      };
    } catch (error) {
      // Fallback: try to list contacts
      try {
        await this.searchContacts('test@test.com', 1);
        return {
          success: true,
          connected: true,
          message: 'Connected (limited scope)'
        };
      } catch (innerError) {
        return {
          success: false,
          connected: false,
          error: error.code || 'CONNECTION_FAILED',
          message: error.message
        };
      }
    }
  }
}

// Export error codes for consumers
HubSpotMCPProxy.ERRORS = HUBSPOT_ERRORS;

module.exports = HubSpotMCPProxy;
