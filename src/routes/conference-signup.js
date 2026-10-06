'use strict';

/**
 * Build With AI — "join the Visionarium AI Engineering Solutions team" sign-up.
 *
 * POST /api/conference/signup   public, rate-limited. The form behind the QR on
 *                               the last slide of /conference/keynote/.
 * GET  /api/conference/health   reports config only.
 *
 * Saves into the CRM `contacts` table under ONE client (CONFERENCE_CLIENT_ID,
 * default 15, the owner's own account). Three rules, all enforced here and not
 * in the page, because the page is public and anyone can post without it:
 *
 *  1. THE ROOM INCLUDES MINORS. Under 18 needs a parent or guardian's name, a
 *     way to reach them and an explicit consent tick, or nothing is stored.
 *     Under 13 is refused outright (a parent must sign up for them): a public
 *     form is not a place to collect a child's contact details.
 *  2. EVERY VALUE IS VALIDATED TO A NARROW CHARACTER SET BEFORE IT IS STORED.
 *     `notes` is rendered inside the CRM for a signed-in owner, so a name is
 *     letters only, a phone is digits, and no free text is accepted at all.
 *  3. `contacts.email` and `contacts.phone` are unique across EVERY client. A
 *     value that already belongs to this client gets a note appended (its name,
 *     phone and email are never overwritten by a public form). A value that
 *     belongs to ANOTHER client is never read back, changed or revealed: the
 *     answer is a generic refusal.
 *
 * Nothing is sent to anyone. The row is a lead the owner follows up by hand.
 * Every query passes logging:false, so a minor's details never reach a server log.
 */

const express = require('express');
const crypto = require('crypto');

const CLIENT_ID = parseInt(process.env.CONFERENCE_CLIENT_ID || '15', 10);
const SOURCE = 'conference';
const LEAD_SOURCE = 'build-with-ai';
const TAGS = ['build-with-ai', 'visionarium-ai-engineering'];
const CONSENT_VERSION = 'conf-v1-2026-10-06';
// A whole room signs up from ONE address (the venue Wi-Fi), so the per-address ceiling has to
// hold a full audience. It is there to stop a script, not a crowd.
const PER_IP = parseInt(process.env.CONFERENCE_SIGNUP_PER_10MIN || '60', 10);
const PER_HOUR_ALL = parseInt(process.env.CONFERENCE_SIGNUP_PER_HOUR || '300', 10);
const MIN_AGE = 13;

// Letters (any language), spaces, apostrophe, hyphen, period. Nothing that can
// carry markup into the CRM screen that later renders it.
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'’-]{0,49}$/u;
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63}){1,4}$/;

function cleanName(v) {
  const s = String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim();
  return NAME_RE.test(s) ? s : null;
}
function cleanEmail(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s.length <= 120 && EMAIL_RE.test(s) ? s : null;
}
// E.164. Ten digits are taken as a US number, which is what the CRM already holds.
function cleanPhone(v) {
  const raw = String(v == null ? '' : v).trim();
  if (raw.length > 30 || /[^0-9+()\-.\s]/.test(raw)) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  if (raw[0] === '+' && d.length >= 8 && d.length <= 15) return '+' + d;
  return null;
}
function cleanAge(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = parseInt(s, 10);
  return n >= 5 && n <= 110 ? n : null;
}

function validate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = [];
  const out = {
    first_name: cleanName(b.first_name),
    last_name: cleanName(b.last_name),
    email: cleanEmail(b.email),
    phone: cleanPhone(b.phone),
    age: cleanAge(b.age),
    lang: b.lang === 'es' ? 'es' : 'en',
    consent: b.consent === true,
    minor: false,
    parent_name: null, parent_email: null, parent_phone: null, parent_consent: false
  };
  if (!out.first_name) errors.push('first_name');
  if (!out.last_name) errors.push('last_name');
  if (!out.email) errors.push('email');
  if (!out.phone) errors.push('phone');
  if (out.age == null) errors.push('age');
  if (!out.consent) errors.push('consent');
  if (out.age != null && out.age < MIN_AGE) return { ok: false, code: 'too_young', errors: ['age'] };
  if (out.age != null && out.age < 18) {
    out.minor = true;
    out.parent_name = cleanName(b.parent_name);
    out.parent_email = b.parent_email ? cleanEmail(b.parent_email) : null;
    out.parent_phone = b.parent_phone ? cleanPhone(b.parent_phone) : null;
    out.parent_consent = b.parent_consent === true;
    if (!out.parent_name) errors.push('parent_name');
    // Something typed but unusable is an error, not a silent blank.
    if (b.parent_email && !out.parent_email) errors.push('parent_email');
    if (b.parent_phone && !out.parent_phone) errors.push('parent_phone');
    if (!out.parent_email && !out.parent_phone && !errors.includes('parent_email') && !errors.includes('parent_phone')) errors.push('parent_contact');
    if (!out.parent_consent) errors.push('parent_consent');
  }
  return errors.length ? { ok: false, code: 'invalid', errors } : { ok: true, data: out };
}

// Built only from validated values and fixed words. The date is the server's.
function noteFor(d, now) {
  const lines = [
    '[Build With AI ' + now.toISOString().slice(0, 10) + '] Wants to join the Visionarium AI Engineering Solutions team.',
    'Age stated: ' + d.age + (d.minor ? ' (MINOR)' : '') + '. Contact consent given ' + now.toISOString() + ' (' + CONSENT_VERSION + ', form in ' + d.lang + ').'
  ];
  if (d.minor) {
    lines.push('Parent or guardian: ' + d.parent_name +
      (d.parent_email ? ', ' + d.parent_email : '') + (d.parent_phone ? ', ' + d.parent_phone : '') +
      '. Parental consent ticked on the form ' + now.toISOString() + '. NOT verified: confirm with the parent before any contact.');
  }
  return lines.join('\n');
}

/* ── in-memory limits (per instance; the form is used for one evening) ───── */
const hits = new Map();
function allow(key, max, windowMs, now) {
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const k of hits.keys()) { if (hits.size <= 2500) break; hits.delete(k); }
  return true;
}
function ipKey(req) {
  const ip = String(req.ip || (req.connection && req.connection.remoteAddress) || '');
  return crypto.createHash('sha256').update((process.env.SESSION_SALT || 'd2ai-default-salt') + ip).digest('hex').slice(0, 16);
}

/**
 * @param {{query: Function}} db  anything with sequelize's query(sql, {replacements}).
 *                                Injected so the test suite can run with no database.
 */
function createRouter(db) {
  const router = express.Router();
  const sql = () => db || require('../config/database');

  router.get('/health', (req, res) => {
    res.json({ service: 'conference-signup', status: 'ok', client_id: CLIENT_ID, min_age: MIN_AGE, consent_version: CONSENT_VERSION });
  });

  router.post('/signup', express.json({ limit: '8kb' }), async (req, res) => {
    const now = Date.now();
    try {
      // The app's global JSON parser runs first with a huge limit, so the 8kb above never
      // applies there. This is the cap that actually holds.
      if (JSON.stringify(req.body || {}).length > 4000) return res.status(413).json({ success: false, code: 'invalid', fields: [] });
      // Honeypot: a real page never fills it. Answer as if it worked, store nothing.
      if (req.body && typeof req.body.website === 'string' && req.body.website.trim()) return res.json({ success: true });

      if (!allow('ip:' + ipKey(req), PER_IP, 10 * 60 * 1000, now) || !allow('all', PER_HOUR_ALL, 60 * 60 * 1000, now)) {
        return res.status(429).json({ success: false, code: 'rate_limited' });
      }
      const v = validate(req.body);
      if (!v.ok) return res.status(v.code === 'too_young' ? 403 : 400).json({ success: false, code: v.code, fields: v.errors });
      const d = v.data;
      const note = noteFor(d, new Date(now));
      const tags = d.minor ? TAGS.concat('minor') : TAGS;
      const last10 = d.phone.replace(/\D/g, '').slice(-10);

      const [rows] = await sql().query(
        `SELECT id, client_id, lower(email) AS email FROM contacts
          WHERE lower(email) = :email OR right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = :last10`,
        { logging: false, replacements: { email: d.email, last10 } });

      if (rows.some((r) => Number(r.client_id) !== CLIENT_ID)) {
        // Belongs to another client. Do not touch it and do not say so.
        console.warn('[conference-signup] refused: email or phone is held by another client');
        return res.status(409).json({ success: false, code: 'not_saved' });
      }
      if (rows.length) {
        const row = rows.find((r) => r.email === d.email) || rows[0];
        await sql().query(
          `UPDATE contacts
              SET notes = CASE WHEN notes IS NULL OR notes = '' THEN :note ELSE left(notes, 6000) || E'\\n\\n' || :note END,
                  tags = (SELECT COALESCE(jsonb_agg(DISTINCT t), '[]'::jsonb)
                            FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb) || CAST(:tags AS jsonb)) AS t),
                  updated_at = NOW()
            WHERE id = :id AND client_id = :client`,
          { logging: false, replacements: { note, tags: JSON.stringify(tags), id: row.id, client: CLIENT_ID } });
        return res.json({ success: true });
      }
      await sql().query(
        `INSERT INTO contacts (client_id, first_name, last_name, phone, email, notes, status, source, lead_source, tags, lifecycle_stage, created_at, updated_at)
         VALUES (:client, :first, :last, :phone, :email, :note, 'active', :source, :lead_source, CAST(:tags AS jsonb), 'lead', NOW(), NOW())`,
        { logging: false, replacements: { client: CLIENT_ID, first: d.first_name, last: d.last_name, phone: d.phone, email: d.email, note,
                          source: SOURCE, lead_source: LEAD_SOURCE, tags: JSON.stringify(tags) } });
      res.json({ success: true });
    } catch (e) {
      // Two people posting the same email at once: the unique index refuses the second.
      if (e && (e.name === 'SequelizeUniqueConstraintError' || (e.original && e.original.code === '23505'))) {
        return res.status(409).json({ success: false, code: 'not_saved' });
      }
      console.error('[conference-signup] error:', e && e.message);
      res.status(500).json({ success: false, code: 'error' });
    }
  });

  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
module.exports.validate = validate;
module.exports.noteFor = noteFor;
module.exports._resetLimits = () => hits.clear();
