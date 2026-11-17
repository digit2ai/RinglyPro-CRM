'use strict';

// =====================================================
// Meeting alerts for the owner's phone (Projects Hub calendar, workspace 1).
//
//   1. "Meeting in 5 minutes"  -> Web Push to the owner's devices
//   2. "New meeting booked"    -> Web Push the moment a booking lands
//   3. A private iCalendar feed (calendarFeed below) that the iPhone Calendar
//      subscribes to, each event carrying its own 5-minute alarm.
//
// Push goes through the SAME owner channel the Hub already uses for Intercom
// (client-builds/voice-to-intake.../services/push.js sendToOwner), so the
// "Enable desktop badge" button in the Hub is the only setup needed.
//
// Each alert is CLAIMED in d2_meeting_alerts (unique event_id + kind) before it
// is sent, so two instances or a restart never send it twice. The poller runs
// only in production unless MEETING_ALERTS=on; MEETING_ALERTS=off stops it.
// =====================================================

const crypto = require('crypto');

const LEAD_MIN = Math.max(1, parseInt(process.env.MEETING_ALERT_MINUTES || '5', 10) || 5);
const TICK_MS = 60 * 1000;
const TZ = process.env.MEETING_ALERT_TZ || 'America/New_York';

let sequelize = null;
function db() {
  if (!sequelize) sequelize = require('../models').sequelize;
  return sequelize;
}
function setDb(s) { sequelize = s; } // tests

let sender = null;
function push() {
  if (sender) return sender;
  try { sender = require('../../../client-builds/voice-to-intake-transcript-direct-pipeli/services/push'); }
  catch (e) { sender = { sendToOwner: async () => {}, isEnabled: () => false }; }
  return sender;
}
function setSender(s) { sender = s; } // tests

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db().query(`CREATE TABLE IF NOT EXISTS d2_meeting_alerts (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL DEFAULT 1,
    event_id INTEGER NOT NULL,
    kind VARCHAR(20) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`, { logging: false });
  await db().query('CREATE UNIQUE INDEX IF NOT EXISTS uq_d2_meeting_alerts_event_kind ON d2_meeting_alerts (event_id, kind)', { logging: false });
  await db().query('CREATE INDEX IF NOT EXISTS idx_d2_meeting_alerts_ws ON d2_meeting_alerts (workspace_id)', { logging: false });
  tableReady = true;
}

// true only for the one caller that inserted the row.
async function claim(eventId, kind) {
  const [rows] = await db().query(
    `INSERT INTO d2_meeting_alerts (workspace_id, event_id, kind) VALUES (1, :id, :kind)
     ON CONFLICT (event_id, kind) DO NOTHING RETURNING id`,
    { replacements: { id: eventId, kind }, logging: false });
  return rows.length > 0;
}

function timeLabel(d) {
  try {
    return new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });
  } catch (e) { return new Date(d).toISOString().slice(11, 16) + ' UTC'; }
}
function dayLabel(d) {
  try {
    return new Date(d).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
  } catch (e) { return new Date(d).toISOString().slice(0, 10); }
}

// One pass. Returns what it sent (for logs and tests).
async function tick(now = new Date()) {
  await ensureTable();
  const out = { reminders: 0, booked: 0 };

  // 1. Meetings starting within the next LEAD_MIN minutes (or that started in
  //    the last minute, so a tick that lands late still fires once).
  const [soon] = await db().query(
    `SELECT id, title, start_time, location, zoom_join_url FROM d2_calendar_events
     WHERE workspace_id = 1 AND COALESCE(all_day, false) = false
       AND start_time > :from AND start_time <= :to
     ORDER BY start_time`,
    { replacements: { from: new Date(now.getTime() - 60 * 1000), to: new Date(now.getTime() + LEAD_MIN * 60 * 1000) }, logging: false });
  for (const ev of soon) {
    if (!(await claim(ev.id, 'reminder'))) continue;
    const mins = Math.max(0, Math.round((new Date(ev.start_time) - now) / 60000));
    await push().sendToOwner({
      kind: 'meeting', tag: 'meeting-' + ev.id, url: '/projects/?view=calendar',
      title: mins > 0 ? `Meeting in ${mins} min` : 'Meeting starting now',
      body: `${timeLabel(ev.start_time)} · ${ev.title}`.slice(0, 180)
    });
    out.reminders++;
  }

  // 2. Meetings created in the last 15 minutes that are still in the future.
  //    The window (not "everything never alerted") is what keeps the first run
  //    after deploy from announcing every old meeting.
  const [fresh] = await db().query(
    `SELECT id, title, start_time FROM d2_calendar_events
     WHERE workspace_id = 1 AND created_at >= :since AND start_time > :now
     ORDER BY created_at`,
    { replacements: { since: new Date(now.getTime() - 15 * 60 * 1000), now }, logging: false });
  for (const ev of fresh) {
    if (!(await claim(ev.id, 'booked'))) continue;
    await push().sendToOwner({
      kind: 'meeting', tag: 'booked-' + ev.id, url: '/projects/?view=calendar',
      title: 'New meeting booked',
      body: `${dayLabel(ev.start_time)}, ${timeLabel(ev.start_time)} · ${ev.title}`.slice(0, 180)
    });
    out.booked++;
  }
  return out;
}

let timer = null;
function startPoller() {
  const flag = String(process.env.MEETING_ALERTS || '').toLowerCase();
  if (flag === 'off') return false;
  if (process.env.NODE_ENV !== 'production' && flag !== 'on') return false;
  if (timer) return true;
  const run = () => tick().catch(e => console.error('[D2AI-MeetingAlerts] tick error:', e.message));
  setTimeout(run, 15 * 1000);
  timer = setInterval(run, TICK_MS);
  console.log(`[D2AI-MeetingAlerts] poller on (${LEAD_MIN} min lead, push ${push().isEnabled() ? 'enabled' : 'DISABLED'})`);
  return true;
}

// =====================================================
// iCalendar feed. The URL is a capability: whoever holds it can read the
// calendar, so the token is an HMAC of a secret and can be rotated by changing
// PROJECTS_CAL_FEED_SECRET. No secret at all = the feed is closed.
// =====================================================
function feedSecret() {
  const s = process.env.PROJECTS_CAL_FEED_SECRET || process.env.JWT_SECRET || '';
  if (!s || s.length < 16 || s === 'your-super-secret-jwt-key') return null;
  return s;
}
function feedToken() {
  const s = feedSecret();
  if (!s) return null;
  return crypto.createHmac('sha256', s).update('d2ai-calendar-feed:workspace-1').digest('hex').slice(0, 40);
}
function tokenOk(tok) {
  const good = feedToken();
  if (!good || typeof tok !== 'string' || tok.length !== good.length) return false;
  return crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(good));
}

function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
}
function icsDate(d) { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
// RFC 5545: lines over 75 octets are folded; count BYTES (Spanish accents are 2).
function fold(line) {
  const out = []; let cur = ''; let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur); return out.join('\r\n');
}

function buildIcs(events, now = new Date()) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Digit2AI//Projects Hub//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Digit2AI Meetings', 'X-PUBLISHED-TTL:PT15M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M'];
  for (const ev of events) {
    const start = new Date(ev.start_time);
    if (isNaN(start)) continue;
    const end = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 30 * 60000);
    L.push('BEGIN:VEVENT', `UID:d2ai-event-${ev.id}@aiagent.ringlypro.com`, `DTSTAMP:${icsDate(now)}`);
    if (ev.all_day) {
      const d = start.toISOString().slice(0, 10).replace(/-/g, '');
      L.push(`DTSTART;VALUE=DATE:${d}`);
    } else {
      L.push(`DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`);
    }
    L.push(fold('SUMMARY:' + icsEscape(ev.title)));
    const loc = ev.zoom_join_url || ev.location;
    if (loc) L.push(fold('LOCATION:' + icsEscape(loc)));
    if (ev.description) L.push(fold('DESCRIPTION:' + icsEscape(String(ev.description).slice(0, 2000))));
    if (!ev.all_day) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(ev.title).slice(0, 200),
        `TRIGGER:-PT${LEAD_MIN}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

// Express handler for GET /cal/:token.ics (public, token-gated).
async function calendarFeed(req, res) {
  const tok = String(req.params.token || '').replace(/\.ics$/i, '');
  if (!tokenOk(tok)) return res.status(404).send('Not found');
  try {
    const [events] = await db().query(
      `SELECT id, title, description, start_time, end_time, all_day, location, zoom_join_url
       FROM d2_calendar_events
       WHERE workspace_id = 1 AND start_time >= NOW() - INTERVAL '30 days' AND start_time <= NOW() + INTERVAL '365 days'
       ORDER BY start_time LIMIT 2000`, { logging: false });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    res.send(buildIcs(events));
  } catch (e) {
    console.error('[D2AI-MeetingAlerts] feed error:', e.message);
    res.status(500).send('error');
  }
}

module.exports = { tick, startPoller, calendarFeed, buildIcs, feedToken, tokenOk, claim, setDb, setSender, LEAD_MIN };
