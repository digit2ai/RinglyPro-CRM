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
      const requestData = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: tool,
          arguments: {
            locationId: this.locationId, // Add locationId to every MCP call
            ...input
          }
        }
      };

      console.log(`🔧 Calling GHL MCP tool: ${tool}`);
      console.log(`📍 LocationId: ${this.locationId}`);
      console.log(`📦 Full arguments:`, JSON.stringify(requestData.params.arguments));

      const response = await axios({
        method: 'POST',
        url: this.mcpURL,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'locationId': this.locationId,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'  // MCP requires both!
        },
        data: requestData
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

              // Log meta information for pagination debugging
              if (actualData.data.meta) {
                console.log('📋 Meta keys:', Object.keys(actualData.data.meta).join(','));
                console.log('📋 Meta content:', JSON.stringify(actualData.data.meta));
              }

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
    // Declare params outside try block so it's accessible in catch
    let params = undefined;

    try {
      // Both JWT and PIT tokens require the Version header
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      };

      const isJWT = !this.apiKey.startsWith('pit-');
      console.log(`🌐 API Request: ${method} ${endpoint}`);
      console.log(`🔑 Auth type: ${isJWT ? 'JWT' : 'PIT'}`);
      console.log(`🔑 Token preview: ${this.apiKey.substring(0, 20)}...${this.apiKey.substring(this.apiKey.length - 10)}`);
      console.log(`📍 Location ID: ${this.locationId}`);

      // JWT tokens have locationId embedded - don't add it anywhere
      // PIT tokens need locationId as query parameter for GET only
      let url = `${this.baseURL}${endpoint}`;

      if (!isJWT && method === 'GET' && !endpoint.includes('?')) {
        // Only add locationId query param for PIT tokens on GET requests
        params = { locationId: this.locationId };
      }

      // Don't modify data - methods should handle locationId themselves if needed
      const response = await axios({
        method,
        url,
        headers,
        data,
        params
      });
      return response.data;
    } catch (error) {
      console.error('❌ GoHighLevel API Error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: `${method} ${this.baseURL}${endpoint}`,
        requestData: data,
        requestParams: params
      });
      throw error;
    }
  }

  // REST API method with proper pagination (using nextPageUrl)
  async searchContactsViaREST(query, limit = 1000) {
    console.log(`🌐 searchContactsViaREST called with query: "${query}", limit: ${limit}`);

    let allContacts = [];
    let nextPageUrl = null;
    let pageCount = 0;
    const maxPages = Math.ceil(limit / 100);

    try {
      // Build initial endpoint - use query params object for proper encoding
      let endpoint = `/contacts/`;
      let queryParams = { limit: 100 };
      if (query) {
        queryParams.query = query;
      }

      do {
        pageCount++;
        console.log(`📄 REST API: Fetching page ${pageCount}...`);

        let response;
        if (nextPageUrl) {
          // Use full nextPageUrl
          console.log(`🔗 Using nextPageUrl: ${nextPageUrl.substring(0, 100)}...`);
          const urlResponse = await axios({
            method: 'GET',
            url: nextPageUrl,
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'Version': '2021-07-28'
            }
          });
          response = urlResponse.data;
        } else {
          // First page - use callAPI which handles params properly
          const fullEndpoint = `/contacts/?${new URLSearchParams(queryParams).toString()}`;
          console.log(`📡 Calling: ${fullEndpoint}`);
          response = await this.callAPI(fullEndpoint);
        }

        const contacts = response.contacts || [];
        allContacts = allContacts.concat(contacts);
        console.log(`✅ REST API Page ${pageCount}: ${contacts.length} contacts (total: ${allContacts.length})`);

        // Check for next page URL
        nextPageUrl = response.meta?.nextPageUrl || null;
        console.log(`🔗 Next page URL: ${nextPageUrl ? 'Found' : 'None'}`);

        if (allContacts.length >= limit || !nextPageUrl || pageCount >= maxPages) {
          break;
        }
      } while (nextPageUrl);

      console.log(`📊 REST API: Retrieved ${allContacts.length} contacts from ${pageCount} pages`);

      // Apply filtering and sorting if query is provided
      if (query && allContacts.length > 0) {
        const lowerQuery = query.toLowerCase();

        // Filter
        allContacts = allContacts.filter(c => {
          const name = (c.contactName || c.name || `${c.firstName || ''} ${c.lastName || ''}`).toLowerCase();
          const email = (c.email || '').toLowerCase();
          const phone = (c.phone || '').toLowerCase();
          const company = (c.companyName || '').toLowerCase();

          return name.includes(lowerQuery) ||
                 email.includes(lowerQuery) ||
                 phone.includes(lowerQuery) ||
                 company.includes(lowerQuery);
        });

        // Sort: exact matches first, then starts with, then contains
        allContacts.sort((a, b) => {
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

        console.log(`✅ Filtered and sorted to ${allContacts.length} matching contacts`);
      }

      return allContacts.slice(0, limit);

    } catch (error) {
      console.error('❌ REST API searchContacts failed:', error.message);
      console.error('❌ Full error:', error.stack);
      console.error('❌ Returning empty array');
      return [];
    }
  }

  // MCP Protocol Methods (using official GHL MCP server)
  async searchContacts(query, limit = 20) {
    console.log(`🔍 searchContacts called with query: "${query}", limit: ${limit}`);

    // For large limits (>100), use REST API which supports pagination
    // MCP pagination is broken and only returns first 100 results
    if (limit > 100) {
      console.log(`🔍 Large limit (${limit}) detected - using REST API instead of MCP`);
      return await this.searchContactsViaREST(query, limit);
    }

    try {
      console.log(`🔍 Using MCP for search (single page only - GHL pagination is broken)`);

      // IMPORTANT: Only fetch first page (100 results to have more to filter from)
      // GHL pagination returns the same cursor every time, causing infinite loops
      // We'll fetch more and filter client-side
      const fetchLimit = 100;

      // Build arguments for MCP call - NO PAGINATION
      const mcpArgs = {
        query: query || '', // MCP server doesn't filter properly, so we'll do it client-side
        limit: fetchLimit
      };

      // Try official MCP protocol - single page only
      const response = await this.callMCP('contacts_get-contacts', mcpArgs);

      console.log(`📡 MCP response type:`, typeof response);
      console.log(`📡 MCP response keys:`, response ? Object.keys(response).join(',') : 'null');

      // Extract contacts from response
      let contacts = response.contacts || response || [];

      if (!Array.isArray(contacts)) {
        console.log(`⚠️ Response is not an array, returning empty`);
        return [];
      }

      console.log(`✅ Retrieved ${contacts.length} contacts from MCP`);

      // CLIENT-SIDE FILTERING (GHL MCP doesn't filter properly)
      if (query && query.trim()) {
        const lowerQuery = query.toLowerCase().trim();
        console.log(`🔍 Client-side filtering for: "${lowerQuery}"`);

        contacts = contacts.filter(contact => {
          const name = (contact.name || contact.firstName || contact.fullName || '').toLowerCase();
          const lastName = (contact.lastName || '').toLowerCase();
          const email = (contact.email || '').toLowerCase();
          const phone = (contact.phone || '').replace(/\D/g, '');
          const queryPhone = lowerQuery.replace(/\D/g, '');
          const companyName = (contact.companyName || contact.businessName || '').toLowerCase();

          // Match on name, email, phone, or company
          return name.includes(lowerQuery) ||
                 lastName.includes(lowerQuery) ||
                 email.includes(lowerQuery) ||
                 companyName.includes(lowerQuery) ||
                 (queryPhone && phone.includes(queryPhone));
        });

        console.log(`✅ Filtered to ${contacts.length} matching contacts`);

        // Sort results - exact matches first, then starts-with, then contains
        contacts.sort((a, b) => {
          const aName = (a.name || a.firstName || a.fullName || '').toLowerCase();
          const bName = (b.name || b.firstName || b.fullName || '').toLowerCase();
          const aEmail = (a.email || '').toLowerCase();
          const bEmail = (b.email || '').toLowerCase();

          // Exact match priority
          const aExact = aName === lowerQuery || aEmail === lowerQuery;
          const bExact = bName === lowerQuery || bEmail === lowerQuery;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          // Starts-with priority
          const aStarts = aName.startsWith(lowerQuery) || aEmail.startsWith(lowerQuery);
          const bStarts = bName.startsWith(lowerQuery) || bEmail.startsWith(lowerQuery);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;

          return 0;
        });
      }

      // Return limited results
      return contacts.slice(0, limit);
    } catch (error) {
      console.error('❌ MCP search error:', error);
      return [];
    }
  }

  async createContact(contactData) {
    // TEMPORARY: Skip MCP, use REST API directly due to 403 issues
    console.log('📝 Creating contact via REST API (MCP has 403 issues)');

    // JWT tokens have locationId embedded - don't add it to body
    // PIT tokens need locationId in body
    const isJWT = !this.apiKey.startsWith('pit-');
    const payload = isJWT ? contactData : { locationId: this.locationId, ...contactData };

    console.log('📝 Contact data:', JSON.stringify(payload));

    try {
      const result = await this.callAPI('/contacts/', 'POST', payload);
      console.log('✅ Contact created via REST API:', result?.contact?.id || 'unknown ID');
      return result;
    } catch (error) {
      console.error('❌ REST API contact creation failed:', error.response?.data || error.message);
      throw error;
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
    // Use REST API directly (MCP has 403 issues)
    console.log('📝 Updating contact via REST API');
    console.log('📝 Update payload:', JSON.stringify(updates));
    // Don't include locationId in PUT body, only in headers/URL
    return await this.callAPI(`/contacts/${contactId}`, 'PUT', updates);
  }

  async deleteContact(contactId) {
    // Use REST API to delete contact
    console.log('🗑️ Deleting contact via REST API');
    console.log('🗑️ Contact ID:', contactId);
    return await this.callAPI(`/contacts/${contactId}`, 'DELETE');
  }

  async upsertContact(contactData) {
    // Use REST API directly (MCP has 403 issues)
    console.log('📝 Upserting contact via REST API');
    const isJWT = !this.apiKey.startsWith('pit-');
    const payload = isJWT ? contactData : { locationId: this.locationId, ...contactData };
    return await this.callAPI('/contacts/upsert', 'POST', payload);
  }

  async addTags(contactId, tags) {
    // Use REST API directly (MCP has 403 issues)
    console.log('🏷️ Adding tags via REST API');
    return await this.callAPI(`/contacts/${contactId}/tags`, 'POST', {
      tags: Array.isArray(tags) ? tags : [tags]
    });
  }

  async removeTags(contactId, tags) {
    // Use REST API directly (MCP has 403 issues)
    console.log('🏷️ Removing tags via REST API');
    return await this.callAPI(`/contacts/${contactId}/tags`, 'DELETE', {
      tags: Array.isArray(tags) ? tags : [tags]
    });
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
    // Use REST API directly (MCP has 403 issues)
    console.log('💰 Updating opportunity via REST API');
    const isJWT = !this.apiKey.startsWith('pit-');
    const payload = isJWT ? updates : { locationId: this.locationId, ...updates };
    return await this.callAPI(`/opportunities/${opportunityId}`, 'PUT', payload);
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
    // Use REST API directly (MCP has 403 issues)
    console.log('💬 Sending message via REST API');
    return await this.callAPI('/conversations/messages', 'POST', {
      conversationId,
      type,
      message
    });
  }

  async sendSMS(contactId, message) {
    // Use REST API directly (MCP has 403 issues)
    console.log('📱 Sending SMS via REST API');
    const isJWT = !this.apiKey.startsWith('pit-');
    const payload = isJWT
      ? { contactId, type: 'SMS', message }
      : { locationId: this.locationId, contactId, type: 'SMS', message };
    return await this.callAPI('/conversations/messages', 'POST', payload);
  }

  async sendEmail(contactId, subject, body) {
    const isJWT = !this.apiKey.startsWith('pit-');
    const payload = isJWT
      ? { contactId, type: 'Email', subject, body }
      : { locationId: this.locationId, contactId, type: 'Email', subject, body };
    return await this.callAPI('/conversations/messages', 'POST', payload);
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

  // Workflows & Campaigns (REST API)
  async addToWorkflow(contactId, workflowId, eventStartTime = null) {
    console.log('🔄 Adding contact to workflow via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/workflow/${workflowId}`, 'POST', {
      eventStartTime: eventStartTime || new Date().toISOString()
    });
  }

  async removeFromWorkflow(contactId, workflowId) {
    console.log('🔄 Removing contact from workflow via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/workflow/${workflowId}`, 'DELETE');
  }

  async addToCampaign(contactId, campaignId) {
    console.log('📢 Adding contact to campaign via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/campaigns/${campaignId}`, 'POST');
  }

  async removeFromCampaign(contactId, campaignId) {
    console.log('📢 Removing contact from campaign via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/campaigns/${campaignId}`, 'DELETE');
  }

  // Tasks (REST API v2)
  async createTask(contactId, taskData) {
    console.log('✅ Creating task via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/tasks`, 'POST', {
      ...taskData
    });
  }

  async updateTask(contactId, taskId, updates) {
    console.log('✅ Updating task via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/tasks/${taskId}`, 'PUT', updates);
  }

  async getTasks(contactId) {
    console.log('✅ Getting tasks via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/tasks`, 'GET');
  }

  async deleteTask(contactId, taskId) {
    console.log('✅ Deleting task via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/tasks/${taskId}`, 'DELETE');
  }

  // Notes (REST API v2)
  async addNote(contactId, body) {
    console.log('📝 Adding note via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/notes`, 'POST', {
      body
    });
  }

  async getNotes(contactId) {
    console.log('📝 Getting notes via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/notes`, 'GET');
  }

  async updateNote(contactId, noteId, body) {
    console.log('📝 Updating note via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/notes/${noteId}`, 'PUT', {
      body
    });
  }

  async deleteNote(contactId, noteId) {
    console.log('📝 Deleting note via REST API v2');
    return await this.callAPI(`/contacts/${contactId}/notes/${noteId}`, 'DELETE');
  }

  // Social Media Posting (REST API v2)
  async createSocialPost(postData) {
    console.log('📱 Creating social media post via REST API v2');
    console.log('📍 Using locationId:', this.locationId);
    console.log('📝 Post data:', JSON.stringify(postData, null, 2));

    const endpoint = `/social-media-posting/${this.locationId}/posts`;
    console.log('🌐 POST endpoint:', endpoint);

    return await this.callAPI(endpoint, 'POST', postData);
  }

  async getSocialPost(postId) {
    console.log('📱 Getting social media post via REST API v2');
    return await this.callAPI(`/social-media-posting/${this.locationId}/posts/${postId}`, 'GET');
  }

  async listSocialPosts(filters = {}) {
    console.log('📱 Listing social media posts via REST API v2');
    console.log('📍 Using locationId:', this.locationId);

    // GoHighLevel uses GET with query params for listing posts
    // Build query params but let callAPI handle locationId for PIT tokens
    const queryParams = {
      limit: filters.limit || 20,
      skip: filters.skip || 0
    };

    const queryString = new URLSearchParams(queryParams).toString();
    const endpoint = `/social-media-posting/${this.locationId}/posts${queryString ? '?' + queryString : ''}`;

    console.log('🌐 Full endpoint:', endpoint);
    return await this.callAPI(endpoint, 'GET');
  }

  async updateSocialPost(postId, updates) {
    console.log('📱 Updating social media post via REST API v2');
    return await this.callAPI(`/social-media-posting/${this.locationId}/posts/${postId}`, 'PUT', updates);
  }

  async deleteSocialPost(postId) {
    console.log('📱 Deleting social media post via REST API v2');
    return await this.callAPI(`/social-media-posting/${this.locationId}/posts/${postId}`, 'DELETE');
  }

  async getSocialAccounts(platform = 'facebook') {
    console.log(`📱 Getting ${platform} accounts via REST API v2`);
    return await this.callAPI(`/social-media-posting/oauth/${this.locationId}/${platform}/accounts`, 'GET');
  }

  // Inbound Webhook Trigger (for workflows)
  async triggerInboundWebhook(webhookUrl, payload) {
    console.log('🪝 Triggering inbound webhook');
    try {
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.data || { success: true };
    } catch (error) {
      console.error('❌ Webhook trigger failed:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = GoHighLevelMCPProxy;
