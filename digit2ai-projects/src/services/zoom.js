'use strict';

// Server-to-Server OAuth client for the Digit2AI Zoom account.
// Reads ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET from env.
// Tokens last 1 hour; we cache in-memory for ~55 minutes.

const axios = require('axios');

let _tokenCache = null; // { token, expiresAt }

function isConfigured() {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function getAccessToken() {
  if (!isConfigured()) {
    throw new Error('Zoom integration not configured (ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET missing)');
  }
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 30000) {
    return _tokenCache.token;
  }
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID)}`;
  const res = await axios.post(url, null, {
    headers: { Authorization: `Basic ${basic}` },
    timeout: 10000
  });
  const expiresInMs = (res.data.expires_in || 3600) * 1000;
  _tokenCache = { token: res.data.access_token, expiresAt: now + expiresInMs - 60000 };
  return _tokenCache.token;
}

// Create a Zoom meeting on the info@digit2ai.com account.
// opts: { topic, startISO, durationMinutes, timezone, agenda }
async function createMeeting(opts) {
  const token = await getAccessToken();
  const body = {
    topic: opts.topic || 'Meeting',
    type: 2, // scheduled
    start_time: opts.startISO,
    duration: Math.max(15, parseInt(opts.durationMinutes, 10) || 30),
    timezone: opts.timezone || 'America/New_York',
    agenda: opts.agenda || '',
    settings: {
      join_before_host: true,
      waiting_room: false,
      mute_upon_entry: true,
      auto_recording: 'none',
      approval_type: 2 // no registration required
    }
  };
  const res = await axios.post('https://api.zoom.us/v2/users/me/meetings', body, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 15000
  });
  return {
    id: String(res.data.id),
    join_url: res.data.join_url,
    start_url: res.data.start_url,
    password: res.data.password || null
  };
}

async function deleteMeeting(meetingId) {
  if (!meetingId) return;
  const token = await getAccessToken();
  try {
    await axios.delete(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });
  } catch (e) {
    // 404 is fine — meeting may already be gone
    if (e.response && e.response.status === 404) return;
    throw e;
  }
}

module.exports = { isConfigured, getAccessToken, createMeeting, deleteMeeting };
