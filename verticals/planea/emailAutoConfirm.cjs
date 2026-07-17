/**
 * PLANEA — TEMPORARY email auto-confirm.
 *
 * Supabase Auth has "Confirm email" ON but no SMTP is delivering the confirmation
 * mail, so new signups get stuck on "Email not confirmed" and cannot log in.
 * When a Supabase service_role key is present in the environment, this poller
 * auto-confirms every unconfirmed user (existing + new signups) so they can log in
 * immediately — no email step. It is a STOPGAP for testing:
 *   - Enable:  set PLANEA_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) on Render.
 *   - Disable: unset that env var → email verification behaves normally again.
 *
 * The permanent fix is still the Supabase dashboard toggle (Authentication →
 * Sign In / Providers → Email → "Confirm email" OFF) or configuring SMTP.
 *
 * Uses the Supabase Auth Admin REST API directly (global fetch, no SDK dependency).
 */
'use strict';

var SB_URL = 'https://mfxujzvvrnsbiqcefvtg.supabase.co';
var KEY = process.env.PLANEA_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
var INTERVAL_MS = parseInt(process.env.PLANEA_AUTOCONFIRM_INTERVAL_MS || '10000', 10);

function hdr(extra) {
  var h = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

async function listUnconfirmed() {
  var out = [];
  for (var page = 1; page <= 25; page++) {
    var r = await fetch(SB_URL + '/auth/v1/admin/users?page=' + page + '&per_page=200', { headers: hdr() });
    if (!r.ok) throw new Error('list ' + r.status);
    var j = await r.json();
    var users = (j && j.users) || (Array.isArray(j) ? j : []);
    users.forEach(function (u) { if (!u.email_confirmed_at && !u.confirmed_at) out.push(u); });
    if (!users.length || users.length < 200) break;
  }
  return out;
}

async function confirm(u) {
  var r = await fetch(SB_URL + '/auth/v1/admin/users/' + u.id, {
    method: 'PUT',
    headers: hdr({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email_confirm: true })
  });
  return r.ok;
}

var running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    var pend = await listUnconfirmed();
    for (var i = 0; i < pend.length; i++) {
      try { if (await confirm(pend[i])) console.log('[planea auto-confirm] ✓ ' + pend[i].email); } catch (e) {}
    }
  } catch (e) {
    // transient (rate limit / network) — retry next tick
  } finally {
    running = false;
  }
}

function start() {
  if (!KEY) {
    console.log('ℹ️  Planea email auto-confirm OFF — set PLANEA_SERVICE_ROLE_KEY to let new users log in without email verification (temporary).');
    return;
  }
  console.log('✅ Planea email auto-confirm ON — confirming signups every ' + Math.round(INTERVAL_MS / 1000) + 's (temporary; unset PLANEA_SERVICE_ROLE_KEY to restore email verification).');
  tick(); // confirm anyone already stuck, right now
  setInterval(tick, Math.max(4000, INTERVAL_MS));
}

module.exports = { start: start };
