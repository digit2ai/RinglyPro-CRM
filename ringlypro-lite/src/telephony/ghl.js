'use strict';

/**
 * HighLevel (GoHighLevel) API client for the LC Phone + Voice AI path.
 *
 * Why this exists: the account's own Twilio voice was disabled after the
 * 2026-08-06 toll-fraud incident. A HighLevel number lives on HighLevel's
 * Twilio (LC Phone), is answered by HighLevel Voice AI, and feeds the owner's
 * HighLevel workflows. Pilot scope: ONE sub-account (LITE_GHL_LOCATION_ID)
 * on the owner's $97 Starter plan, reached with a sub-account Private
 * Integration token (LITE_GHL_TOKEN). Nothing here buys a number yet.
 *
 * The token never leaves this file: errors carry the HTTP status and the
 * API's message, never the Authorization header.
 */
const BASE = process.env.LITE_GHL_API_BASE || 'https://services.leadconnectorhq.com';
const VERSION = process.env.LITE_GHL_API_VERSION || '2021-07-28';

function configured() {
  return !!(process.env.LITE_GHL_TOKEN && process.env.LITE_GHL_LOCATION_ID);
}
function locationId() { return String(process.env.LITE_GHL_LOCATION_ID || '').trim(); }

async function call(method, path, { query, body } = {}) {
  const token = String(process.env.LITE_GHL_TOKEN || '').trim();
  if (!token) { const e = new Error('LITE_GHL_TOKEN is not set'); e.status = 0; throw e; }
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    const e = new Error((data && (data.message || data.error)) ? String(data.message || data.error).slice(0, 300) : `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

const getLocation = () => call('GET', `/locations/${locationId()}`);
const listActiveNumbers = () => call('GET', `/phone-system/numbers/location/${locationId()}`);
const searchAvailable = (opts = {}) => call('GET', `/phone-system/numbers/location/${locationId()}/available`,
  { query: { countryCode: 'US', numberTypes: 'local', voiceEnabled: true, smsEnabled: true, ...opts } });
const listVoiceAgents = () => call('GET', '/voice-ai/agents', { query: { locationId: locationId() } });

/** Count items in whatever list shape the API returned, without guessing a field name. */
function countOf(data) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) if (Array.isArray(v)) return v.length;
  }
  return null;
}

/**
 * Probe what this token can do on this plan. Read-only: nothing is bought,
 * created or changed. Reports status codes and counts, never the data.
 */
async function probe() {
  const out = { configured: configured() };
  if (!out.configured) return out;
  const step = async (name, fn) => {
    try { const d = await fn(); out[name] = { ok: true, count: countOf(d) }; }
    catch (e) { out[name] = { ok: false, status: e.status || null, error: e.message }; }
  };
  await step('location', getLocation);
  await step('active_numbers', listActiveNumbers);
  await step('available_us_numbers', () => searchAvailable());
  await step('voice_ai_agents', listVoiceAgents);
  return out;
}

module.exports = { configured, locationId, call, getLocation, listActiveNumbers, searchAvailable, listVoiceAgents, probe, countOf };
