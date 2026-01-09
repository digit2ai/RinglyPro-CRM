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
      return res.redirect('/settings/google-calendar?error=access_denied');
    }

    if (!code || !state) {
      return res.redirect('/settings/google-calendar?error=missing_params');
    }

    // Parse state to get client ID
    let clientId;
    try {
      const stateData = JSON.parse(state);
      clientId = stateData.clientId;
    } catch (e) {
      return res.redirect('/settings/google-calendar?error=invalid_state');
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

    // Redirect to Google Calendar settings page with success message
    res.redirect(`/settings/google-calendar?client_id=${clientId}&connected=true`);

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    res.redirect('/settings/google-calendar?error=callback_failed');
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
 * GET /api/google-oauth/events/:clientId
 * Get Google Calendar events for display in RinglyPro
 */
router.get('/events/:clientId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { startDate, endDate } = req.query;

    // Default to current week if no dates provided
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    const start = startDate ? new Date(startDate) : weekStart;
    const end = endDate ? new Date(endDate) : weekEnd;

    // Check if Google Calendar is connected
    const status = await googleCalendarService.getConnectionStatus(clientId);
    if (!status.connected) {
      return res.json({
        events: [],
        connected: false,
        message: 'Google Calendar not connected'
      });
    }

    const events = await googleCalendarService.listEvents(clientId, start, end);

    // Transform events to match RinglyPro appointment format for easy display
    const formattedEvents = events.map(event => ({
      id: `gcal_${event.id}`,
      googleEventId: event.id,
      customerName: event.title || 'Google Calendar Event',
      customer_name: event.title || 'Google Calendar Event',
      appointmentDate: event.start.toISOString().split('T')[0],
      appointment_date: event.start.toISOString().split('T')[0],
      appointmentTime: event.start.toTimeString().slice(0, 5),
      appointment_time: event.start.toTimeString().slice(0, 5),
      endTime: event.end.toTimeString().slice(0, 5),
      duration: Math.round((event.end - event.start) / (1000 * 60)),
      purpose: event.description?.split('\n')[0] || '',
      notes: event.description || '',
      status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
      source: 'google_calendar',
      isRinglyProEvent: event.isRinglyProEvent,
      htmlLink: event.htmlLink,
      // Visual indicator for Google Calendar events
      calendarSource: event.isRinglyProEvent ? 'RinglyPro (synced)' : 'Google Calendar'
    }));

    res.json({
      events: formattedEvents,
      connected: true,
      calendarName: status.calendarName || 'Primary',
      count: formattedEvents.length
    });

  } catch (error) {
    console.error('Events fetch error:', error);
    res.status(500).json({
      error: error.message,
      events: [],
      connected: false
    });
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
