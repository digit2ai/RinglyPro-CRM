'use strict';

/**
 * SpeakUp — recordings API (multi-tenant; scoped by req.user.tenant_id).
 *
 *  POST   /                       create a recording (live mic/webspeech: text included)
 *  POST   /upload                 upload an audio/video file -> async transcription
 *  POST   /import                 import a file or a URL      -> async transcription
 *  GET    /                       library (tenant-scoped)
 *  GET    /:id                    recording + transcript + summaries/translations/edits
 *  POST   /:id/transcribe         (re)enqueue transcription of the stored file
 *  GET    /:id/status             poll job status
 *  DELETE /:id                    one-tap delete (row + file)
 *  GET    /:id/export?format=txt|md   download transcript + summary
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// THE SAME CLEANER THE PHONE RUNS. Loaded from public/ so the browser and the server share
// one implementation. It runs again here because the phone is not the only writer and not
// always a current one: an installed app can keep serving a cached recorder for days, and
// the self-hosted server engine is Whisper too and loops the same way. Every summary and
// extraction reads the stored text, so the loop is removed before it is stored.
const { collapseRepeats } = require('../../public/transcript-clean');
const router = express.Router();
const { Recording, Transcript, Summary, Translation, Edit, Document, Usage } = require('../models');
const stt = require('../services/stt');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* ignore */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || 'audio').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } }); // 300MB

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function userOf(req) { return (req.user && req.user.id) || null; }

async function logUsage(req, kind, units) {
  try { await Usage.create({ tenant_id: tenantOf(req), user_id: userOf(req), kind, units: units || 1 }); }
  catch (e) { /* non-fatal */ }
}

// ── Async transcription job (runs OUT of the request cycle: Cloudflare ~100s) ──
async function runTranscriptionJob(recordingId, meta) {
  try {
    const result = await stt.transcribe(meta);
    // Only a real decode is cleaned; the stub's labelled placeholder is left exactly as it is.
    if (result && !result.is_simulated && result.text) result.text = collapseRepeats(result.text).text;
    const rec = await Recording.findByPk(recordingId);
    if (!rec) return;
    const existing = await Transcript.findOne({ where: { recording_id: recordingId } });
    if (existing) {
      existing.text = result.text;
      existing.segments = result.segments;
      existing.lang_detected = result.lang_detected;
      existing.engine = result.engine;
      existing.is_simulated = result.is_simulated;
      await existing.save();
    } else {
      await Transcript.create({
        tenant_id: rec.tenant_id, recording_id: recordingId,
        text: result.text, segments: result.segments,
        lang_detected: result.lang_detected, engine: result.engine,
        is_simulated: result.is_simulated
      });
    }
    rec.status = 'done';
    rec.engine = result.engine;
    if (!rec.lang && result.lang_detected) rec.lang = result.lang_detected;
    await rec.save();
  } catch (e) {
    console.error('SpeakUp transcription job error:', e.message);
    try {
      const rec = await Recording.findByPk(recordingId);
      if (rec) { rec.status = 'error'; rec.error = e.message.slice(0, 500); await rec.save(); }
    } catch (e2) { /* ignore */ }
  }
}

// ── Create (live mic / Web Speech: transcript text comes from the browser) ────
router.post('/', async (req, res) => {
  try {
    const text = collapseRepeats(String(req.body.text || '').trim()).text;
    const status = ['recording', 'done'].includes(req.body.status) ? req.body.status : 'done';
    const rec = await Recording.create({
      tenant_id: tenantOf(req),
      user_id: userOf(req),
      title: String(req.body.title || 'Grabación').slice(0, 200),
      source: ['mic', 'meeting', 'call', 'upload', 'import'].includes(req.body.source) ? req.body.source : 'mic',
      lang: req.body.lang ? String(req.body.lang).slice(0, 12) : null,
      duration_sec: parseInt(req.body.duration_sec, 10) || null,
      status,
      engine: text ? 'webspeech' : null
    });
    if (text) {
      await Transcript.create({
        tenant_id: tenantOf(req), recording_id: rec.id,
        text: text.slice(0, 200000), segments: req.body.segments || [],
        lang_detected: req.body.lang || null, engine: 'webspeech', is_simulated: false
      });
      await logUsage(req, 'transcribe', (rec.duration_sec || 0) / 60);
    }
    res.json({ success: true, recording: rec });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Upload an audio/video file → transcribe with our own engine (async) ───────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const src = ['upload', 'meeting', 'call'].includes(req.body.source) ? req.body.source : 'upload';
    const rec = await Recording.create({
      tenant_id: tenantOf(req),
      user_id: userOf(req),
      title: String(req.body.title || req.file.originalname || 'Archivo').slice(0, 200),
      source: src,
      lang: req.body.lang ? String(req.body.lang).slice(0, 12) : null,
      status: 'processing',
      file_path: req.file.path,
      mime: req.file.mimetype
    });
    await logUsage(req, 'import', 1);
    // Kick the job WITHOUT awaiting — client polls /:id/status.
    setImmediate(() => runTranscriptionJob(rec.id, {
      filePath: req.file.path, mimetype: req.file.mimetype, lang: rec.lang
    }));
    res.json({ success: true, recording: rec, message: 'Transcripción en proceso' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Library ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const recs = await Recording.findAll({
      where: { tenant_id: tenantOf(req) },
      order: [['created_at', 'DESC']],
      limit: 300
    });
    const ids = recs.map(r => r.id);
    const transcripts = ids.length ? await Transcript.findAll({ where: { recording_id: ids } }) : [];
    const byRec = {};
    for (const t of transcripts) byRec[t.recording_id] = t;
    res.json({
      success: true,
      recordings: recs.map(r => {
        const t = byRec[r.id];
        const text = t ? t.text : '';
        return {
          ...r.toJSON(),
          has_transcript: !!(text && text.trim()),
          is_simulated: t ? t.is_simulated : false,
          preview: text ? text.slice(0, 160) : ''
        };
      })
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Detail ────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    const transcript = await Transcript.findOne({ where: { recording_id: rec.id } });
    const summaries = await Summary.findAll({ where: { recording_id: rec.id }, order: [['id', 'DESC']] });
    const translations = await Translation.findAll({ where: { recording_id: rec.id }, order: [['id', 'DESC']] });
    const edits = await Edit.findAll({ where: { recording_id: rec.id }, order: [['id', 'DESC']] });
    const documents = await Document.findAll({ where: { recording_id: rec.id }, order: [['id', 'DESC']] });
    res.json({ success: true, recording: rec, transcript, summaries, translations, edits, documents });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── (Re)enqueue transcription of the stored file ──────────────────────────────
router.post('/:id/transcribe', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    if (!rec.file_path) return res.status(400).json({ error: 'No hay archivo asociado para transcribir' });
    rec.status = 'processing'; rec.error = null; await rec.save();
    setImmediate(() => runTranscriptionJob(rec.id, { filePath: rec.file_path, mimetype: rec.mime, lang: rec.lang }));
    res.json({ success: true, recording: rec, message: 'Transcripción en proceso' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Autosave: replace the transcript text (idempotent upsert) ─────────────────
// Called every chunk during a live recording so nothing is lost on a crash.
router.put('/:id/transcript', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    // Cleaned BEFORE the length cap, so a loop cannot spend the cap and truncate real speech
    // that came after it.
    const text = collapseRepeats(String(req.body.text || '')).text.slice(0, 800000);
    let tr = await Transcript.findOne({ where: { recording_id: rec.id } });
    if (tr) {
      tr.text = text;
      tr.engine = req.body.engine || tr.engine || 'whisper';
      if (req.body.lang) tr.lang_detected = req.body.lang;
      tr.is_simulated = false;
      await tr.save();
    } else {
      tr = await Transcript.create({
        tenant_id: rec.tenant_id, recording_id: rec.id, text,
        engine: req.body.engine || 'whisper', lang_detected: req.body.lang || null, is_simulated: false
      });
    }
    if (!rec.lang && req.body.lang) { rec.lang = String(req.body.lang).slice(0, 12); await rec.save(); }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update recording metadata (finalize: status/title/duration) ───────────────
router.patch('/:id', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    if (req.body.status && ['recording', 'processing', 'done', 'error'].includes(req.body.status)) rec.status = req.body.status;
    if (req.body.title) rec.title = String(req.body.title).slice(0, 200);
    if (req.body.duration_sec != null) rec.duration_sec = parseInt(req.body.duration_sec, 10) || rec.duration_sec;
    if (req.body.engine) rec.engine = String(req.body.engine).slice(0, 20);
    await rec.save();
    res.json({ success: true, recording: rec });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Poll status ───────────────────────────────────────────────────────────────
router.get('/:id/status', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    const t = await Transcript.findOne({ where: { recording_id: rec.id } });
    res.json({ success: true, status: rec.status, error: rec.error, has_transcript: !!(t && t.text && t.text.trim()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete (row + file) ───────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    if (rec.file_path && rec.mime !== 'url') { try { fs.unlinkSync(rec.file_path); } catch (e) { /* ignore */ } }
    await Transcript.destroy({ where: { recording_id: rec.id } });
    await Summary.destroy({ where: { recording_id: rec.id } });
    await Translation.destroy({ where: { recording_id: rec.id } });
    await Edit.destroy({ where: { recording_id: rec.id } });
    await Document.destroy({ where: { recording_id: rec.id } });
    await rec.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;
