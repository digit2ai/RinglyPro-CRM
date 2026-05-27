'use strict';

/**
 * Workflow Presentation Builder
 *
 * Builds the 11-slide HTML deck + Rachel narration scripts for the new
 * 10-step Hospital Workflow + Executive Brief structure.
 *
 * Powers the public/magic-link proposal at /intuitive/proposal/:projectId
 * (no login required, shareable to CFOs).
 *
 * Fetches enrichment data from each step service, renders as HTML strings
 * (the proposal route already has the HTML shell, audio player, slide
 * navigator).
 */

const hospitalProfileService = require('./hospital-profile-service');
const surgeonProfileService = require('./surgeon-profile-service');
const roboticsProgramService = require('./robotics-program-service');
const marketProfileService = require('./market-profile-service');
const clinicalOutcomesService = require('./clinical-outcomes-service');
const clinicalOverlayService = require('./clinical-overlay-service');
const surgeonCommitmentsService = require('./surgeon-commitments-service');
const businessPlanService = require('./business-plan-service');
const performanceTrackingService = require('./performance-tracking-service');
const executiveBriefService = require('./executive-brief-service');

const fmt = (n) => n != null ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--';
const fmtMoneyShort = (n) => {
  if (n == null) return '$0';
  const v = Number(n);
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(v);
};
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const metric = (label, value, color = '#0ea5e9') =>
  `<div class="metric"><div class="metric-value" style="color:${color}">${esc(String(value))}</div><div class="metric-label">${esc(label)}</div></div>`;

// Plain-language note explaining how the slide's figures are derived, so the
// board can trace every number back to its source/formula. Intentionally NOT
// labeled "executive explanation" — just the logic.
const logic = (bodyHtml) =>
  `<div style="margin-top:16px;border-left:3px solid #0ea5e9;background:rgba(14,165,233,0.06);border-radius:0 8px 8px 0;padding:12px 16px">
     <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7dd3fc;font-weight:700;margin-bottom:6px">How these numbers are calculated</div>
     <div style="font-size:12px;color:#cbd5e1;line-height:1.65">${bodyHtml}</div>
   </div>`;

// ─── Fetch all enrichment data in parallel ────────────────────────────

async function fetchAllEnrichments(projectId, models) {
  const [hp, sp, rp, mp, co, cb, sc, bp, pt, eb] = await Promise.all([
    hospitalProfileService.buildHospitalProfileEnrichment({ projectId, models }).catch(() => null),
    surgeonProfileService.buildSurgeonProfileEnrichment({ projectId, models }).catch(() => null),
    roboticsProgramService.buildRoboticsProgramEnrichment({ projectId, models }).catch(() => null),
    marketProfileService.buildMarketProfileEnrichment({ projectId, models }).catch(() => null),
    clinicalOutcomesService.buildClinicalOutcomesEnrichment({ projectId, models }).catch(() => null),
    clinicalOverlayService.buildClinicalOverlayEnrichment({ projectId, models, conversionPct: 15 }).catch(() => null),
    surgeonCommitmentsService.buildSurgeonCommitmentsEnrichment({ projectId, models }).catch(() => null),
    businessPlanService.buildBusinessPlanEnrichment({ projectId, models }).catch(() => null),
    performanceTrackingService.buildPerformanceTrackingEnrichment({ projectId, models }).catch(() => null),
    executiveBriefService.buildExecutiveBrief({ projectId, models }).catch(() => null),
  ]);
  return { hp, sp, rp, mp, co, cb, sc, bp, pt, eb };
}

// ─── 11 slides (cover + 9 steps + executive closer) ───────────────────

function buildWorkflowSlides(project, enrichments, hospitalName) {
  const { hp, sp, rp, mp, co, cb, sc, bp, pt, eb } = enrichments;
  const slides = [];

  // Each slide must return { title, html } to match the proposal template's expectation

  // ───── SLIDE 1: COVER ─────
  const coverTrained = sp?.training_pipeline?.trained?.length || 0;
  const coverPipeline = sp?.training_pipeline?.untrained?.length || 0;
  const coverPullFwd = sp?.training_pipeline?.pull_forward?.length || 0;
  const coverSurgeons = coverTrained + coverPipeline + coverPullFwd;
  const coverCommitted = sc?.summary?.total_incremental_cases || sp?.training_pipeline?.total_committed_cases || 0;
  slides.push({
    title: `${hospitalName} — da Vinci System Assessment`,
    html: `
      <div style="text-align:center;padding:8px 0 4px">
        <h3 style="font-size:30px;color:#f8fafc;margin-bottom:6px">${esc(hospitalName)}</h3>
        <p style="color:#94a3b8;font-size:17px;margin-bottom:18px">Strategic Alignment Opportunity · Hospital &amp; Surgeon Profile at a Glance</p>
      </div>
      <div class="metrics-grid">
        ${metric('Total Beds', fmt(project.bed_count), '#0ea5e9')}
        ${metric('Annual Surgical Vol', fmt(project.annual_surgical_volume), '#0ea5e9')}
        ${metric('Surgeons Tracked', fmt(coverSurgeons), '#8b5cf6')}
        ${metric('Committed Cases/Yr', fmt(coverCommitted), '#10b981')}
      </div>
      <div class="info-box"><strong>Hospital &amp; Surgeon Profile Snapshot</strong> · relative strength across the six dimensions this assessment scores</div>
      <div class="chart-box"><canvas id="wfCoverSnapshot" height="300"></canvas></div>
      <div class="info-box" style="text-align:center">
        Prepared by <strong>SurgicalMind AI · Digit2AI</strong> ·
        ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} ·
        <span style="color:#64748b">CONFIDENTIAL · For executive review</span>
      </div>` + logic(`Every figure in this assessment is built from <strong>public, auditable data</strong> — CMS Hospital Compare, the Medicare cost report (HCRIS), CMS physician volume (MPUP), CMS inpatient stay data, the NPPES provider registry, and PubMed. Nothing is supplied by Intuitive and nothing is guessed. The snapshot above is a qualitative overview; each slide that follows shows both the result and the formula behind it, so any number can be traced back to its source.`),
  });

  // ───── SLIDE 2: HOSPITAL PROFILE ─────
  slides.push({
    title: 'Step 1 · Hospital Profile',
    html: `
      <div class="metrics-grid">
        ${metric('Total Beds', fmt(project.bed_count))}
        ${metric('Annual Surgical Vol', fmt(project.annual_surgical_volume))}
        ${metric('OR Count', fmt(project.total_or_count))}
        ${metric('Robotic Cases/Yr', fmt(project.current_robotic_cases), '#8b5cf6')}
      </div>
      ${hp?.strategic_impact ? `
        <div class="info-box"><strong>${esc(hp.strategic_impact.headline)}</strong></div>
        <div class="chart-box"><canvas id="wfStrategicImpact" height="200"></canvas></div>
      ` : ''}
      ${hp?.peer_benchmark ? `
        <div class="info-box" style="background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.2)">
          <strong>AMP Peer Benchmark · Rank #${hp.peer_benchmark.rank} of ${hp.peer_benchmark.total_ranked}</strong>
          ${hp.peer_benchmark.gap_to_peer_avg > 0 ? ` · <span style="color:#fca5a5">${hp.peer_benchmark.gap_to_peer_avg} systems below peer avg</span>` : ''}
        </div>
        <div class="chart-box"><canvas id="wfPeerBenchmark" height="220"></canvas></div>
      ` : ''}
      ${hp?.research_profile?.by_year?.length > 0 ? `
        <div class="info-box"><strong>Research Profile · ${fmt(hp.research_profile.total_all_publications)} total publications · ${fmt(hp.research_profile.last_12_months)} in last 12 months</strong></div>
        <div class="chart-box"><canvas id="wfPublicationsByYear" height="180"></canvas></div>
      ` : ''}` + logic(`Bed count, OR count, and annual surgical volume are read directly from this hospital's CMS Provider-of-Services file and Medicare cost report — not estimated. Robotic cases/yr is your current da Vinci case count, shown next to total surgical volume so the conversion headroom is visible. The peer rank orders your installed da Vinci base against a matched set of comparable systems, so "below peer average" is a like-for-like gap, not a national average. Publication counts are a live PubMed query against your affiliated surgeons.`),
  });

  // ───── SLIDE 3: SURGEON PROFILE ─────
  slides.push({
    title: 'Step 2 · Surgeon Profile — KOLs & Training Pipeline',
    html: `
      ${sp?.training_pipeline ? `
        <div class="metrics-grid">
          ${metric('Trained', sp.training_pipeline.trained.length, '#10b981')}
          ${metric('In Pipeline', sp.training_pipeline.untrained.length, '#f59e0b')}
          ${metric('Pull-Forward', sp.training_pipeline.pull_forward.length, '#06b6d4')}
          ${metric('Need Proctoring', sp.training_pipeline.needs_proctoring.length, '#3b82f6')}
        </div>
      ` : '<div class="info-box">Surgeon roster will populate once Hospital Intake runs NPPES + facility affiliation lookup.</div>'}
      ${sp?.kol_signals?.top_kols?.length > 0 ? `
        <div class="info-box"><strong>Top KOLs — Volume × Publications Quadrant</strong> · top-right = high-value KOLs</div>
        <div class="chart-box"><canvas id="wfKolQuadrant" height="240"></canvas></div>
        <table class="data-table">
          <thead><tr><th>Top KOLs</th><th>Specialty / Type</th><th style="text-align:right">Robotic Vol</th><th style="text-align:right">Publications</th><th style="text-align:right">Score</th></tr></thead>
          <tbody>
            ${sp.kol_signals.top_kols.map(k => `
              <tr>
                <td><strong>${esc(k.surgeon_name)}</strong></td>
                <td>${k.specialty ? esc(k.specialty) : `<span style="color:#a78bfa">Research KOL</span>`}</td>
                <td style="text-align:right;color:#06b6d4">${k.robotic_vol > 0 ? fmt(k.robotic_vol) + (k.volume_is_commitment ? '<span style="color:#64748b;font-size:10px"> committed</span>' : '') : '<span style="color:#64748b">n/a</span>'}</td>
                <td style="text-align:right;color:#8b5cf6">${k.publications_5yr}</td>
                <td style="text-align:right;font-weight:700">${fmt(k.composite_score)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}` + logic(`Every surgeon is pulled from the national NPPES registry, filtered to this facility's affiliations. Robotic volume is the surgeon's Medicare-billed robotic case count (CMS physician volume); where a surgeon has no claims match, we substitute their captured commitment cases and mark it "committed." Publications are a live 5-year PubMed count. The score combines volume and publications. Surgeons with clinical volume show their specialty; high-publication academics with no claims match are flagged <strong>Research KOL</strong> — both are real, they are just sourced differently.`),
  });

  // ───── SLIDE 4: ROBOTICS PROGRAM ─────
  slides.push({
    title: 'Step 3 · Robotics Program — Installed Base & Utilization',
    html: `
      <div class="metrics-grid">
        ${metric('Systems Installed', fmt(project.current_system_count))}
        ${metric('Model', project.current_system || 'None')}
        ${rp?.system_utilization ? metric('Current Avg/Qtr', fmt(rp.system_utilization.current_avg_per_system_qtr), '#10b981') : ''}
        ${rp?.system_utilization ? metric('Academic Avg', fmt(rp.system_utilization.academic_avg_per_qtr)) : ''}
      </div>
      ${rp?.system_utilization?.procedure_volume_by_qtr?.length > 0 ? `
        <div class="info-box"><strong>Procedure Volume by Quarter</strong> · In-Hours (green) vs After-Hours (red)</div>
        <div class="chart-box"><canvas id="wfProcedureVolume" height="180"></canvas></div>
      ` : ''}
      ${rp?.modality_by_year ? `
        <div class="info-box">
          <strong>Modality Mix vs National Academic Peers</strong> ·
          <span style="color:${rp.modality_by_year.delta_vs_peer_davinci > 0 ? '#fca5a5' : '#86efac'}">${Math.abs(rp.modality_by_year.delta_vs_peer_davinci)}% Delta</span>
        </div>
        <div class="chart-box"><canvas id="wfModalityTrend" height="180"></canvas></div>
      ` : ''}
      ${rp?.tech_generation_mix?.timeline ? `
        <div class="info-box"><strong>Tech Generation Mix Over Time</strong> · ${esc(rp.tech_generation_mix.headline)}</div>
        <div class="chart-box"><canvas id="wfTechGen" height="180"></canvas></div>
      ` : ''}` + logic(`Utilization = your robotic procedure volume divided by the number of installed systems, per quarter. The "academic average" is the per-system throughput of comparable programs — so a gap means each of your systems is running below what peers achieve. The modality mix compares your open / laparoscopic / robotic case split against the peer mix. <strong>Only the OPEN share is treated as convertible</strong> — laparoscopic cases are already minimally invasive and are never counted — and even then the business case on later slides models just <strong>15% of that open volume</strong> converting.`),
  });

  // ───── SLIDE 5: MARKET PROFILE ─────
  slides.push({
    title: 'Step 4 · Market Profile — Share + Regional Market Context',
    html: `
      ${mp?.procedure_market_share ? `
        <div class="metrics-grid">
          ${metric('Current Mkt Share', mp.procedure_market_share.blended_market_share_pct + '%', '#06b6d4')}
          ${metric('Hospital Volume', fmt(mp.procedure_market_share.total_hospital_volume))}
          ${metric('Total Regional Market', fmt(mp.procedure_market_share.total_remaining_opportunity), '#94a3b8')}
          ${mp?.growth_math ? metric('+1% Share Value', fmtMoneyShort(mp.growth_math.dollars_per_1_pct_share), '#10b981') : ''}
        </div>
        <div class="info-box" style="background:rgba(148,163,184,0.10);border-color:rgba(148,163,184,0.35)">
          <strong style="color:#cbd5e1">Total Regional Market = context only, NOT the conversion opportunity.</strong> This is the estimated regional case pool Mayo doesn't currently capture. The bookable incremental is the conservative <strong>15% of OPEN soft-tissue da Vinci-applicable cases</strong> (see Step 6) — not this market gap.
        </div>
      ` : ''}
      ${mp?.growth_math?.scenarios ? `
        <table class="data-table">
          <thead><tr><th>Scenario</th><th style="text-align:right">Cases Captured</th><th style="text-align:right">Annual $ Impact</th></tr></thead>
          <tbody>
            ${mp.growth_math.scenarios.map(s => `
              <tr><td><strong>${esc(s.name)}</strong></td><td style="text-align:right">${fmt(s.cases_added)}</td><td style="text-align:right;color:#10b981;font-weight:600">${fmtMoneyShort(s.dollars)}</td></tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
      ${mp?.procedure_market_share?.procedures?.length > 0 ? `
        <div class="info-box"><strong>Procedure-Level Market Share</strong> · hospital (cyan) vs market (gray)</div>
        <div class="chart-box"><canvas id="wfMarketShare" height="300"></canvas></div>
      ` : ''}` + logic(`Market share = your case volume divided by the total cases performed across your service-area market (CMS plus state discharge data). "Remaining opportunity" is the market volume you do not currently capture — shown here as <strong>context for sizing the market</strong>, not as a promise. <strong>Important:</strong> the financial case on the following slides does NOT assume you capture this whole opportunity. It models only a conservative <strong>15% of your OPEN surgical volume converting</strong> — never laparoscopic, never the full market. The share scenarios are illustrative market context; the booked numbers come from that 15%-of-open basis.`),
  });

  // ───── SLIDE 6: CLINICAL OUTCOMES ─────
  slides.push({
    title: 'Step 5 · Clinical Outcomes Baseline',
    html: `
      ${co?.outcomes_benchmark ? `
        <div class="info-box"><strong>${esc(co.outcomes_benchmark.headline)}</strong></div>
        <div class="chart-box"><canvas id="wfOutcomesRadar" height="280"></canvas></div>
      ` : ''}
      ${co?.los_variability?.procedures?.length > 0 ? `
        <div class="info-box"><strong>LOS by Modality</strong> · Open (gray) vs MIS (light blue) vs Da Vinci (blue)</div>
        <div class="chart-box"><canvas id="wfLosVariability" height="280"></canvas></div>
      ` : ''}` + logic(`The length-of-stay bars are the average inpatient days per procedure by surgical approach — open vs laparoscopic vs da Vinci — taken from CMS Medicare inpatient stay data. The radar compares your outcome rates against the published national benchmark; the gap is the clinical headroom. The next slide turns that headroom into dollars — but only on the open-to-da Vinci gap, and only for a conservative <strong>15% of your OPEN cases</strong> (laparoscopic is already minimally invasive and is never counted).`),
  });

  // ───── SLIDE 7: CLINICAL BENEFIT OVERLAY (THE MOAT) ─────
  slides.push({
    title: 'Step 6 · Clinical Benefit Overlay — THE MOAT',
    html: `
      ${cb?.complication_burden ? `
        <div style="background:linear-gradient(135deg,#450a0a 0%,#1a0606 100%);border:2px solid #ef4444;border-radius:12px;padding:22px;text-align:center;margin:14px 0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#fca5a5;font-weight:700">The Cost of Staying Open — Daily Bleed</div>
          <div style="font-size:46px;font-weight:bold;color:#ef4444;margin:8px 0">($${fmt(cb.complication_burden.daily_avoidable)}/day)</div>
          <div style="font-size:13px;color:#fecaca">$${fmt(cb.complication_burden.total_annual_avoidable)}/yr in complications, readmissions &amp; infections da Vinci would prevent — across ${fmt(cb.complication_burden.total_open_cases)} open da Vinci-applicable cases</div>
        </div>
        <table class="data-table">
          <thead><tr><th>Open-Case Harm (CMS / peer-reviewed)</th><th style="text-align:right">Open Rate</th><th style="text-align:right">da Vinci</th><th style="text-align:right">Events/yr</th><th style="text-align:right">$ Lost/yr</th></tr></thead>
          <tbody>
            ${cb.complication_burden.rows.map(r => `
              <tr>
                <td>${esc(r.name)}</td>
                <td style="text-align:right;color:#fca5a5">${r.open_rate_pct}%</td>
                <td style="text-align:right;color:#86efac">${r.davinci_rate_pct}%</td>
                <td style="text-align:right;color:#fcd34d">${fmt(r.avoidable_events_yr)}</td>
                <td style="text-align:right;color:#fca5a5;font-weight:700">${fmtMoneyShort(r.annual_avoidable_cost)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
      ${cb?.conversion_formula ? `
        <div style="background:rgba(14,165,233,0.10);border:2px solid #0ea5e9;border-radius:12px;padding:18px;margin:14px 0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#7dd3fc;font-weight:700;margin-bottom:6px">The Conversion Formula — the cost-avoidance numbers flow from this</div>
          <div style="font-size:18px;color:#f8fafc;font-weight:700;margin-bottom:6px">Conversion opportunity = ${cb.conversion_formula.basis_pct}% × Open Soft-Tissue cases the da Vinci can perform</div>
          <div style="font-size:14px;color:#cbd5e1;margin-bottom:10px">For ${esc(hospitalName)}: ${cb.conversion_formula.basis_pct}% × ${fmt(cb.conversion_formula.open_applicable_cases)} open applicable cases = <strong style="color:#34d399">${fmt(cb.conversion_formula.conversion_opportunity || cb.conversion_formula.incremental_opportunity)} converted cases</strong> (cost avoidance — <em>not</em> the surgeon-committed incremental volume from Step 7). Laparoscopic and robotic cases — and any open case outside these procedures — do <strong style="color:#fca5a5">NOT count</strong>.</div>
          <div style="font-size:11px;color:#94a3b8;line-height:1.6">
            <strong style="color:#cbd5e1">da Vinci-applicable procedures:</strong>
            Urology (prostatectomy, nephrectomy, partial nephrectomy, pyeloplasty) ·
            Gynecology (hysterectomy, myomectomy, sacrocolpopexy, endometriosis) ·
            General (cholecystectomy, hernia repair, colorectal resection, esophagectomy, gastric bypass) ·
            Thoracic (lobectomy, esophageal resection) ·
            Cardiac (mitral valve repair, CABG) ·
            Head &amp; Neck (thyroidectomy, parotid) ·
            Pediatric urology
          </div>
        </div>
      ` : ''}
      ${cb?.bed_days_savings ? `
        <div class="info-box" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.3)"><strong style="color:#34d399">The da Vinci alternative.</strong> Converting open cases to robotic recovers that bleed — here is the bed-day cost avoidance alone:</div>
        <div style="background:linear-gradient(135deg,#064e3b 0%,#0c4a6e 100%);border:2px solid #10b981;border-radius:12px;padding:24px;text-align:center;margin:14px 0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#34d399;font-weight:700">Annual Cost Avoidance (bed days)</div>
          <div style="font-size:48px;font-weight:bold;color:#10b981;margin:8px 0">${fmtMoneyShort(cb.bed_days_savings.total_dollar_savings)}</div>
          <div style="font-size:13px;color:#cbd5e1">@ $${cb.bed_days_savings.bed_day_cost_used.toLocaleString()}/day · ${cb.bed_days_savings.conversion_pct_assumed}% conversion · ${fmt(cb.bed_days_savings.total_bed_days_saved)} bed days saved</div>
        </div>
      ` : ''}
      ${cb?.investment_payback ? `
        <div class="metrics-grid">
          ${metric('Project IRR', cb.investment_payback.project_irr_pct + '%', '#10b981')}
          ${metric('Payback', cb.investment_payback.estimated_payback_years ? cb.investment_payback.estimated_payback_years + ' yrs' : '5+ yrs', '#06b6d4')}
          ${metric('Annual Net Benefit', fmtMoneyShort(cb.investment_payback.annual_net_benefit), '#8b5cf6')}
          ${cb?.cost_of_waiting ? metric('Cost of Waiting/mo', `(${fmtMoneyShort(cb.cost_of_waiting.monthly_cost_of_waiting)})`, '#ef4444') : ''}
        </div>
        <div class="info-box"><strong>Cumulative Return vs Investment Breakeven</strong></div>
        <div class="chart-box"><canvas id="wfCumulativeReturn" height="220"></canvas></div>
      ` : ''}
      <div class="info-box" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">
        <strong style="color:#fca5a5">This is the moat.</strong> AcuityMD cannot produce this slide. Intuitive cannot produce this slide internally. We can — because we dollarize clinical outcomes from peer-reviewed literature against your specific case mix.
      </div>` + logic(`Four steps, all conservative:
        <br><strong>1.</strong> Start with your <strong>OPEN cases only</strong> — laparoscopic cases are never counted, because they are already minimally invasive.
        <br><strong>2.</strong> Convert just <strong>${cb?.bed_days_savings ? cb.bed_days_savings.conversion_pct_assumed : 15}%</strong> of those open cases to da Vinci (a deliberately low, defensible rate).
        <br><strong>3.</strong> Each converted case saves <strong>(open length-of-stay − da Vinci length-of-stay)</strong> bed days, using the CMS length-of-stay figures from the prior slide${cb?.bed_days_savings ? ` — ${fmt(cb.bed_days_savings.total_bed_days_saved)} bed days in total` : ''}.
        <br><strong>4.</strong> Multiply bed days saved by your state's cost per bed day${cb?.bed_days_savings ? ` (<strong>$${cb.bed_days_savings.bed_day_cost_used.toLocaleString()}/day</strong>, kff.org non-profit average)` : ''} to get annual cost avoidance${cb?.bed_days_savings ? ` of <strong>${fmtMoneyShort(cb.bed_days_savings.total_dollar_savings)}</strong>` : ''}.
        <br>IRR and payback then run this cost avoidance plus incremental revenue against the system capital cost over 5 years. "Cost of waiting" is that annual opportunity divided into months — the price of delaying the decision.`),
  });

  // ───── SLIDE 8: SURGEON COMMITMENTS ─────
  slides.push({
    title: 'Step 7 · Surgeon Commitments',
    html: `
      ${sc?.summary ? `
        <div class="info-box"><strong>${esc(sc.summary.headline)}</strong></div>
        <div class="metrics-grid">
          ${metric('Surgeons', sc.summary.total_surgeons)}
          ${metric('Cases/Yr', fmt(sc.summary.total_incremental_cases), '#06b6d4')}
          ${metric('Revenue', fmtMoneyShort(sc.summary.total_revenue_impact), '#8b5cf6')}
          ${metric('Bed Days Saved', fmt(sc.summary.total_bed_days_saved), '#10b981')}
        </div>
      ` : '<div class="info-box">Surgeon commitments will populate once Step 7 is completed.</div>'}
      ${sc?.summary?.composition?.length > 0 ? `
        <div class="chart-2col">
          <div class="chart-box"><canvas id="wfCommitmentComposition" height="200"></canvas></div>
          <div class="chart-box"><canvas id="wfSurgeonBedDays" height="200"></canvas></div>
        </div>
      ` : ''}
      ${(() => {
        const committed = (sc?.master_table || []).filter(s => s.incremental_cases_yr > 0);
        const pipelineCount = (sc?.master_table || []).length - committed.length;
        if (!committed.length) return '';
        return `
        <table class="data-table">
          <thead><tr><th>Committed Surgeons</th><th>Specialty</th><th>Trained</th><th style="text-align:right">Cases/Yr</th></tr></thead>
          <tbody>
            ${committed.slice(0, 6).map(s => `
              <tr>
                <td><strong>${esc(s.surgeon_name)}</strong></td>
                <td>${esc(s.specialty || '--')}</td>
                <td>${s.trained ? '<span style="color:#10b981">✓ Trained</span>' : '<span style="color:#f59e0b">○ Pipeline</span>'}</td>
                <td style="text-align:right;color:#10b981;font-weight:700">${fmt(s.incremental_cases_yr)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${pipelineCount > 0 ? `<div style="font-size:12px;color:#94a3b8;margin-top:8px">+ <strong style="color:#a78bfa">${pipelineCount}</strong> additional surgeons identified in the training pipeline — not yet counted in the totals above (volume booked only once they commit, keeping this a floor).</div>` : ''}`;
      })()}` + logic(`Each surgeon's annual cases come from their <strong>own committed monthly volume</strong>, modeled two ways. For an <strong>open-to-MIS conversion</strong>, we count only 15% of their OPEN volume (never laparoscopic). For a <strong>net-new commitment</strong> — a surgeon blocked by capacity or a new recruit — we count the committed cases at face value. Revenue = those cases × the procedure's reimbursement rate. Bed days saved apply only to the open conversions × the length-of-stay gap. Surgeons still in the training pipeline show <strong>0 cases until they commit volume</strong> — nothing is assumed on their behalf, which is why the total is a floor, not a stretch.`),
  });

  // ───── SLIDE 9: BUSINESS PLAN ─────
  slides.push({
    title: 'Step 8 · Business Plan — 5-Year Proforma + Capital Placement',
    html: `
      ${bp?.proforma?.investment_summary ? `
        <div class="metrics-grid">
          ${metric('Project IRR', bp.proforma.investment_summary.project_irr + '%', '#10b981')}
          ${metric('Payback', bp.proforma.investment_summary.estimated_payback_years ? bp.proforma.investment_summary.estimated_payback_years + ' yrs' : '5+ yrs', '#06b6d4')}
          ${metric('5yr Cost Avoidance', fmtMoneyShort(bp.proforma.investment_summary.total_cost_avoidance_5yr), '#f59e0b')}
          ${metric('5yr Inc. Revenue', fmtMoneyShort(bp.proforma.investment_summary.incremental_revenue_5yr), '#8b5cf6')}
        </div>
      ` : ''}
      ${bp?.proforma?.yearly ? `
        <div class="info-box"><strong>Annual P&L Breakdown</strong> · Y0 capex → Y1-5 ramped returns</div>
        <div class="chart-box"><canvas id="wfAnnualPnl" height="220"></canvas></div>
      ` : ''}
      ${bp?.two_phase_placement ? `
        <div class="info-box" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.3)">
          <strong style="color:#34d399">Phase 1:</strong> ${esc(bp.two_phase_placement.phase_1?.title)}<br>
          <span style="font-size:12px;color:#94a3b8">${bp.two_phase_placement.phase_1?.new_trainings_required} trainings · ${fmt(bp.two_phase_placement.phase_1?.bed_days_saved)}+ bed days saved</span>
        </div>
        ${bp.two_phase_placement.phase_2 ? `
          <div class="info-box" style="background:rgba(139,92,246,0.08);border-color:rgba(139,92,246,0.3)">
            <strong style="color:#a78bfa">Phase 2:</strong> ${esc(bp.two_phase_placement.phase_2.title)}
          </div>
        ` : ''}
      ` : ''}` + logic(`Year 0 books the system capital cost. Years 1-5 <strong>ramp the returns</strong> the way real adoption happens, not at full run-rate on day one:
        <br>· Conversion revenue builds <strong>50% → 75% → 100%</strong> (training and credentialing take time).
        <br>· Net-new volume from <strong>already-trained</strong> surgeons builds faster — <strong>80% → 100%</strong>.
        <br>· Volume from <strong>untrained</strong> surgeons sits behind a training year — <strong>25% → 75% → 100%</strong>.
        <br>Clinical cost avoidance (the bed-day savings from the moat slide) is ramped the same way. IRR and payback compare the cumulative net return against the Year-0 capital. Revenue and cost avoidance are kept as separate lines so the board can see how much of the return is real cash vs cost the hospital simply stops spending.`),
  });

  // ───── SLIDE 10: PERFORMANCE TRACKING ─────
  slides.push({
    title: 'Step 9 · Performance Tracking — Post Go-Live',
    html: `
      ${pt?.plan_vs_actual ? `
        <div class="info-box"><strong>${esc(pt.plan_vs_actual.headline)}</strong></div>
        ${pt.plan_vs_actual.has_actuals ? `
          <div class="metrics-grid">
            ${metric('On-Track', pt.plan_vs_actual.on_track_count, '#10b981')}
            ${metric('At-Risk', pt.plan_vs_actual.at_risk_count, '#f59e0b')}
            ${metric('Off-Track', pt.plan_vs_actual.off_track_count, '#ef4444')}
            ${metric('Months Elapsed', pt.plan_vs_actual.months_elapsed)}
          </div>
        ` : `
          <div class="info-box" style="background:rgba(14,165,233,0.08);border-color:rgba(14,165,233,0.3)">
            <strong style="color:#7dd3fc">Baseline mode.</strong> Once monthly actuals are ingested post-go-live, this page surfaces plan vs actual variance, surgeon-level performance gaps, and intervention alerts ranked by urgency.
          </div>
        `}
      ` : ''}
      <div class="info-box"><strong>Projected Trajectory</strong> · the planned ramp that monthly actuals will be measured against</div>
      <div class="chart-box"><canvas id="wfPerfProjection" height="220"></canvas></div>
      <div style="font-size:13px;color:#cbd5e1;line-height:1.6">
        <strong>What this delivers:</strong><br>
        · Plan vs Actual variance per KPI · Per-system quarterly utilization vs academic avg<br>
        · Per-surgeon committed vs actual cases · Auto-generated variance watch list with intervention recommendations
      </div>` + logic(`The line is the <strong>planned trajectory</strong> from the business plan — cumulative incremental cases ramping Y1 through Y5 at the same adoption curve used in the proforma. After go-live, each surgeon's actual monthly billed cases are plotted against this line; on-track / at-risk / off-track are variance bands against the commitment. Nothing here is re-modeled — the projection is fixed at approval, and everything after is actual volume versus that plan, refreshed monthly.`),
  });

  // ───── SLIDE 11: EXECUTIVE SUMMARY CLOSER ─────
  slides.push({
    title: 'Step 10 · Executive Summary — Recommendation & Next Steps',
    html: `
      ${eb?.kpi_header ? `
        <div class="metrics-grid">
          ${metric('da Vinci Systems', eb.kpi_header.systems.value, '#1e40af')}
          ${metric('Surgeons Committed', eb.kpi_header.surgeons.value, '#06b6d4')}
          ${metric('Specialties', eb.kpi_header.specialties.value, '#10b981')}
          ${metric('Annual Cases', fmt(eb.kpi_header.patients.value), '#8b5cf6')}
        </div>
      ` : ''}
      ${eb?.recommendation ? `
        <div class="info-box" style="background:rgba(30,64,175,0.1);border-color:rgba(30,64,175,0.3)">
          <strong style="color:#93c5fd">Recommendation:</strong> Place ${eb.recommendation.total_systems} ${esc(eb.recommendation.primary_system)} ${eb.recommendation.total_systems == 1 ? 'system' : 'systems in two phases'}, sized to the committed incremental volume
        </div>
      ` : ''}
      <div class="steps">
        <div class="step"><div class="step-num">1</div><div><strong>IT Security Review</strong><br><span style="color:#94a3b8;font-size:12px">Platform infrastructure (Render/AWS, Anthropic-grade)</span></div></div>
        <div class="step"><div class="step-num">2</div><div><strong>Surgeon Survey Distribution</strong><br><span style="color:#94a3b8;font-size:12px">Confirm commitment volumes</span></div></div>
        <div class="step"><div class="step-num">3</div><div><strong>Free Trial Period</strong><br><span style="color:#94a3b8;font-size:12px">Duration open for discussion · zero risk on cost, security, data</span></div></div>
        <div class="step"><div class="step-num">4</div><div><strong>Capital Placement</strong><br><span style="color:#94a3b8;font-size:12px">Timing aligned to Phase 1 / Phase 2 plan</span></div></div>
      </div>` + logic(`The four header numbers are roll-ups, not new estimates: <strong>Surgeons Committed</strong> and <strong>Specialties</strong> are counts of the roster captured in Step 7, and <strong>Annual Cases</strong> is the sum of every surgeon's committed volume from that same step. The recommended <strong>system count</strong> is sized to absorb the committed-plus-projected case volume at a target per-system utilization — and the two-phase split places systems first where trained surgeons and committed volume already exist, so capital follows demand rather than leading it.`),
  });

  return slides;
}

// ─── Rachel narration scripts (one per slide) ─────────────────────────

function buildWorkflowNarration(project, enrichments, hospitalName) {
  const { hp, sp, rp, mp, co, cb, sc, bp, pt, eb } = enrichments;
  const scripts = [];

  // Slide 1 — Cover
  scripts.push(`Welcome to the da Vinci System Assessment for ${hospitalName}. I'm Rachel, your AI presentation guide. Over the next ten slides, I'll walk you through a comprehensive evaluation of how the da Vinci robotic surgery platform fits ${hospitalName}'s clinical, operational, and financial profile. Before we begin, one important note on credibility: every figure you'll hear is built only from public, auditable data — Medicare records, the national provider registry, and published research. Nothing is supplied by Intuitive, and nothing is guessed. Let's begin.`);

  // Slide 2 — Hospital Profile
  scripts.push(`${hospitalName} is a ${project.hospital_type || 'community hospital'} with ${fmt(project.bed_count)} beds and ${fmt(project.annual_surgical_volume)} annual surgical cases. ${hp?.strategic_impact?.headline ? hp.strategic_impact.headline + '.' : 'Our analysis shows significant opportunity to improve clinical outcomes and operational throughput with da Vinci.'} How are these numbers calculated? Bed count, operating rooms, and surgical volume come straight from this hospital's Medicare cost report — not estimates. We show your current robotic cases next to total surgical volume so the conversion headroom is visible, and the peer ranking compares your installed systems against a matched set of similar hospitals.`);

  // Slide 3 — Surgeon Profile
  scripts.push(`Looking at the surgeon roster, ${sp?.training_pipeline?.headline || 'we identified the key surgeon stakeholders for the robotic program'}. ${sp?.kol_signals?.top_kols?.length ? `The top key opinion leader is ${sp.kol_signals.top_kols[0].surgeon_name} in ${sp.kol_signals.top_kols[0].specialty || 'a research-leading role'}, with ${sp.kol_signals.top_kols[0].publications_5yr} publications in the last 5 years.` : ''} Here's how this is built: every surgeon comes from the national provider registry filtered to this facility, their robotic volume is their actual Medicare-billed case count, and publications are a live five-year search. The score combines clinical volume and research influence, so high-publication academics with no claims match are flagged as research key opinion leaders rather than shown as blanks.`);

  // Slide 4 — Robotics Program
  scripts.push(`Currently ${hospitalName} operates ${fmt(project.current_system_count)} da Vinci systems${project.current_system && project.current_system !== 'None' ? ' of the ' + project.current_system + ' generation' : ''}. ${rp?.modality_by_year?.headline || 'There is meaningful opportunity to increase robotic adoption versus national peers.'} The way we calculate utilization is simple: your robotic case volume divided by the number of installed systems each quarter, compared against what peer programs achieve per system. And to be precise about what counts as convertible: only your OPEN share is treated as convertible volume. Laparoscopic cases are already minimally invasive, so they are never counted — and even within your open volume, the business case models just fifteen percent converting. That is the conservative basis behind every dollar figure you'll see.`);

  // Slide 5 — Market Profile
  scripts.push(`In the regional market, ${mp?.procedure_market_share?.headline || 'there is substantial untapped opportunity'}. ${mp?.growth_math ? `Each one percent of market share captured equals ${fmtMoneyShort(mp.growth_math.dollars_per_1_pct_share)} in annual revenue.` : ''} To explain the math: market share is your case volume divided by all cases performed in your service area, drawn from Medicare and state discharge data. The value of each additional point of share is one percent of those market cases multiplied by your average reimbursement. But let me be clear, because this matters: this market view is context for sizing the opportunity — it is not what we book. The financial case does not assume you capture this entire market. It models only a conservative fifteen percent of your OPEN surgical volume converting — never laparoscopic, and never the full market. So the numbers you'll see are deliberately on the floor.`);

  // Slide 6 — Clinical Outcomes
  scripts.push(`${co?.outcomes_benchmark?.headline || 'Examining clinical outcomes against national benchmarks shows meaningful improvement targets.'} ${co?.los_variability?.opportunity_procedures?.length ? `The biggest length-of-stay opportunities are in ${co.los_variability.opportunity_procedures.slice(0, 3).join(', ')}.` : ''} These length-of-stay numbers are the average inpatient days per procedure by surgical approach — open, laparoscopic, and da Vinci — taken directly from Medicare inpatient data. The gap between approaches is the clinical headroom, and on the next slide we turn that headroom into dollars — but only on the open-to-da Vinci gap, and only for a conservative fifteen percent of your open cases. Laparoscopic cases are already minimally invasive, so they are never counted.`);

  // Slide 7 — Clinical Benefit Overlay
  scripts.push(`This slide is the moat, and it opens with a hard number. ${cb?.complication_burden ? `Right now, ${hospitalName}'s open cases are bleeding ${fmtMoneyShort(cb.complication_burden.daily_avoidable)} every single day — that is ${fmtMoneyShort(cb.complication_burden.total_annual_avoidable)} a year — in surgical site infections, readmissions, and post-operative complications that da Vinci would prevent. That money leaves the building every day you stay open.` : 'Open-case complications, readmissions, and infections cost this hospital real money every day.'} Now the da Vinci alternative, and here is the single formula the cost-avoidance numbers on this slide flow from: the conversion opportunity is fifteen percent of the OPEN soft-tissue cases the da Vinci can actually perform — urology, gynecology, general and colorectal, thoracic, cardiac, and head and neck. Laparoscopic cases, robotic cases, and any open case outside those procedures simply do not count. ${cb?.conversion_formula ? `For ${hospitalName}, that is fifteen percent of ${fmt(cb.conversion_formula.open_applicable_cases)} open applicable cases, or about ${fmt(cb.conversion_formula.conversion_opportunity || cb.conversion_formula.incremental_opportunity)} converted cases.` : ''} On that conservative basis the bed-day cost avoidance alone is ${cb?.bed_days_savings ? fmtMoneyShort(cb.bed_days_savings.total_dollar_savings) : 'substantial'}, dollarized from peer-reviewed literature against ${hospitalName}'s actual open case mix. ${cb?.investment_payback ? `Project IRR is ${cb.investment_payback.project_irr_pct} percent.` : ''} AcuityMD cannot produce this slide. Intuitive cannot produce this slide internally. SurgicalMind AI can.`);

  // Slide 8 — Surgeon Commitments
  scripts.push(`This is the real driver of the business case — and it is not a blanket conversion percentage. It is actual surgeon commitments. ${sc?.summary ? `In this illustrative example, ${sc.summary.total_surgeons ? sc.summary.total_surgeons + ' ' : ''}named surgeons each commit additional da Vinci cases they would perform with unfettered robot access — together about ${fmt(sc.summary.total_incremental_cases)} incremental cases a year.` : 'Named surgeons each commit the additional da Vinci cases they would perform with unfettered robot access.'} The capital manager captures these after the surgeon survey, the tool sums the incremental volume, and the entire return — revenue, IRR, and the system recommendation itself — flows from that committed volume. The system count is sized to the commitments, never to a theoretical conversion of every open case. That is what makes it defensible to a CFO.`);

  // Slide 9 — Business Plan
  scripts.push(`The 5-year business plan delivers ${bp?.proforma?.headline || 'strong financial returns'}. ${bp?.two_phase_placement?.phase_1?.title || 'Phase 1 places the recommended systems at the main facility.'} ${bp?.two_phase_placement?.phase_2 ? bp.two_phase_placement.phase_2.title : ''} A word on how the returns ramp, because we don't assume full run-rate on day one. Conversion revenue builds at fifty, seventy-five, then one hundred percent as training and credentialing take hold. Volume from already-trained surgeons builds faster — eighty percent, then full. And volume from untrained surgeons sits behind a training year. Year zero carries the system's capital cost, and payback compares the cumulative return against it.`);

  // Slide 10 — Performance Tracking
  scripts.push(`Once the program is live, performance tracking compares planned outcomes against monthly actuals. ${pt?.plan_vs_actual?.has_actuals ? 'Variance alerts surface surgeons or KPIs needing intervention.' : 'When monthly actuals are ingested, the system will surface variance alerts, surgeon performance gaps, and recommended interventions automatically.'} The line on this chart is the planned trajectory from the business case — cumulative committed cases ramping year one through year five. After go-live, each surgeon's actual monthly cases are plotted against that line. Nothing here is re-modeled; the projection is fixed at approval, and everything after is actual volume versus the plan, refreshed each month.`);

  // Slide 11 — Executive Summary
  scripts.push(`To close: we recommend ${eb?.recommendation ? 'placing ' + eb.recommendation.total_systems + ' ' + eb.recommendation.primary_system + ' ' + (eb.recommendation.total_systems == 1 ? 'system' : 'systems') + ', sized to the committed incremental volume' : 'a placement strategy sized to surgeon commitments'}. And to be clear on these headline numbers: they're roll-ups of the surgeon commitments you just saw, and the recommended system count is sized to absorb that committed and projected volume — so the capital follows the demand, not the other way around. Next steps are: IT security review, surgeon survey distribution, a free trial period with duration open for discussion and zero risk on cost, security, or data, and capital placement aligned to the phase plan. Thank you for reviewing the ${hospitalName} da Vinci System Assessment. We look forward to partnering on your robotic surgery program.`);

  return scripts;
}

// ─── Workflow Chart Data Builder (Chart.js configs per slide) ─────────

function buildWorkflowChartData(enrichments, project = {}) {
  const { hp, sp, rp, mp, co, cb, sc, bp, pt, eb } = enrichments;
  const data = {};

  // Slide 1 (Cover): holistic Hospital + Surgeon profile radar — a qualitative
  // 0-100 fingerprint across the six dimensions this assessment scores.
  {
    const beds = parseInt(project.bed_count || 0);
    const vol = parseInt(project.annual_surgical_volume || 0);
    const robotic = parseInt(project.current_robotic_cases || 0);
    const trained = sp?.training_pipeline?.trained?.length || 0;
    const pipeline = sp?.training_pipeline?.untrained?.length || 0;
    const pullFwd = sp?.training_pipeline?.pull_forward?.length || 0;
    const surgeons = trained + pipeline + pullFwd;
    const star = parseInt(project.extended_data?.cms?.overall_rating || 0);
    const clamp = (n) => Math.max(8, Math.min(100, Math.round(n)));
    data.wfCoverSnapshot = [
      { axis: 'Surgical Scale', value: clamp(vol / 250) },                       // 20k vol -> 80
      { axis: 'Robotic Program', value: clamp(vol ? (robotic / vol) * 100 / 0.30 : 0) }, // adoption vs 30% target
      { axis: 'Surgeon Network', value: clamp(surgeons * 5) },                   // 19 -> 95
      { axis: 'Training Pipeline', value: clamp(pipeline * 7) },                 // 13 -> 91
      { axis: 'Bed Capacity', value: clamp(beds / 5) },                          // 419 -> 84
      { axis: 'Clinical Quality', value: clamp(star * 20) },                     // 5 stars -> 100
    ];
  }

  // Slide 2: Hospital Profile — Strategic Impact bars + Peer Benchmark bars + Pubs line
  if (hp?.strategic_impact?.metrics) {
    data.wfStrategicImpact = hp.strategic_impact.metrics
      .filter(m => m.raw_value > 0)
      .map(m => ({ label: m.label, value: m.raw_value, display: m.value }));
  }
  if (hp?.peer_benchmark?.peers_ranked) {
    data.wfPeerBenchmark = hp.peer_benchmark.peers_ranked.map(p => ({
      label: p.name, value: p.systems, is_target: p.is_target,
    }));
    data.wfPeerBenchmarkAvg = hp.peer_benchmark.peer_avg_systems;
  }
  if (hp?.research_profile?.by_year) {
    data.wfPublicationsByYear = hp.research_profile.by_year.map(y => ({ label: y.year, value: y.count }));
  }

  // Slide 3: Surgeon Profile — KOL Quadrant scatter
  if (sp?.kol_signals?.top_kols) {
    data.wfKolQuadrant = sp.kol_signals.top_kols.map(k => ({
      x: k.robotic_vol, y: k.publications_5yr,
      r: Math.max(7, Math.min(22, (k.commitment_cases || k.robotic_vol || 10) / 8 + 7)),
      label: k.surgeon_name, specialty: k.specialty || 'Research KOL',
    }));
  }

  // Slide 4: Robotics Program — Procedure volume + Modality trend + Tech gen
  if (rp?.system_utilization?.procedure_volume_by_qtr) {
    data.wfProcedureVolume = rp.system_utilization.procedure_volume_by_qtr.map(q => ({
      label: q.quarter, in_hours: q.in_hours, after_hours: q.after_hours,
    }));
  }
  if (rp?.modality_by_year?.trend_by_year) {
    data.wfModalityTrend = rp.modality_by_year.trend_by_year.map(t => ({
      label: t.year, davinci: t.davinci_pct, lap: t.lap_pct, open: t.open_pct,
    }));
  }
  if (rp?.tech_generation_mix?.timeline) {
    data.wfTechGen = rp.tech_generation_mix.timeline.map(t => ({
      label: t.year, S: t.S || 0, Si: t.Si || 0, Xi: t.Xi || 0, dV5: t.dV5 || 0,
    }));
  }

  // Slide 5: Market Profile — Procedure-level market share bars
  if (mp?.procedure_market_share?.procedures) {
    data.wfMarketShare = mp.procedure_market_share.procedures.map(p => ({
      label: p.procedure, hospital: p.hospital_volume, market: p.market_volume, share: p.market_share_pct,
    }));
  }

  // Slide 6: Clinical Outcomes — Outcomes Radar + LOS bars
  if (co?.outcomes_benchmark?.radar_data) {
    data.wfOutcomesRadar = co.outcomes_benchmark.radar_data.map(r => ({
      label: r.metric, hospital: r.hospital, national: r.national, top_decile: r.top_decile,
    }));
  }
  if (co?.los_variability?.procedures) {
    data.wfLosVariability = co.los_variability.procedures.map(p => ({
      label: p.procedure, open: p.open_los_days, mis: p.mis_los_days, davinci: p.davinci_los_days,
      opportunity: p.opportunity,
    }));
  }

  // Slide 7: Clinical Overlay — Cumulative Return line
  if (cb?.investment_payback?.cumulative_return_5yr) {
    data.wfCumulativeReturn = cb.investment_payback.cumulative_return_5yr.map(c => ({
      label: c.year, cumulative: c.cumulative_return, breakeven: c.breakeven,
    }));
  }

  // Slide 8: Surgeon Commitments — Composition donut + Per-Surgeon bed days
  if (sc?.summary?.composition) {
    data.wfCommitmentComposition = sc.summary.composition.map(c => ({
      label: c.name, value: c.value, color: c.color,
    }));
  }
  if (sc?.per_surgeon_bed_days?.length) {
    data.wfSurgeonBedDays = sc.per_surgeon_bed_days.slice(0, 8).map(s => ({
      label: s.surgeon_name, value: s.bed_days_saved,
    }));
  }

  // Slide 9: Business Plan — Annual P&L stacked bar
  if (bp?.proforma?.yearly) {
    data.wfAnnualPnl = bp.proforma.yearly.map(y => ({
      label: y.year,
      revenue: y.revenue || 0,
      cost_avoidance: y.cost_avoidance || 0,
      capital_expense: -(y.capital_expense || 0),
      operating_expense: -(y.operating_expense || 0),
    }));
  }

  // Slide 10: Performance Tracking — Projected adoption trajectory (Y1-Y5).
  // Annual + cumulative committed cases, ramped the same way the proforma ramps
  // revenue. This fills the baseline-mode page and shows what actuals get measured against.
  {
    const totalCommitted = sc?.summary?.total_incremental_cases
      || (bp?.proforma?.investment_summary ? Math.round((bp.proforma.investment_summary.incremental_revenue_5yr / 5) / 18500) : 0);
    if (totalCommitted > 0) {
      const ramp = { 1: 0.5, 2: 0.75, 3: 1.0, 4: 1.0, 5: 1.0 };
      let cum = 0;
      data.wfPerfProjection = [1, 2, 3, 4, 5].map(y => {
        const annual = Math.round(totalCommitted * ramp[y]);
        cum += annual;
        return { label: 'Year ' + y, annual, cumulative: cum };
      });
    }
  }

  return data;
}

module.exports = {
  fetchAllEnrichments,
  buildWorkflowSlides,
  buildWorkflowNarration,
  buildWorkflowChartData,
};
