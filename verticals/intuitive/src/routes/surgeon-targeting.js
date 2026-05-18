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
const pubmed = require('../services/data-sources/pubmed');
const clinicalTrials = require('../services/data-sources/clinical-trials');

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

// KOL score = publications (50pts) + active trials (35pts) + Intuitive-sponsored trial (15pts)
function kolScore({ publications_5yr, active_trials, intuitive_trials }) {
  const pubs = Number(publications_5yr) || 0;
  const trials = Number(active_trials) || 0;
  const intvTrials = Number(intuitive_trials) || 0;

  // 50 pts for publications — saturates at 25 pubs in 5yr (5 pubs/yr = strong academic)
  const pubPts = Math.min(50, Math.round((pubs / 25) * 50));
  // 35 pts for active trials — 2+ active trials maxes
  const trialPts = Math.min(35, trials * 18);
  // 15 pts bonus for Intuitive-sponsored involvement (rare; very high signal)
  const intvPts = intvTrials > 0 ? 15 : 0;

  return Math.min(100, pubPts + trialPts + intvPts);
}

function kolBadge(score) {
  if (score >= 70) return { label: 'Key Opinion Leader', color: '#a855f7' };
  if (score >= 40) return { label: 'Research-Active', color: '#8b5cf6' };
  if (score >= 15) return { label: 'Publishing', color: '#6366f1' };
  return null;
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
  const { state, zips, specialty = 'all', limit = 100, enrich = false, enrich_top = 25 } = req.body || {};

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

    // 4) Optional KOL enrichment — top N only (slow, external API calls)
    let enrichmentTime = 0;
    if (enrich) {
      const eStart = Date.now();
      const topN = targets.slice(0, Math.min(Number(enrich_top) || 25, 50));
      try {
        const [pubMap, trialMap] = await Promise.all([
          pubmed.fetchBulk(topN.map(t => ({ npi: t.npi, full_name: t.full_name })), { models: req.models }),
          clinicalTrials.fetchBulk(topN.map(t => ({ npi: t.npi, full_name: t.full_name })), { models: req.models }),
        ]);
        for (const t of topN) {
          const p = pubMap[t.npi] || { count: 0 };
          const c = trialMap[t.npi] || { active_count: 0 };
          t.publications_5yr = p.count || 0;
          t.recent_pmids = (p.recent_pmids || []).slice(0, 3);
          t.pubmed_url = p.source_url || null;
          t.active_trials = c.active_count || 0;
          t.industry_trials = c.industry_sponsored || 0;
          t.intuitive_trials = c.intuitive_sponsored || 0;
          t.trial_titles = (c.trials || []).slice(0, 3).map(tr => tr.title);
          t.clinicaltrials_url = c.source_url || null;
          const ks = kolScore({
            publications_5yr: t.publications_5yr,
            active_trials: t.active_trials,
            intuitive_trials: t.intuitive_trials,
          });
          t.kol_score = ks;
          const kb = kolBadge(ks);
          t.kol_badge = kb ? kb.label : null;
          t.kol_badge_color = kb ? kb.color : null;
          // Composite score = 70% target_score + 30% kol_score (KOL is a multiplier on a hot target)
          t.composite_score = Math.round(t.target_score * 0.7 + t.kol_score * 0.3);
        }
        // Non-enriched surgeons get null KOL fields
        for (const t of targets.slice(topN.length)) {
          t.publications_5yr = null;
          t.active_trials = null;
          t.kol_score = null;
          t.kol_badge = null;
          t.composite_score = t.target_score;
        }
      } catch (e) {
        console.error('[SurgeonTargeting] enrichment error:', e.message);
      }
      enrichmentTime = Date.now() - eStart;
    }

    const sources = [
      { name: 'NPI Registry (NPPES)', url: 'https://npiregistry.cms.hhs.gov' },
      { name: 'CMS MPUP (Medicare Physician Volume)', url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
      { name: 'CMS Open Payments (Sunshine Act)', url: 'https://openpaymentsdata.cms.gov' },
    ];
    if (enrich) {
      sources.push({ name: 'PubMed (NCBI E-utilities)', url: 'https://pubmed.ncbi.nlm.nih.gov' });
      sources.push({ name: 'ClinicalTrials.gov', url: 'https://clinicaltrials.gov' });
    }

    res.json({
      targets: targets.slice(0, Math.min(Number(limit) || 100, 500)),
      total: targets.length,
      territory: { state: state.toUpperCase(), zips: zipList, specialty: specKey },
      elapsed_ms: Date.now() - t0,
      enrichment_ms: enrichmentTime || undefined,
      enriched_count: enrich ? Math.min(Number(enrich_top) || 25, targets.length) : 0,
      data_sources: sources,
      summary: {
        tier_a: targets.filter(t => t.target_score >= 75).length,
        tier_b: targets.filter(t => t.target_score >= 50 && t.target_score < 75).length,
        tier_c: targets.filter(t => t.target_score >= 25 && t.target_score < 50).length,
        tier_d: targets.filter(t => t.target_score < 25).length,
        total_intuitive_dollars_2yr: targets.reduce((s, t) => s + (t.intuitive_dollars_2yr || 0), 0),
        total_robotic_cases: targets.reduce((s, t) => s + (t.robotic_cases_last_yr || 0), 0),
        kol_count: enrich ? targets.filter(t => (t.kol_score || 0) >= 40).length : 0,
        total_publications_5yr: enrich ? targets.reduce((s, t) => s + (t.publications_5yr || 0), 0) : 0,
        total_active_trials: enrich ? targets.reduce((s, t) => s + (t.active_trials || 0), 0) : 0,
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

// ---------------------------------------------------------------------------
// POST /enrich — enrich a single surgeon by name (PubMed + ClinicalTrials)
// Body: { full_name, npi (optional) }
// ---------------------------------------------------------------------------
router.post('/enrich', async (req, res) => {
  const { full_name, npi } = req.body || {};
  if (!full_name) return res.status(400).json({ error: 'full_name required' });

  try {
    const [pub, trials] = await Promise.all([
      pubmed.fetchPublicationCount(full_name, { models: req.models }),
      clinicalTrials.fetchActiveTrials(full_name, { models: req.models }),
    ]);

    const ks = kolScore({
      publications_5yr: pub.count || 0,
      active_trials: trials.active_count || 0,
      intuitive_trials: trials.intuitive_sponsored || 0,
    });
    const kb = kolBadge(ks);

    res.json({
      npi: npi || null,
      full_name,
      publications_5yr: pub.count || 0,
      recent_pmids: (pub.recent_pmids || []).slice(0, 5),
      pubmed_url: pub.source_url,
      active_trials: trials.active_count || 0,
      industry_trials: trials.industry_sponsored || 0,
      intuitive_trials: trials.intuitive_sponsored || 0,
      trials: (trials.trials || []).slice(0, 10),
      clinicaltrials_url: trials.source_url,
      kol_score: ks,
      kol_badge: kb ? kb.label : null,
      kol_badge_color: kb ? kb.color : null,
    });
  } catch (e) {
    console.error('[SurgeonTargeting] /enrich error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
