'use strict';

// =============================================================
// VIDEO POSTING CREATOR — describe the ad, review it, then spend.
//
// Auth is REUSED from the subscribers console, exactly as social-admin does,
// rather than minting a fourth JOBUP_*_ADMIN_PASSWORD.
//
// THE APPROVAL GATE IS THE PRODUCT. Composing a spec is free and reversible;
// rendering is 2-4 minutes and real money. So `/render` refuses anything that
// is not `approved`, and approval is its own endpoint a human calls after
// reading the spec and the price. There is deliberately no compose-and-render
// shortcut, however convenient it would be.
// =============================================================

const express = require('express');
const fs = require('fs');
const { models, scoped, plain } = require('../models');
const { requireAdmin } = require('./subscribers-admin');
const briefSvc = require('../services/video-brief');
const renderSvc = require('../services/video-render');

const router = express.Router();
const TENANT = renderSvc.PLATFORM_TENANT;

async function audit(actor, action, reason) {
  try {
    await models.audit_log.create({
      tenant_id: null, actor: String(actor).slice(0, 200),
      action: String(action).slice(0, 200), reason: reason ? String(reason).slice(0, 1000) : null,
    });
  } catch (e) { console.warn('[video-admin] audit write failed:', e.message); }
}

/**
 * Route params are strings; the store compares ids strictly, so an unparsed
 * ':id' silently matches nothing and every lookup 404s.
 */
function idOf(req) {
  const n = parseInt(req.params.id, 10);
  return Number.isInteger(n) ? n : null;
}

const briefView = (b) => ({
  id: b.id, title: b.title, brief: b.brief, lang: b.lang,
  spec: b.spec,
  // The one box: the whole spec as an editable script.
  script: briefSvc.toText(b.spec),
  unverified: b.unverified || [],
  composed_by: b.composed_by, is_simulated: !!b.is_simulated,
  estimate: b.estimate, status: b.status, status_reason: b.status_reason,
  progress: renderSvc.progress(b.id) || b.progress || null,
  approved_at: b.approved_at, approved_by: b.approved_by,
  created_at: b.created_at, updated_at: b.updated_at,
});

const videoView = (v) => ({
  id: v.id, brief_id: v.brief_id, title: v.title, filename: v.filename,
  seconds: v.seconds, width: v.width, height: v.height, bytes: v.bytes,
  caption: v.caption, ledger: v.ledger, created_at: v.created_at,
  url: `/video-admin/api/videos/${v.id}/file`,
  exists: !!(v.path && fs.existsSync(v.path)),
});

// ---- capability ------------------------------------------------------------

router.get('/api/health', requireAdmin, (req, res) => {
  res.json({ ok: true, readiness: renderSvc.readiness(), composer: briefSvc.FACTS.length });
});

/**
 * Runs every ffmpeg stage the assembler uses on synthetic inputs. Free, and
 * the only honest way to find a host problem without paying for a render to
 * discover it at the last step.
 */
router.get('/api/selftest', requireAdmin, async (req, res) => {
  try {
    res.json(await renderSvc.selfTest());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- compose ---------------------------------------------------------------

/** Natural language in, an editable spec out. Persists nothing but the draft. */
router.post('/api/briefs', requireAdmin, async (req, res) => {
  const text = String((req.body && req.body.brief) || '').trim();
  const lang = String((req.body && req.body.lang) || 'en').slice(0, 5);
  if (!text) return res.status(400).json({ error: 'describe the video you want' });

  try {
    const out = await briefSvc.compose(text, { lang });
    const row = await models.video_briefs.create({
      tenant_id: TENANT,
      title: out.spec.title, brief: text, lang,
      spec: out.spec, unverified: out.unverified,
      composed_by: out.composed_by, is_simulated: out.is_simulated,
      estimate: renderSvc.estimate(out.spec),
      status: 'draft',
    });
    await audit(req.admin.email, 'video.brief.compose', out.spec.title);
    res.json({ brief: briefView(plain(row)), rewrites: out.rewrites || [], note: out.note || null });
  } catch (e) {
    console.error('[video-admin] compose failed:', e.message);
    res.status(e.code === 'empty_brief' ? 400 : 500).json({ error: e.message });
  }
});

router.get('/api/briefs', requireAdmin, async (req, res) => {
  const rows = await scoped('video_briefs', TENANT).findAll({ order: [['id', 'DESC']], limit: 100 });
  res.json({ briefs: plain(rows).map(briefView) });
});

router.get('/api/briefs/:id', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('video_briefs', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ brief: briefView(plain(row)) });
});

/** Edit the spec. Any edit re-prices it and drops it back to draft. */
router.patch('/api/briefs/:id', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('video_briefs', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });
  if (['rendering'].includes(row.status)) {
    return res.status(409).json({ error: 'cannot edit a brief while it is rendering' });
  }

  const patch = { updated_at: new Date() };
  // One box in: the operator edits the script, not ten form fields.
  if (req.body && typeof req.body.script === 'string') {
    req.body = Object.assign({}, req.body, { spec: briefSvc.fromText(req.body.script) });
  }
  if (req.body && req.body.spec) {
    // Run the operator's edits through the same guard the model's output goes
    // through — a human can type "we apply for you" just as easily.
    const n = briefSvc.normalise(req.body.spec, row.brief);
    patch.spec = n.spec;
    patch.unverified = n.unverified;
    patch.estimate = renderSvc.estimate(n.spec);
    patch.title = n.spec.title;
    // An edited spec is no longer the one that was signed off on.
    patch.status = 'draft';
    patch.approved_at = null;
    patch.approved_by = null;
    var rewrites = n.rewrites;
  }
  if (req.body && typeof req.body.title === 'string') patch.title = req.body.title.slice(0, 120);

  await scoped('video_briefs', TENANT).update(patch, { id: row.id });
  const fresh = await scoped('video_briefs', TENANT).findOne({ id: row.id });
  res.json({ brief: briefView(plain(fresh)), rewrites: rewrites || [] });
});

/** Unstick a brief whose render died with the process that owned it. */
router.post('/api/briefs/:id/reset', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('video_briefs', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });
  await scoped('video_briefs', TENANT).update({
    status: row.approved_at ? 'approved' : 'draft',
    status_reason: null, progress: null, updated_at: new Date(),
  }, { id });
  const fresh = await scoped('video_briefs', TENANT).findOne({ id });
  res.json({ brief: briefView(plain(fresh)) });
});

router.delete('/api/briefs/:id', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('video_briefs', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });
  // A live job is protected; a stale one must not be undeletable forever.
  if (row.status === 'rendering' && renderSvc.progress(row.id)) {
    return res.status(409).json({ error: 'it is rendering' });
  }
  await scoped('video_briefs', TENANT).destroy({ id: row.id });
  await audit(req.admin.email, 'video.brief.delete', String(row.id));
  res.json({ deleted: true });
});

// ---- sign off, then and only then render -----------------------------------

router.post('/api/briefs/:id/approve', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('video_briefs', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.status === 'rendering') return res.status(409).json({ error: 'already rendering' });

  const est = renderSvc.estimate(row.spec);
  if (!est.available) return res.status(400).json({ error: est.reason });
  if (est.over_ceiling) {
    return res.status(400).json({ error: `estimated $${est.cost.total} is over the $${est.max_cost_usd} ceiling` });
  }
  // A generated beat with no pose animates a setting instead of a body — the
  // clip is bought and then unusable. This was a warning and got approved
  // through twice, both times on a spec whose "spoken lines" were actually
  // someone's instructions. It refuses now; `force` is the deliberate override.
  if (est.beats_missing_pose && est.beats_missing_pose.length && !(req.body && req.body.force)) {
    return res.status(400).json({
      error: `${est.beats_missing_pose.length} beat(s) have no pose (beat `
        + `${est.beats_missing_pose.map((i) => i + 1).join(', ')}). Those clips would animate a `
        + `setting instead of a body and be wasted. Write the poses, or re-compose the brief.`,
      beats_missing_pose: est.beats_missing_pose,
      can_force: true,
    });
  }
  await scoped('video_briefs', TENANT).update({
    status: 'approved', estimate: est, approved_at: new Date(), approved_by: req.admin.email,
    status_reason: null, updated_at: new Date(),
  }, { id: row.id });
  await audit(req.admin.email, 'video.brief.approve', `$${est.cost.total} · ${est.generated_clips} clips`);
  const fresh = await scoped('video_briefs', TENANT).findOne({ id: row.id });
  res.json({ brief: briefView(plain(fresh)) });
});

router.post('/api/briefs/:id/render', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('video_briefs', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });

  const started = renderSvc.start(models, plain(row));
  if (!started.started) return res.status(400).json({ error: started.reason });
  await audit(req.admin.email, 'video.render.start', `brief ${row.id}`);
  // Returns immediately; the console polls GET /api/briefs/:id for progress.
  res.json({ started: true, estimate: started.estimate });
});

// ---- the library -----------------------------------------------------------

router.get('/api/videos', requireAdmin, async (req, res) => {
  const rows = await scoped('videos', TENANT).findAll({ order: [['id', 'DESC']], limit: 200 });
  res.json({ videos: plain(rows).map(videoView) });
});

router.get('/api/videos/:id/file', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('videos', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });
  if (!row.path || !fs.existsSync(row.path)) {
    // Render's disk is ephemeral; say so rather than serving a 0-byte file.
    return res.status(410).json({ error: 'the file is no longer on disk (re-render, or mount a persistent disk)' });
  }
  res.type('video/mp4');
  res.setHeader('Content-Disposition', `inline; filename="${row.filename}"`);
  fs.createReadStream(row.path).pipe(res);
});

router.delete('/api/videos/:id', requireAdmin, async (req, res) => {
  const id = idOf(req);
  if (id === null) return res.status(400).json({ error: 'bad id' });
  const row = await scoped('videos', TENANT).findOne({ id });
  if (!row) return res.status(404).json({ error: 'not found' });
  try { if (row.path && fs.existsSync(row.path)) fs.unlinkSync(row.path); } catch (_) {}
  await scoped('videos', TENANT).destroy({ id: row.id });
  await audit(req.admin.email, 'video.delete', String(row.id));
  res.json({ deleted: true });
});

module.exports = router;
