'use strict';

/**
 * SpeakUp — AI editing API (Claude, with heuristic fallbacks).
 * Mounted at /api/v1. (Summarize lives under /recordings/:id/summarize.)
 *
 *  POST /translate                { text?, recording_id?, target_lang } -> stored
 *  POST /rewrite                  { text?, recording_id?, tone|custom_prompt } -> stored
 */

const express = require('express');
const router = express.Router();
const { Recording, Transcript, Translation, Edit, Usage } = require('../models');
const ai = require('../services/ai-editor');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function userOf(req) { return (req.user && req.user.id) || null; }
async function logUsage(req, kind) {
  try { await Usage.create({ tenant_id: tenantOf(req), user_id: userOf(req), kind, units: 1 }); }
  catch (e) { /* non-fatal */ }
}

async function transcriptTextFor(req, recordingId) {
  const rec = await Recording.findOne({ where: { id: recordingId, tenant_id: tenantOf(req) } });
  if (!rec) return { error: 'Grabación no encontrada' };
  const t = await Transcript.findOne({ where: { recording_id: rec.id } });
  return { rec, text: t ? t.text : '' };
}

// ── Translate (recording transcript OR ad-hoc text) ───────────────────────────
router.post('/translate', async (req, res) => {
  try {
    const target_lang = String(req.body.target_lang || '').trim();
    if (!target_lang) return res.status(400).json({ error: 'target_lang requerido' });

    let text = String(req.body.text || '');
    let recording_id = req.body.recording_id ? parseInt(req.body.recording_id, 10) : null;
    if (!text && recording_id) {
      const r = await transcriptTextFor(req, recording_id);
      if (r.error) return res.status(404).json({ error: r.error });
      text = r.text;
    }
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texto requerido' });

    const result = await ai.translate(text, target_lang);
    const translation = await Translation.create({
      tenant_id: tenantOf(req), recording_id: recording_id || null,
      source_lang: result.source_lang, target_lang,
      text: result.text, model: ai.activeModel()
    });
    await logUsage(req, 'translate');
    res.json({ success: true, translation });
  } catch (e) {
    console.error('SpeakUp translate route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Rewrite / tone adjustment (recording transcript OR ad-hoc text) ───────────
router.post('/rewrite', async (req, res) => {
  try {
    const tone = String(req.body.tone || 'professional');
    const custom_prompt = String(req.body.custom_prompt || '');

    let text = String(req.body.text || '');
    let recording_id = req.body.recording_id ? parseInt(req.body.recording_id, 10) : null;
    if (!text && recording_id) {
      const r = await transcriptTextFor(req, recording_id);
      if (r.error) return res.status(404).json({ error: r.error });
      text = r.text;
    }
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texto requerido' });

    const output = await ai.rewrite(text, tone, custom_prompt);
    const edit = await Edit.create({
      tenant_id: tenantOf(req), recording_id: recording_id || null,
      kind: custom_prompt ? 'custom' : tone, prompt: custom_prompt || null,
      input_text: text, output_text: output, model: ai.activeModel()
    });
    await logUsage(req, 'rewrite');
    res.json({ success: true, edit });
  } catch (e) {
    console.error('SpeakUp rewrite route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
