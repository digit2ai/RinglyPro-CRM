# Google Calendar OAuth Integration - Full Implementation Plan

## Document Created: 2026-01-09
## Target Client: Client 15 (Pilot)
## Excluded Client: Client 32 (DO NOT TOUCH)

---

## Overview

Implement self-service Google Calendar OAuth integration allowing RinglyPro clients to connect their Google Calendar directly, bypassing the need for GoHighLevel (GHL) as an intermediary.

### Current State (Client 15)
```
RinglyPro → GHL Calendar → Google Calendar (via GHL's built-in sync)
```

### Target State (Client 15)
```
RinglyPro → Google Calendar API (direct OAuth)
```

### Client 32 (No Changes)
```
RinglyPro → GHL Calendar (unchanged, do not modify)
```

---

## Pre-Implementation Steps (Manual - User Must Do)

### 1. Remove Existing GHL ↔ Google Calendar Sync
- Go to GoHighLevel settings for Client 15
- Disconnect the Google Calendar integration in GHL
- This prevents duplicate syncing once RinglyPro direct integration is active

### 2. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Create Project"
   - Project name: `RinglyPro Calendar`
   - Organization: (your organization or leave blank)
3. Click "Create"

### 3. Enable Google Calendar API
1. In Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

### 4. Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External" user type (for production) or "Internal" (for testing)
3. Fill in required fields:
   - **App name**: `RinglyPro`
   - **User support email**: your email
   - **App logo**: (optional) RinglyPro logo
   - **App domain**: `ringlypro-crm.onrender.com`
   - **Authorized domains**: `onrender.com`
   - **Developer contact email**: your email
4. Click "Save and Continue"
5. Add Scopes:
   - Click "Add or Remove Scopes"
   - Add these scopes:
     - `https://www.googleapis.com/auth/calendar.readonly` (View calendars)
     - `https://www.googleapis.com/auth/calendar.events` (Create/edit/delete events)
   - Click "Update"
6. Add Test Users (while in testing mode):
   - Add your Google email and Client 15's Google email
7. Click "Save and Continue"

### 5. Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: `RinglyPro Web Client`
5. Authorized JavaScript origins:
   - `https://ringlypro-crm.onrender.com`
   - `http://localhost:3000` (for local testing)
6. Authorized redirect URIs:
   - `https://ringlypro-crm.onrender.com/api/google-oauth/callback`
   - `http://localhost:3000/api/google-oauth/callback` (for local testing)
7. Click "Create"
8. **Copy and save**:
   - Client ID: `xxxxxxxxxx.apps.googleusercontent.com`
   - Client Secret: `GOCSPX-xxxxxxxxxx`

### 6. Add Environment Variables to Render
In Render dashboard for RinglyPro-CRM, add:
```
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret-here
GOOGLE_REDIRECT_URI=https://ringlypro-crm.onrender.com/api/google-oauth/callback
```

---

## Implementation Steps (Developer Tasks)

### Phase 1: Install Dependencies

```bash
npm install googleapis google-auth-library --save
```

**Files Modified:**
- `package.json` - Add googleapis and google-auth-library

---

### Phase 2: Database Migration

**Create file:** `migrations/YYYYMMDDHHMMSS-create-google-calendar-integrations.js`

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('google_calendar_integrations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'clients',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      google_email: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Google account email used for authorization'
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'OAuth access token (encrypted in production)'
      },
      refresh_token: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'OAuth refresh token for getting new access tokens'
      },
      token_type: {
        type: Sequelize.STRING,
        defaultValue: 'Bearer'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the access token expires'
      },
      scope: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Granted OAuth scopes'
      },
      calendar_id: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'primary',
        comment: 'Selected Google Calendar ID to sync with'
      },
      calendar_name: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Display name of selected calendar'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this integration is currently active'
      },
      sync_appointments: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether to sync RinglyPro appointments to Google'
      },
      sync_blocked_times: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether to check Google Calendar for blocked times'
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last successful sync timestamp'
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Last error message if any'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Index for quick lookups
    await queryInterface.addIndex('google_calendar_integrations', ['client_id']);
    await queryInterface.addIndex('google_calendar_integrations', ['is_active']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('google_calendar_integrations');
  }
};
```

**Run migration:**
```bash
npm run migrate
```

---

### Phase 3: Create Sequelize Model

**Create file:** `src/models/GoogleCalendarIntegration.js`

```javascript
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GoogleCalendarIntegration = sequelize.define('GoogleCalendarIntegration', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  clientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'client_id'
  },
  googleEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'google_email'
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'access_token'
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'refresh_token'
  },
  tokenType: {
    type: DataTypes.STRING,
    defaultValue: 'Bearer',
    field: 'token_type'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at'
  },
  scope: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  calendarId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'primary',
    field: 'calendar_id'
  },
  calendarName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'calendar_name'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  syncAppointments: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'sync_appointments'
  },
  syncBlockedTimes: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'sync_blocked_times'
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_synced_at'
  },
  lastError: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'last_error'
  }
}, {
  tableName: 'google_calendar_integrations',
  timestamps: true,
  underscored: true
});

// Check if token is expired (with 5 minute buffer)
GoogleCalendarIntegration.prototype.isTokenExpired = function() {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return new Date() >= new Date(this.expiresAt.getTime() - bufferMs);
};

// Get active integration for a client
GoogleCalendarIntegration.getActiveForClient = async function(clientId) {
  return this.findOne({
    where: { clientId, isActive: true }
  });
};

module.exports = GoogleCalendarIntegration;
```

---

### Phase 4: Create Google Calendar Service

**Create file:** `src/services/googleCalendarService.js`

```javascript
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
```

---

### Phase 5: Create OAuth Routes

**Create file:** `src/routes/google-oauth.js`

```javascript
/**
 * Google Calendar OAuth Routes
 *
 * Handles the OAuth flow for connecting client Google Calendars:
 * - /authorize - Initiates OAuth flow
 * - /callback - Handles Google's OAuth callback
 * - /status - Check connection status
 * - /calendars - List available calendars
 * - /select-calendar - Select which calendar to use
 * - /disconnect - Remove Google Calendar connection
 */

const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendarService');
const GoogleCalendarIntegration = require('../models/GoogleCalendarIntegration');

/**
 * GET /api/google-oauth/authorize/:clientId
 * Start the OAuth flow - redirects to Google
 */
router.get('/authorize/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);

    // Validate client exists and is allowed (exclude Client 32)
    if (clientId === 32) {
      return res.status(403).json({
        error: 'Google Calendar integration is not available for this client'
      });
    }

    const authUrl = googleCalendarService.getAuthorizationUrl(clientId);

    console.log(`🔗 Google OAuth initiated for client ${clientId}`);
    res.redirect(authUrl);

  } catch (error) {
    console.error('OAuth authorization error:', error);
    res.status(500).json({ error: 'Failed to start authorization' });
  }
});

/**
 * GET /api/google-oauth/callback
 * Handle Google's OAuth callback
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('OAuth callback error:', error);
      return res.redirect('/dashboard?google_error=access_denied');
    }

    if (!code || !state) {
      return res.redirect('/dashboard?google_error=missing_params');
    }

    // Parse state to get client ID
    let clientId;
    try {
      const stateData = JSON.parse(state);
      clientId = stateData.clientId;
    } catch (e) {
      return res.redirect('/dashboard?google_error=invalid_state');
    }

    console.log(`🔄 Processing Google OAuth callback for client ${clientId}`);

    // Exchange code for tokens
    const tokens = await googleCalendarService.getTokensFromCode(code);

    // Get user's email
    const googleEmail = await googleCalendarService.getUserEmail(tokens.access_token);

    // Calculate token expiration
    const expiresAt = new Date(tokens.expiry_date || Date.now() + (tokens.expires_in * 1000));

    // Check for existing integration
    const existing = await GoogleCalendarIntegration.findOne({
      where: { clientId }
    });

    if (existing) {
      // Update existing integration
      await existing.update({
        googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existing.refreshToken,
        tokenType: tokens.token_type || 'Bearer',
        expiresAt,
        scope: tokens.scope,
        isActive: true,
        lastError: null
      });
      console.log(`✅ Updated Google Calendar integration for client ${clientId}`);
    } else {
      // Create new integration
      await GoogleCalendarIntegration.create({
        clientId,
        googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type || 'Bearer',
        expiresAt,
        scope: tokens.scope,
        calendarId: 'primary',
        isActive: true
      });
      console.log(`✅ Created Google Calendar integration for client ${clientId}`);
    }

    // Redirect to calendar selection page or dashboard
    res.redirect(`/dashboard?client_id=${clientId}&google_connected=true`);

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    res.redirect('/dashboard?google_error=callback_failed');
  }
});

/**
 * GET /api/google-oauth/status/:clientId
 * Check Google Calendar connection status
 */
router.get('/status/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const status = await googleCalendarService.getConnectionStatus(clientId);
    res.json(status);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

/**
 * GET /api/google-oauth/calendars/:clientId
 * List available Google Calendars for selection
 */
router.get('/calendars/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const calendars = await googleCalendarService.listCalendars(clientId);
    res.json({ calendars });
  } catch (error) {
    console.error('Calendar list error:', error);
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

/**
 * POST /api/google-oauth/select-calendar/:clientId
 * Select which calendar to use for syncing
 */
router.post('/select-calendar/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { calendarId, calendarName } = req.body;

    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);

    if (!integration) {
      return res.status(404).json({ error: 'Google Calendar not connected' });
    }

    await integration.update({ calendarId, calendarName });

    res.json({
      success: true,
      message: `Calendar "${calendarName}" selected`,
      calendarId
    });

  } catch (error) {
    console.error('Calendar selection error:', error);
    res.status(500).json({ error: 'Failed to select calendar' });
  }
});

/**
 * POST /api/google-oauth/settings/:clientId
 * Update sync settings
 */
router.post('/settings/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { syncAppointments, syncBlockedTimes } = req.body;

    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);

    if (!integration) {
      return res.status(404).json({ error: 'Google Calendar not connected' });
    }

    await integration.update({ syncAppointments, syncBlockedTimes });

    res.json({ success: true, message: 'Settings updated' });

  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * POST /api/google-oauth/disconnect/:clientId
 * Disconnect Google Calendar
 */
router.post('/disconnect/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    await googleCalendarService.disconnect(clientId);
    res.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

/**
 * POST /api/google-oauth/test-create-event/:clientId
 * Test endpoint to create a sample event (for testing only)
 */
router.post('/test-create-event/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);

    const testEvent = {
      title: 'Test RinglyPro Appointment',
      customerName: 'Test Customer',
      customerPhone: '+1234567890',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // Tomorrow + 1 hour
      purpose: 'Test Appointment',
      confirmationCode: 'TEST123',
      timezone: 'America/New_York'
    };

    const result = await googleCalendarService.createEvent(clientId, testEvent);
    res.json({ success: true, event: result });

  } catch (error) {
    console.error('Test event creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

### Phase 6: Register Routes in App

**Update file:** `src/app.js`

Add these lines where other routes are registered:

```javascript
// Google Calendar OAuth routes
const googleOAuthRoutes = require('./routes/google-oauth');
app.use('/api/google-oauth', googleOAuthRoutes);
```

---

### Phase 7: Update Dual Calendar Service

**Update file:** `src/services/dualCalendarService.js`

Add Google Calendar as a third availability source:

```javascript
const googleCalendarService = require('./googleCalendarService');
const GoogleCalendarIntegration = require('../models/GoogleCalendarIntegration');

// Add to getCombinedAvailability function:
async function getCombinedAvailability(clientId, date, timezone) {
  // ... existing RinglyPro and GHL availability logic ...

  // Check Google Calendar availability
  const googleIntegration = await GoogleCalendarIntegration.getActiveForClient(clientId);

  if (googleIntegration && googleIntegration.syncBlockedTimes) {
    try {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const googleBusy = await googleCalendarService.getFreeBusy(clientId, dayStart, dayEnd);

      // Filter out slots that conflict with Google Calendar
      availableSlots = availableSlots.filter(slot => {
        const slotStart = new Date(slot.startTime);
        const slotEnd = new Date(slot.endTime);

        return !googleBusy.some(busy =>
          slotStart < busy.end && slotEnd > busy.start
        );
      });
    } catch (error) {
      console.error(`Google Calendar availability check failed:`, error.message);
      // Continue with available slots (fail open)
    }
  }

  return availableSlots;
}
```

---

### Phase 8: Update Appointment Booking

**Update file:** `src/services/crmAppointmentService.js` (or wherever appointments are created)

Add Google Calendar sync when appointment is booked:

```javascript
const googleCalendarService = require('./googleCalendarService');
const GoogleCalendarIntegration = require('../models/GoogleCalendarIntegration');

// Add after appointment is created in database:
async function syncToGoogleCalendar(clientId, appointment) {
  try {
    const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);

    if (!integration || !integration.syncAppointments) {
      return null;
    }

    // Skip Client 32 explicitly
    if (clientId === 32) {
      return null;
    }

    const eventDetails = {
      appointmentId: appointment.id,
      title: appointment.purpose || 'RinglyPro Appointment',
      customerName: appointment.customerName,
      customerPhone: appointment.customerPhone,
      customerEmail: appointment.customerEmail,
      startTime: new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}`),
      endTime: calculateEndTime(appointment),
      purpose: appointment.purpose,
      notes: appointment.notes,
      confirmationCode: appointment.confirmationCode,
      timezone: 'America/New_York'
    };

    const googleEvent = await googleCalendarService.createEvent(clientId, eventDetails);

    // Store Google event ID in appointment for future updates/deletes
    await appointment.update({
      googleEventId: googleEvent.googleEventId
    });

    return googleEvent;

  } catch (error) {
    console.error(`Failed to sync appointment to Google Calendar:`, error.message);
    return null;
  }
}
```

---

### Phase 9: Add Dashboard UI (Settings Page)

**Update file:** `views/dashboard.ejs` or create settings partial

Add Google Calendar integration section to Settings:

```html
<!-- Google Calendar Integration Section -->
<div id="googleCalendarSection" class="integration-section" style="display: none;">
  <h3>Google Calendar Integration</h3>

  <div id="googleNotConnected" style="display: none;">
    <p>Connect your Google Calendar to automatically sync appointments.</p>
    <button onclick="connectGoogleCalendar()" class="btn btn-primary">
      <img src="/images/google-calendar-icon.svg" alt="" style="width: 20px; margin-right: 8px;">
      Connect Google Calendar
    </button>
  </div>

  <div id="googleConnected" style="display: none;">
    <div class="connection-status">
      <span class="status-indicator connected"></span>
      <strong>Connected</strong>
    </div>
    <p>Account: <span id="googleEmail"></span></p>
    <p>Calendar: <span id="googleCalendarName"></span></p>

    <div class="sync-options">
      <label>
        <input type="checkbox" id="syncAppointments" checked onchange="updateGoogleSettings()">
        Sync new appointments to Google Calendar
      </label>
      <label>
        <input type="checkbox" id="syncBlockedTimes" checked onchange="updateGoogleSettings()">
        Check Google Calendar for busy times
      </label>
    </div>

    <div class="calendar-actions">
      <button onclick="showCalendarSelector()" class="btn btn-secondary">Change Calendar</button>
      <button onclick="disconnectGoogleCalendar()" class="btn btn-danger">Disconnect</button>
    </div>
  </div>

  <!-- Calendar Selector Modal -->
  <div id="calendarSelectorModal" class="modal" style="display: none;">
    <div class="modal-content">
      <h4>Select Calendar</h4>
      <div id="calendarList"></div>
      <button onclick="closeCalendarSelector()" class="btn btn-secondary">Cancel</button>
    </div>
  </div>
</div>

<script>
// Google Calendar Integration JavaScript
const CLIENT_ID = <%= clientId %>;

// Only show Google Calendar section for allowed clients (not Client 32)
if (CLIENT_ID !== 32) {
  document.getElementById('googleCalendarSection').style.display = 'block';
  checkGoogleCalendarStatus();
}

async function checkGoogleCalendarStatus() {
  try {
    const response = await fetch(`/api/google-oauth/status/${CLIENT_ID}`);
    const status = await response.json();

    if (status.connected) {
      document.getElementById('googleNotConnected').style.display = 'none';
      document.getElementById('googleConnected').style.display = 'block';
      document.getElementById('googleEmail').textContent = status.email;
      document.getElementById('googleCalendarName').textContent = status.calendarName || 'Primary';
      document.getElementById('syncAppointments').checked = status.syncAppointments;
      document.getElementById('syncBlockedTimes').checked = status.syncBlockedTimes;
    } else {
      document.getElementById('googleNotConnected').style.display = 'block';
      document.getElementById('googleConnected').style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to check Google Calendar status:', error);
  }
}

function connectGoogleCalendar() {
  window.location.href = `/api/google-oauth/authorize/${CLIENT_ID}`;
}

async function disconnectGoogleCalendar() {
  if (!confirm('Are you sure you want to disconnect Google Calendar?')) return;

  try {
    await fetch(`/api/google-oauth/disconnect/${CLIENT_ID}`, { method: 'POST' });
    checkGoogleCalendarStatus();
    alert('Google Calendar disconnected');
  } catch (error) {
    alert('Failed to disconnect: ' + error.message);
  }
}

async function showCalendarSelector() {
  try {
    const response = await fetch(`/api/google-oauth/calendars/${CLIENT_ID}`);
    const { calendars } = await response.json();

    const listHtml = calendars.map(cal => `
      <div class="calendar-option" onclick="selectCalendar('${cal.id}', '${cal.name}')">
        <span class="calendar-color" style="background: ${cal.backgroundColor}"></span>
        ${cal.name} ${cal.primary ? '(Primary)' : ''}
      </div>
    `).join('');

    document.getElementById('calendarList').innerHTML = listHtml;
    document.getElementById('calendarSelectorModal').style.display = 'flex';
  } catch (error) {
    alert('Failed to load calendars: ' + error.message);
  }
}

async function selectCalendar(calendarId, calendarName) {
  try {
    await fetch(`/api/google-oauth/select-calendar/${CLIENT_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId, calendarName })
    });

    closeCalendarSelector();
    checkGoogleCalendarStatus();
  } catch (error) {
    alert('Failed to select calendar: ' + error.message);
  }
}

function closeCalendarSelector() {
  document.getElementById('calendarSelectorModal').style.display = 'none';
}

async function updateGoogleSettings() {
  try {
    await fetch(`/api/google-oauth/settings/${CLIENT_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        syncAppointments: document.getElementById('syncAppointments').checked,
        syncBlockedTimes: document.getElementById('syncBlockedTimes').checked
      })
    });
  } catch (error) {
    alert('Failed to update settings: ' + error.message);
  }
}
</script>
```

---

### Phase 10: Add google_event_id Column to Appointments

**Create migration:** `migrations/YYYYMMDDHHMMSS-add-google-event-id-to-appointments.js`

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('appointments', 'google_event_id', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Google Calendar event ID for sync tracking'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('appointments', 'google_event_id');
  }
};
```

---

## Testing Plan

### 1. Test OAuth Flow
```bash
# Start local server
npm run dev

# Open browser and navigate to:
http://localhost:3000/api/google-oauth/authorize/15

# Should redirect to Google sign-in
# After sign-in, should redirect back with google_connected=true
```

### 2. Test Connection Status
```bash
curl http://localhost:3000/api/google-oauth/status/15
```

### 3. Test Calendar Listing
```bash
curl http://localhost:3000/api/google-oauth/calendars/15
```

### 4. Test Event Creation
```bash
curl -X POST http://localhost:3000/api/google-oauth/test-create-event/15
```

### 5. Verify in Google Calendar
- Check that test event appears in the connected Google Calendar

---

## Rollout Plan

### Phase 1: Client 15 Only
1. Deploy to production
2. Client 15 connects Google Calendar via Settings
3. Test appointment booking → verify sync to Google
4. Monitor for errors for 1 week

### Phase 2: All Clients (Except 32)
1. If Client 15 works successfully, enable for all clients
2. Remove client ID restrictions (keep Client 32 excluded)
3. Add Google Calendar option to onboarding flow

### Client 32 Exclusion
- Client 32 check is hardcoded in:
  - `google-oauth.js` authorize route
  - Dashboard UI (hide section for Client 32)
  - Appointment sync function

---

## Files to Create/Modify Summary

### New Files
- `migrations/YYYYMMDDHHMMSS-create-google-calendar-integrations.js`
- `migrations/YYYYMMDDHHMMSS-add-google-event-id-to-appointments.js`
- `src/models/GoogleCalendarIntegration.js`
- `src/services/googleCalendarService.js`
- `src/routes/google-oauth.js`

### Modified Files
- `package.json` - Add googleapis, google-auth-library
- `src/app.js` - Register google-oauth routes
- `src/services/dualCalendarService.js` - Add Google availability check
- `src/services/crmAppointmentService.js` - Add Google sync on booking
- `views/dashboard.ejs` - Add Google Calendar UI section
- `src/models/Appointment.js` - Add googleEventId field

### Environment Variables
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://ringlypro-crm.onrender.com/api/google-oauth/callback
```

---

## Prompt to Resume Development

When ready to implement, use this prompt:

```
I want to implement the Google Calendar OAuth integration as documented in
docs/google-calendar-integration-plan.md

I have completed the Google Cloud Console setup and have:
- GOOGLE_CLIENT_ID: [paste here]
- GOOGLE_CLIENT_SECRET: [paste here]

Please implement Phase 1 through Phase 10 in order:
1. Install npm packages
2. Create database migration
3. Create GoogleCalendarIntegration model
4. Create googleCalendarService.js
5. Create google-oauth.js routes
6. Register routes in app.js
7. Update dualCalendarService.js
8. Update appointment booking to sync to Google
9. Add Settings UI for Google Calendar
10. Add google_event_id to appointments table

Remember:
- Client 32 must be excluded from all Google Calendar features
- This is initially for Client 15 only as a pilot
- Do not modify any Client 32 specific code or settings
```

---

## Document Version
- Created: 2026-01-09
- Author: Claude Code
- Status: Ready for implementation pending Google Cloud credentials
