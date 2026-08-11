'use strict';

// =============================================================
// SOCIAL POSTER CONSOLE — destinations, copy library, and runs.
//
// Auth is REUSED from the subscribers console (same credential, same
// jobup_subs_admin cookie) rather than minting a third near-identical
// JOBUP_*_ADMIN_PASSWORD. Two similar variable names already caused one console
// to sit open in production because the obvious one got set and the other did
// not; a third would be inviting it again.
//
// ACCESS TOKENS GO IN AND NEVER COME BACK OUT. A token is accepted on write,
// encrypted immediately, and every read returns {set, hint} — the same contract
// the Growth vertical uses for its channel secrets.
// =============================================================

const express = require('express');
const { models, scoped } = require('../models');
const { requireAdmin } = require('./subscribers-admin');
const poster = require('../services/social-poster');
const rules = require('../services/social-rules');
const connectors = require('../services/social-connectors');
const cryptoSvc = require('../services/crypto');

const router = express.Router();
const TENANT = poster.PLATFORM_TENANT;

async function audit(actor, action, reason) {
  try {
    await models.audit_log.create({
      tenant_id: null, actor: String(actor).slice(0, 200),
      action: String(action).slice(0, 200), reason: reason ? String(reason).slice(0, 1000) : null,
    });
  } catch (e) { console.warn('[social-admin] audit write failed:', e.message); }
}

/** The projection an operator may see. Never the token. */
function publicAccount(a) {
  const r = rules.forPlatform(a.platform);
  return {
    id: a.id,
    name: a.name,
    platform: a.platform,
    platform_label: r.label,
    supported: r.supported,
    unsupported_reason: r.supported ? null : r.unsupported_reason,
    account_or_page_id: a.account_or_page_id || null,
    token: cryptoSvc.hint(a.access_token_enc),
    token_expires_at: a.token_expires_at || null,
    enabled: a.enabled !== false,
    notes: a.notes || null,
  };
}

// ---- platform capability map (what the console renders) -------------------
router.get('/api/platforms', requireAdmin, (req, res) => {
  res.json({
    platforms: Object.entries(rules.PLATFORMS).map(([key, v]) => ({
      key, label: v.label, supported: v.supported,
      unsupported_reason: v.supported ? null : v.unsupported_reason,
      caption_max: v.caption_max, formats: v.formats,
      max_bytes: v.max_bytes, aspect_min: v.aspect_min, aspect_max: v.aspect_max,
    })),
    graph_version: connectors.GRAPH_VERSION,
  });
});

// ---- destinations ---------------------------------------------------------
router.get('/api/accounts', requireAdmin, async (req, res) => {
  try {
    const rows = await scoped('social_accounts', TENANT).findAll({});
    res.json({ accounts: rows.map(publicAccount) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/accounts', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const platform = String(b.platform || '').trim();
    if (!name) return res.status(400).json({ error: 'a destination name is required' });
    if (!rules.PLATFORMS[platform]) {
      return res.status(400).json({ error: `unknown platform "${platform}"`,
        allowed: Object.keys(rules.PLATFORMS) });
    }
    const row = await scoped('social_accounts', TENANT).create({
      name, platform,
      account_or_page_id: b.account_or_page_id ? String(b.account_or_page_id).trim() : null,
      access_token_enc: b.access_token ? cryptoSvc.encrypt(String(b.access_token)) : null,
      token_expires_at: b.token_expires_at ? new Date(b.token_expires_at) : null,
      notes: b.notes ? String(b.notes).slice(0, 1000) : null,
      enabled: b.enabled !== false,
    });
    await audit(req.admin.email, 'social.account.created', `${name} (${platform})`);
    res.status(201).json({ account: publicAccount(row) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/api/accounts/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const existing = await scoped('social_accounts', TENANT).findOne({ id });
    if (!existing) return res.status(404).json({ error: 'no such destination' });

    const b = req.body || {};
    const patch = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.account_or_page_id !== undefined) patch.account_or_page_id = String(b.account_or_page_id).trim() || null;
    if (b.notes !== undefined) patch.notes = String(b.notes).slice(0, 1000);
    if (b.enabled !== undefined) patch.enabled = Boolean(b.enabled);
    if (b.token_expires_at !== undefined) {
      patch.token_expires_at = b.token_expires_at ? new Date(b.token_expires_at) : null;
    }
    // An EMPTY token field means "leave it alone", never "erase it" — otherwise
    // saving a name change would silently disconnect the destination.
    if (b.access_token) patch.access_token_enc = cryptoSvc.encrypt(String(b.access_token));

    await scoped('social_accounts', TENANT).update(patch, { id });
    const row = await scoped('social_accounts', TENANT).findOne({ id });
    await audit(req.admin.email, 'social.account.updated', `#${id} ${row.name}`);
    res.json({ account: publicAccount(row) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/accounts/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await scoped('social_accounts', TENANT).findOne({ id });
    if (!row) return res.status(404).json({ error: 'no such destination' });
    await scoped('social_accounts', TENANT).destroy({ id });
    await audit(req.admin.email, 'social.account.deleted', `#${id} ${row.name}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Check a stored credential against the platform without posting anything. */
router.post('/api/accounts/:id/verify', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await scoped('social_accounts', TENANT).findOne({ id });
    if (!row) return res.status(404).json({ error: 'no such destination' });
    const r = rules.forPlatform(row.platform);
    if (!r.supported) return res.json({ ok: false, error: r.unsupported_reason });
    const cred = poster.credentialState(row);
    if (!cred.ok) return res.json({ ok: false, error: cred.reason });
    const out = await connectors.verifyCredential({
      platform: row.platform, accountId: row.account_or_page_id, token: cred.token });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- marketing copy library ----------------------------------------------
router.get('/api/copy', requireAdmin, async (req, res) => {
  const rows = await scoped('social_copy', TENANT).findAll({});
  res.json({ copy: rows.map((c) => ({ id: c.id, label: c.label, body: c.body, lang: c.lang })) });
});

router.post('/api/copy', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!String(b.body || '').trim()) return res.status(400).json({ error: 'copy body is required' });
  const row = await scoped('social_copy', TENANT).create({
    label: String(b.label || 'Untitled').slice(0, 200),
    body: String(b.body), lang: b.lang === 'es' ? 'es' : 'en',
  });
  res.status(201).json({ copy: { id: row.id, label: row.label, body: row.body, lang: row.lang } });
});

router.delete('/api/copy/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await scoped('social_copy', TENANT).destroy({ id });
  res.json({ ok: true });
});

// ---- the run --------------------------------------------------------------
router.post('/api/post', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!Array.isArray(b.destination_ids) || !b.destination_ids.length) {
      return res.status(400).json({
        error: 'destination_ids is required',
        note: 'The agent only ever touches the destinations named in the request.',
      });
    }
    const out = await poster.run({
      tenant_id: TENANT,
      campaign_id: b.campaign_id,
      image: b.image || { url: b.image_url },
      caption: b.caption,
      copy_id: b.copy_id,
      destination_ids: b.destination_ids,
      dry_run: Boolean(b.dry_run),
    });
    await audit(req.admin.email, b.dry_run ? 'social.run.dry' : 'social.run.posted',
      `${out.campaign_id}: ${out.summary.posted} posted, ${out.summary.failed} failed, ${out.summary.skipped} skipped`);
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/runs', requireAdmin, async (req, res) => {
  const rows = await scoped('social_campaigns', TENANT).findAll({});
  const recent = rows
    .slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 50);
  res.json({
    runs: recent.map((c) => ({
      campaign_id: c.campaign_id, image_reference: c.image_reference,
      dry_run: Boolean(c.dry_run), run_timestamp: c.run_timestamp,
      summary: (c.result && c.result.summary) || null,
    })),
  });
});

router.get('/api/runs/:campaignId', requireAdmin, async (req, res) => {
  const row = await scoped('social_campaigns', TENANT).findOne({ campaign_id: String(req.params.campaignId) });
  if (!row) return res.status(404).json({ error: 'no such run' });
  res.json(row.result);
});

router.get('/api/health', (req, res) => {
  res.json({
    ok: true, module: 'social-poster',
    graph_version: connectors.GRAPH_VERSION,
    platforms_supported: Object.entries(rules.PLATFORMS)
      .filter(([, v]) => v.supported).map(([k]) => k),
    platforms_unsupported: Object.entries(rules.PLATFORMS)
      .filter(([, v]) => !v.supported).map(([k]) => k),
  });
});

module.exports = router;
