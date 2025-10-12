const axios = require('axios');

class HubSpotMCPProxy {
  constructor(accessToken) {
    this.baseURL = 'https://api.hubapi.com';
    this.accessToken = accessToken;
  }

  async callAPI(endpoint, method = 'GET', data = null) {
    try {
      const response = await axios({
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        data
      });
      return response.data;
    } catch (error) {
      console.error('HubSpot API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async searchContacts(query, limit = 10) {
    const response = await this.callAPI('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'CONTAINS_TOKEN',
          value: query
        }]
      }],
      limit
    });
    return response.results || [];
  }

  async createContact(contactData) {
    return await this.callAPI('/crm/v3/objects/contacts', 'POST', {
      properties: contactData
    });
  }

  async getContact(contactId) {
    return await this.callAPI(`/crm/v3/objects/contacts/${contactId}`);
  }

  async updateContact(contactId, updates) {
    return await this.callAPI(`/crm/v3/objects/contacts/${contactId}`, 'PATCH', {
      properties: updates
    });
  }

  async getDeals(filters = {}) {
    const response = await this.callAPI('/crm/v3/objects/deals', 'GET');
    return response.results || [];
  }

  async createDeal(dealData) {
    return await this.callAPI('/crm/v3/objects/deals', 'POST', {
      properties: dealData
    });
  }

  async createTask(taskData) {
    return await this.callAPI('/crm/v3/objects/tasks', 'POST', {
      properties: taskData
    });
  }

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

  async createAppointment(appointmentData) {
    return await this.callAPI('/crm/v3/objects/meetings', 'POST', {
      properties: appointmentData
    });
  }
}

module.exports = HubSpotMCPProxy;
