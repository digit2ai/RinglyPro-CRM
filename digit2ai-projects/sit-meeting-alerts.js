'use strict';
// SIT for meeting alerts: node digit2ai-projects/sit-meeting-alerts.js
// Zero keys, no database: an in-memory fake that READS the window off the
// query's replacements, and a fake push sender.
process.env.JWT_SECRET = 'sit-meeting-alerts-secret-0123456789';
delete process.env.PROJECTS_CAL_FEED_SECRET;
const ma = require('./src/services/meetingAlerts');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL', m); } };

const NOW = new Date('2026-11-18T15:00:00Z');
const min = (n) => new Date(NOW.getTime() + n * 60000);
const events = [
  { id: 1, workspace_id: 1, title: 'Client A', start_time: min(4), all_day: false, created_at: min(-600) },
  { id: 2, workspace_id: 1, title: 'Client B', start_time: min(30), all_day: false, created_at: min(-2) },
  { id: 3, workspace_id: 1, title: 'Holiday', start_time: min(3), all_day: true, created_at: min(-600) },
  { id: 4, workspace_id: 2, title: 'Other workspace', start_time: min(3), all_day: false, created_at: min(-1) },
  { id: 5, workspace_id: 1, title: 'Old booking', start_time: min(120), all_day: false, created_at: min(-60) },
  { id: 6, workspace_id: 1, title: 'Past meeting', start_time: min(-30), all_day: false, created_at: min(-5) }
];
const alerts = new Set();
const fakeDb = {
  async query(sql, opts = {}) {
    const r = opts.replacements || {};
    if (/CREATE/.test(sql)) return [[]];
    if (/INSERT INTO d2_meeting_alerts/.test(sql)) {
      if (!/ON CONFLICT \(event_id, kind\) DO NOTHING/.test(sql)) throw new Error('claim must be ON CONFLICT DO NOTHING');
      const k = r.id + ':' + r.kind;
      if (alerts.has(k)) return [[]];
      alerts.add(k); return [[{ id: alerts.size }]];
    }
    if (/FROM d2_calendar_events/.test(sql)) {
      if (!/workspace_id = 1/.test(sql)) throw new Error('missing workspace predicate');
      let rows = events.filter(e => e.workspace_id === 1);
      if (/created_at >= :since/.test(sql)) rows = rows.filter(e => e.created_at >= r.since && e.start_time > r.now);
      else {
        if (/all_day, false\) = false/.test(sql)) rows = rows.filter(e => !e.all_day);
        rows = rows.filter(e => e.start_time > r.from && e.start_time <= r.to);
      }
      return [rows];
    }
    throw new Error('unexpected SQL ' + sql.slice(0, 60));
  }
};
const sent = [];
ma.setDb(fakeDb);
ma.setSender({ sendToOwner: async (p) => { sent.push(p); }, isEnabled: () => true });

(async () => {
  const r1 = await ma.tick(NOW);
  ok(r1.reminders === 1, 'one reminder (only Client A is within 5 min, not all-day, workspace 1)');
  ok(sent.some(p => p.title === 'Meeting in 4 min' && /Client A/.test(p.body)), 'reminder says minutes + title');
  ok(!sent.some(p => /Holiday|Other workspace/.test(p.body)), 'no all-day / other-workspace alert');
  ok(r1.booked === 1 && sent.some(p => p.title === 'New meeting booked' && /Client B/.test(p.body)), 'new booking alert only for a fresh future booking');
  ok(!sent.some(p => /Old booking|Past meeting/.test(p.body)), 'old bookings and past meetings are not announced');
  ok(sent.every(p => p.kind === 'meeting' && p.tag), 'pushes carry kind + tag (no Intercom badge)');

  const before = sent.length;
  const r2 = await ma.tick(new Date(NOW.getTime() + 60000));
  ok(r2.reminders === 0 && r2.booked === 0 && sent.length === before, 'second tick sends nothing again');

  // Feed token: closed without a strong secret, stable and checked with one.
  const saved = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'your-super-secret-jwt-key';
  ok(ma.feedToken() === null, 'published default secret = feed closed');
  process.env.JWT_SECRET = 'short';
  ok(ma.feedToken() === null, 'short secret = feed closed');
  process.env.JWT_SECRET = saved;
  const tok = ma.feedToken();
  ok(tok && tok.length === 40 && ma.tokenOk(tok), 'token valid');
  ok(!ma.tokenOk(tok.slice(0, 39) + (tok[39] === 'a' ? 'b' : 'a')), 'wrong token refused');
  ok(!ma.tokenOk(''), 'empty token refused');
  process.env.PROJECTS_CAL_FEED_SECRET = 'rotated-secret-abcdefghijklmnop';
  ok(!ma.tokenOk(tok), 'rotating PROJECTS_CAL_FEED_SECRET invalidates the old link');
  delete process.env.PROJECTS_CAL_FEED_SECRET;

  const ics = ma.buildIcs([
    { id: 9, title: 'Call, with; Rafael', start_time: '2026-11-20T17:00:00Z', end_time: null, description: 'line1\nline2 ' + 'reunión con año '.repeat(20) },
    { id: 10, title: 'Holiday', start_time: '2026-11-26T00:00:00Z', all_day: true }
  ], NOW);
  ok(/BEGIN:VCALENDAR[\s\S]*END:VCALENDAR\r\n$/.test(ics), 'ics wrapper');
  ok(ics.includes('TRIGGER:-PT5M'), '5-minute alarm');
  ok((ics.match(/BEGIN:VALARM/g) || []).length === 1, 'no alarm on all-day events');
  ok(ics.includes('SUMMARY:Call\\, with\\; Rafael'), 'escaping');
  ok(ics.includes('DTEND:20261120T173000Z'), 'default 30-minute end');
  ok(ics.includes('DESCRIPTION:line1\\nline2'), 'newline escaped');
  ok(ics.includes('DTSTART;VALUE=DATE:20261126'), 'all-day date');
  ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'lines folded');

  console.log(`meeting alerts SIT: ${pass}/${pass + fail}`);
  console.log('NOT covered: real Web Push delivery, the iPhone subscription, Postgres.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
