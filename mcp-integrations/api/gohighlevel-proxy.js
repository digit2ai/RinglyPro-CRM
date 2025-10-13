const axios = require('axios');

class GoHighLevelMCPProxy {
  constructor(apiKey, locationId) {
    this.mcpURL = 'https://services.leadconnectorhq.com/mcp/';
    this.baseURL = 'https://services.leadconnectorhq.com';
    this.apiKey = apiKey;
    this.locationId = locationId;
  }

  // Call Official GHL MCP Server
  async callMCP(tool, input) {
    try {
      console.log(`🔧 Calling GHL MCP tool: ${tool}`, input);
      const response = await axios({
        method: 'POST',
        url: this.mcpURL,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'locationId': this.locationId,
          'Content-Type': 'application/json'
        },
        data: {
          tool,
          input
        }
      });
      console.log(`✅ MCP tool ${tool} succeeded`);
      return response.data;
    } catch (error) {
      console.error(`❌ MCP tool ${tool} failed:`, error.response?.data || error.message);
      throw error;
    }
  }

  // Legacy REST API call (fallback)
  async callAPI(endpoint, method = 'GET', data = null) {
    try {
      const response = await axios({
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        data
      });
      return response.data;
    } catch (error) {
      console.error('GoHighLevel API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // MCP Protocol Methods (using official GHL MCP server)
  async searchContacts(query, limit = 10) {
    try {
      // Try official MCP protocol first
      const response = await this.callMCP('contacts_get-contacts', {
        query,
        limit
      });
      return response.contacts || [];
    } catch (error) {
      // Fallback to REST API
      console.log('⚠️ MCP failed, falling back to REST API');
      const response = await this.callAPI(
        `/contacts/?locationId=${this.locationId}&query=${encodeURIComponent(query)}&limit=${limit}`
      );
      return response.contacts || [];
    }
  }

  async createContact(contactData) {
    try {
      return await this.callMCP('contacts_create-contact', contactData);
    } catch (error) {
      console.log('⚠️ MCP failed, falling back to REST API');
      return await this.callAPI('/contacts/', 'POST', {
        locationId: this.locationId,
        ...contactData
      });
    }
  }

  async getContact(contactId) {
    try {
      return await this.callMCP('contacts_get-contact', { contactId });
    } catch (error) {
      console.log('⚠️ MCP failed, falling back to REST API');
      return await this.callAPI(`/contacts/${contactId}`);
    }
  }

  async updateContact(contactId, updates) {
    try {
      return await this.callMCP('contacts_update-contact', {
        contactId,
        ...updates
      });
    } catch (error) {
      console.log('⚠️ MCP failed, falling back to REST API');
      return await this.callAPI(`/contacts/${contactId}`, 'PUT', {
        locationId: this.locationId,
        ...updates
      });
    }
  }

  async upsertContact(contactData) {
    return await this.callMCP('contacts_upsert-contact', contactData);
  }

  async addTags(contactId, tags) {
    return await this.callMCP('contacts_add-tags', { contactId, tags });
  }

  async removeTags(contactId, tags) {
    return await this.callMCP('contacts_remove-tags', { contactId, tags });
  }

  async getAllTasks(contactId) {
    return await this.callMCP('contacts_get-all-tasks', { contactId });
  }

  // Opportunities (MCP Protocol)
  async searchOpportunities(filters = {}) {
    return await this.callMCP('opportunities_search-opportunity', filters);
  }

  async getOpportunities(filters = {}) {
    try {
      return await this.searchOpportunities(filters);
    } catch (error) {
      console.log('⚠️ MCP failed, falling back to REST API');
      const response = await this.callAPI(
        `/opportunities/search?locationId=${this.locationId}`,
        'POST',
        filters
      );
      return response.opportunities || [];
    }
  }

  async getOpportunity(opportunityId) {
    return await this.callMCP('opportunities_get-opportunity', { opportunityId });
  }

  async updateOpportunity(opportunityId, updates) {
    return await this.callMCP('opportunities_update-opportunity', {
      opportunityId,
      ...updates
    });
  }

  async getPipelines() {
    return await this.callMCP('opportunities_get-pipelines', {});
  }

  async createOpportunity(opportunityData) {
    try {
      // MCP doesn't have create opportunity yet, use REST API
      return await this.callAPI('/opportunities/', 'POST', {
        locationId: this.locationId,
        ...opportunityData
      });
    } catch (error) {
      throw error;
    }
  }

  // Conversations (MCP Protocol)
  async searchConversations(filters = {}) {
    return await this.callMCP('conversations_search-conversation', filters);
  }

  async getMessages(conversationId, limit = 20) {
    return await this.callMCP('conversations_get-messages', {
      conversationId,
      limit
    });
  }

  async sendMessage(conversationId, type, message) {
    return await this.callMCP('conversations_send-a-new-message', {
      conversationId,
      type,
      message
    });
  }

  async sendSMS(contactId, message) {
    try {
      // First, find or create conversation for contact
      const conversations = await this.searchConversations({ contactId });
      const conversationId = conversations[0]?.id;

      if (conversationId) {
        return await this.sendMessage(conversationId, 'SMS', message);
      } else {
        // Fallback to REST API
        return await this.callAPI('/conversations/messages', 'POST', {
          locationId: this.locationId,
          contactId,
          type: 'SMS',
          message
        });
      }
    } catch (error) {
      console.log('⚠️ MCP failed, falling back to REST API');
      return await this.callAPI('/conversations/messages', 'POST', {
        locationId: this.locationId,
        contactId,
        type: 'SMS',
        message
      });
    }
  }

  async sendEmail(contactId, subject, body) {
    return await this.callAPI('/conversations/messages', 'POST', {
      locationId: this.locationId,
      contactId,
      type: 'Email',
      subject,
      body
    });
  }

  // Calendar (MCP Protocol)
  async getCalendarEvents(userId, groupId, calendarId) {
    return await this.callMCP('calendars_get-calendar-events', {
      userId,
      groupId,
      calendarId
    });
  }

  async getAppointmentNotes(appointmentId) {
    return await this.callMCP('calendars_get-appointment-notes', { appointmentId });
  }

  async getCalendars() {
    try {
      // MCP doesn't have list calendars, use REST API
      return await this.callAPI(`/calendars/?locationId=${this.locationId}`);
    } catch (error) {
      throw error;
    }
  }

  async createAppointment(appointmentData) {
    return await this.callAPI('/calendars/events/appointments', 'POST', {
      locationId: this.locationId,
      ...appointmentData
    });
  }

  // Location (MCP Protocol)
  async getLocation() {
    return await this.callMCP('locations_get-location', {
      locationId: this.locationId
    });
  }

  async getCustomFields() {
    return await this.callMCP('locations_get-custom-fields', {
      locationId: this.locationId
    });
  }

  // Payments (MCP Protocol)
  async getOrder(orderId) {
    return await this.callMCP('payments_get-order-by-id', { orderId });
  }

  async listTransactions(filters = {}) {
    return await this.callMCP('payments_list-transactions', filters);
  }

  // Workflows (REST API - not in MCP yet)
  async addToWorkflow(contactId, workflowId) {
    return await this.callAPI('/workflows/add-contact', 'POST', {
      locationId: this.locationId,
      contactId,
      workflowId
    });
  }
}

module.exports = GoHighLevelMCPProxy;
