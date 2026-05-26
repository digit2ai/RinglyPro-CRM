'use strict';

/**
 * Surgeon Profile Enrichment Service
 *
 * Produces the 4 deck-aligned additions for Step 2 Surgeon Profile:
 *   1. Training Pipeline panel  (Deck p11 — trained / training needs / proctoring)
 *   2. CSR Intel Panel          (Deck p12, p18 — free-text surgeon access notes)
 *   3. KOL Signal Strip         (top surgeons by composite signal)
 *   4. Industry Payment Leaders (top surgeons by CMS Open Payments from Intuitive)
 */

const pubmed = require('./data-sources/pubmed');

// ─── 1. TRAINING PIPELINE (Deck p11 format) ────────────────────────────

// A surgeon is "CSR-captured" if we reached them through the CSR system — a survey,
// a voice call, a CSR-tagged source, or any free-text CSR access note. Per the
// 2026-05-26 review the Training Pipeline must ONLY show CSR-captured surgeons so it
// is defensible as "N surgeons remaining with CSR capture access mode" — we cannot
// admit knowing the roster from the account report card.
function isCsrCaptured(s) {
  const src = (s.source || '').toLowerCase();
  return src === 'csr' || src === 'survey' || src === 'voice_call'
    || !!(s.free_text_intel && String(s.free_text_intel).trim().length > 0);
}

function buildTrainingPipeline(allSurgeons = []) {
  // CSR cross-reference: only surgeons confirmed through the CSR system are shown.
  const surgeons = allSurgeons.filter(isCsrCaptured);
  const trained = [];
  const untrained = [];
  const needsProctoring = [];
  const pullForward = [];

  for (const s of surgeons) {
    const row = {
      surgeon_name: s.surgeon_name,
      specialty: s.surgeon_specialty,
      training_needs: s.training_needs,
      cases_annual: s.total_incremental_annual || 0,
      commitment_category: s.commitment_category || 'open_to_mis',
      current_weekly_volume: s.current_weekly_volume,
      target_weekly_volume: s.target_weekly_volume,
      backlog_weeks: s.backlog_weeks,
    };
    if (s.trained === false || s.commitment_category === 'training_pipeline') {
      untrained.push(row);
    } else if (s.commitment_category === 'pull_forward') {
      pullForward.push(row);
    } else {
      trained.push(row);
    }
    if (s.proctoring_needed) needsProctoring.push(row);
  }

  return {
    csr_captured_count: surgeons.length,
    headline: `${surgeons.length} surgeons remaining with CSR capture access mode · ${trained.length} trained · ${untrained.length} in pipeline · ${pullForward.length} pull-forward · ${needsProctoring.length} need proctoring`,
    trained,
    untrained,
    pull_forward: pullForward,
    needs_proctoring: needsProctoring,
    total_committed_cases: surgeons.reduce((s, sg) => s + (sg.total_incremental_annual || 0), 0),
  };
}

// ─── 2. CSR INTEL PANEL (Deck p12, p18 format) ─────────────────────────

function buildCsrIntel(surgeons = []) {
  const items = surgeons
    .filter(s => s.free_text_intel && s.free_text_intel.trim().length > 0)
    .map(s => ({
      surgeon_name: s.surgeon_name,
      specialty: s.surgeon_specialty,
      commitment_category: s.commitment_category,
      intel: s.free_text_intel,
      current_weekly: s.current_weekly_volume,
      target_weekly: s.target_weekly_volume,
      backlog_weeks: s.backlog_weeks,
    }))
    .sort((a, b) => {
      // Sort by urgency: high backlog first, then high target/current ratio
      const aUrgency = (a.backlog_weeks || 0) + ((a.target_weekly || 0) - (a.current_weekly || 0));
      const bUrgency = (b.backlog_weeks || 0) + ((b.target_weekly || 0) - (b.current_weekly || 0));
      return bUrgency - aUrgency;
    });

  return {
    headline: items.length > 0
      ? `${items.length} surgeons with CSR-captured access notes`
      : 'No CSR access intel captured yet. Use the Surgeon Commitments page to add per-surgeon notes.',
    items,
  };
}

// ─── 3. KOL SIGNAL STRIP (composite ranking) ───────────────────────────

async function buildKolSignals(surgeons = [], opts = {}) {
  if (!surgeons.length) return { headline: 'No surgeon roster yet', top_kols: [] };

  // CRITICAL: on prod the surgeon list = committed surgeons + a large NPPES
  // affiliation roster. A blind slice() would score only the first N roster
  // surgeons (publication-only academics) and push the committed clinical
  // surgeons — the ones with specialty + robotic/commitment volume — out of the
  // scoring window entirely. So we ALWAYS score clinical surgeons first, then
  // fill the remaining budget with research-only candidates.
  const isClinical = (s) =>
    parseInt(s.total_incremental_annual || 0) > 0 ||
    parseInt(s.robotic_cases_last_yr || s.total_robotic_cases_last_yr || 0) > 0 ||
    !!(s.surgeon_specialty || s.specialty);
  const clinicalFirst = surgeons.filter(isClinical);
  const researchOnly = surgeons.filter(s => !isClinical(s));
  const toScore = [...clinicalFirst, ...researchOnly].slice(0, 24);

  const scored = [];
  for (const s of toScore) {
    let publicationCount = 0;
    try {
      const pub = await pubmed.fetchPublicationCount(s.surgeon_name || s.full_name, {
        years: 5, models: opts.models, affiliation: opts.affiliation,
      });
      publicationCount = pub?.count || 0;
    } catch (e) { /* skip */ }

    const mpupVol = parseInt(s.robotic_cases_last_yr || s.total_robotic_cases_last_yr || 0);
    const commitmentCases = parseInt(s.total_incremental_annual || 0);
    // Volume basis for the quadrant x-axis: prefer claims-derived MPUP robotic
    // volume; if a surgeon has no MPUP match (common for pure-research KOLs),
    // fall back to their captured commitment cases so the point is not pinned at 0.
    const roboticVol = mpupVol || commitmentCases;
    // For a da Vinci business case, the surgeons who ACTUALLY do robotic volume and
    // have committed cases are the highest-value KOLs — weight that well above raw
    // publication count, so committed operators (with specialty + volume) lead and
    // publication-only academics still appear but below them.
    const score = (mpupVol * 2) + (commitmentCases * 3) + (publicationCount * 1);
    const specialty = s.surgeon_specialty || s.specialty || null;
    scored.push({
      surgeon_name: s.surgeon_name || s.full_name,
      specialty: specialty,
      // When neither specialty nor claims volume is known, the surgeon entered
      // via PubMed only — label them a Research KOL rather than showing blanks.
      kol_type: specialty ? 'Clinical' : (publicationCount > 0 ? 'Research' : 'Roster'),
      npi: s.npi,
      robotic_vol: roboticVol,
      volume_is_commitment: !mpupVol && commitmentCases > 0,
      commitment_cases: commitmentCases,
      publications_5yr: publicationCount,
      composite_score: Math.round(score),
    });
  }
  // Two-tier ranking: clinical operators (known specialty) rank above
  // publication-only academics; within each tier, by composite score. On a
  // da Vinci KOL slide the surgeons who actually operate are the relevant
  // leaders, so this guarantees they fill the top before any Research KOL.
  scored.sort((a, b) => {
    const aClin = a.specialty ? 1 : 0;
    const bClin = b.specialty ? 1 : 0;
    if (aClin !== bClin) return bClin - aClin;
    return b.composite_score - a.composite_score;
  });

  return {
    headline: `Top ${Math.min(5, scored.length)} KOLs · clinical operators first (specialty + committed/robotic volume), then research leaders by publications`,
    top_kols: scored.slice(0, 5),
    methodology: 'Composite KOL score weights captured commitment cases and MPUP robotic volume above 5-yr PubMed publication count, so committed robotic operators rank ahead of publication-only academics. Tunable.',
  };
}

// ─── 4. INDUSTRY PAYMENT LEADERS (CMS Open Payments from Intuitive) ────

async function buildPaymentLeaders(surgeons = [], models) {
  if (!surgeons.length || !models?.IntuitiveOpenPaymentsIntuitive) {
    return { headline: 'No payment data available', top_payments: [] };
  }

  const npis = surgeons.map(s => s.npi).filter(Boolean);
  if (!npis.length) return { headline: 'No NPIs on surgeon roster', top_payments: [] };

  const currentYear = new Date().getFullYear();
  const fiscalYears = [currentYear - 1, currentYear - 2]; // last 2 fiscal years

  let rows = [];
  try {
    rows = await models.IntuitiveOpenPaymentsIntuitive.findAll({
      where: {
        npi: npis,
        fiscal_year: fiscalYears,
      },
      raw: true,
    });
  } catch (e) {
    console.error('[surgeon-profile] OpenPayments query error:', e.message);
    return { headline: 'Payment data lookup failed', top_payments: [] };
  }

  // Aggregate by NPI
  const byNpi = {};
  for (const r of rows) {
    if (!byNpi[r.npi]) byNpi[r.npi] = { total: 0, payment_count: 0, latest_year: 0 };
    byNpi[r.npi].total += parseFloat(r.total_amount || 0);
    byNpi[r.npi].payment_count += parseInt(r.payment_count || 0);
    if (r.fiscal_year > byNpi[r.npi].latest_year) byNpi[r.npi].latest_year = r.fiscal_year;
  }

  const surgeonByNpi = {};
  for (const s of surgeons) if (s.npi) surgeonByNpi[s.npi] = s;

  const leaders = Object.entries(byNpi)
    .map(([npi, data]) => {
      const s = surgeonByNpi[npi];
      return {
        npi,
        surgeon_name: s?.surgeon_name || s?.full_name || `NPI ${npi}`,
        specialty: s?.surgeon_specialty || s?.specialty,
        total_amount: Math.round(data.total),
        payment_count: data.payment_count,
        latest_year: data.latest_year,
      };
    })
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 5);

  const grandTotal = leaders.reduce((s, l) => s + l.total_amount, 0);
  return {
    headline: leaders.length > 0
      ? `Top ${leaders.length} surgeons received $${grandTotal.toLocaleString()} from Intuitive (last 2 fiscal years)`
      : 'No CMS Open Payments data for surgeons on this roster',
    top_payments: leaders,
    fiscal_years: fiscalYears,
    methodology: 'CMS Open Payments general payments where covered company = Intuitive Surgical, last 2 fiscal years.',
  };
}

// ─── COMPOSITE BUILDER ────────────────────────────────────────────────

async function buildSurgeonProfileEnrichment({ projectId, models }) {
  const {
    IntuitiveProject,
    IntuitiveBusinessPlan,
    IntuitiveSurgeonCommitment,
    IntuitiveSurgeonHospitalAffiliation,
    IntuitiveHospital,
  } = models;

  if (!IntuitiveProject) throw new Error('IntuitiveProject model not available');
  const project = await IntuitiveProject.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Pull surgeon commitments (Step 7 data)
  let surgeons = [];
  try {
    const plan = await IntuitiveBusinessPlan.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] });
    if (plan) {
      surgeons = await IntuitiveSurgeonCommitment.findAll({
        where: { business_plan_id: plan.id },
        raw: true,
      });
    }
  } catch (e) { console.error('[surgeon-profile] commitment load error:', e.message); }

  // Fold in roster data from facility affiliations + MPUP for NPIs we don't have via commitments
  // (so KOL/Payment signals work even before Step 7 is populated)
  let rosterSurgeons = [];
  try {
    if (IntuitiveSurgeonHospitalAffiliation && IntuitiveHospital && project.hospital_name) {
      const targetingService = require('./surgeon-targeting-service');
      const hospitalRow = await targetingService.resolveHospitalByName(models, project.hospital_name);
      if (hospitalRow?.ccn) {
        const links = await IntuitiveSurgeonHospitalAffiliation.findAll({
          where: { facility_ccn: hospitalRow.ccn, facility_type: 'Hospital' },
          raw: true, limit: 50,
        });
        if (links.length) {
          const npis = links.map(l => l.npi);
          const mpup = require('./data-sources/cms-physician-volume');
          const volRes = await mpup.fetchFor(npis, { models });
          const byNpi = {};
          for (const v of ((volRes.data && volRes.data.surgeon_volumes) || [])) byNpi[v.npi] = v;
          rosterSurgeons = links.map(l => ({
            surgeon_name: `${(l.surgeon_first_name || '').trim()} ${(l.surgeon_last_name || '').trim()}`.trim(),
            full_name: `${(l.surgeon_first_name || '').trim()} ${(l.surgeon_last_name || '').trim()}`.trim(),
            npi: l.npi,
            surgeon_specialty: (byNpi[l.npi] || {}).specialty || null,
            robotic_cases_last_yr: (byNpi[l.npi] || {}).total_robotic_cases_last_yr || 0,
          }));
          rosterSurgeons.sort((a, b) => b.robotic_cases_last_yr - a.robotic_cases_last_yr);
        }
      }
    }
  } catch (e) { console.error('[surgeon-profile] roster fetch error:', e.message); }

  // Merge commitments + roster (commitments win for surgeons present in both)
  const mergedByKey = {};
  for (const r of rosterSurgeons) {
    const key = (r.npi || r.surgeon_name || '').toLowerCase();
    if (key) mergedByKey[key] = r;
  }
  for (const c of surgeons) {
    const key = (c.npi || c.surgeon_name || '').toLowerCase();
    if (key) {
      mergedByKey[key] = { ...(mergedByKey[key] || {}), ...c };
    }
  }
  const allSurgeons = Object.values(mergedByKey);

  // Build the 4 enrichment blocks.
  // Note: we rely on the FULL first name + surgery filter for PubMed
  // disambiguation. A hard [Affiliation] requirement was tested but under-counts
  // badly (PubMed only indexes affiliations on a subset of papers), so it's left
  // off — the full-name query alone removes the common-surname inflation.
  const trainingPipeline = buildTrainingPipeline(surgeons); // commitments only for trained/untrained categorization
  const csrIntel = buildCsrIntel(surgeons);
  const kolSignals = await buildKolSignals(allSurgeons, { models });
  const paymentLeaders = await buildPaymentLeaders(allSurgeons, models);

  return {
    project_id: projectId,
    hospital_name: project.hospital_name,
    training_pipeline: trainingPipeline,
    csr_intel: csrIntel,
    kol_signals: kolSignals,
    payment_leaders: paymentLeaders,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildSurgeonProfileEnrichment,
  buildTrainingPipeline,
  buildCsrIntel,
  buildKolSignals,
  buildPaymentLeaders,
};
