'use strict';

/**
 * Outbound list management. Mounted under the authenticated /api tree, so
 * every handler already has req.tenantId from the session — never from a body.
 *
 * Uploading is deliberately unglamorous: paste or upload CSV text, see a
 * per-row result, then ACTIVATE as a separate act. Approve and activate stay
 * apart, because "I uploaded it" and "start ringing strangers" are different
 * decisions and one click should not be both.
 */
const express = require('express');
const router = express.Router();
const { sequelize, Tenant } = require('../models');
const ob = require('../services/outbound');
const tollFraud = require('../security/tollFraud');

const MAX_UPLOAD = Math.max(1, parseInt(process.env.LITE_OUTBOUND_MAX_KB || '2048', 10) || 2048) * 1024;

/** Is this tenant allowed to see the feature at all? */
router.get('/status', async (req, res) => {
  const t = await Tenant.findByPk(req.tenantId);
  const [[cnt]] = await sequelize.query(
    `SELECT COUNT(*)::int AS lists FROM lite_outbound_lists WHERE tenant_id = :t`,
    { replacements: { t: req.tenantId } }
  );
  res.json({
    enabled: !!(t && t.outbound_enabled),
    workflow_ready: !!(t && t.outbound_workflow_id),
    daily_cap: (t && t.outbound_daily_cap) || 0,
    dialled_today: await ob.dialledToday(req.tenantId),
    lists: (cnt && cnt.lists) || 0,
    calling_hours: `${ob.startHour()}:00–${ob.endHour()}:00 in each contact's own timezone`,
    consent_bases: ob.CONSENT_BASES,
    // STATED, NOT IMPLIED. Scrubbing needs an FTC SAN the owner does not have.
    national_dnc_scrub: false,
    national_dnc_note: 'Numbers are NOT checked against the National Do Not Call registry. That needs an FTC Subscription Account Number. Only your own do-not-call list is applied.',
  });
});

/**
 * PREVIEW FIRST. Nothing is stored: the tenant sees exactly which rows would
 * be accepted and which refused, with the reason, before anything exists.
 */
router.post('/preview', express.text({ limit: MAX_UPLOAD, type: '*/*' }), async (req, res) => {
  const t = await Tenant.findByPk(req.tenantId);
  const buf = Buffer.from(req.body || '', 'utf8');
  if (!buf.length) return res.status(400).json({ error: 'empty' });
  const r = ob.parseList(buf, { defaultCountry: (t && t.country) || 'US' });
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, would_accept: r.accepted.length, would_refuse: r.refused.length,
    truncated: r.truncated, header_detected: r.header_detected,
    sample: r.accepted.slice(0, 10), refused: r.refused.slice(0, 50) });
});

/** Store the accepted rows as a DRAFT list. A draft never dials. */
router.post('/lists', express.text({ limit: MAX_UPLOAD, type: '*/*' }), async (req, res) => {
  const t = await Tenant.findByPk(req.tenantId);
  const name = String(req.query.name || 'Uploaded list').trim().slice(0, 160);
  const basis = ob.CONSENT_BASES.includes(String(req.query.consent)) ? String(req.query.consent) : 'unstated';
  const note = String(req.query.note || '').slice(0, 500);
  const buf = Buffer.from(req.body || '', 'utf8');
  if (!buf.length) return res.status(400).json({ error: 'empty' });

  const r = ob.parseList(buf, { defaultCountry: (t && t.country) || 'US' });
  if (!r.ok) return res.status(400).json(r);

  const [ins] = await sequelize.query(
    `INSERT INTO lite_outbound_lists (tenant_id, name, consent_basis, consent_note, rows_total, rows_accepted, rows_refused)
       VALUES (:t, :n, :cb, :cn, :tot, :acc, :ref) RETURNING id`,
    { replacements: { t: req.tenantId, n: name, cb: basis, cn: note || null,
      tot: r.total_rows, acc: r.accepted.length, ref: r.refused.length } }
  );
  const listId = ins[0].id;

  let stored = 0, duplicates = 0;
  for (const c of r.accepted) {
    try {
      // A number already on this tenant's books is left alone — re-uploading
      // the same sheet must not reset somebody's status or double-dial them.
      const [out] = await sequelize.query(
        `INSERT INTO lite_outbound_contacts (tenant_id, list_id, company, contact_name, phone, email, timezone)
           VALUES (:t, :l, :co, :cn, :p, :e, :tz)
         ON CONFLICT (tenant_id, phone) DO NOTHING RETURNING id`,
        { replacements: { t: req.tenantId, l: listId, co: c.company, cn: c.contact_name,
          p: c.phone, e: c.email, tz: c.timezone } }
      );
      if (out && out.length) stored++; else duplicates++;
    } catch (e) { duplicates++; }
  }
  res.status(201).json({ ok: true, list_id: listId, stored, duplicates,
    refused: r.refused.length, status: 'draft',
    next: 'Review it, then activate. A draft never dials.' });
});

router.get('/lists', async (req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, name, consent_basis, status, rows_accepted, rows_refused, created_at, activated_at
       FROM lite_outbound_lists WHERE tenant_id = :t ORDER BY id DESC LIMIT 100`,
    { replacements: { t: req.tenantId } }
  );
  res.json({ lists: rows });
});

router.get('/lists/:id/contacts', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const [rows] = await sequelize.query(
    `SELECT id, company, contact_name, phone, email, timezone, status, attempts, last_outcome
       FROM lite_outbound_contacts WHERE tenant_id = :t AND list_id = :l ORDER BY id LIMIT 500`,
    { replacements: { t: req.tenantId, l: id } }
  );
  // The owner's own list, so numbers are shown in full — they uploaded them.
  res.json({ contacts: rows });
});

/** ACTIVATION IS ITS OWN ACT, and it still cannot dial without the gates. */
router.post('/lists/:id/activate', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const t = await Tenant.findByPk(req.tenantId);
  if (!t || !t.outbound_enabled) {
    return res.status(403).json({ error: 'outbound_not_enabled',
      message: 'Outbound calling is not switched on for this account yet.' });
  }
  await sequelize.query(
    `UPDATE lite_outbound_lists SET status = 'active', activated_at = NOW()
       WHERE id = :i AND tenant_id = :t`,
    { replacements: { i: id, t: req.tenantId } }
  );
  res.json({ ok: true, status: 'active' });
});

/** The do-not-call list. The one thing a called party can demand. */
router.get('/suppressions', async (req, res) => {
  const [rows] = await sequelize.query(
    `SELECT phone, reason, source, created_at FROM lite_outbound_suppressions
       WHERE tenant_id = :t ORDER BY id DESC LIMIT 500`,
    { replacements: { t: req.tenantId } }
  );
  res.json({ suppressions: rows });
});

router.post('/suppressions', express.json({ limit: '8kb' }), async (req, res) => {
  const r = await ob.suppress(req.tenantId, (req.body || {}).phone, 'do_not_call', 'owner');
  res.status(r.ok ? 201 : 400).json(r);
});

/** Dial one contact now. Every gate in mayDial runs first. */
router.post('/contacts/:id/dial', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const t = await Tenant.findByPk(req.tenantId);
  const [rows] = await sequelize.query(
    `SELECT * FROM lite_outbound_contacts WHERE id = :i AND tenant_id = :t`,
    { replacements: { i: id, t: req.tenantId } }
  );
  const contact = rows && rows[0];
  if (!contact) return res.status(404).json({ error: 'not_found' });
  try {
    const r = await ob.dial(t, contact);
    return res.status(r.ok ? 200 : 409).json(r);
  } catch (e) {
    console.error('[lite:outbound] dial failed:', e.message);
    return res.status(502).json({ ok: false, reason: 'dial_failed',
      detail: String(e.message || e).slice(0, 200) });
  }
});

module.exports = router;
