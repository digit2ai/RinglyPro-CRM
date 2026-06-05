'use strict';

/**
 * Veritas — "Analista de Protección" (protection analyst).
 *
 * Two layers, both keyless-capable:
 *  - GET  /config : returns the ElevenLabs convai agent IDs (public per convai
 *    design — no API key is sent to the browser). Voice mode activates only when
 *    ELEVENLABS_CONVAI_VERITAS_EN / _ES are set on the server.
 *  - POST /ask : rule-based Spanish Q&A over the tenant's live detection data.
 *    Works with zero external keys; this is the fallback the dashboard uses when
 *    the voice agent is not configured.
 */

const express = require('express');
const router = express.Router();
const { Detection, Takedown, Monitor } = require('../models');

function tenantId(req) {
  return parseInt(req.query.tenant_id || req.body.tenant_id || 1, 10);
}

// GET /api/v1/analyst/config
router.get('/config', (req, res) => {
  const en = process.env.ELEVENLABS_CONVAI_VERITAS_EN || null;
  const es = process.env.ELEVENLABS_CONVAI_VERITAS_ES || null;
  res.json({ success: true, data: { enabled: !!(en || es), agent_id_en: en, agent_id_es: es } });
});

// Build a Spanish answer from the tenant's live data based on keywords.
async function answer(question, tid) {
  const q = (question || '').toLowerCase();
  const dets = await Detection.findAll({ where: { tenant_id: tid } });
  const tds = await Takedown.findAll({ where: { tenant_id: tid } });
  const mons = await Monitor.findAll({ where: { tenant_id: tid } });

  const v = { clean: 0, suspect: 0, deepfake: 0 };
  dets.forEach(d => { v[d.verdict] = (v[d.verdict] || 0) + 1; });
  const removed = tds.filter(t => t.status === 'removed').length;
  const active = tds.filter(t => ['draft', 'submitted', 'acknowledged'].includes(t.status)).length;
  const activeMon = mons.filter(m => m.status === 'active');

  const has = (...words) => words.some(w => q.includes(w));

  if (has('elimin', 'retir', 'baj', 'takedown')) {
    const pend = tds.filter(t => t.status !== 'removed' && t.status !== 'rejected')
      .map(t => `${t.platform || 'plataforma'} (${t.status})`).slice(0, 5).join(', ');
    return `Se ha eliminado ${removed} contenido y hay ${active} retiro(s) en curso.` +
      (pend ? ` Pendientes: ${pend}.` : '');
  }
  if (has('monitor', 'vigil', 'segui')) {
    return `Hay ${activeMon.length} monitor(es) activo(s): ${activeMon.map(m => m.target_label).join('; ')}.`;
  }
  if (has('sospech')) {
    return `Hay ${v.suspect} elemento(s) sospechoso(s) en revisión que aún no se confirman como deepfake.`;
  }
  if (has('deepfake', 'falso', 'cuant', 'cuánt', 'detect')) {
    const top = dets.filter(d => d.verdict === 'deepfake').sort((a, b) => b.confidence - a.confidence)[0];
    return `Se detectaron ${v.deepfake} deepfake(s) de ${dets.length} elementos analizados.` +
      (top ? ` El de mayor riesgo: "${(top.deepfakes_impact || '').slice(0, 90)}" (${top.confidence}%).` : '');
  }
  if (has('riesgo', 'peligr', 'urgent', 'prioridad')) {
    const urgent = dets.filter(d => d.verdict === 'deepfake').sort((a, b) => b.confidence - a.confidence).slice(0, 3);
    return urgent.length
      ? 'Prioridades ahora: ' + urgent.map(d => `${d.targeted_person} — ${(d.deepfakes_impact || '').slice(0, 70)} (${d.confidence}%)`).join(' | ')
      : 'No hay amenazas de alto riesgo pendientes en este momento.';
  }
  // Resumen / por defecto
  return `Resumen: ${dets.length} elementos analizados — ${v.deepfake} deepfake(s), ${v.suspect} sospechoso(s), ${v.clean} auténtico(s). ` +
    `${removed} contenido eliminado, ${active} retiro(s) en curso, ${activeMon.length} monitor(es) activo(s). ` +
    `Pregúntame por "deepfakes", "retiros", "monitores", "sospechosos" o "riesgo".`;
}

// POST /api/v1/analyst/ask  { question }
router.post('/ask', async (req, res) => {
  try {
    const a = await answer(req.body.question, tenantId(req));
    res.json({ success: true, data: { answer: a, source: 'rule-based' } });
  } catch (e) {
    console.error('Veritas analyst error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
