/**
 * Google Calendar Service
 *
 * Handles all Google Calendar API operations including:
 * - OAuth token management and refresh
 * - Calendar listing
 * - Event creation, update, deletion
 * - Free/busy availability checking
 */

const { google } = require('googleapis');
const GoogleCalendarIntegration = require('../models/GoogleCalendarIntegration');

class GoogleCalendarService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI;
  }

  /**
   * Create OAuth2 client with credentials
   */
  createOAuth2Client() {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  /**
   * Generate authorization URL for client to connect their Google Calendar
   * @param {number} clientId - RinglyPro client ID
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(clientId) {
    const oauth2Client = this.createOAuth2Client();

    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent to get refresh token
      state: JSON.stringify({ clientId }) // Pass client ID through state
    });
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from Google
   * @returns {object} Token response
   */
  async getTokensFromCode(code) {
    const oauth2Client = this.createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  /**
   * Get user's email from token
   * @param {string} accessToken - Valid access token
   * @returns {string} User's email
   */
  async getUserEmail(accessToken) {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data.email;
  }

  /**
   * Get authenticated OAuth2 client for a RinglyPro client
   * Automatically refreshes token if expired
   * @param {number} clientId - RinglyPro client ID
   * @returns {OAuth2Client} Authenticated OAuth2 client
   */
  async getAuthenticatedClient(clientId) {
    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);

    if (!integration) {
      throw new Error('Google Calendar not connected for this client');
    }

    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
      token_type: integration.tokenType,
      expiry_date: integration.expiresAt.getTime()
    });

    // Check if token needs refresh
    if (integration.isTokenExpired()) {
      console.log(`🔄 Refreshing Google token for client ${clientId}`);

      try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Update stored tokens
        await integration.update({
          accessToken: credentials.access_token,
          expiresAt: new Date(credentials.expiry_date),
          lastError: null
        });

        oauth2Client.setCredentials(credentials);
        console.log(`✅ Token refreshed for client ${clientId}`);
      } catch (error) {
        console.error(`❌ Token refresh failed for client ${clientId}:`, error.message);
        await integration.update({
          lastError: `Token refresh failed: ${error.message}`
        });
        throw new Error('Failed to refresh Google Calendar token. Please reconnect.');
      }
    }

    return oauth2Client;
  }

  /**
   * List all calendars for a client
   * @param {number} clientId - RinglyPro client ID
   * @returns {Array} List of calendars
   */
  async listCalendars(clientId) {
    const auth = await this.getAuthenticatedClient(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const { data } = await calendar.calendarList.list();

    return data.items.map(cal => ({
      id: cal.id,
      name: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor
    }));
  }

  /**
   * Get free/busy information for availability checking
   * @param {number} clientId - RinglyPro client ID
   * @param {Date} startTime - Start of time range
   * @param {Date} endTime - End of time range
   * @returns {Array} Busy time slots
   */
  async getFreeBusy(clientId, startTime, endTime) {
    const auth = await this.getAuthenticatedClient(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);
    const calendarId = integration?.calendarId || 'primary';

    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: calendarId }]
      }
    });

    const busySlots = data.calendars[calendarId]?.busy || [];
    return busySlots.map(slot => ({
      start: new Date(slot.start),
      end: new Date(slot.end)
    }));
  }

  /**
   * Check if a specific time slot is available
   * @param {number} clientId - RinglyPro client ID
   * @param {Date} startTime - Appointment start time
   * @param {Date} endTime - Appointment end time
   * @returns {boolean} True if slot is available
   */
  async isSlotAvailable(clientId, startTime, endTime) {
    try {
      const busySlots = await this.getFreeBusy(clientId, startTime, endTime);

      // Check if any busy slot overlaps with requested time
      for (const slot of busySlots) {
        if (startTime < slot.end && endTime > slot.start) {
          return false; // Overlap found
        }
      }
      return true;
    } catch (error) {
      console.error(`Error checking Google Calendar availability:`, error.message);
      // If we can't check Google, assume available (fail open)
      return true;
    }
  }

  /**
   * Create an event in Google Calendar
   * @param {number} clientId - RinglyPro client ID
   * @param {object} eventDetails - Event details
   * @returns {object} Created event
   */
  async createEvent(clientId, eventDetails) {
    const auth = await this.getAuthenticatedClient(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);
    const calendarId = integration?.calendarId || 'primary';

    const event = {
      summary: eventDetails.title || eventDetails.customerName || 'RinglyPro Appointment',
      description: this.buildEventDescription(eventDetails),
      start: {
        dateTime: eventDetails.startTime.toISOString(),
        timeZone: eventDetails.timezone || 'America/New_York'
      },
      end: {
        dateTime: eventDetails.endTime.toISOString(),
        timeZone: eventDetails.timezone || 'America/New_York'
      },
      attendees: eventDetails.customerEmail ? [{ email: eventDetails.customerEmail }] : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 30 }
        ]
      },
      // Store RinglyPro appointment ID in extended properties for sync
      extendedProperties: {
        private: {
          ringlyproAppointmentId: String(eventDetails.appointmentId || ''),
          ringlyproClientId: String(clientId),
          source: 'ringlypro'
        }
      }
    };

    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: event,
      sendUpdates: eventDetails.sendNotifications ? 'all' : 'none'
    });

    console.log(`✅ Created Google Calendar event: ${data.id}`);

    // Update last synced timestamp
    await integration.update({ lastSyncedAt: new Date(), lastError: null });

    return {
      googleEventId: data.id,
      htmlLink: data.htmlLink,
      status: data.status
    };
  }

  /**
   * Update an existing event in Google Calendar
   * @param {number} clientId - RinglyPro client ID
   * @param {string} eventId - Google Calendar event ID
   * @param {object} eventDetails - Updated event details
   * @returns {object} Updated event
   */
  async updateEvent(clientId, eventId, eventDetails) {
    const auth = await this.getAuthenticatedClient(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);
    const calendarId = integration?.calendarId || 'primary';

    const event = {
      summary: eventDetails.title || eventDetails.customerName,
      description: this.buildEventDescription(eventDetails),
      start: {
        dateTime: eventDetails.startTime.toISOString(),
        timeZone: eventDetails.timezone || 'America/New_York'
      },
      end: {
        dateTime: eventDetails.endTime.toISOString(),
        timeZone: eventDetails.timezone || 'America/New_York'
      }
    };

    const { data } = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: event,
      sendUpdates: eventDetails.sendNotifications ? 'all' : 'none'
    });

    console.log(`✅ Updated Google Calendar event: ${data.id}`);
    return data;
  }

  /**
   * Delete an event from Google Calendar
   * @param {number} clientId - RinglyPro client ID
   * @param {string} eventId - Google Calendar event ID
   */
  async deleteEvent(clientId, eventId) {
    const auth = await this.getAuthenticatedClient(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);
    const calendarId = integration?.calendarId || 'primary';

    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all'
    });

    console.log(`✅ Deleted Google Calendar event: ${eventId}`);
  }

  /**
   * List events from Google Calendar (for sync/display)
   * @param {number} clientId - RinglyPro client ID
   * @param {Date} startTime - Start of time range
   * @param {Date} endTime - End of time range
   * @returns {Array} List of events
   */
  async listEvents(clientId, startTime, endTime) {
    const auth = await this.getAuthenticatedClient(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);
    const calendarId = integration?.calendarId || 'primary';

    const { data } = await calendar.events.list({
      calendarId,
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    return data.items.map(event => ({
      id: event.id,
      title: event.summary,
      description: event.description,
      start: new Date(event.start.dateTime || event.start.date),
      end: new Date(event.end.dateTime || event.end.date),
      status: event.status,
      htmlLink: event.htmlLink,
      isRinglyProEvent: event.extendedProperties?.private?.source === 'ringlypro',
      ringlyproAppointmentId: event.extendedProperties?.private?.ringlyproAppointmentId
    }));
  }

  /**
   * Build event description from appointment details
   */
  buildEventDescription(details) {
    const lines = [
      `Booked via RinglyPro`,
      '',
      details.customerName ? `Customer: ${details.customerName}` : null,
      details.customerPhone ? `Phone: ${details.customerPhone}` : null,
      details.customerEmail ? `Email: ${details.customerEmail}` : null,
      details.purpose ? `Service: ${details.purpose}` : null,
      details.notes ? `Notes: ${details.notes}` : null,
      '',
      details.confirmationCode ? `Confirmation: ${details.confirmationCode}` : null
    ].filter(Boolean);

    return lines.join('\n');
  }

  /**
   * Disconnect Google Calendar for a client
   * @param {number} clientId - RinglyPro client ID
   */
  async disconnect(clientId) {
    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);

    if (integration) {
      // Revoke token with Google
      try {
        const oauth2Client = this.createOAuth2Client();
        await oauth2Client.revokeToken(integration.accessToken);
      } catch (error) {
        console.log('Token revocation failed (may already be revoked):', error.message);
      }

      // Mark as inactive (or delete)
      await integration.update({ isActive: false });
      console.log(`✅ Disconnected Google Calendar for client ${clientId}`);
    }
  }

  /**
   * Get connection status for a client
   * @param {number} clientId - RinglyPro client ID
   * @returns {object} Connection status
   */
  async getConnectionStatus(clientId) {
    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      email: integration.googleEmail,
      calendarId: integration.calendarId,
      calendarName: integration.calendarName,
      syncAppointments: integration.syncAppointments,
      syncBlockedTimes: integration.syncBlockedTimes,
      lastSyncedAt: integration.lastSyncedAt,
      lastError: integration.lastError,
      tokenExpired: integration.isTokenExpired()
    };
  }
}

module.exports = new GoogleCalendarService();
