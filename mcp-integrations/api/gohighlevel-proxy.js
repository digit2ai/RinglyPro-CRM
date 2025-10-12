const axios = require('axios');

class GoHighLevelMCPProxy {
  constructor(apiKey, locationId) {
    this.baseURL = 'https://services.leadconnectorhq.com';
    this.apiKey = apiKey;
    this.locationId = locationId;
  }

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

  async searchContacts(query, limit = 10) {
    const response = await this.callAPI(
      `/contacts/?locationId=${this.locationId}&query=${encodeURIComponent(query)}&limit=${limit}`
    );
    return response.contacts || [];
  }

  async createContact(contactData) {
    return await this.callAPI('/contacts/', 'POST', {
      locationId: this.locationId,
      ...contactData
    });
  }

  async getContact(contactId) {
    return await this.callAPI(`/contacts/${contactId}`);
  }

  async updateContact(contactId, updates) {
    return await this.callAPI(`/contacts/${contactId}`, 'PUT', {
      locationId: this.locationId,
      ...updates
    });
  }

  async getOpportunities(filters = {}) {
    const response = await this.callAPI(
      `/opportunities/search?locationId=${this.locationId}`,
      'POST',
      filters
    );
    return response.opportunities || [];
  }

  async createOpportunity(opportunityData) {
    return await this.callAPI('/opportunities/', 'POST', {
      locationId: this.locationId,
      ...opportunityData
    });
  }

  async sendSMS(contactId, message) {
    return await this.callAPI('/conversations/messages', 'POST', {
      locationId: this.locationId,
      contactId,
      type: 'SMS',
      message
    });
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

  async getCalendars() {
    return await this.callAPI(`/calendars/?locationId=${this.locationId}`);
  }

  async createAppointment(appointmentData) {
    return await this.callAPI('/calendars/events/appointments', 'POST', {
      locationId: this.locationId,
      ...appointmentData
    });
  }

  async addToWorkflow(contactId, workflowId) {
    return await this.callAPI('/workflows/add-contact', 'POST', {
      locationId: this.locationId,
      contactId,
      workflowId
    });
  }
}

module.exports = GoHighLevelMCPProxy;
