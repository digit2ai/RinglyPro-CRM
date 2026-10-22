'use strict';

const { Op } = require('sequelize');
const { Contact, Project, Task, CalendarEvent, Vertical, ProjectContact, ProjectMilestone, Notification } = require('../models');
const { logActivity, createNotification } = require('./activityService');
const zoomService = require('./zoom');
const { HUB_TZ, detectLang, L, resolveDate, parseTime, MEETING_WORDS, NO_ZOOM } = require('./nlpLang');

// Intent patterns for NLP parsing - ordered by specificity (most specific first)
// Designed for non-technical users: supports casual, conversational language
const INTENT_PATTERNS = [
  // Spanish — reminders first, so "recuérdame que tengo una reunión…" is a reminder (it also books the meeting).
  { pattern: /^(?:oye\s+|por\s+favor\s+)?(?:recu[eé]rda(?:me|nos)?|recordarme|av[ií]same|no\s+me\s+dejes\s+olvidar|tengo\s+que\s+acordarme|necesito\s+recordar|pon(?:me)?\s+un\s+recordatorio|crea(?:r)?\s+un\s+recordatorio)/i, intent: 'create_reminder' },
  { pattern: /^(?:por\s+favor\s+)?(?:agenda(?:r|me)?|ag[eé]nda(?:me|la)|programa(?:r|me)?|crea(?:r)?|pon(?:er|me)?|haz|organiza(?:r)?|coordina(?:r)?|reserva(?:r)?|fija(?:r)?|cuadra(?:r)?|anota(?:r)?)\s+(?:(?:una?|la|el|otra|nueva)\s+)*(?:reuni[oó]n|cita|llamada|videollamada|zoom|evento|junta)/i, intent: 'create_event' },
  { pattern: /^(?:yo\s+)?(?:tengo|tenemos|cuadr[eé]|agend[eé]|program[eé]|hice)\s+(?:una?\s+)?(?:reuni[oó]n|cita|llamada|videollamada|zoom|junta)/i, intent: 'create_event' },
  { pattern: /^(?:i|we)\s+(?:have|got|set\s*up|setup|scheduled|booked|arranged)\s+(?:a|an)\s+(?:meeting|call|appointment|zoom)/i, intent: 'create_event' },
  { pattern: /^(?:crea(?:r)?|agrega(?:r)?|a[nñ]ade|anota(?:r)?|nueva?)\s+(?:una?\s+)?(?:tarea|pendiente)/i, intent: 'create_task' },
  { pattern: /^(?:mu[eé]stra(?:me)?|ver|lista(?:r)?|cu[aá]les\s+son)\s+(?:mis\s+|los\s+)?recordatorios/i, intent: 'list_reminders' },
  { pattern: /^(?:mu[eé]stra(?:me)?|ver|lista(?:r)?)\s+(?:mis\s+|las\s+)?tareas\s+(?:vencidas|atrasadas)/i, intent: 'overdue_tasks' },
  { pattern: /^(?:qu[eé]\s+(?:tengo\s+que\s+hacer|tengo\s+pendiente|me\s+falta|hay\s+pendiente)|mis\s+(?:tareas|pendientes)|mu[eé]stra(?:me)?\s+(?:mis\s+)?(?:tareas|pendientes))/i, intent: 'list_tasks' },
  { pattern: /^(?:hay\s+)?(?:algo|alg[uú]n\s+proyecto)\s+(?:vencido|atrasado)|^proyectos\s+(?:vencidos|atrasados)/i, intent: 'overdue_projects' },
  { pattern: /^(?:mu[eé]stra(?:me)?|ver|lista(?:r)?|mis|cu[aá]les\s+son\s+mis)\s+(?:mis\s+|los\s+)?proyectos|^(?:c[oó]mo\s+van|c[oó]mo\s+est[aá]n)\s+(?:mis\s+|los\s+)?proyectos/i, intent: 'list_projects' },
  { pattern: /^(?:qu[eé]\s+(?:tengo|hay)\s+(?:en\s+(?:la|mi)\s+agenda|esta\s+semana|hoy|ma[nñ]ana|pr[oó]ximamente)|mi\s+agenda|mu[eé]stra(?:me)?\s+(?:mi\s+)?(?:agenda|calendario)|cu[aá]l\s+es\s+mi\s+(?:pr[oó]xima\s+reuni[oó]n|agenda))/i, intent: 'upcoming_events' },
  { pattern: /^(?:dame\s+)?(?:un\s+)?res[uú]men/i, intent: 'summarize_projects' },
  { pattern: /^(?:ayuda|comandos|qu[eé]\s+puedes\s+hacer)/i, intent: 'help' },

  // Contact intents
  { pattern: /^(create|add|new|register)\s+(?:(?:a|the|another|new)\s+)*contact/i, intent: 'create_contact' },
  { pattern: /^(show|list|get|find|see|view|open)\s+(all\s+|my\s+)?contacts/i, intent: 'list_contacts' },
  { pattern: /^(show|list|get|find)\s+contacts?\s+(linked|assigned|for|in|under)\s+(.+)/i, intent: 'filter_contacts' },
  { pattern: /^(search|find|look\s*up|look\s+for)\s+(for\s+)?contact/i, intent: 'search_contacts' },
  { pattern: /^(who|people|contacts)/i, intent: 'list_contacts' },
  { pattern: /^how many contacts/i, intent: 'list_contacts' },

  // Project intents — specific patterns first
  { pattern: /^(show|list|get|find|see|view)\s+(all\s+|my\s+)?overdue\s+projects/i, intent: 'overdue_projects' },
  { pattern: /^(show|list|get|find|see|view)\s+(all\s+|my\s+)?stalled\s+projects/i, intent: 'stalled_projects' },
  { pattern: /^(show|list|see|view)\s+high[\s-]?priority\s+projects/i, intent: 'high_priority_projects' },
  { pattern: /^(show|list|see|view)\s+(all\s+|my\s+)?urgent\s+projects/i, intent: 'high_priority_projects' },
  { pattern: /^(show|list|see|view)\s+(all\s+|my\s+)?critical\s+projects/i, intent: 'high_priority_projects' },
  { pattern: /^(create|add|new|start|begin|launch)\s+(?:(?:a|the|another|brand[-\s]?new|new)\s+)*project/i, intent: 'create_project' },
  { pattern: /^(show|list|get|find|see|view|open)\s+(all\s+|my\s+)?projects/i, intent: 'list_projects' },
  { pattern: /^(change|update|set|move)\s+(project\s+)?(.+?)\s+(?:project\s+)?(?:due\s+date|deadline|due)\s+(?:to|=)\s+(.+)/i, intent: 'update_project_due_date' },
  { pattern: /^(change|update|set)\s+(?:the\s+)?(?:due\s+date|deadline|due)\s+(?:of|for)\s+(?:project\s+)?(.+?)\s+(?:to|=)\s+(.+)/i, intent: 'update_project_due_date' },
  { pattern: /^(move|change|update|set)\s+(project\s+)?(.+?)\s+to\s+(.+)/i, intent: 'update_project_status' },
  { pattern: /^(summarize|summary|overview)\s+(of\s+)?(high[\s-]?priority\s+)?projects/i, intent: 'summarize_projects' },
  { pattern: /^what\s+projects?\s+(are\s+)?overdue/i, intent: 'overdue_projects' },
  { pattern: /^any(thing)?\s+overdue/i, intent: 'overdue_projects' },
  { pattern: /^what.*behind\s+schedule/i, intent: 'overdue_projects' },
  { pattern: /^what.*stuck|what.*stalled/i, intent: 'stalled_projects' },
  { pattern: /^how many projects/i, intent: 'list_projects' },

  // Task intents — specific first
  { pattern: /^(show|list|get|see|view)\s+(all\s+|my\s+)?overdue\s+tasks/i, intent: 'overdue_tasks' },
  { pattern: /^(create|add|new|make)\s+(?:(?:a|the|another|new)\s+)*(task|todo|to[\s-]?do|reminder|follow[\s-]?up)/i, intent: 'create_task' },
  { pattern: /^(show|list|get|see|view|open)\s+(all\s+|my\s+)?(pending\s+)?tasks/i, intent: 'list_tasks' },
  { pattern: /^(show|list|get|see|view)\s+(all\s+|my\s+)?to[\s-]?do/i, intent: 'list_tasks' },
  { pattern: /^what\s+(do\s+i\s+)?need\s+to\s+do/i, intent: 'list_tasks' },
  { pattern: /^what.*my\s+tasks/i, intent: 'list_tasks' },
  { pattern: /^what.*pending/i, intent: 'list_tasks' },
  { pattern: /^how many tasks/i, intent: 'list_tasks' },
  { pattern: /^any\s+overdue\s+tasks/i, intent: 'overdue_tasks' },

  // Calendar intents
  { pattern: /^(?:create|add|schedule|new|book|plan|arrange|organi[sz]e|set\s*up|setup)\s+(?:(?:a|an|the|another|new|up)\s+)*(?:meeting|event|appointment|calendar|call|zoom|sync)/i, intent: 'create_event' },
  { pattern: /^(?:meet|call)\s+with\s+/i, intent: 'create_event' },
  { pattern: /^(show|list|get|what|see|view)\s+(are\s+)?(my\s+)?(upcoming|this week|today|next|calendar|schedule|events)/i, intent: 'upcoming_events' },
  { pattern: /^what.*coming\s+up/i, intent: 'upcoming_events' },
  { pattern: /^what.*my\s+(schedule|calendar|agenda)/i, intent: 'upcoming_events' },
  { pattern: /^when.*next\s+(meeting|event|appointment)/i, intent: 'upcoming_events' },

  // Link intents
  { pattern: /^link\s+(this\s+)?contact/i, intent: 'link_contact_project' },
  { pattern: /^link\s+(.+?)\s+to\s+(project\s+)?(.+)/i, intent: 'link_contact_project' },
  { pattern: /^(connect|associate|assign)\s+(.+?)\s+to\s+(.+)/i, intent: 'link_contact_project' },

  // Dashboard / summary intents
  { pattern: /^(show|get|see|view|open)\s+(me\s+)?(the\s+)?(dashboard|overview|home)/i, intent: 'dashboard' },
  { pattern: /^(what|how)\s+(is|are)\s+(the\s+)?(status|stats|metrics|numbers)/i, intent: 'dashboard' },
  { pattern: /^(give\s+me\s+|show\s+me\s+)?(a\s+)?(summary|overview|report|status\s*update|brief|snapshot|recap)/i, intent: 'summarize_projects' },
  { pattern: /^(how|what).*going/i, intent: 'summarize_projects' },
  { pattern: /^status$/i, intent: 'summarize_projects' },
  { pattern: /^summary$/i, intent: 'summarize_projects' },
  { pattern: /^overview$/i, intent: 'summarize_projects' },
  { pattern: /^report$/i, intent: 'summarize_projects' },
  { pattern: /^recap$/i, intent: 'summarize_projects' },

  // Reminder intents
  { pattern: /^(remind|email|alert|notify)\s+(me|us)\s+(about\s+|to\s+)?(.+)/i, intent: 'create_reminder' },
  { pattern: /^(show|list|get|see|view)\s+(all\s+|my\s+)?reminders/i, intent: 'list_reminders' },
  { pattern: /^don'?t\s+let\s+me\s+forget/i, intent: 'create_reminder' },
  { pattern: /^i\s+need\s+to\s+remember/i, intent: 'create_reminder' },

  // Greeting / small talk
  { pattern: /^(hi|hello|hey|good\s+morning|good\s+afternoon|good\s+evening|hola|buenas)/i, intent: 'greeting' },
  { pattern: /^(thanks|thank\s+you|gracias)/i, intent: 'thanks' },

  // Help — catch-all for confused users
  { pattern: /^(help|what can you|commands|how to|how does|what do|what should|i don'?t know)/i, intent: 'help' },
  { pattern: /^\?+$/i, intent: 'help' }
];

// Extract entities from text
function extractEntities(text) {
  const entities = {};

  // Extract name (for contacts) - "named X" or "called X" or after "contact"
  const nameMatch = text.match(/(?:named?|called?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (nameMatch) entities.name = nameMatch[1];

  // Extract project name - "project X" or "Project X"
  const projectMatch = text.match(/(?:project\s+)([A-Z][a-zA-Z0-9\s]+?)(?:\s+to\s+|\s*$|\s+under|\s+for)/i);
  if (projectMatch) entities.project_name = projectMatch[1].trim();

  // Extract vertical
  const verticalMatch = text.match(/(?:under|for|vertical|in)\s+(?:the\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*(?:vertical)?/i);
  if (verticalMatch) entities.vertical = verticalMatch[1].trim();

  // Extract date references (English + Spanish, resolved in the hub timezone)
  const resolved = resolveDate(text);
  if (resolved) entities.date = resolved;

  // Extract status
  const statusMatch = text.match(/to\s+(planning|active|in[\s_]?progress|on[\s_]?hold|completed|cancelled|review|done|finished)/i);
  if (statusMatch) {
    let s = statusMatch[1].toLowerCase().replace(/\s+/g, '_');
    if (s === 'done' || s === 'finished') s = 'completed';
    entities.status = s;
  }

  // Extract priority
  const priorityMatch = text.match(/(high|medium|low|critical|urgent)\s*(?:priority)?/i);
  if (priorityMatch) {
    let p = priorityMatch[1].toLowerCase();
    if (p === 'urgent') p = 'critical';
    entities.priority = p;
  }

  // Extract days for stalled
  const daysMatch = text.match(/(\d+)\s+days/);
  if (daysMatch) entities.days = parseInt(daysMatch[1]);

  // Extract email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) entities.email = emailMatch[0];

  // Extract phone
  const phoneMatch = text.match(/[\+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}/);
  if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 7) entities.phone = phoneMatch[0];

  return entities;
}

// Parse a free-form date string ("July 15", "July 15 2026", "7/15", "2026-07-15") into ISO date
function parseDateFreeform(s) {
  if (!s) return null;
  const cleaned = s.trim().replace(/[.,]/g, '').toLowerCase();
  const months = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12 };
  // Already ISO
  let m = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  // M/D or M/D/YYYY
  m = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const yr = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear();
    return `${yr}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  // "Month Day Year" or "Month Day"
  m = cleaned.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{2,4}))?$/);
  if (m && months[m[1]]) {
    const yr = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear();
    return `${yr}-${String(months[m[1]]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  // "Day of Month [Year]"
  m = cleaned.match(/^(\d{1,2})\s+(?:of\s+)?([a-z]+)(?:\s+(\d{2,4}))?$/);
  if (m && months[m[2]]) {
    const yr = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear();
    return `${yr}-${String(months[m[2]]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  return null;
}

// Convert a wall-clock time in a given IANA tz to a correct UTC Date (DST-safe).
function wallTimeToUtc(tz, y, mo, d, h, mi) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  let ts = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let i = 0; i < 3; i++) {
    const p = dtf.formatToParts(new Date(ts)).reduce((a, x) => (a[x.type] = x.value, a), {});
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute, +p.second);
    const offset = shown - ts;                 // tz offset at ts
    ts = Date.UTC(y, mo - 1, d, h, mi, 0) - offset;
  }
  return new Date(ts);
}

// Drop opening punctuation and a leading greeting so "¿Qué…" and "Hola, agenda…" reach their real intent.
function normalizeInput(text) {
  const t = String(text).replace(/^[\s¿¡"'“]+/, '').replace(/[?!]+$/, '').trim();
  const rest = t.replace(/^(?:hola|hi|hey|hello|oye|buenos\s+d[ií]as|buenas(?:\s+tardes|\s+noches)?|good\s+(?:morning|afternoon|evening))[\s,.!:]+/i, '');
  return rest.length >= 3 && rest !== t ? rest : t;
}

// Detect intent from text
function detectIntent(text) {
  text = normalizeInput(text);
  for (const { pattern, intent } of INTENT_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { intent, match };
  }
  return { intent: 'unknown', match: null };
}

// Words that end the attendee list: "con Eduardo mañana a las 10:30" -> "Eduardo".
const ATTENDEE_STOP = /\s*(?:[,.;]\s*)?\b(?:today|tomorrow|tonight|this|next|on|at|in|for|about|to\s+(?:discuss|review|talk)|regarding|via|over|by|hoy|ma[nñ]ana|pasado|esta|este|pr[oó]xim[oa]|el\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d+)|a\s+las?|a\s+la|para|por|sobre|acerca|en\s+(?:la|el|zoom)|v[ií]a|sin|no\s+zoom|with(?:out)?\s+zoom|and\s+(?:please\s+)?(?:add|use|activate|enable|turn\s+on)|y\s+(?:pon|agrega|activa|usa)|\d+)\b.*$/i;

function parseAttendees(text) {
  const wm = text.match(/\b(?:with|con)\s+(.+)$/i);
  if (!wm) return [];
  const raw = wm[1].replace(ATTENDEE_STOP, '').trim();
  return raw.split(/\s*(?:,|&|\band\b|\by\b|\be\b)\s*/i)
    .map(x => x.replace(/^(?:el|la|los|las|the|my|mi|mis)\s+/i, '').trim())
    .filter(x => x && x.length <= 60 && !/^(?:zoom|team|equipo)$/i.test(x))
    .map(x => x.charAt(0).toUpperCase() + x.slice(1));
}

// Books a calendar meeting from a sentence. Zoom is ON unless the sentence opts out.
async function bookMeeting(inputText, entities, userEmail, lang) {
  const attendees = parseAttendees(inputText);
  const wantsZoom = !NO_ZOOM.test(inputText);

  let title;
  if (attendees.length) title = L(lang, 'Meeting with ', 'Reunión con ') + attendees.join(', ');
  else {
    const tm2 = inputText.match(/(?:meeting|event|appointment|call|sync|reuni[oó]n|cita|llamada|junta|evento)\s+(?:for\s+|about\s+|sobre\s+|de\s+|para\s+)?(.+?)(?:\s+(?:on|at|next|tomorrow|today|with|ma[nñ]ana|hoy|a\s+las?|el|con)\b|$)/i);
    title = tm2 && tm2[1] && !/^\d/.test(tm2[1].trim()) ? tm2[1].trim() : L(lang, 'New Meeting', 'Nueva reunión');
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  const dateStr = entities.date || new Date().toLocaleDateString('en-CA', { timeZone: HUB_TZ });
  const parsedTime = parseTime(inputText);
  const tm = parsedTime || { h: 10, m: 0 };
  const [Y, Mo, D] = dateStr.split('-').map(Number);
  const startDate = wallTimeToUtc(HUB_TZ, Y, Mo, D, tm.h, tm.m);
  const endDate = new Date(startDate.getTime() + 3600000);

  // Attendee names -> contact emails (best effort; contacts store first/last name).
  const inviteEmails = [];
  for (const nm of attendees) {
    try {
      const [first, ...rest] = nm.split(/\s+/);
      const where = { workspace_id: 1, first_name: { [Op.iLike]: `${first}%` }, email: { [Op.ne]: null } };
      if (rest.length) where.last_name = { [Op.iLike]: `${rest.join(' ')}%` };
      const c = await Contact.findOne({ where });
      if (c && c.email) inviteEmails.push(c.email);
    } catch (_) { /* best effort */ }
  }

  let zoomFields = {}, zoomNote = '';
  if (wantsZoom) {
    if (zoomService.isConfigured && zoomService.isConfigured()) {
      try {
        const mtg = await zoomService.createMeeting({ topic: title, startISO: startDate.toISOString(), durationMinutes: 60, timezone: HUB_TZ, agenda: '' });
        zoomFields = { zoom_meeting_id: String(mtg.id), zoom_join_url: mtg.join_url, zoom_start_url: mtg.start_url, zoom_password: mtg.password, location: mtg.join_url };
        zoomNote = `\nZoom: ${mtg.join_url}`;
      } catch (zErr) {
        zoomFields = { location: 'Zoom' };
        zoomNote = L(lang, `\n(The Zoom link couldn't be created: `, `\n(No se pudo crear el enlace de Zoom: `) + (zErr.response?.data?.message || zErr.message) + ')';
      }
    } else {
      zoomFields = { location: 'Zoom' };
      zoomNote = L(lang, `\n(Zoom isn't configured on the server, so no link was generated.)`, `\n(Zoom no está configurado en el servidor; no se generó enlace.)`);
    }
  }

  const event = await CalendarEvent.create({
    workspace_id: 1, user_email: userEmail, title,
    start_time: startDate, end_time: endDate,
    event_type: 'meeting',
    invited_emails: inviteEmails,
    language: lang,
    ...zoomFields
  });
  await logActivity(userEmail, 'created', 'calendar_event', event.id, title, { via: 'nlp', attendees, zoom: wantsZoom, lang });

  const whenStr = startDate.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { timeZone: HUB_TZ, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const assumed = [];
  if (!entities.date) assumed.push(L(lang, 'no date was given, so today', 'no dijiste fecha, así que hoy'));
  if (!parsedTime) assumed.push(L(lang, 'no time was given, so 10:00 AM', 'no dijiste hora, así que 10:00 a. m.'));
  const text = L(lang, `Scheduled "${title}" for ${whenStr}.`, `Agendé "${title}" para el ${whenStr}.`) +
    (attendees.length ? L(lang, ` Attendees: `, ` Asistentes: `) + attendees.join(', ') +
      (inviteEmails.length ? L(lang, ` (${inviteEmails.length} email found)`, ` (${inviteEmails.length} correo encontrado)`) : '') + '.' : '') +
    (assumed.length ? L(lang, ` Note: `, ` Ojo: `) + assumed.join('; ') + L(lang, ' — edit it in the Calendar if needed.', ' — cámbialo en el Calendario si hace falta.') : '') +
    zoomNote + L(lang, `\nIt's in your Calendar.`, `\nYa está en tu Calendario.`);
  return { event, text, whenStr, title };
}

// Execute NLP command
async function executeCommand(inputText, userEmail, opts = {}) {
  inputText = normalizeInput(inputText);
  const { intent, match } = detectIntent(inputText);
  const entities = extractEntities(inputText);
  const lang = detectLang(inputText, opts.lang);

  let response = '';
  let data = null;
  let actionTaken = intent;
  let success = true;

  try {
    switch (intent) {
      case 'greeting': {
        const hour = Number(new Date().toLocaleString('en-US', { timeZone: HUB_TZ, hour: 'numeric', hour12: false }));
        response = lang === 'es'
          ? `${hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'}! Soy tu asistente. Puedes decirme cosas como:\n\n` +
            `  "¿Qué tengo pendiente?"\n  "Muéstrame mis proyectos"\n  "Agenda una reunión con Eduardo mañana a las 10:30"\n  "Recuérdame llamar al proveedor el viernes"\n  "Dame un resumen"\n\nO escribe "ayuda" para ver todo.`
          : `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}! I'm your AI assistant. Here's what I can help with:\n\n` +
            `Try saying things like:\n` +
            `  "What do I need to do?"\n` +
            `  "Show my projects"\n` +
            `  "Any overdue tasks?"\n` +
            `  "Schedule a meeting with Eduardo tomorrow at 10:30"\n` +
            `  "Give me a summary"\n\n` +
            `Or type "help" to see all available commands.`;
        break;
      }

      case 'thanks': {
        response = L(lang, "You're welcome! Let me know if you need anything else.", '¡Con gusto! Avísame si necesitas algo más.');
        break;
      }

      case 'create_contact': {
        const parts = inputText.match(/(?:add|create|new|register)\s+(?:a\s+)?contact\s+(.+)/i);
        let firstName = entities.name || 'New Contact';
        let lastName = '';
        if (!entities.name && parts) {
          const words = parts[1].split(/\s+/);
          firstName = words[0] || 'New';
          lastName = words[1] || '';
        } else if (entities.name) {
          const nameParts = entities.name.split(' ');
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        }
        const contact = await Contact.create({
          workspace_id: 1, first_name: firstName, last_name: lastName,
          email: entities.email || null, phone: entities.phone || null,
          source: 'nlp'
        });
        await logActivity(userEmail, 'created', 'contact', contact.id, `${firstName} ${lastName}`, { via: 'nlp' });
        data = contact;
        response = `Done! Created contact "${firstName} ${lastName}". You can find them in the Contacts section.`;
        break;
      }

      case 'list_contacts': {
        const contacts = await Contact.findAll({
          where: { workspace_id: 1, archived_at: null },
          attributes: ['id', 'first_name', 'last_name', 'email', 'status'],
          order: [['updated_at', 'DESC']],
          limit: 10
        });
        data = contacts;
        response = contacts.length > 0
          ? `You have ${contacts.length} contact${contacts.length > 1 ? 's' : ''}:\n` + contacts.map(c => `  - ${c.first_name} ${c.last_name || ''} (${c.email || 'no email'}) [${c.status}]`).join('\n')
          : 'You don\'t have any contacts yet. Try: "Add a contact named John Doe"';
        break;
      }

      case 'filter_contacts': {
        const verticalName = entities.vertical || (match && match[3]);
        if (verticalName) {
          const vertical = await Vertical.findOne({
            where: { workspace_id: 1, name: { [Op.iLike]: `%${verticalName}%` } }
          });
          if (vertical) {
            const contacts = await Contact.findAll({
              where: { workspace_id: 1, vertical_id: vertical.id, archived_at: null },
              limit: 20
            });
            data = contacts;
            response = contacts.length > 0
              ? `${contacts.length} contact${contacts.length > 1 ? 's' : ''} in ${vertical.name}:\n` + contacts.map(c => `  - ${c.first_name} ${c.last_name || ''}`).join('\n')
              : `No contacts in the ${vertical.name} category yet.`;
          } else {
            response = `I couldn't find a category called "${verticalName}". Check Settings to see your categories.`;
          }
        }
        break;
      }

      case 'create_project': {
        let projectName = entities.project_name;
        if (!projectName) {
          const nameMatch = inputText.match(/project\s+(?:for\s+|called\s+|named\s+)?(.+?)(?:\s+under|\s+for|\s+with|$)/i);
          projectName = nameMatch ? nameMatch[1].trim() : 'Untitled Project';
        }
        let verticalId = null;
        if (entities.vertical) {
          const v = await Vertical.findOne({ where: { workspace_id: 1, name: { [Op.iLike]: `%${entities.vertical}%` } } });
          if (v) verticalId = v.id;
        }
        const project = await Project.create({
          workspace_id: 1, name: projectName, vertical_id: verticalId,
          status: 'planning', priority: entities.priority || 'medium',
          start_date: new Date().toISOString().split('T')[0],
          code: projectName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() + '-' + Date.now().toString(36).slice(-4).toUpperCase()
        });
        await logActivity(userEmail, 'created', 'project', project.id, projectName, { via: 'nlp' });
        data = project;
        response = `Project created! "${projectName}" is now in the Planning stage. Click on Projects in the sidebar to see it.`;
        break;
      }

      case 'list_projects': {
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null },
          include: [{ model: Vertical, as: 'vertical', attributes: ['name'] }],
          order: [['updated_at', 'DESC']],
          limit: 10
        });
        data = projects;
        response = projects.length > 0
          ? L(lang, `You have ${projects.length} project${projects.length > 1 ? 's' : ''}:\n`, `Tienes ${projects.length} proyecto${projects.length > 1 ? 's' : ''}:\n`) + projects.map(p => `  - ${p.name} [${p.status}] ${p.priority} priority ${p.vertical ? '(' + p.vertical.name + ')' : ''}`).join('\n')
          : 'No projects yet. Try: "Start a new project called Website Redesign"';
        break;
      }

      case 'overdue_projects': {
        const today = new Date().toISOString().split('T')[0];
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null, due_date: { [Op.lt]: today }, status: { [Op.notIn]: ['completed', 'cancelled'] } },
          order: [['due_date', 'ASC']]
        });
        data = projects;
        response = projects.length > 0
          ? L(lang, `Heads up! ${projects.length} project${projects.length > 1 ? 's are' : ' is'} overdue:\n`, `¡Ojo! ${projects.length} proyecto${projects.length > 1 ? 's están vencidos' : ' está vencido'}:\n`) + projects.map(p => `  - ${p.name} (was due: ${p.due_date}) [${p.status}]`).join('\n') + '\n\nClick on any project to update its status.'
          : L(lang, 'Great news! No overdue projects. Everything is on track.', '¡Buenas noticias! No hay proyectos vencidos. Todo va en orden.');
        break;
      }

      case 'stalled_projects': {
        const days = entities.days || 14;
        const cutoff = new Date(Date.now() - days * 86400000);
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null, status: { [Op.notIn]: ['completed', 'cancelled'] }, updated_at: { [Op.lt]: cutoff } },
          order: [['updated_at', 'ASC']]
        });
        data = projects;
        response = projects.length > 0
          ? `${projects.length} project${projects.length > 1 ? 's have' : ' has'} had no updates in ${days} days:\n` + projects.map(p => `  - ${p.name} (last activity: ${p.updated_at.toISOString().split('T')[0]}) [${p.status}]`).join('\n') + '\n\nConsider adding an update or changing their status.'
          : `All projects have had activity in the last ${days} days. Looking good!`;
        break;
      }

      case 'high_priority_projects': {
        const projects = await Project.findAll({
          where: { workspace_id: 1, archived_at: null, priority: { [Op.in]: ['high', 'critical'] } },
          include: [{ model: Vertical, as: 'vertical', attributes: ['name'] }],
          order: [['priority', 'ASC'], ['due_date', 'ASC NULLS LAST']]
        });
        data = projects;
        response = projects.length > 0
          ? `${projects.length} high-priority project${projects.length > 1 ? 's' : ''}:\n` + projects.map(p => `  - ${p.name} [${p.priority}] ${p.status} ${p.due_date ? '(due: ' + p.due_date + ')' : ''}`).join('\n')
          : 'No high-priority projects right now.';
        break;
      }

      case 'update_project_due_date': {
        // Pattern A: change [project] X due date to Y -> match[3]=name, match[4]=date
        // Pattern B: change due date of X to Y     -> match[2]=name, match[3]=date
        let targetName = match && (match[3] || match[2]) ? (match[4] ? match[3] : match[2]).trim() : null;
        const dateStr = match && (match[4] || match[3]) ? (match[4] || match[3]).trim() : null;
        if (targetName) targetName = targetName.replace(/\s+(project|due\s+date|deadline|due)\s*$/i, '').trim();
        const isoDate = parseDateFreeform(dateStr);
        if (!targetName || !isoDate) {
          response = `I need a project name and a date. Try: "change Visionarium due date to July 15" or "set the deadline of KanchoAI to 2026-08-01".`;
          break;
        }
        const project = await Project.findOne({ where: { workspace_id: 1, name: { [Op.iLike]: `%${targetName}%` } } });
        if (!project) {
          response = `I couldn't find a project matching "${targetName}". Try "show projects" to see your project names.`;
          break;
        }
        const oldDue = project.due_date;
        await project.update({ due_date: isoDate });
        await logActivity(userEmail, 'due_date_changed', 'project', project.id, project.name, { from: oldDue, to: isoDate, via: 'nlp' });
        data = project;
        response = `Done! Due date for "${project.name}" is now ${isoDate}${oldDue ? ` (was ${oldDue})` : ''}.`;
        break;
      }

      case 'update_project_status': {
        const targetName = match && match[3] ? match[3].trim() : null;
        const newStatus = entities.status || (match && match[4] ? match[4].trim().toLowerCase().replace(/\s+/g, '_') : null);
        if (targetName && newStatus) {
          const project = await Project.findOne({ where: { workspace_id: 1, name: { [Op.iLike]: `%${targetName}%` } } });
          if (project) {
            const oldStatus = project.status;
            await project.update({ status: newStatus });
            await logActivity(userEmail, 'status_changed', 'project', project.id, project.name, { from: oldStatus, to: newStatus, via: 'nlp' });
            data = project;
            response = `Done! "${project.name}" has been moved from "${oldStatus}" to "${newStatus}".`;
          } else {
            response = `I couldn't find a project matching "${targetName}". Try "show projects" to see your project names.`;
          }
        } else {
          response = 'I need to know which project and what status. Try something like:\n  "Move Website Redesign to in progress"\n  "Set KanchoAI to completed"';
        }
        break;
      }

      case 'summarize_projects': {
        const projects = await Project.findAll({ where: { workspace_id: 1, archived_at: null } });
        const tasks = await Task.findAll({ where: { workspace_id: 1, status: 'pending' } });
        const contacts = await Contact.findAll({ where: { workspace_id: 1, archived_at: null } });
        const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date());

        const byStatus = {};
        const byPriority = {};
        projects.forEach(p => {
          byStatus[p.status] = (byStatus[p.status] || 0) + 1;
          byPriority[p.priority] = (byPriority[p.priority] || 0) + 1;
        });

        response = lang === 'es'
          ? `Resumen de tu espacio:\n\n  Proyectos: ${projects.length} en total\n` +
            (Object.keys(byStatus).length ? Object.entries(byStatus).map(([k, v]) => `    - ${v} ${k}`).join('\n') + '\n' : '') +
            `\n  Tareas: ${tasks.length} pendientes` + (overdueTasks.length ? ` (¡${overdueTasks.length} vencidas!)` : ' (ninguna vencida)') +
            `\n  Contactos: ${contacts.length}\n\n` +
            (overdueTasks.length ? `Tienes ${overdueTasks.length} tarea${overdueTasks.length > 1 ? 's' : ''} vencida${overdueTasks.length > 1 ? 's' : ''} por atender.` : 'Todo se ve bien. Nada urgente.')
          : `Here's your workspace snapshot:\n\n` +
            `  Projects: ${projects.length} total\n` +
            (Object.keys(byStatus).length ? Object.entries(byStatus).map(([k, v]) => `    - ${v} ${k}`).join('\n') + '\n' : '') +
            `\n  Tasks: ${tasks.length} pending` +
            (overdueTasks.length ? ` (${overdueTasks.length} overdue!)` : ' (none overdue)') +
            `\n  Contacts: ${contacts.length} in your network\n\n` +
            (overdueTasks.length ? `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need attention.` : 'Everything looks good! No urgent items.');
        break;
      }

      case 'create_task': {
        let title;
        if (lang === 'es') {
          title = inputText.replace(/^(?:crea(?:r)?|agrega(?:r)?|a[nñ]ade|anota(?:r)?|nueva?)\s+(?:una?\s+)?(?:tarea|pendiente)\s*(?:de|para|:)?\s*/i, '').trim() || 'Seguimiento';
          title = title.charAt(0).toUpperCase() + title.slice(1);
        } else {
          const titleMatch = inputText.match(/(?:to|about|for)\s+(.+?)(?:\s+(?:on|by|next|tomorrow|today)|$)/i);
          title = titleMatch ? titleMatch[1].trim() : inputText.replace(/^(create|add|new|make)\s+(a\s+)?(task|todo|to[\s-]?do|follow[\s-]?up)\s*/i, '').trim() || 'Follow-up';
        }
        const task = await Task.create({
          workspace_id: 1, user_email: userEmail, title, task_type: 'task',
          due_date: entities.date ? new Date(entities.date) : null,
          priority: entities.priority || 'medium'
        });
        await logActivity(userEmail, 'created', 'task', task.id, title, { via: 'nlp' });
        data = task;
        response = L(lang, `Got it! Created task: "${title}"`, `Listo. Creé la tarea: "${title}"`) +
          (entities.date ? L(lang, ` (due: ${entities.date})`, ` (vence: ${entities.date})`) : '') +
          L(lang, `. You can find it in the Tasks section.`, `. La encuentras en Tareas.`);
        break;
      }

      case 'create_reminder': {
        // On-demand reminders are ALERTS (the bell / Alerts & Updates), not tasks.
        let title;
        if (lang === 'es') {
          title = inputText
            .replace(/^(?:oye\s+|por\s+favor\s+)?(?:recu[eé]rda(?:me|nos)?|recordarme|av[ií]same|no\s+me\s+dejes\s+olvidar|tengo\s+que\s+acordarme|necesito\s+recordar|pon(?:me)?\s+un\s+recordatorio|crea(?:r)?\s+un\s+recordatorio)\s*[,:]?\s*/i, '')
            .replace(/^(?:que|de|para|sobre|lo\s+de)\s+/i, '')
            .trim();
        } else {
          const titleMatch = inputText.match(/(?:about|that|to|for|of)\s+(.+)$/i);
          title = titleMatch
            ? titleMatch[1].trim()
            : inputText
                .replace(/^(remind|alert|notify)\s+(me|us)\s*/i, '')
                .replace(/^(don'?t\s+let\s+me\s+forget|i\s+need\s+to\s+remember)\s*(to|about|that)?\s*/i, '')
                .trim();
        }
        if (!title) title = L(lang, 'Reminder', 'Recordatorio');
        title = title.charAt(0).toUpperCase() + title.slice(1);

        // A reminder about a meeting with a day or time also goes on the calendar (Zoom by default).
        let booked = null;
        if (MEETING_WORDS.test(inputText) && (entities.date || parseTime(inputText))) {
          booked = await bookMeeting(inputText, entities, userEmail, lang);
        }

        const message = booked
          ? L(lang, `Meeting on ${booked.whenStr}`, `Reunión el ${booked.whenStr}`) + (booked.event.zoom_join_url ? ` · Zoom: ${booked.event.zoom_join_url}` : '')
          : entities.date ? L(lang, `Reminder for ${entities.date}`, `Recordatorio para el ${entities.date}`) : L(lang, 'On-demand reminder', 'Recordatorio');
        await createNotification(userEmail, 'reminder', title, message, booked ? 'calendar_event' : 'reminder', booked ? booked.event.id : null);
        await logActivity(userEmail, 'created', 'reminder', null, title, { via: 'nlp', lang, event_id: booked ? booked.event.id : null });
        data = { title, event_id: booked ? booked.event.id : null };
        response = L(lang, `Reminder set: "${title}". It's in your Alerts — tap the bell, top-right.`,
                           `Recordatorio guardado: "${title}". Está en tus Alertas — toca la campana, arriba a la derecha.`) +
          (booked ? '\n\n' + booked.text : '');
        break;
      }

      case 'list_tasks': {
        const tasks = await Task.findAll({
          where: { workspace_id: 1, status: 'pending' },
          include: [{ model: Project, as: 'project', attributes: ['name'] }],
          order: [['due_date', 'ASC NULLS LAST']],
          limit: 10
        });
        data = tasks;
        if (tasks.length > 0) {
          const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date());
          response = L(lang, `You have ${tasks.length} pending task${tasks.length > 1 ? 's' : ''}`, `Tienes ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} pendiente${tasks.length > 1 ? 's' : ''}`) +
            (overdue.length ? L(lang, ` (${overdue.length} overdue!)`, ` (¡${overdue.length} vencida${overdue.length > 1 ? 's' : ''}!)`) : '') + `:\n` +
            tasks.map(t => {
              const isOverdue = t.due_date && new Date(t.due_date) < new Date();
              return `  ${isOverdue ? '!' : '-'} ${t.title} [${t.priority}]` +
                (t.due_date ? ` (due: ${t.due_date.toISOString().split('T')[0]}${isOverdue ? ' - OVERDUE' : ''})` : '') +
                (t.project ? ` [${t.project.name}]` : '');
            }).join('\n') +
            L(lang, `\n\nClick on Tasks in the sidebar to manage them.`, `\n\nAbre Tareas en el menú para gestionarlas.`);
        } else {
          response = L(lang, 'You\'re all caught up! No pending tasks. To add one, try:\n  "Add a task to review the proposal"', '¡Estás al día! No tienes tareas pendientes. Para agregar una: "Crea una tarea revisar la propuesta"');
        }
        break;
      }

      case 'overdue_tasks': {
        const tasks = await Task.findAll({
          where: { workspace_id: 1, status: 'pending', due_date: { [Op.lt]: new Date() } },
          order: [['due_date', 'ASC']]
        });
        data = tasks;
        response = tasks.length > 0
          ? L(lang, `Attention! ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''}:\n`, `¡Atención! ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} vencida${tasks.length > 1 ? 's' : ''}:\n`) + tasks.map(t => `  ! ${t.title} (${L(lang, 'was due', 'vencía')}: ${t.due_date.toISOString().split('T')[0]})`).join('\n') + L(lang, '\n\nClick Tasks to mark them as done or reschedule.', '\n\nAbre Tareas para marcarlas o reprogramarlas.')
          : L(lang, 'No overdue tasks. You\'re on top of everything!', 'No hay tareas vencidas. ¡Vas al día!');
        break;
      }

      case 'create_event': {
        const booked = await bookMeeting(inputText, entities, userEmail, lang);
        data = booked.event;
        response = booked.text;
        break;
      }

      case 'upcoming_events': {
        const now = new Date();
        const weekLater = new Date(now.getTime() + 7 * 86400000);
        const events = await CalendarEvent.findAll({
          where: { workspace_id: 1, start_time: { [Op.between]: [now, weekLater] } },
          order: [['start_time', 'ASC']],
          limit: 10
        });
        data = events;
        response = events.length > 0
          ? L(lang, `You have ${events.length} event${events.length > 1 ? 's' : ''} coming up this week:\n`, `Tienes ${events.length} evento${events.length > 1 ? 's' : ''} esta semana:\n`) + events.map(e => `  - ${e.title} (${new Date(e.start_time).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { timeZone: HUB_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})${e.zoom_join_url ? ' · Zoom' : ''}`).join('\n')
          : L(lang, 'Your week is clear! No upcoming events. To add one, try:\n  "Schedule a meeting with the team for tomorrow"', '¡Semana libre! No tienes eventos. Para agregar uno: "Agenda una reunión con el equipo mañana a las 10"');
        break;
      }

      case 'link_contact_project': {
        const linkMatch = inputText.match(/(?:link|connect|associate|assign)\s+(.+?)\s+to\s+(?:project\s+)?(.+)/i);
        if (linkMatch) {
          const contactName = linkMatch[1].trim();
          const projectName = linkMatch[2].trim();
          const contact = await Contact.findOne({ where: { workspace_id: 1, first_name: { [Op.iLike]: `%${contactName}%` } } });
          const project = await Project.findOne({ where: { workspace_id: 1, name: { [Op.iLike]: `%${projectName}%` } } });
          if (contact && project) {
            await ProjectContact.findOrCreate({ where: { project_id: project.id, contact_id: contact.id }, defaults: { project_id: project.id, contact_id: contact.id } });
            await logActivity(userEmail, 'linked_contact', 'project', project.id, project.name, { contact_id: contact.id, via: 'nlp' });
            response = `Done! Linked "${contact.first_name} ${contact.last_name || ''}" to project "${project.name}".`;
          } else {
            response = `I couldn't find ${!contact ? 'a contact matching "' + contactName + '"' : 'a project matching "' + projectName + '"'}. Check your Contacts and Projects lists.`;
          }
        } else {
          response = 'To link a contact to a project, try:\n  "Link John to project Website Redesign"\n  "Connect Maria to KanchoAI"';
        }
        break;
      }

      case 'list_reminders': {
        const reminders = await Task.findAll({
          where: { workspace_id: 1, task_type: 'reminder', status: 'pending' },
          order: [['due_date', 'ASC NULLS LAST']],
          limit: 10
        });
        data = reminders;
        response = reminders.length > 0
          ? L(lang, `${reminders.length} pending reminder${reminders.length > 1 ? 's' : ''}:\n`, `${reminders.length} recordatorio${reminders.length > 1 ? 's' : ''} pendiente${reminders.length > 1 ? 's' : ''}:\n`) + reminders.map(r => `  - ${r.title} ${r.due_date ? '(due: ' + r.due_date.toISOString().split('T')[0] + ')' : ''}`).join('\n')
          : L(lang, 'No pending reminders. To add one, try:\n  "Remind me to call the vendor next Tuesday"', 'No hay recordatorios pendientes. Para crear uno: "Recuérdame llamar al proveedor el martes"');
        break;
      }

      case 'dashboard': {
        response = 'Taking you to the dashboard now...';
        data = { navigate: 'overview' };
        break;
      }

      case 'help': {
        if (lang === 'es') {
          response = `Puedes pedirme cosas como:\n\n` +
            `TAREAS\n  "¿Qué tengo pendiente?"\n  "Muéstrame las tareas vencidas"\n  "Crea una tarea llamar al proveedor"\n  "Recuérdame enviar la propuesta el viernes"\n\n` +
            `PROYECTOS\n  "Muéstrame mis proyectos"\n  "¿Hay algo vencido?"\n  "Dame un resumen"\n\n` +
            `AGENDA (Zoom incluido por defecto)\n  "¿Qué tengo esta semana?"\n  "Agenda una reunión con Eduardo mañana a las 10:30"\n  "Tengo una cita con Ana el lunes a las 3 de la tarde, sin zoom"\n\n` +
            `Habla o escribe con naturalidad, en español o en inglés.`;
          break;
        }
        response = `Here are some things you can ask me:\n\n` +
          `TASKS & TO-DOS\n` +
          `  "What do I need to do?"\n` +
          `  "Any overdue tasks?"\n` +
          `  "Add a task to call the supplier"\n` +
          `  "Remind me to follow up tomorrow"\n\n` +
          `PROJECTS\n` +
          `  "Show my projects"\n` +
          `  "Any projects overdue?"\n` +
          `  "Start a new project called Website Redesign"\n` +
          `  "Move KanchoAI to in progress"\n` +
          `  "Give me a summary"\n\n` +
          `CONTACTS\n` +
          `  "Show all contacts"\n` +
          `  "Add a contact named John Doe"\n` +
          `  "Link John to project KanchoAI"\n\n` +
          `CALENDAR\n` +
          `  "What's coming up this week?"\n` +
          `  "Schedule a meeting for tomorrow"\n\n` +
          `Just type naturally — I understand plain language!`;
        break;
      }

      default:
        if (lang === 'es') {
          response = `No estoy seguro de qué necesitas. Prueba con:\n\n` +
            `  "¿Qué tengo pendiente?"\n  "Muéstrame mis proyectos"\n  "Agenda una reunión con Eduardo mañana a las 10:30"\n  "Recuérdame llamar a Carlos el viernes"\n  "Ayuda" — para ver todo`;
          break;
        }
        response = `I'm not sure what you mean. Here are some things you can try:\n\n` +
          `  "What do I need to do?" — see your pending tasks\n` +
          `  "Show my projects" — list all projects\n` +
          `  "Give me a summary" — get a quick overview\n` +
          `  "Help" — see all available commands\n\n` +
          `Just type naturally, like you would talk to an assistant!`;
    }
  } catch (err) {
    console.error('[D2AI NLP] Execution error:', err);
    response = L(lang, `Oops, something went wrong: ${err.message}. Please try again.`, `Algo salió mal: ${err.message}. Intenta de nuevo.`);
    success = false;
  }

  return { intent, entities, actionTaken, response, data, success, lang };
}

module.exports = { executeCommand, detectIntent, extractEntities, parseAttendees };
