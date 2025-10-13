const axios = require('axios');

class GoHighLevelMCPProxy {
  constructor(apiKey, locationId) {
    this.mcpURL = 'https://services.leadconnectorhq.com/mcp/';
    this.baseURL = 'https://services.leadconnectorhq.com';
    this.apiKey = apiKey;
    this.locationId = locationId;
  }

  // Call Official GHL MCP Server (JSON-RPC 2.0 Protocol)
  async callMCP(tool, input) {
    try {
      console.log(`🔧 Calling GHL MCP tool: ${tool}`, JSON.stringify(input));
      const response = await axios({
        method: 'POST',
        url: this.mcpURL,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'locationId': this.locationId,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'  // MCP requires both!
        },
        data: {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: tool,
            arguments: input
          }
        }
      });
      console.log(`✅ MCP tool ${tool} succeeded`);

      // MCP server returns Server-Sent Events (SSE) format, need to parse it
      let parsedData = response.data;

      // If response is a string (SSE format), parse it
      if (typeof response.data === 'string') {
        console.log('📡 Response is SSE format, parsing...');

        // Extract JSON from SSE format: "event: message\ndata: {...}\n\n"
        const dataMatch = response.data.match(/data: ({.*})/);
        if (dataMatch) {
          parsedData = JSON.parse(dataMatch[1]);
          console.log('✅ Parsed SSE to JSON');
        } else {
          console.error('⚠️ Could not extract JSON from SSE');
          throw new Error('Invalid SSE format');
        }
      }

      // Extract result from JSON-RPC response
      if (parsedData.error) {
        throw new Error(parsedData.error.message || 'MCP call failed');
      }

      const result = parsedData.result;
      if (!result) {
        console.error('⚠️ No result in parsed data');
        return parsedData;
      }

      console.log('🔍 Result structure:', JSON.stringify(result).substring(0, 200));

      if (result && result.content && result.content[0]) {
        const textContent = result.content[0].text;
        console.log('📄 Text content (first 200 chars):', textContent.substring(0, 200));

        try {
          // The text is a JSON string containing another JSON string, so we need to parse twice
          const parsedOnce = JSON.parse(textContent);
          console.log('📦 Parsed once:', typeof parsedOnce, Object.keys(parsedOnce).join(','));

          if (parsedOnce.content && parsedOnce.content[0]) {
            const actualData = JSON.parse(parsedOnce.content[0].text);
            console.log('📦 Parsed MCP response:', actualData.success ? '✅ success' : '❌ failed');
            console.log('📊 Data keys:', Object.keys(actualData.data || {}).join(','));

            if (actualData.data && actualData.data.contacts) {
              console.log('✅ Found', actualData.data.contacts.length, 'contacts');
              return actualData.data;
            }

            return actualData.data || actualData;
          }
          console.log('⚠️ No nested content found, returning parsedOnce');
          return parsedOnce;
        } catch (parseError) {
          console.error('⚠️ Failed to parse MCP text content:', parseError.message);
          console.error('⚠️ Text content was:', textContent.substring(0, 500));
          return result;
        }
      }

      console.log('⚠️ No result.content found, returning raw result');
      return result || response.data;
    } catch (error) {
      console.error(`❌ MCP tool ${tool} failed:`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
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
  async searchContacts(query, limit = 5) {
    try {
      console.log(`🔍 searchContacts called with query: "${query}", limit: ${limit}`);

      // Try official MCP protocol first
      const response = await this.callMCP('contacts_get-contacts', {
        query: query || '', // Ensure query is never undefined
        limit
      });

      console.log(`📡 MCP response type:`, typeof response);
      console.log(`📡 MCP response keys:`, response ? Object.keys(response).join(',') : 'null');

      // Filter results client-side to ensure exact matches appear first
      let contacts = response.contacts || response || []; // Handle different response formats

      console.log(`📊 Total contacts from API: ${Array.isArray(contacts) ? contacts.length : 'not an array'}`);

      // Debug: Log contact structure
      if (contacts.length > 0) {
        console.log('🔍 First contact keys:', Object.keys(contacts[0]).join(','));
        console.log('🔍 First contact sample:', JSON.stringify(contacts[0]).substring(0, 300));
      }

      // If we have results, FILTER and sort them
      if (contacts.length > 0 && query) {
        const lowerQuery = query.toLowerCase();

        console.log(`🔍 Filtering ${contacts.length} contacts for query: "${query}"`);

        // FIRST: Filter to only include contacts that actually match the query
        contacts = contacts.filter(c => {
          const name = (c.contactName || c.name || `${c.firstName || ''} ${c.lastName || ''}`).toLowerCase();
          const email = (c.email || '').toLowerCase();
          const phone = (c.phone || '').toLowerCase();
          const company = (c.companyName || '').toLowerCase();

          // Contact must match query in name, email, phone, or company
          const matches = name.includes(lowerQuery) ||
                         email.includes(lowerQuery) ||
                         phone.includes(lowerQuery) ||
                         company.includes(lowerQuery);

          return matches;
        });

        console.log(`✅ Filtered down to ${contacts.length} matching contacts`);

        // SECOND: Sort the filtered results: exact matches first, then starts with, then contains
        contacts.sort((a, b) => {
          const aName = (a.contactName || a.name || `${a.firstName || ''} ${a.lastName || ''}`).toLowerCase();
          const bName = (b.contactName || b.name || `${b.firstName || ''} ${b.lastName || ''}`).toLowerCase();
          const aEmail = (a.email || '').toLowerCase();
          const bEmail = (b.email || '').toLowerCase();

          // Check if exact match
          const aExact = aName === lowerQuery || aEmail === lowerQuery;
          const bExact = bName === lowerQuery || bEmail === lowerQuery;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          // Check if starts with
          const aStarts = aName.startsWith(lowerQuery) || aEmail.startsWith(lowerQuery);
          const bStarts = bName.startsWith(lowerQuery) || bEmail.startsWith(lowerQuery);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;

          return 0;
        });
      }

      // Enforce limit strictly
      return contacts.slice(0, limit);
    } catch (error) {
      // Fallback to REST API
      console.log('⚠️ MCP failed, falling back to REST API');
      const response = await this.callAPI(
        `/contacts/?locationId=${this.locationId}&query=${encodeURIComponent(query)}&limit=${limit}`
      );

      // Apply same filtering/sorting to REST API results
      let contacts = response.contacts || [];
      if (contacts.length > 0 && query) {
        const lowerQuery = query.toLowerCase();

        // FIRST: Filter to only include contacts that actually match
        contacts = contacts.filter(c => {
          const name = (c.contactName || c.name || `${c.firstName || ''} ${c.lastName || ''}`).toLowerCase();
          const email = (c.email || '').toLowerCase();
          const phone = (c.phone || '').toLowerCase();
          const company = (c.companyName || '').toLowerCase();

          return name.includes(lowerQuery) ||
                 email.includes(lowerQuery) ||
                 phone.includes(lowerQuery) ||
                 company.includes(lowerQuery);
        });

        // SECOND: Sort filtered results
        contacts.sort((a, b) => {
          const aName = (a.contactName || a.name || `${a.firstName || ''} ${a.lastName || ''}`).toLowerCase();
          const bName = (b.contactName || b.name || `${b.firstName || ''} ${b.lastName || ''}`).toLowerCase();
          const aEmail = (a.email || '').toLowerCase();
          const bEmail = (b.email || '').toLowerCase();

          const aExact = aName === lowerQuery || aEmail === lowerQuery;
          const bExact = bName === lowerQuery || bEmail === lowerQuery;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          const aStarts = aName.startsWith(lowerQuery) || aEmail.startsWith(lowerQuery);
          const bStarts = bName.startsWith(lowerQuery) || bEmail.startsWith(lowerQuery);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;

          return 0;
        });
      }

      return contacts.slice(0, limit);
    }
  }

  async createContact(contactData) {
    try {
      console.log('📝 Creating contact with data:', JSON.stringify(contactData));
      const result = await this.callMCP('contacts_create-contact', contactData);
      console.log('✅ Contact created via MCP:', result?.id || 'unknown ID');
      return result;
    } catch (error) {
      console.log('⚠️ MCP failed, falling back to REST API');
      console.log('📝 REST API contact data:', JSON.stringify({
        locationId: this.locationId,
        ...contactData
      }));
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
      const result = await this.searchOpportunities(filters);
      console.log('🔍 Opportunities result type:', typeof result);
      console.log('🔍 Opportunities result keys:', result ? Object.keys(result).join(',') : 'null');

      // Handle different response formats
      if (Array.isArray(result)) {
        return result;
      } else if (result?.opportunities) {
        return result.opportunities;
      } else if (result?.data?.opportunities) {
        return result.data.opportunities;
      }

      return [];
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
      // GoHighLevel REST API expects query params in the request, not URL
      const response = await axios({
        method: 'GET',
        url: `${this.baseURL}/calendars/`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        params: {
          locationId: this.locationId
        }
      });
      return response.data;
    } catch (error) {
      console.error('❌ Get calendars failed:', error.response?.data || error.message);
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
    const result = await this.callMCP('locations_get-location', {
      locationId: this.locationId
    });
    console.log('🏢 Location result type:', typeof result);
    console.log('🏢 Location result keys:', result ? Object.keys(result).join(',') : 'null');

    // Handle different response formats
    if (result?.location) {
      return result.location;
    } else if (result?.data?.location) {
      return result.data.location;
    }

    return result;
  }

  async getCustomFields() {
    const result = await this.callMCP('locations_get-custom-fields', {
      locationId: this.locationId
    });
    console.log('📝 Custom fields result type:', typeof result);
    console.log('📝 Custom fields result keys:', result ? Object.keys(result).join(',') : 'null');

    // Handle different response formats
    if (Array.isArray(result)) {
      return { customFields: result };
    } else if (result?.customFields) {
      return result;
    } else if (result?.data?.customFields) {
      return result.data;
    }

    return { customFields: [] };
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
