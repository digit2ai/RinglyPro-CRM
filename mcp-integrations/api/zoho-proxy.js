/**
 * Zoho CRM MCP Proxy
 *
 * Provides a unified interface for Zoho CRM operations.
 * Follows the same patterns as HubSpotProxy and VagaroMCPProxy.
 *
 * Features:
 * - OAuth 2.0 token management with auto-refresh
 * - Contact/Lead/Deal operations
 * - Call logging and task creation
 * - Multi-region support (US, EU, IN, AU, etc.)
 */

const axios = require('axios');

// Zoho API regions
const ZOHO_API_DOMAINS = {
  'com': 'https://www.zohoapis.com',
  'eu': 'https://www.zohoapis.eu',
  'in': 'https://www.zohoapis.in',
  'com.au': 'https://www.zohoapis.com.au',
  'jp': 'https://www.zohoapis.jp',
  'com.cn': 'https://www.zohoapis.com.cn'
};

const ZOHO_AUTH_DOMAINS = {
  'com': 'https://accounts.zoho.com',
  'eu': 'https://accounts.zoho.eu',
  'in': 'https://accounts.zoho.in',
  'com.au': 'https://accounts.zoho.com.au',
  'jp': 'https://accounts.zoho.jp',
  'com.cn': 'https://accounts.zoho.com.cn'
};

// Error codes for AI-friendly error handling
const ZOHO_ERRORS = {
  CREDENTIALS_MISSING: 'ZOHO_CREDENTIALS_MISSING',
  AUTH_FAILED: 'ZOHO_AUTH_FAILED',
  TOKEN_EXPIRED: 'ZOHO_TOKEN_EXPIRED',
  RATE_LIMITED: 'ZOHO_RATE_LIMITED',
  VALIDATION_ERROR: 'ZOHO_VALIDATION_ERROR',
  NOT_FOUND: 'ZOHO_NOT_FOUND',
  API_ERROR: 'ZOHO_API_ERROR',
  DUPLICATE_DATA: 'ZOHO_DUPLICATE_DATA'
};

class ZohoMCPProxy {
  /**
   * Create a new Zoho CRM proxy
   * @param {Object} credentials
   * @param {string} credentials.clientId - Zoho OAuth client ID
   * @param {string} credentials.clientSecret - Zoho OAuth client secret
   * @param {string} credentials.refreshToken - Zoho OAuth refresh token
   * @param {string} [credentials.accessToken] - Optional existing access token
   * @param {string} [credentials.region='com'] - Zoho region (com, eu, in, com.au, jp, com.cn)
   */
  constructor(credentials) {
    this.validateCredentials(credentials);

    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.refreshToken = credentials.refreshToken;
    this.accessToken = credentials.accessToken || null;
    this.tokenExpiresAt = null;
    this.region = credentials.region || 'com';

    this.apiDomain = ZOHO_API_DOMAINS[this.region] || ZOHO_API_DOMAINS['com'];
    this.authDomain = ZOHO_AUTH_DOMAINS[this.region] || ZOHO_AUTH_DOMAINS['com'];

    console.log(`[Zoho] Proxy initialized for region: ${this.region}`);
  }

  /**
   * Validate required credentials
   */
  validateCredentials(credentials) {
    const required = ['clientId', 'clientSecret', 'refreshToken'];
    const missing = required.filter(field => !credentials[field]);

    if (missing.length > 0) {
      const error = new Error(`Missing required Zoho credentials: ${missing.join(', ')}`);
      error.code = ZOHO_ERRORS.CREDENTIALS_MISSING;
      throw error;
    }
  }

  /**
   * Get or refresh the access token
   */
  async getAccessToken() {
    // Check if current token is still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiresAt) {
      const bufferMs = 5 * 60 * 1000;
      if (Date.now() < this.tokenExpiresAt - bufferMs) {
        return this.accessToken;
      }
    }

    // Refresh the token
    try {
      const params = new URLSearchParams({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      });

      const response = await axios.post(
        `${this.authDomain}/oauth/v2/token?${params.toString()}`,
        null,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      if (response.data.error) {
        const error = new Error(`Zoho auth error: ${response.data.error}`);
        error.code = ZOHO_ERRORS.AUTH_FAILED;
        throw error;
      }

      this.accessToken = response.data.access_token;
      // Zoho tokens typically expire in 1 hour (3600 seconds)
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiresAt = Date.now() + (expiresIn * 1000);

      console.log('[Zoho] Access token refreshed successfully');
      return this.accessToken;
    } catch (error) {
      if (error.code === ZOHO_ERRORS.AUTH_FAILED) throw error;

      const authError = new Error(`Failed to refresh Zoho token: ${error.message}`);
      authError.code = ZOHO_ERRORS.AUTH_FAILED;
      authError.details = error.response?.data;
      throw authError;
    }
  }

  /**
   * Make an authenticated API request to Zoho
   */
  async callAPI(method, endpoint, data = null, params = null) {
    const accessToken = await this.getAccessToken();

    const config = {
      method,
      url: `${this.apiDomain}/crm/v5${endpoint}`,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) config.data = data;
    if (params) config.params = params;

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      this.handleAPIError(error);
    }
  }

  /**
   * Handle API errors and map to friendly error codes
   */
  handleAPIError(error) {
    const status = error.response?.status;
    const zohoError = error.response?.data?.data?.[0] || error.response?.data;

    let enhancedError;

    switch (status) {
      case 401:
        enhancedError = new Error('Zoho authentication failed. Token may be invalid or expired.');
        enhancedError.code = ZOHO_ERRORS.AUTH_FAILED;
        break;
      case 429:
        enhancedError = new Error('Zoho rate limit exceeded. Please try again later.');
        enhancedError.code = ZOHO_ERRORS.RATE_LIMITED;
        break;
      case 400:
        enhancedError = new Error(`Zoho validation error: ${zohoError?.message || 'Invalid request'}`);
        enhancedError.code = ZOHO_ERRORS.VALIDATION_ERROR;
        break;
      case 404:
        enhancedError = new Error('Record not found in Zoho');
        enhancedError.code = ZOHO_ERRORS.NOT_FOUND;
        break;
      default:
        enhancedError = new Error(`Zoho API error: ${error.message}`);
        enhancedError.code = ZOHO_ERRORS.API_ERROR;
    }

    enhancedError.status = status;
    enhancedError.details = zohoError;
    throw enhancedError;
  }

  // ==================== HEALTH & IDENTITY ====================

  /**
   * Test connection to Zoho CRM
   * Uses Contacts endpoint instead of users (works with modules.ALL scope only)
   */
  async testConnection() {
    try {
      // Test with Contacts endpoint - works with ZohoCRM.modules.ALL scope
      const response = await this.callAPI('GET', '/Contacts', null, { per_page: 1 });

      if (response.data || response.info) {
        const contactCount = response.info?.count || 0;
        return {
          success: true,
          message: 'Successfully connected to Zoho CRM',
          user: {
            contactsFound: contactCount,
            status: 'Connected'
          }
        };
      }

      return { success: true, message: 'Connected to Zoho CRM' };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code || ZOHO_ERRORS.API_ERROR
      };
    }
  }

  // ==================== CONTACT OPERATIONS ====================

  /**
   * Search contacts by query (phone, email, or name)
   */
  async searchContacts(query, limit = 10) {
    const normalizedQuery = this.normalizeSearchQuery(query);

    try {
      // Build COQL query for flexible search
      const coqlQuery = `SELECT id, First_Name, Last_Name, Email, Phone, Mobile, Full_Name, Created_Time, Modified_Time
                         FROM Contacts
                         WHERE (Phone like '%${normalizedQuery}%'
                            OR Mobile like '%${normalizedQuery}%'
                            OR Email like '%${normalizedQuery}%'
                            OR Full_Name like '%${normalizedQuery}%')
                         LIMIT ${limit}`;

      const response = await this.callAPI('POST', '/coql', { select_query: coqlQuery });

      return {
        success: true,
        contacts: (response.data || []).map(c => this.normalizeContact(c)),
        total: response.info?.count || 0
      };
    } catch (error) {
      // Fallback to simple search if COQL fails
      try {
        const response = await this.callAPI('GET', '/Contacts/search', null, {
          criteria: `(Phone:equals:${normalizedQuery})or(Mobile:equals:${normalizedQuery})or(Email:equals:${normalizedQuery})`,
          per_page: limit
        });

        return {
          success: true,
          contacts: (response.data || []).map(c => this.normalizeContact(c)),
          total: response.info?.count || 0
        };
      } catch (searchError) {
        return { success: false, contacts: [], error: searchError.message };
      }
    }
  }

  /**
   * Get a single contact by ID
   */
  async getContact(contactId) {
    try {
      const response = await this.callAPI('GET', `/Contacts/${contactId}`);
      return {
        success: true,
        contact: this.normalizeContact(response.data[0])
      };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Create a new contact
   */
  async createContact(contactData) {
    const zohoData = this.formatContactForZoho(contactData);

    try {
      const response = await this.callAPI('POST', '/Contacts', { data: [zohoData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          contact: {
            id: response.data[0].details.id,
            ...contactData
          }
        };
      }

      const error = new Error(response.data?.[0]?.message || 'Failed to create contact');
      error.code = ZOHO_ERRORS.API_ERROR;
      throw error;
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Update an existing contact
   */
  async updateContact(contactId, updates) {
    const zohoData = this.formatContactForZoho(updates);
    zohoData.id = contactId;

    try {
      const response = await this.callAPI('PUT', '/Contacts', { data: [zohoData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          contact: { id: contactId, ...updates }
        };
      }

      return { success: false, error: response.data?.[0]?.message || 'Update failed' };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Find or create a contact
   * Searches by phone first, then email
   * Creates if not found
   */
  async findOrCreateContact({ firstName, lastName, phone, email }) {
    // Normalize phone for search
    const normalizedPhone = this.normalizePhone(phone);

    // Search by phone first
    if (normalizedPhone) {
      const phoneSearch = await this.searchContacts(normalizedPhone, 1);
      if (phoneSearch.success && phoneSearch.contacts.length > 0) {
        return {
          success: true,
          contact: phoneSearch.contacts[0],
          isNew: false,
          matchedOn: 'phone'
        };
      }
    }

    // Search by email if phone didn't match
    if (email) {
      const emailSearch = await this.searchContacts(email, 1);
      if (emailSearch.success && emailSearch.contacts.length > 0) {
        return {
          success: true,
          contact: emailSearch.contacts[0],
          isNew: false,
          matchedOn: 'email'
        };
      }
    }

    // Create new contact
    const createResult = await this.createContact({
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Caller',
      phone: phone,
      email: email
    });

    if (createResult.success) {
      return {
        success: true,
        contact: createResult.contact,
        isNew: true
      };
    }

    return { success: false, error: createResult.error, code: createResult.code };
  }

  // ==================== LEAD OPERATIONS ====================

  /**
   * Search leads by query
   */
  async searchLeads(query, limit = 10) {
    const normalizedQuery = this.normalizeSearchQuery(query);

    try {
      const response = await this.callAPI('GET', '/Leads/search', null, {
        criteria: `(Phone:equals:${normalizedQuery})or(Mobile:equals:${normalizedQuery})or(Email:equals:${normalizedQuery})`,
        per_page: limit
      });

      return {
        success: true,
        leads: (response.data || []).map(l => this.normalizeLead(l)),
        total: response.info?.count || 0
      };
    } catch (error) {
      return { success: false, leads: [], error: error.message };
    }
  }

  /**
   * Create a new lead
   */
  async createLead(leadData) {
    const zohoData = this.formatLeadForZoho(leadData);

    try {
      const response = await this.callAPI('POST', '/Leads', { data: [zohoData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          lead: {
            id: response.data[0].details.id,
            ...leadData
          }
        };
      }

      return { success: false, error: response.data?.[0]?.message || 'Failed to create lead' };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Update an existing lead
   */
  async updateLead(leadId, updates) {
    const zohoData = this.formatLeadForZoho(updates);
    zohoData.id = leadId;

    try {
      const response = await this.callAPI('PUT', '/Leads', { data: [zohoData] });

      if (response.data?.[0]?.status === 'success') {
        return { success: true, lead: { id: leadId, ...updates } };
      }

      return { success: false, error: response.data?.[0]?.message || 'Update failed' };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  // ==================== CALL LOGGING ====================

  /**
   * Log a call activity in Zoho
   */
  async logCall({ whoId, direction, durationSeconds, summary, callTime, subject }) {
    // Zoho uses Calls module for call logging
    const callData = {
      Subject: subject || `${direction} Call - ${new Date(callTime || Date.now()).toLocaleString()}`,
      Call_Type: direction === 'Inbound' ? 'Inbound' : 'Outbound',
      Call_Duration: this.formatDuration(durationSeconds),
      Call_Duration_in_seconds: durationSeconds,
      Description: summary,
      Call_Start_Time: callTime || new Date().toISOString(),
      Who_Id: whoId,
      Call_Result: 'Completed'
    };

    try {
      const response = await this.callAPI('POST', '/Calls', { data: [callData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          call: {
            id: response.data[0].details.id,
            ...callData
          }
        };
      }

      return { success: false, error: response.data?.[0]?.message || 'Failed to log call' };
    } catch (error) {
      // Fallback: Try to add as a note if Calls module isn't available
      return this.addNote({
        parentId: whoId,
        noteTitle: `${direction} Call - ${this.formatDuration(durationSeconds)}`,
        noteContent: summary
      });
    }
  }

  // ==================== TASK OPERATIONS ====================

  /**
   * Create a follow-up task
   */
  async createTask({ subject, dueDate, whoId, notes, priority = 'Normal' }) {
    const taskData = {
      Subject: subject,
      Due_Date: dueDate,
      Status: 'Not Started',
      Priority: priority,
      Description: notes,
      Who_Id: whoId
    };

    try {
      const response = await this.callAPI('POST', '/Tasks', { data: [taskData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          task: {
            id: response.data[0].details.id,
            subject,
            dueDate,
            whoId,
            notes
          }
        };
      }

      return { success: false, error: response.data?.[0]?.message || 'Failed to create task' };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  // ==================== EVENT/APPOINTMENT OPERATIONS ====================

  /**
   * Create an event/appointment in Zoho CRM
   * Uses the Events module for calendar appointments
   */
  async createEvent({ title, startTime, endTime, contactId, description, location, reminderMinutes }) {
    // Calculate duration if endTime not provided (default 1 hour)
    const startDate = new Date(startTime);
    const endDate = endTime ? new Date(endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);

    const eventData = {
      Event_Title: title,
      Start_DateTime: startDate.toISOString(),
      End_DateTime: endDate.toISOString(),
      Description: description || '',
      Venue: location || ''
    };

    // Associate with contact if provided
    if (contactId) {
      eventData.Participants = [{
        participant: contactId,
        type: 'contact'
      }];
      eventData.Who_Id = { id: contactId, module: 'Contacts' };
    }

    // Add reminder if specified
    if (reminderMinutes) {
      eventData.Remind_At = new Date(startDate.getTime() - reminderMinutes * 60 * 1000).toISOString();
    }

    try {
      const response = await this.callAPI('POST', '/Events', { data: [eventData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          event: {
            id: response.data[0].details.id,
            title,
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
            contactId,
            location,
            description
          }
        };
      }

      return { success: false, error: response.data?.[0]?.message || 'Failed to create event' };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Get events/appointments
   */
  async getEvents(filters = {}) {
    try {
      const params = {
        per_page: filters.limit || 20,
        fields: 'Event_Title,Start_DateTime,End_DateTime,Venue,Description,Who_Id'
      };

      // Filter by date range if provided
      if (filters.startDate) {
        params.criteria = `(Start_DateTime:greater_than:${filters.startDate})`;
        if (filters.endDate) {
          params.criteria += `and(Start_DateTime:less_than:${filters.endDate})`;
        }
      }

      const response = await this.callAPI('GET', '/Events', null, params);

      return {
        success: true,
        events: (response.data || []).map(e => this.normalizeEvent(e)),
        total: response.info?.count || 0
      };
    } catch (error) {
      return { success: false, events: [], error: error.message };
    }
  }

  /**
   * Normalize Zoho event to standard format
   */
  normalizeEvent(zohoEvent) {
    return {
      id: zohoEvent.id,
      title: zohoEvent.Event_Title,
      startTime: zohoEvent.Start_DateTime,
      endTime: zohoEvent.End_DateTime,
      location: zohoEvent.Venue,
      description: zohoEvent.Description,
      contactId: zohoEvent.Who_Id?.id,
      contactName: zohoEvent.Who_Id?.name,
      createdAt: zohoEvent.Created_Time,
      updatedAt: zohoEvent.Modified_Time,
      raw: zohoEvent
    };
  }

  // ==================== NOTE OPERATIONS ====================

  /**
   * Add a note to a record
   */
  async addNote({ parentId, noteTitle, noteContent }) {
    const noteData = {
      Note_Title: noteTitle,
      Note_Content: noteContent,
      Parent_Id: parentId,
      se_module: 'Contacts' // Default to Contacts
    };

    try {
      const response = await this.callAPI('POST', '/Notes', { data: [noteData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          note: {
            id: response.data[0].details.id,
            title: noteTitle,
            content: noteContent
          }
        };
      }

      return { success: false, error: response.data?.[0]?.message || 'Failed to add note' };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  // ==================== DEAL OPERATIONS ====================

  /**
   * Get deals/opportunities
   */
  async getDeals(filters = {}) {
    try {
      const params = { per_page: filters.limit || 20 };
      if (filters.contactId) {
        params.criteria = `(Contact_Name:equals:${filters.contactId})`;
      }

      const response = await this.callAPI('GET', '/Deals', null, params);

      return {
        success: true,
        deals: (response.data || []).map(d => this.normalizeDeal(d)),
        total: response.info?.count || 0
      };
    } catch (error) {
      return { success: false, deals: [], error: error.message };
    }
  }

  /**
   * Create a deal
   */
  async createDeal(dealData) {
    const zohoData = {
      Deal_Name: dealData.name,
      Amount: dealData.amount,
      Stage: dealData.stage || 'Qualification',
      Closing_Date: dealData.closeDate,
      Contact_Name: dealData.contactId
    };

    try {
      const response = await this.callAPI('POST', '/Deals', { data: [zohoData] });

      if (response.data?.[0]?.status === 'success') {
        return {
          success: true,
          deal: {
            id: response.data[0].details.id,
            ...dealData
          }
        };
      }

      return { success: false, error: response.data?.[0]?.message || 'Failed to create deal' };
    } catch (error) {
      return { success: false, error: error.message, code: error.code };
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Normalize phone number for search
   */
  normalizePhone(phone) {
    if (!phone) return null;
    // Remove all non-digit characters except leading +
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Normalize search query
   */
  normalizeSearchQuery(query) {
    if (!query) return '';
    // Escape special characters for Zoho search
    return query.replace(/'/g, "\\'").trim();
  }

  /**
   * Format duration in mm:ss format
   */
  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Normalize Zoho contact to standard format
   */
  normalizeContact(zohoContact) {
    return {
      id: zohoContact.id,
      firstName: zohoContact.First_Name,
      lastName: zohoContact.Last_Name,
      fullName: zohoContact.Full_Name || `${zohoContact.First_Name || ''} ${zohoContact.Last_Name || ''}`.trim(),
      email: zohoContact.Email,
      phone: zohoContact.Phone || zohoContact.Mobile,
      mobile: zohoContact.Mobile,
      createdAt: zohoContact.Created_Time,
      updatedAt: zohoContact.Modified_Time,
      raw: zohoContact
    };
  }

  /**
   * Normalize Zoho lead to standard format
   */
  normalizeLead(zohoLead) {
    return {
      id: zohoLead.id,
      firstName: zohoLead.First_Name,
      lastName: zohoLead.Last_Name,
      fullName: zohoLead.Full_Name || `${zohoLead.First_Name || ''} ${zohoLead.Last_Name || ''}`.trim(),
      email: zohoLead.Email,
      phone: zohoLead.Phone || zohoLead.Mobile,
      company: zohoLead.Company,
      status: zohoLead.Lead_Status,
      source: zohoLead.Lead_Source,
      createdAt: zohoLead.Created_Time,
      updatedAt: zohoLead.Modified_Time,
      raw: zohoLead
    };
  }

  /**
   * Normalize Zoho deal to standard format
   */
  normalizeDeal(zohoDeal) {
    return {
      id: zohoDeal.id,
      name: zohoDeal.Deal_Name,
      amount: zohoDeal.Amount,
      stage: zohoDeal.Stage,
      probability: zohoDeal.Probability,
      closeDate: zohoDeal.Closing_Date,
      contactId: zohoDeal.Contact_Name?.id,
      accountId: zohoDeal.Account_Name?.id,
      createdAt: zohoDeal.Created_Time,
      updatedAt: zohoDeal.Modified_Time,
      raw: zohoDeal
    };
  }

  /**
   * Format contact data for Zoho API
   */
  formatContactForZoho(contactData) {
    return {
      First_Name: contactData.firstName,
      Last_Name: contactData.lastName,
      Email: contactData.email,
      Phone: contactData.phone,
      Mobile: contactData.mobile,
      ...(contactData.company && { Account_Name: contactData.company }),
      ...(contactData.title && { Title: contactData.title })
    };
  }

  /**
   * Format lead data for Zoho API
   */
  formatLeadForZoho(leadData) {
    return {
      First_Name: leadData.firstName,
      Last_Name: leadData.lastName,
      Email: leadData.email,
      Phone: leadData.phone,
      Mobile: leadData.mobile,
      Company: leadData.company || 'Unknown',
      Lead_Source: leadData.source || 'Phone',
      Lead_Status: leadData.status || 'Not Contacted'
    };
  }
}

// Export the class and error codes
module.exports = ZohoMCPProxy;
module.exports.ZOHO_ERRORS = ZOHO_ERRORS;
