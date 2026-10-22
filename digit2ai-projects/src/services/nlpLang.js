'use strict';

// Bilingual (English / Spanish) helpers for the AI Command Center parser.
// Dates are resolved in the hub timezone, never the server's (Render runs UTC,
// so "tomorrow" said at 9pm in Tampa used to land two days out).

const HUB_TZ = process.env.D2AI_TZ || 'America/New_York';

const ES_WORDS = /\b(recu[eé]rda(?:me|nos)?|recordatorio|reuni[oó]n|cita|llamada|junta|ma[nñ]ana|hoy|pasado|tengo|tenemos|agenda|ag[eé]ndame|programa|qu[eé]|mis|muestra(?:me)?|proyectos|tareas|pendientes?|semana|pr[oó]xim[oa]|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|con|las|del|para|sobre|hola|gracias|ayuda|resumen|vencid[oa]s?|atrasad[oa]s?|av[ií]same|necesito)(?![a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1])/gi;
const EN_WORDS = /\b(remind|reminder|meeting|tomorrow|today|schedule|show|my|what|the|with|at|for|about|projects|tasks|week|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|have|need|please|hello|thanks|help|summary|overdue|call)\b/gi;

// Text wins when it is clearly one language; otherwise the mic setting decides.
function detectLang(text, hint) {
  const es = (String(text).match(ES_WORDS) || []).length;
  const en = (String(text).match(EN_WORDS) || []).length;
  if (es >= 2 && es > en) return 'es';
  if (en >= 2 && en > es) return 'en';
  if (hint === 'es' || hint === 'en') return hint;
  return es > en ? 'es' : 'en';
}

function L(lang, en, es) { return lang === 'es' ? es : en; }

function hubToday() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: HUB_TZ });
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);

const DAYS = [
  ['sunday', 'domingo'], ['monday', 'lunes'], ['tuesday', 'martes'],
  ['wednesday', 'mi[eé]rcoles'], ['thursday', 'jueves'], ['friday', 'viernes'], ['saturday', 's[aá]bado']
];
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

// "mañana" means tomorrow, but "de la mañana" / "en la mañana" means morning.
const TOMORROW_ES = /(?<!\b(?:la|las)\s)\bma[nñ]ana\b/i;

// Returns an ISO date (YYYY-MM-DD) in the hub timezone, or null when the text names none.
function resolveDate(text) {
  const t = String(text).toLowerCase();
  const today = hubToday();

  if (/\b(day after tomorrow|pasado\s+ma[nñ]ana)\b/.test(t)) return iso(addDays(today, 2));
  if (/\btomorrow\b/.test(t) || TOMORROW_ES.test(t)) return iso(addDays(today, 1));
  if (/\b(today|tonight|this (?:morning|afternoon|evening)|hoy|esta (?:noche|tarde))\b/.test(t)) return iso(today);
  let m = t.match(/\b(?:in|en)\s+(\d{1,2}|two|three|dos|tres)\s+(?:days?|d[ií]as?)\b/);
  if (m) {
    const n = { two: 2, three: 3, dos: 2, tres: 3 }[m[1]] || parseInt(m[1], 10);
    return iso(addDays(today, n));
  }
  if (/\b(next week|in a week|la pr[oó]xima semana|la semana que viene|en una semana)\b/.test(t)) return iso(addDays(today, 7));
  if (/\b(end of (?:the )?week|fin de semana)\b/.test(t)) return iso(nextWeekday(today, 5));

  // Explicit dates: "October 25", "25 de octubre", "10/25", "2026-10-25".
  m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m && MONTHS[m[1]]) return withYear(today, MONTHS[m[1]], +m[2]);
  m = t.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)\b/);
  if (m && MONTHS[m[2]]) return withYear(today, MONTHS[m[2]], +m[1]);
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    if (m[3]) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return withYear(today, +m[1], +m[2]);
  }

  // Weekdays, with or without next/this/on/el/este/próximo.
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\b(?:${DAYS[i][0]}|${DAYS[i][1]})\\b`, 'i');
    if (re.test(t)) return iso(nextWeekday(today, i));
  }
  return null;
}

function nextWeekday(today, target) {
  let diff = target - today.getUTCDay();
  if (diff <= 0) diff += 7;
  return addDays(today, diff);
}

// A date with no year is the next time that day comes round.
function withYear(today, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let y = today.getUTCFullYear();
  if (Date.UTC(y, month - 1, day) < today.getTime()) y += 1;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Free-form time in English or Spanish. Returns { h, m } or null.
function parseTime(text) {
  const t = String(text).toLowerCase();
  if (/\b(noon|mediod[ií]a)\b/.test(t)) return { h: 12, m: 0 };
  if (/\b(midnight|medianoche)\b/.test(t)) return { h: 0, m: 0 };
  const morning = /\b(morning|de la ma[nñ]ana|en la ma[nñ]ana|por la ma[nñ]ana)\b/.test(t);
  const evening = /\b(afternoon|evening|tonight|de la tarde|en la tarde|por la tarde|de la noche|esta noche|esta tarde)\b/.test(t);

  const fix = (h, mi, mer) => {
    if (mer) { h = h % 12; if (/p/.test(mer)) h += 12; }
    else if (evening && h < 12) h += 12;
    else if (!morning && h >= 1 && h <= 6) h += 12;   // "at 3" in business hours means 3 PM
    return h <= 23 && mi <= 59 ? { h, m: mi } : null;
  };

  let m = t.match(/\b(\d{1,2})(?:[:;.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/);
  if (m) return fix(+m[1], m[2] ? +m[2] : 0, m[3]);
  m = t.match(/\b(\d{1,2})\s+y\s+(media|cuarto)\b/);
  if (m) return fix(+m[1], m[2] === 'media' ? 30 : 15, null);
  m = t.match(/\b(\d{1,2})[:;](\d{2})\b/);
  if (m) return fix(+m[1], +m[2], null);
  m = t.match(/\b(?:at|a\s+las?|@)\s+(\d{1,2})\b/);
  if (m) return fix(+m[1], 0, null);
  return null;
}

// Phrases that turn a command into a calendar meeting (nouns, not the verb "call").
const MEETING_WORDS = /\b(meeting|appointment|zoom|sync|reuni[oó]n|cita|junta|videollamada|llamada|a call|the call|call with)\b/i;
// Zoom is on by default; only an explicit opt-out turns it off.
const NO_ZOOM = /\b(no zoom|without zoom|sin zoom|in[\s-]person|presencial|en persona|en la oficina|at the office)\b/i;

module.exports = { HUB_TZ, detectLang, L, resolveDate, parseTime, hubToday, MEETING_WORDS, NO_ZOOM };
