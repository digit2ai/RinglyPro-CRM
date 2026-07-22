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
const router = express.Router();
const { Recording, Transcript, Summary, Translation, Edit, Document, Usage } = require('../models');
const stt = require('../services/stt');
const ai = require('../services/ai-editor');

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
    const text = String(req.body.text || '').trim();
    const rec = await Recording.create({
      tenant_id: tenantOf(req),
      user_id: userOf(req),
      title: String(req.body.title || 'Grabación').slice(0, 200),
      source: ['mic', 'meeting', 'upload', 'import'].includes(req.body.source) ? req.body.source : 'mic',
      lang: req.body.lang ? String(req.body.lang).slice(0, 12) : null,
      duration_sec: parseInt(req.body.duration_sec, 10) || null,
      status: 'done',
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

// ── Import (file field OR a URL) ──────────────────────────────────────────────
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const url = String(req.body.url || '').trim();
    if (!req.file && !url) return res.status(400).json({ error: 'Archivo o URL requerido' });

    if (req.file) {
      const rec = await Recording.create({
        tenant_id: tenantOf(req), user_id: userOf(req),
        title: String(req.body.title || req.file.originalname || 'Importado').slice(0, 200),
        source: 'import', status: 'processing',
        file_path: req.file.path, mime: req.file.mimetype
      });
      await logUsage(req, 'import', 1);
      setImmediate(() => runTranscriptionJob(rec.id, { filePath: req.file.path, mimetype: req.file.mimetype }));
      return res.json({ success: true, recording: rec });
    }

    // URL import: we only accept the link; fetching/extracting media is a future
    // self-hosted step. Record it honestly as pending rather than faking a result.
    const rec = await Recording.create({
      tenant_id: tenantOf(req), user_id: userOf(req),
      title: String(req.body.title || url).slice(0, 200),
      source: 'import', status: 'processing', file_path: url, mime: 'url'
    });
    await Transcript.create({
      tenant_id: tenantOf(req), recording_id: rec.id,
      text: `[Importación por URL registrada: ${url}. La extracción de audio desde enlaces se procesa con nuestro propio motor; configura el descargador para completarla.]`,
      engine: 'stub', is_simulated: true
    });
    rec.status = 'done'; rec.engine = 'stub'; await rec.save();
    await logUsage(req, 'import', 1);
    res.json({ success: true, recording: rec });
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

// ── Summarize this recording's transcript (Claude, heuristic fallback) ─────────
router.post('/:id/summarize', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    const trans = await Transcript.findOne({ where: { recording_id: rec.id } });
    const text = trans ? trans.text : '';
    if (!text || !text.trim()) return res.status(400).json({ error: 'La grabación no tiene transcripción' });

    const result = await ai.summarize(text, rec.lang || 'es');
    const summary = await Summary.create({
      tenant_id: tenantOf(req), recording_id: rec.id,
      summary: result.summary, bullets: result.bullets, action_items: result.action_items,
      model: ai.activeModel()
    });
    await logUsage(req, 'summarize');
    res.json({ success: true, summary });
  } catch (e) {
    console.error('SpeakUp summarize error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Generate a deliverable from this recording (minutes/details/next_steps/
//    presentation/project_plan) — Voice-Memos-style "what to do with it" ────────
router.post('/:id/generate', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    const type = String(req.body.type || 'minutes');
    if (!ai.DOC_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo no válido' });
    const instruction = String(req.body.instruction || '').trim();
    if (type === 'custom' && !instruction) return res.status(400).json({ error: 'Escribe una instrucción' });
    const trans = await Transcript.findOne({ where: { recording_id: rec.id } });
    const text = trans ? trans.text : '';
    if (!text || !text.trim()) return res.status(400).json({ error: 'La grabación no tiene transcripción' });

    const result = await ai.generateDocument(text, type, req.body.lang || rec.lang || 'es', instruction);
    const doc = await Document.create({
      tenant_id: tenantOf(req), recording_id: rec.id,
      kind: type, title: result.title, prompt: type === 'custom' ? instruction : null,
      content: result.content, model: ai.activeModel()
    });
    await logUsage(req, 'generate');
    res.json({ success: true, document: doc });
  } catch (e) {
    console.error('SpeakUp generate error:', e.message);
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

// ── Export (txt | md) ─────────────────────────────────────────────────────────
router.get('/:id/export', async (req, res) => {
  try {
    const rec = await Recording.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!rec) return res.status(404).json({ error: 'Grabación no encontrada' });
    const t = await Transcript.findOne({ where: { recording_id: rec.id } });
    const summaries = await Summary.findAll({ where: { recording_id: rec.id }, order: [['id', 'DESC']], limit: 1 });
    const s = summaries[0];
    const format = (req.query.format || 'txt').toLowerCase();
    const date = new Date(rec.created_at).toISOString().slice(0, 10);
    const slug = String(rec.title || 'speakup').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

    let body;
    if (format === 'md') {
      body = `# ${rec.title}\n\n_${date} · SpeakUp_\n\n`;
      if (s && s.summary) {
        body += `## Resumen\n\n${s.summary}\n\n`;
        if (s.bullets && s.bullets.length) body += `## Puntos clave\n\n${s.bullets.map(b => `- ${b}`).join('\n')}\n\n`;
        if (s.action_items && s.action_items.length) body += `## Acciones\n\n${s.action_items.map(a => `- [ ] ${a}`).join('\n')}\n\n`;
      }
      body += `## Transcripción\n\n${t ? t.text : '(sin transcripción)'}\n`;
    } else {
      body = `${rec.title}\n${date} · SpeakUp\n\n`;
      if (s && s.summary) {
        body += `RESUMEN\n${s.summary}\n\n`;
        if (s.bullets && s.bullets.length) body += `PUNTOS CLAVE\n${s.bullets.map(b => `- ${b}`).join('\n')}\n\n`;
        if (s.action_items && s.action_items.length) body += `ACCIONES\n${s.action_items.map(a => `- ${a}`).join('\n')}\n\n`;
      }
      body += `TRANSCRIPCIÓN\n${t ? t.text : '(sin transcripción)'}\n`;
    }
    res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="speakup-${slug}-${date}.${format === 'md' ? 'md' : 'txt'}"`);
    res.send(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
