'use strict';
// AI Command Center (Projects Hub) — bilingual parser + meeting booking.
// Offline: no database, no Zoom, no keys. Model methods are replaced with fakes.
//   node digit2ai-projects/scripts/test-nlp-bilingual.js

process.env.PROJECTS_DATABASE_URL = process.env.PROJECTS_DATABASE_URL || 'postgres://sit:sit@127.0.0.1:1/none';
delete process.env.ZOOM_ACCOUNT_ID; delete process.env.ZOOM_CLIENT_ID; delete process.env.ZOOM_CLIENT_SECRET;

const fs = require('fs');
const path = require('path');
const models = require('../src/models');
const zoom = require('../src/services/zoom');
const nlp = require('../src/services/nlpService');
const lang = require('../src/services/nlpLang');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// Fakes: record what would have been written.
const created = { events: [], notes: [] };
models.CalendarEvent.create = async (row) => { const r = { id: 9000 + created.events.length, ...row }; created.events.push(r); return r; };
models.Notification.create = async (row) => { created.notes.push(row); return row; };
models.ActivityLog.create = async () => ({});
models.Contact.findOne = async ({ where }) => (String(where.first_name[Object.getOwnPropertySymbols(where.first_name)[0]]).toLowerCase().startsWith('eduardo')
  ? { email: 'eduardo@example.test' } : null);
let zoomCalls = 0;
zoom.isConfigured = () => true;
zoom.createMeeting = async ({ topic }) => { zoomCalls++; return { id: 123, join_url: 'https://zoom.us/j/123', start_url: 'https://zoom.us/s/123', password: 'x', topic }; };

const today = lang.hubToday();
const plus = (n) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  // 1. Language detection.
  ok(lang.detectLang('Recuérdame que tengo una reunión con Eduardo mañana', null) === 'es', 'detect es');
  ok(lang.detectLang('Remind me about the meeting tomorrow', null) === 'en', 'detect en');
  ok(lang.detectLang('Eduardo 10:30', 'es') === 'es', 'ambiguous text follows the mic setting');
  ok(lang.detectLang('¿Qué tengo pendiente?', null) === 'es', 'qué with accent counts as Spanish');

  // 2. Intents, both languages.
  const intents = {
    'Recuérdame que tengo una reunión con Eduardo mañana a las 10:30': 'create_reminder',
    'Agenda una reunión con Eduardo mañana a las 10:30': 'create_event',
    'Tengo una cita con Ana el lunes a las 3 de la tarde': 'create_event',
    'I set up a meeting with Eduardo for tomorrow morning at 10;30 AM': 'create_event',
    'Remind me I have a meeting with Eduardo tomorrow at 10:30 AM': 'create_reminder',
    '¿Qué tengo pendiente?': 'list_tasks',
    'Muéstrame mis proyectos': 'list_projects',
    'qué tengo esta semana': 'upcoming_events',
    'Dame un resumen': 'summarize_projects',
    'hola, agenda una llamada con Carlos pasado mañana': 'create_event',
    'Hola': 'greeting',
    'Show my projects': 'list_projects',
    'What do I need to do today?': 'list_tasks',
    'ayuda': 'help'
  };
  for (const [t, want] of Object.entries(intents)) ok(nlp.detectIntent(t).intent === want, `intent "${t}" -> ${nlp.detectIntent(t).intent}, want ${want}`);

  // 3. Dates and times in the hub timezone.
  ok(lang.resolveDate('mañana a las 10:30') === plus(1), 'mañana = tomorrow');
  ok(lang.resolveDate('hoy a las 10 de la mañana') === plus(0), '"de la mañana" is morning, not tomorrow');
  ok(lang.resolveDate('pasado mañana') === plus(2), 'pasado mañana');
  ok(lang.resolveDate('tomorrow morning') === plus(1), 'tomorrow');
  ok(/^\d{4}-10-25$/.test(lang.resolveDate('el 25 de octubre') || ''), '25 de octubre');
  ok(lang.resolveDate('no date here') === null, 'no date = null, never a guess');
  const t1 = lang.parseTime('at 10;30 AM'); ok(t1 && t1.h === 10 && t1.m === 30, 'semicolon time 10;30 AM');
  const t2 = lang.parseTime('a las 3 de la tarde'); ok(t2 && t2.h === 15, '3 de la tarde = 15h');
  const t3 = lang.parseTime('a las 10 y media'); ok(t3 && t3.h === 10 && t3.m === 30, '10 y media');
  const t4 = lang.parseTime('at 3'); ok(t4 && t4.h === 15, 'bare "at 3" is business hours PM');
  const t5 = lang.parseTime('a las 9 de la mañana'); ok(t5 && t5.h === 9, '9 de la mañana stays AM');

  // 4. Attendees.
  ok(nlp.parseAttendees('Agenda una reunión con Eduardo mañana a las 10:30').join() === 'Eduardo', 'attendee es');
  ok(nlp.parseAttendees('meeting with Juan y Pedro el 25 de octubre').join() === 'Juan,Pedro', 'attendees stop at a date');

  // 5. The owner's case: a reminder about a meeting also books it, with Zoom by default.
  created.events.length = 0; created.notes.length = 0; zoomCalls = 0;
  let r = await nlp.executeCommand('Recuérdame que tengo una reunión con Eduardo mañana a las 10:30 de la mañana', 'owner@example.test', { lang: 'es' });
  ok(r.success && r.intent === 'create_reminder', 'reminder runs');
  ok(created.notes.length === 1, 'reminder alert written');
  ok(created.events.length === 1, 'meeting booked from the reminder');
  const ev = created.events[0] || {};
  ok(ev.title === 'Reunión con Eduardo', 'Spanish title: ' + ev.title);
  ok(ev.zoom_join_url === 'https://zoom.us/j/123' && zoomCalls === 1, 'Zoom on by default');
  ok(ev.language === 'es', 'event language stored');
  ok((ev.invited_emails || []).includes('eduardo@example.test'), 'contact lookup uses first_name (old code queried a column that does not exist)');
  ok(/Recordatorio guardado/.test(r.response) && /Agendé/.test(r.response), 'reply in Spanish');
  const hubTime = ev.start_time && ev.start_time.toLocaleString('en-US', { timeZone: lang.HUB_TZ, hour: 'numeric', minute: '2-digit' });
  ok(hubTime === '10:30 AM', '10:30 AM in hub time, got ' + hubTime);

  // 6. Opt-out and non-meetings.
  created.events.length = 0; zoomCalls = 0;
  await nlp.executeCommand('Tengo una cita con Ana el lunes a las 3 de la tarde, sin zoom', 'o@example.test', {});
  ok(created.events.length === 1 && !created.events[0].zoom_join_url && zoomCalls === 0, '"sin zoom" opts out');
  created.events.length = 0;
  await nlp.executeCommand('Remind me to call the vendor next Tuesday', 'o@example.test', {});
  ok(created.events.length === 0, '"call" as a verb does not book a meeting');
  await nlp.executeCommand('Recuérdame enviar la propuesta', 'o@example.test', {});
  ok(created.events.length === 0, 'plain reminder books nothing');
  r = await nlp.executeCommand('Agenda una reunión con Eduardo', 'o@example.test', {});
  ok(/no dijiste fecha/.test(r.response) && /no dijiste hora/.test(r.response), 'assumed date/time are stated, not hidden');

  // 7. English still works.
  created.events.length = 0;
  r = await nlp.executeCommand('I set up a meeting with Eduardo for tomorrow morning at 10;30 AM', 'o@example.test', {});
  ok(created.events.length === 1 && created.events[0].title === 'Meeting with Eduardo' && /Scheduled/.test(r.response), 'English booking');

  // 8. Front end: mic keeps listening, sends the language.
  const app = fs.readFileSync(path.join(__dirname, '../dashboard/assets/app.js'), 'utf8');
  ok(/rec\.continuous = true/.test(app), 'mic is continuous');
  ok(/VOICE_SILENCE_MS/.test(app) && /armSilence\(\)/.test(app), 'mic stops on silence, not on first pause');
  ok(/lang: getVoiceLang\(\)/.test(app), 'language sent to the server');
  const html = fs.readFileSync(path.join(__dirname, '../dashboard/index.html'), 'utf8');
  ok(/id="nlp-lang"/.test(html), 'EN/ES switch present');
  const v = (html.match(/app\.js\?v=([\w-]+)/) || [])[1];
  ok(v && v !== 'premortem-20260716', 'app.js cache version bumped');

  console.log(`\nnlp bilingual: ${pass}/${pass + fail}${fail ? ' FAILED' : ''}`);
  console.log('Not covered: a real browser microphone, the real Zoom API, Postgres.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
