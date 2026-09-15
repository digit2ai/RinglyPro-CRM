'use strict';

/**
 * SpeakUp AI Factory — context selection.
 *
 * Resolves "use my latest meeting", "yesterday's meeting with Greg", "the RinglyPro
 * meeting from this morning", "meeting 184", or an explicit on-screen selection
 * into concrete su_recordings rows. Deterministic (no model), tenant-scoped, and
 * every selected row carries WHY it was picked so the phone can show the choice
 * before anything is prepared or executed.
 *
 * Commands and architect requests are never implicit context: a spoken instruction
 * is not a meeting. They can still be named explicitly by number.
 */

const { Op } = require('sequelize');
const { Recording, Transcript, sequelize } = require('../models');
const { normalizeSpoken } = require('./security');

const TZ = process.env.SPEAKUP_TZ || 'America/New_York';

// Offset of `tz` from UTC at instant `d`, in ms.
function tzOffsetMs(d, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d)
    .reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

// Midnight (local to tz) of the day `dayDelta` days from `now`.
function localMidnight(now, dayDelta, tz) {
  const off = tzOffsetMs(now, tz);
  const local = new Date(now.getTime() + off);
  const midLocalUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayDelta);
  return new Date(midLocalUtc - tzOffsetMs(new Date(midLocalUtc - off), tz));
}

const NUMBER_WORDS = { two: 2, dos: 2, three: 3, tres: 3, four: 4, cuatro: 4, five: 5, cinco: 5 };
const PERSON_STOP = new Set(['de', 'del', 'la', 'el', 'the', 'from', 'this', 'esta', 'este', 'ayer', 'hoy', 'yesterday', 'today',
  'today s', 'on', 'en', 'about', 'sobre', 'y', 'and', 'for', 'para', 'meeting', 'reunion', 'my', 'mi', 'team', 'equipo', 'morning', 'manana']);

// Pure parser (unit-tested offline).
function parseSelector(text) {
  const n = ' ' + normalizeSpoken(text) + ' ';
  const sel = { ids: [], range: null, latest: false, person: null, count: null, kindHint: null, plural: false };

  const idRe = /\b(?:meeting|reunion|grabacion|nota|note|recording|sesion|session|conversation|conversacion)\s*(?:number|numero|no|n)?\s*(\d{1,9})\b/g;
  let m;
  while ((m = idRe.exec(n))) sel.ids.push(parseInt(m[1], 10));
  const hashRe = /#\s*(\d{1,9})/g;
  while ((m = hashRe.exec(String(text || '')))) sel.ids.push(parseInt(m[1], 10));
  sel.ids = [...new Set(sel.ids)].slice(0, 10);

  if (/ (this morning|esta manana|de la manana|hoy en la manana) /.test(n)) sel.range = 'this_morning';
  else if (/ (yesterday|ayer) /.test(n)) sel.range = 'yesterday';
  else if (/ (today|hoy|today s) /.test(n)) sel.range = 'today';
  else if (/ (this week|esta semana|de la semana) /.test(n)) sel.range = 'this_week';
  else if (/ (last week|semana pasada) /.test(n)) sel.range = 'last_week';

  if (/ (latest|last|most recent|ultima|ultimo|mas reciente|reciente) /.test(n)) sel.latest = true;

  const cm = n.match(/ (these|those|estas|estos|esas|esos|the last|las ultimas|los ultimos) (two|three|four|five|dos|tres|cuatro|cinco|\d) /);
  if (cm) sel.count = NUMBER_WORDS[cm[2]] || parseInt(cm[2], 10) || null;

  const pm = n.match(/ (?:with|con) ([a-z][a-z]+)(?: ([a-z][a-z]+))? /);
  if (pm && !PERSON_STOP.has(pm[1])) sel.person = pm[2] && !PERSON_STOP.has(pm[2]) && pm[2].length > 2 ? pm[1] + ' ' + pm[2] : pm[1];

  if (/ (meeting|meetings|reunion|reuniones|call|llamada|conversation|conversations|conversacion|conversaciones) /.test(n)) sel.kindHint = 'meeting';
  else if (/ (note|notes|nota|notas|idea|ideas) /.test(n)) sel.kindHint = 'note';
  sel.plural = / (meetings|reuniones|conversations|conversaciones|notes|notas) /.test(n);
  return sel;
}

function rangeBounds(range, now, tz) {
  if (range === 'today') return [localMidnight(now, 0, tz), localMidnight(now, 1, tz)];
  if (range === 'this_morning') { const s = localMidnight(now, 0, tz); return [s, new Date(s.getTime() + 12 * 3600e3)]; }
  if (range === 'yesterday') return [localMidnight(now, -1, tz), localMidnight(now, 0, tz)];
  if (range === 'this_week' || range === 'last_week') {
    const off = tzOffsetMs(now, tz);
    const dow = (new Date(now.getTime() + off).getUTCDay() + 6) % 7; // Monday = 0
    const mon = localMidnight(now, -dow, tz);
    return range === 'this_week' ? [mon, localMidnight(now, 1, tz)] : [new Date(mon.getTime() - 7 * 86400e3), mon];
  }
  return null;
}

/**
 * resolve(tenant_id, text, { recording_ids, project, now })
 * -> { recordings: [{ id, title, created_at, mode, source, project_key, why }], selector, needs_selection, explanation }
 */
async function resolve(tenant_id, text, opts = {}) {
  const now = opts.now || new Date();
  const sel = parseSelector(text);
  const why = [];
  const base = { tenant_id, status: { [Op.ne]: 'recording' }, [Op.or]: [{ mode: null }, { mode: { [Op.notIn]: ['command', 'architect'] } }] };

  // 1. An explicit on-screen selection always wins.
  const explicit = (Array.isArray(opts.recording_ids) ? opts.recording_ids : []).map(x => parseInt(x, 10)).filter(Boolean).slice(0, 10);
  if (explicit.length || sel.ids.length) {
    const ids = explicit.length ? explicit : sel.ids;
    const rows = await Recording.findAll({ where: { tenant_id, status: { [Op.ne]: 'recording' }, id: ids }, order: [['created_at', 'DESC']] });
    const missing = ids.filter(id => !rows.some(r => r.id === id));
    return out(rows, sel, explicit.length ? ['selected on screen'] : ['named by number'],
      missing.length ? 'Not found (or not yours): ' + missing.join(', ') : null, false);
  }
  if (sel.count && !explicit.length) {
    return out([], sel, [], 'Select the ' + sel.count + ' conversations on screen, then repeat the command.', true);
  }

  const where = { ...base };
  const b = rangeBounds(sel.range, now, TZ);
  if (b) { where.created_at = { [Op.gte]: b[0], [Op.lt]: b[1] }; why.push(sel.range.replace('_', ' ')); }
  if (sel.kindHint === 'meeting') { where[Op.and] = [{ [Op.or]: [{ mode: 'meeting' }, { source: ['meeting', 'call'] }, { mode: null, source: ['mic', 'upload', 'import'] }] }]; why.push('meetings'); }
  if (sel.kindHint === 'note') { where[Op.and] = [{ [Op.or]: [{ mode: 'note' }, { source: 'note' }] }]; why.push('notes'); }

  const candidates = await Recording.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });
  let rows = candidates;

  if (opts.project) {
    const names = [opts.project.key, opts.project.name, ...(opts.project.aliases || [])].map(normalizeSpoken).filter(Boolean);
    rows = await filterByTerms(rows, names, r => r.project_key === opts.project.key);
    why.push('project ' + opts.project.name);
  }
  if (sel.person) {
    const person = sel.person;
    rows = await filterByTerms(rows, [person], r => (r.participants || []).some(p => normalizeSpoken(p).includes(person)));
    why.push('with ' + person);
  }

  const limit = (sel.plural || sel.range === 'this_week' || sel.range === 'last_week') && !sel.latest ? 10 : 1;
  rows = rows.slice(0, limit);
  if (!why.length || sel.latest) why.push('most recent');
  return out(rows, sel, why, rows.length ? null : 'No conversation matched: ' + why.join(', '), false);
}

async function filterByTerms(rows, terms, directMatch) {
  if (!rows.length) return rows;
  const direct = new Set(rows.filter(directMatch).map(r => r.id));
  const ids = rows.map(r => r.id);
  const likes = terms.filter(t => t.length >= 3).map(t => '%' + t.replace(/[%_]/g, '') + '%');
  if (likes.length) {
    const [hits] = await sequelize.query(
      `SELECT r.id FROM su_recordings r LEFT JOIN su_transcripts t ON t.recording_id = r.id
        WHERE r.id IN (:ids) AND (${likes.map((_, i) => `TRANSLATE(LOWER(r.title), 'áéíóúüñàèìòù', 'aeiouunaeiou') LIKE :l${i} OR TRANSLATE(LOWER(t.text), 'áéíóúüñàèìòù', 'aeiouunaeiou') LIKE :l${i}`).join(' OR ')})`,
      { replacements: Object.assign({ ids }, ...likes.map((l, i) => ({ ['l' + i]: l }))) }
    );
    for (const h of hits) direct.add(h.id);
  }
  return rows.filter(r => direct.has(r.id));
}

function out(rows, selector, why, explanation, needs_selection) {
  return {
    recordings: rows.map(r => ({ id: r.id, title: r.title, created_at: r.created_at, mode: r.mode, source: r.source,
      project_key: r.project_key, why: why.join(' · ') })),
    selector, needs_selection: !!needs_selection, explanation: explanation || null
  };
}

async function loadTexts(tenant_id, ids) {
  const recs = await Recording.findAll({ where: { tenant_id, id: ids } });
  const trs = await Transcript.findAll({ where: { tenant_id, recording_id: recs.map(r => r.id) } });
  const byId = new Map(trs.map(t => [t.recording_id, t.text || '']));
  return recs.map(r => ({ recording: r, text: byId.get(r.id) || '' }));
}

module.exports = { TZ, parseSelector, rangeBounds, localMidnight, resolve, loadTexts };
