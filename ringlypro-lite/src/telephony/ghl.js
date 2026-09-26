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

/**
 * CREDENTIALS ARE PER SUB-ACCOUNT, AND THAT IS THE WHOLE POINT OF `creds`.
 * A HighLevel Private Integration token belongs to ONE sub-account, so once
 * Lite serves more than one client there is one token per tenant and env can
 * no longer hold them. Every function therefore takes an optional
 * `{ token, locationId }` and falls back to env only when it is absent — which
 * is exactly the one-client pilot. Passing the wrong tenant's creds is the
 * failure this shape exists to make impossible to do by accident.
 */
function envCreds() {
  return {
    token: String(process.env.LITE_GHL_TOKEN || '').trim(),
    locationId: String(process.env.LITE_GHL_LOCATION_ID || '').trim(),
  };
}
function resolve(creds) {
  const e = envCreds();
  const token = (creds && creds.token) ? String(creds.token).trim() : e.token;
  const locationId = (creds && creds.locationId) ? String(creds.locationId).trim() : e.locationId;
  return { token, locationId };
}
function configured(creds) {
  const c = resolve(creds);
  return !!(c.token && c.locationId);
}
function locationId(creds) { return resolve(creds).locationId; }

/**
 * `version` overrides the Version header for ONE call. It exists because the
 * calendar and contact endpoints this service now writes to are documented
 * under `Version: v3` while everything that already worked here is on the
 * date-stamped `2021-07-28`. Rather than guess which one a given sub-account
 * honours, the caller supplies one and retries with the other (see
 * services/ghlCalendar.js) — a version mismatch is then a recorded fact, not
 * an assumption baked into a constant.
 */
async function call(method, path, { query, body, creds, version, timeoutMs } = {}) {
  const { token } = resolve(creds);
  if (!token) { const e = new Error('no HighLevel token for this tenant (and LITE_GHL_TOKEN is not set)'); e.status = 0; throw e; }
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Version: version || VERSION, Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    // 20 s is right for a background provisioning step and far too long for a
    // call a person is waiting on: the calendar push runs inside a live phone
    // turn and inside a visitor's HTTP request, so those callers pass a much
    // smaller budget. See services/ghlCalendar.js.
    signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 20000)),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    const e = new Error((data && (data.message || data.error)) ? String(data.message || data.error).slice(0, 300) : `HTTP ${res.status}`);
    e.status = res.status;
    // The whole body, for diagnosis. HighLevel's `message` alone said
    // "request took longer than expected" for two different numbers and told
    // us nothing about why; the rest of the payload usually does. Capped, and
    // never logged automatically — a caller decides whether to surface it.
    try { e.body = data ? JSON.stringify(data).slice(0, 800) : null; } catch (_) { e.body = null; }
    throw e;
  }
  return data;
}

const getLocation = (creds) => call('GET', `/locations/${locationId(creds)}`, { creds });
const listActiveNumbers = (creds) => call('GET', `/phone-system/numbers/location/${locationId(creds)}`, { creds });
const searchAvailable = (opts = {}, creds) => call('GET', `/phone-system/numbers/location/${locationId(creds)}/available`,
  { query: { countryCode: 'US', numberTypes: 'local', voiceEnabled: true, smsEnabled: true, ...opts }, creds });
const listVoiceAgents = (creds) => call('GET', '/voice-ai/agents', { query: { locationId: locationId(creds) }, creds });
const listCalendars = (creds) => call('GET', '/calendars/', { query: { locationId: locationId(creds) }, creds });

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
async function probe(creds) {
  const out = { configured: configured(creds) };
  if (!out.configured) return out;
  const step = async (name, fn) => {
    try { const d = await fn(); out[name] = { ok: true, count: countOf(d) }; }
    catch (e) { out[name] = { ok: false, status: e.status || null, error: e.message }; }
  };
  await step('location', () => getLocation(creds));
  await step('active_numbers', () => listActiveNumbers(creds));
  await step('available_us_numbers', () => searchAvailable({}, creds));
  await step('voice_ai_agents', () => listVoiceAgents(creds));
  await step('calendars', () => listCalendars(creds));
  return out;
}

module.exports = { configured, locationId, call, getLocation, listActiveNumbers, searchAvailable, listVoiceAgents, listCalendars, probe, countOf, resolve };
