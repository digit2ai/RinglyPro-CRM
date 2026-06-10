'use strict';

/**
 * AgroMercado — Phase 4: Macroeconomic / FX (BCV + parallel) module.
 * USD-normalized prices rendered to VES. Latest rate from am_fx_rates, with
 * the parallel fallback (official + fixed delta) when only BCV is known.
 */

const express = require('express');
const router = express.Router();

const { FxRate } = require('../models');
const { parallelFallback } = require('../utils/fx');
const { tenantId } = require('../middleware/auth');

async function latestRate(tid) {
  return FxRate.findOne({ where: { tenant_id: tid }, order: [['fetched_at', 'DESC']] });
}

// GET /divisas/rates — current official + parallel + timestamp
router.get('/rates', async (req, res) => {
  try {
    const tid = tenantId(req);
    const rate = await latestRate(tid);
    if (!rate) return res.json({ success: true, available: false, message: 'Sin cotización registrada todavía' });
    const bcv = Number(rate.bcv_ves);
    const parallel = rate.parallel_ves != null ? Number(rate.parallel_ves) : parallelFallback(bcv);
    res.json({ success: true, available: true, bcv_ves: bcv, parallel_ves: parallel, source: rate.source, fetched_at: rate.fetched_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /divisas/convert?usd=&rate=bcv|parallel
router.get('/convert', async (req, res) => {
  try {
    const tid = tenantId(req);
    const usd = Number(req.query.usd);
    if (!usd && usd !== 0) return res.status(400).json({ error: 'usd requerido' });
    const which = (req.query.rate || 'bcv').toLowerCase();
    const rate = await latestRate(tid);
    if (!rate) return res.status(503).json({ error: 'Sin cotización disponible' });
    const bcv = Number(rate.bcv_ves);
    const parallel = rate.parallel_ves != null ? Number(rate.parallel_ves) : parallelFallback(bcv);
    const factor = which === 'parallel' ? parallel : bcv;
    res.json({ success: true, usd, rate_used: which, ves: Math.round(usd * factor * 100) / 100, bcv_ves: bcv, parallel_ves: parallel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
