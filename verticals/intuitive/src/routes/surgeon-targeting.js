'use strict';

/**
 * Surgeon Targeting — AcuityMD-style territory intelligence
 *
 * Aggregates NPI Registry + CMS MPUP (Medicare physician volume) + CMS Open Payments
 * into a ranked target list for a sales territory (state + ZIPs + specialty).
 *
 * Public data only. No paid feed. The same data AcuityMD layers their UI on top of.
 *
 * Endpoints:
 *   POST /api/v1/surgeon-targeting/search   - territory → ranked surgeon targets
 *   GET  /api/v1/surgeon-targeting/profile/:npi - single surgeon dossier
 */

const router = require('express').Router();
const npiRegistry = require('../services/data-sources/npi-registry');
const mpup = require('../services/data-sources/cms-physician-volume');
const openPayments = require('../services/data-sources/cms-open-payments');

// Specialty key → NPI taxonomy label (matches npi-registry.js SURGERY_TAXONOMIES)
const SPECIALTY_FILTERS = {
  urology:    'Urology',
  gynecology: 'Obstetrics',
  general:    'Surgery',
  thoracic:   'Thoracic',
  colorectal: 'Colon',
  head_neck:  'Otolaryngology',
  all:        null,
};

// Target score = volume signal (50pts) + Intuitive relationship (35pts) + recency (15pts)
function targetScore({ robotic_cases, intuitive_dollars_2yr, last_payment_date }) {
  const vol = Number(robotic_cases) || 0;
  const dollars = Number(intuitive_dollars_2yr) || 0;
  const lpd = last_payment_date ? new Date(last_payment_date) : null;
  const daysSince = lpd ? (Date.now() - lpd.getTime()) / (1000 * 60 * 60 * 24) : Infinity;

  // 50 pts for volume — saturates at 200 robotic cases/yr
  const volPts = Math.min(50, Math.round((vol / 200) * 50));
  // 35 pts for Intuitive $ exposure — saturates at $25K (proxy for engaged relationship)
  const dollarPts = Math.min(35, Math.round((dollars / 25000) * 35));
  // 15 pts for recency of last Intuitive payment
  const recencyPts = daysSince < 180 ? 15 : daysSince < 365 ? 10 : daysSince < 730 ? 5 : 0;

  return Math.min(100, volPts + dollarPts + recencyPts);
}

function tier(score) {
  if (score >= 75) return { label: 'A — Convert Now', color: '#10b981' };
  if (score >= 50) return { label: 'B — Develop', color: '#0ea5e9' };
  if (score >= 25) return { label: 'C — Nurture', color: '#eab308' };
  return { label: 'D — Cold', color: '#64748b' };
}

// ---------------------------------------------------------------------------
// POST /search — territory query
// Body: { state, zips: ['33133', ...], specialty: 'urology'|'all', limit }
// ---------------------------------------------------------------------------
router.post('/search', async (req, res) => {
  const t0 = Date.now();
  const { state, zips, specialty = 'all', limit = 100 } = req.body || {};

  if (!state || typeof state !== 'string' || state.length !== 2) {
    return res.status(400).json({ error: 'state (2-letter code) is required' });
  }
  const zipList = Array.isArray(zips) ? zips.filter(z => /^\d{5}$/.test(String(z))) : [];
  const specKey = SPECIALTY_FILTERS[specialty] !== undefined ? specialty : 'all';

  try {
    // 1) NPI roster — query each ZIP (or state-wide if no ZIP given)
    const rosterSeen = new Set();
    const roster = [];
    const queryZips = zipList.length ? zipList : [null];

    for (const zip of queryZips.slice(0, 12)) {
      const r = await npiRegistry.fetchFor('Territory Query', state.toUpperCase(), {
        zip: zip || undefined,
        models: req.models,
      });
      const surgeons = (r.data && r.data.surgeons) || [];
      for (const s of surgeons) {
        if (rosterSeen.has(s.npi)) continue;
        if (specKey !== 'all' && s.specialty_key !== specKey) continue;
        rosterSeen.add(s.npi);
        roster.push(s);
      }
    }

    if (roster.length === 0) {
      return res.json({
        targets: [], total: 0, elapsed_ms: Date.now() - t0,
        message: 'No surgeons found in NPPES for this territory + specialty.',
      });
    }

    // 2) Bulk-enrich with MPUP procedure volumes + Open Payments
    const npis = roster.map(s => s.npi);
    const [mpupResult, opResult] = await Promise.all([
      mpup.fetchFor(npis, { models: req.models }),
      openPayments.fetchFor(npis, { models: req.models }),
    ]);

    const volumeByNpi = {};
    for (const v of ((mpupResult.data && mpupResult.data.surgeon_volumes) || [])) {
      volumeByNpi[v.npi] = v;
    }
    const paymentsByNpi = {};
    for (const p of ((opResult.data && opResult.data.surgeon_payments) || [])) {
      paymentsByNpi[p.npi] = p;
    }

    // 3) Join + score
    const targets = roster.map(s => {
      const vol = volumeByNpi[s.npi] || {};
      const pay = paymentsByNpi[s.npi] || {};
      const score = targetScore({
        robotic_cases: vol.total_robotic_cases_last_yr || 0,
        intuitive_dollars_2yr: pay.total_payments_2yr || 0,
        last_payment_date: pay.last_payment_date,
      });
      const t = tier(score);
      return {
        npi: s.npi,
        full_name: s.full_name,
        credential: s.credential,
        specialty: s.specialty_label,
        specialty_key: s.specialty_key,
        practice_address: s.practice_address,
        // Volume signals (from CMS MPUP — Medicare only, latest year)
        robotic_cases_last_yr: vol.total_robotic_cases_last_yr || 0,
        procedure_breakdown: vol.procedure_breakdown || {},
        volume_year: vol.fiscal_year || null,
        // Intuitive relationship (from CMS Open Payments)
        intuitive_dollars_2yr: pay.total_payments_2yr || 0,
        last_intuitive_payment: pay.last_payment_date || null,
        payment_categories: pay.payment_categories || [],
        champion_score: pay.champion_score || 0,
        // Composite
        target_score: score,
        tier: t.label,
        tier_color: t.color,
      };
    });

    targets.sort((a, b) => b.target_score - a.target_score);

    res.json({
      targets: targets.slice(0, Math.min(Number(limit) || 100, 500)),
      total: targets.length,
      territory: { state: state.toUpperCase(), zips: zipList, specialty: specKey },
      elapsed_ms: Date.now() - t0,
      data_sources: [
        { name: 'NPI Registry (NPPES)', url: 'https://npiregistry.cms.hhs.gov' },
        { name: 'CMS MPUP (Medicare Physician Volume)', url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
        { name: 'CMS Open Payments (Sunshine Act)', url: 'https://openpaymentsdata.cms.gov' },
      ],
      summary: {
        tier_a: targets.filter(t => t.target_score >= 75).length,
        tier_b: targets.filter(t => t.target_score >= 50 && t.target_score < 75).length,
        tier_c: targets.filter(t => t.target_score >= 25 && t.target_score < 50).length,
        tier_d: targets.filter(t => t.target_score < 25).length,
        total_intuitive_dollars_2yr: targets.reduce((s, t) => s + (t.intuitive_dollars_2yr || 0), 0),
        total_robotic_cases: targets.reduce((s, t) => s + (t.robotic_cases_last_yr || 0), 0),
      },
    });
  } catch (e) {
    console.error('[SurgeonTargeting] /search error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /profile/:npi — single surgeon deep-dive
// ---------------------------------------------------------------------------
router.get('/profile/:npi', async (req, res) => {
  const { npi } = req.params;
  if (!/^\d{10}$/.test(npi)) {
    return res.status(400).json({ error: 'npi must be 10 digits' });
  }
  try {
    const [mpupResult, opResult] = await Promise.all([
      mpup.fetchFor([npi], { models: req.models }),
      openPayments.fetchFor([npi], { models: req.models }),
    ]);
    const vol = (mpupResult.data && mpupResult.data.surgeon_volumes && mpupResult.data.surgeon_volumes[0]) || null;
    const pay = (opResult.data && opResult.data.surgeon_payments && opResult.data.surgeon_payments[0]) || null;

    if (!vol && !pay) {
      return res.status(404).json({ error: 'No CMS data found for this NPI' });
    }

    const score = targetScore({
      robotic_cases: (vol && vol.total_robotic_cases_last_yr) || 0,
      intuitive_dollars_2yr: (pay && pay.total_payments_2yr) || 0,
      last_payment_date: pay && pay.last_payment_date,
    });
    const t = tier(score);

    res.json({
      npi,
      volume: vol,
      payments: pay,
      target_score: score,
      tier: t.label,
      tier_color: t.color,
      citations: [...(mpupResult.citations || []), ...(opResult.citations || [])],
    });
  } catch (e) {
    console.error('[SurgeonTargeting] /profile error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
