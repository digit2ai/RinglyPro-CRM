// =====================================================
// /api/v1/analyses — JWT-guarded, tenant-scoped CRUD over pose analyses.
//
//   POST   /            -> {filename, durationSec, frames:[{t,keypoints}], lang?}
//                          runs the fault engine, persists metadata+faults, 201
//   GET    /            -> list this tenant's analyses
//   GET    /:id         -> one analysis IF owned by this tenant, else 404
//   DELETE /:id         -> delete IF owned by this tenant, else 404
//
// PII: never log raw frames, filenames, or keypoints. Emails (if present in the
// JWT) are masked before any log line.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const jwtLib = require('jsonwebtoken');
const { getToken } = require('../lib/auth');
const store = require('../models/analysis');
const { analyze } = require('../lib/faultEngine');

// Unified credits: this app now bills against the Evaluación del Caballo de Paso
// Fino account system (same Node process + DB). A rider-pose analysis costs 1
// credit, charged to the horse account. The token arrives via ?token= (the panel
// mints a short-lived embed token) or Authorization: Bearer.
const horseAccount = require('../../evaluacion-del-caballo-de-paso-fino/models/account');
const ECPF_SECRET = process.env.ECPF_JWT_SECRET || process.env.JWT_SECRET || 'ecpf-dev-secret';

function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at <= 0) return 'u***';
  return s[0] + '***' + s.slice(at);
}

// Identify the horse account from the token (no charge here). Sets req.ecpfUser
// and req.tenantId so analyses are scoped to that account.
async function requireHorseAccount(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Inicia sesión en el panel para analizar.', code: 'NO_ACCOUNT' });
  let dec;
  try { dec = jwtLib.verify(token, ECPF_SECRET); } catch (e) { return res.status(401).json({ error: 'Sesión inválida o expirada.', code: 'NO_ACCOUNT' }); }
  const uid = dec.uid != null ? dec.uid : (dec.user_id != null ? dec.user_id : dec.id);
  if (uid == null) return res.status(401).json({ error: 'Token no pertenece a una cuenta válida.', code: 'NO_ACCOUNT' });
  let u = null;
  try { u = await horseAccount.findById(uid); } catch (e) { /* fallthrough */ }
  if (!u) return res.status(401).json({ error: 'Cuenta no encontrada.', code: 'NO_ACCOUNT' });
  req.ecpfUser = u; req.tenantId = u.id; req.jwt = dec;
  next();
}

router.use(requireHorseAccount);

// POST /  -> analyze + persist
router.post('/', async (req, res) => {
  try {
    const { filename, durationSec, frames, lang } = req.body || {};
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(422).json({ error: 'frames[] required (array of {t, keypoints})' });
    }
    // Defensive cap so a runaway client can't OOM the analyzer.
    if (frames.length > 5000) {
      return res.status(422).json({ error: 'too many frames (max 5000)' });
    }

    // Charge 1 credit (rider-pose analysis) to the horse account. Refund on failure.
    const debit = await horseAccount.debitOne(req.ecpfUser.id, { analysis_type: 'jump', description: 'Analizador de Postura del Jinete' });
    if (!debit.ok) return res.status(402).json({ error: 'Sin créditos. Recarga tu cuenta para continuar.', code: 'NO_CREDITS', credits: debit.balance });

    let row;
    try {
      const result = analyze(frames);
      const safeName = typeof filename === 'string' ? filename.slice(0, 255) : null;
      row = await store.create({
        tenant_id: req.tenantId,
        filename: safeName,
        duration_sec: typeof durationSec === 'number' ? durationSec : null,
        frame_count: result.frameCount,
        apex_sec: result.apexSec,
        faults: result.faults,
        lang: lang === 'en' ? 'en' : 'es'
      });
    } catch (inner) {
      await horseAccount.refundOne(req.ecpfUser.id, { description: 'refund: análisis de postura falló' });
      throw inner;
    }
    console.log(JSON.stringify({
      svc: 'ai-jump-coach', event: 'analysis_created',
      tenant: req.tenantId, user: maskEmail(req.jwt && req.jwt.email),
      id: row.id, frames: row.frame_count, faults: (row.faults || []).length, credits: debit.balance
    }));
    return res.status(201).json(Object.assign({}, row, { credits: debit.balance, charged: true }));
  } catch (e) {
    console.error(JSON.stringify({ svc: 'ai-jump-coach', event: 'analysis_error', error: e.message }));
    return res.status(500).json({ error: 'analysis failed' });
  }
});

// GET /  -> list (tenant-scoped)
router.get('/', async (req, res) => {
  try {
    const rows = await store.listByTenant(req.tenantId);
    return res.json({ data: rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: 'list failed' });
  }
});

// GET /:id  -> one (404 if not owned by this tenant)
router.get('/:id', async (req, res) => {
  try {
    const row = await store.findForTenant(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: 'not found' });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: 'read failed' });
  }
});

// DELETE /:id  -> delete (404 if not owned by this tenant)
router.delete('/:id', async (req, res) => {
  try {
    const ok = await store.remove(req.params.id, req.tenantId);
    if (!ok) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'delete failed' });
  }
});

module.exports = router;
