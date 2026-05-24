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

// ─── Fetch all enrichment data in parallel ────────────────────────────

async function fetchAllEnrichments(projectId, models) {
  const [hp, sp, rp, mp, co, cb, sc, bp, pt, eb] = await Promise.all([
    hospitalProfileService.buildHospitalProfileEnrichment({ projectId, models }).catch(() => null),
    surgeonProfileService.buildSurgeonProfileEnrichment({ projectId, models }).catch(() => null),
    roboticsProgramService.buildRoboticsProgramEnrichment({ projectId, models }).catch(() => null),
    marketProfileService.buildMarketProfileEnrichment({ projectId, models }).catch(() => null),
    clinicalOutcomesService.buildClinicalOutcomesEnrichment({ projectId, models }).catch(() => null),
    clinicalOverlayService.buildClinicalOverlayEnrichment({ projectId, models, conversionPct: 50 }).catch(() => null),
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
  slides.push({
    title: `${hospitalName} — da Vinci System Assessment`,
    html: `
      <div style="text-align:center;padding:20px 0">
        <h3 style="font-size:32px;color:#f8fafc;margin-bottom:8px">${esc(hospitalName)}</h3>
        <p style="color:#94a3b8;font-size:18px;margin-bottom:30px">Strategic Alignment Opportunity</p>
        <div class="info-box" style="text-align:center;max-width:500px;margin:0 auto">
          Prepared by <strong>SurgicalMind AI · Digit2AI</strong><br>
          ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
          <span style="font-size:10px;color:#64748b;margin-top:8px;display:inline-block">CONFIDENTIAL · For executive review</span>
        </div>
      </div>`,
  });

  // ───── SLIDE 2: HOSPITAL PROFILE ─────
  slides.push({
    title: 'Step 1 · Hospital Profile',
    html: `
      <div class="metrics-grid">
        ${metric('Total Beds', fmt(project.bed_count))}
        ${metric('Annual Surgical Vol', fmt(project.annual_surgical_volume))}
        ${metric('OR Count', fmt(project.total_or_count))}
        ${metric('Operating Margin', project.operating_margin_pct ? project.operating_margin_pct + '%' : '--')}
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
      ` : ''}`,
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
          <thead><tr><th>Top KOLs</th><th>Specialty</th><th style="text-align:right">Robotic Vol</th><th style="text-align:right">Publications</th><th style="text-align:right">Score</th></tr></thead>
          <tbody>
            ${sp.kol_signals.top_kols.map(k => `
              <tr>
                <td><strong>${esc(k.surgeon_name)}</strong></td>
                <td>${esc(k.specialty || '--')}</td>
                <td style="text-align:right;color:#06b6d4">${fmt(k.robotic_vol)}</td>
                <td style="text-align:right;color:#8b5cf6">${k.publications_5yr}</td>
                <td style="text-align:right;font-weight:700">${fmt(k.composite_score)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}`,
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
      ` : ''}`,
  });

  // ───── SLIDE 5: MARKET PROFILE ─────
  slides.push({
    title: 'Step 4 · Market Profile — Share + Remaining Opportunity',
    html: `
      ${mp?.procedure_market_share ? `
        <div class="metrics-grid">
          ${metric('Current Mkt Share', mp.procedure_market_share.blended_market_share_pct + '%', '#06b6d4')}
          ${metric('Hospital Volume', fmt(mp.procedure_market_share.total_hospital_volume))}
          ${metric('Remaining Opportunity', fmt(mp.procedure_market_share.total_remaining_opportunity), '#ef4444')}
          ${mp?.growth_math ? metric('+1% Share Value', fmtMoneyShort(mp.growth_math.dollars_per_1_pct_share), '#10b981') : ''}
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
      ` : ''}`,
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
      ` : ''}`,
  });

  // ───── SLIDE 7: CLINICAL BENEFIT OVERLAY (THE MOAT) ─────
  slides.push({
    title: 'Step 6 · Clinical Benefit Overlay — THE MOAT',
    html: `
      ${cb?.bed_days_savings ? `
        <div style="background:linear-gradient(135deg,#064e3b 0%,#0c4a6e 100%);border:2px solid #10b981;border-radius:12px;padding:24px;text-align:center;margin:14px 0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#34d399;font-weight:700">Annual Cost Avoidance</div>
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
      </div>`,
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="chart-box"><canvas id="wfCommitmentComposition" height="200"></canvas></div>
          <div class="chart-box"><canvas id="wfSurgeonBedDays" height="200"></canvas></div>
        </div>
      ` : ''}
      ${sc?.master_table?.length > 0 ? `
        <table class="data-table">
          <thead><tr><th>Top Surgeons</th><th>Specialty</th><th>Trained</th><th style="text-align:right">Cases/Yr</th></tr></thead>
          <tbody>
            ${sc.master_table.slice(0, 6).map(s => `
              <tr>
                <td><strong>${esc(s.surgeon_name)}</strong></td>
                <td>${esc(s.specialty || '--')}</td>
                <td>${s.trained ? '<span style="color:#10b981">✓ Trained</span>' : '<span style="color:#f59e0b">○ Pipeline</span>'}</td>
                <td style="text-align:right;color:#10b981;font-weight:700">${fmt(s.incremental_cases_yr)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}`,
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
      ` : ''}`,
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
      <div style="font-size:13px;color:#cbd5e1;line-height:1.6">
        <strong>What this delivers:</strong><br>
        · Plan vs Actual variance per KPI · Per-system quarterly utilization vs academic avg<br>
        · Per-surgeon committed vs actual cases · Auto-generated variance watch list with intervention recommendations
      </div>`,
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
          <strong style="color:#93c5fd">Recommendation:</strong> Place ${eb.recommendation.total_systems} ${esc(eb.recommendation.primary_system)} systems in two phases
        </div>
      ` : ''}
      <div class="steps">
        <div class="step"><div class="step-num">1</div><div><strong>IT Security Review</strong><br><span style="color:#94a3b8;font-size:12px">Platform infrastructure (Render/AWS, Anthropic-grade)</span></div></div>
        <div class="step"><div class="step-num">2</div><div><strong>Surgeon Survey Distribution</strong><br><span style="color:#94a3b8;font-size:12px">Confirm commitment volumes</span></div></div>
        <div class="step"><div class="step-num">3</div><div><strong>Free Trial Period (2-6 months)</strong><br><span style="color:#94a3b8;font-size:12px">Zero risk on cost, security, data</span></div></div>
        <div class="step"><div class="step-num">4</div><div><strong>Capital Placement</strong><br><span style="color:#94a3b8;font-size:12px">Timing aligned to Phase 1 / Phase 2 plan</span></div></div>
      </div>`,
  });

  return slides;
}

// ─── Rachel narration scripts (one per slide) ─────────────────────────

function buildWorkflowNarration(project, enrichments, hospitalName) {
  const { hp, sp, rp, mp, co, cb, sc, bp, pt, eb } = enrichments;
  const scripts = [];

  // Slide 1 — Cover
  scripts.push(`Welcome to the da Vinci System Assessment for ${hospitalName}. I'm Rachel, your AI presentation guide. Over the next ten slides, I'll walk you through a comprehensive evaluation of how the da Vinci robotic surgery platform fits ${hospitalName}'s clinical, operational, and financial profile. Let's begin.`);

  // Slide 2 — Hospital Profile
  scripts.push(`${hospitalName} is a ${project.hospital_type || 'community hospital'} with ${fmt(project.bed_count)} beds and ${fmt(project.annual_surgical_volume)} annual surgical cases. ${hp?.strategic_impact?.headline ? hp.strategic_impact.headline + '.' : 'Our analysis shows significant opportunity to improve clinical outcomes and operational throughput with da Vinci.'}`);

  // Slide 3 — Surgeon Profile
  scripts.push(`Looking at the surgeon roster, ${sp?.training_pipeline?.headline || 'we identified the key surgeon stakeholders for the robotic program'}. ${sp?.kol_signals?.top_kols?.length ? `The top key opinion leader is ${sp.kol_signals.top_kols[0].surgeon_name} in ${sp.kol_signals.top_kols[0].specialty || 'their specialty'}, with ${sp.kol_signals.top_kols[0].publications_5yr} publications in the last 5 years.` : ''}`);

  // Slide 4 — Robotics Program
  scripts.push(`Currently ${hospitalName} operates ${fmt(project.current_system_count)} da Vinci systems${project.current_system && project.current_system !== 'None' ? ' of the ' + project.current_system + ' generation' : ''}. ${rp?.modality_by_year?.headline || 'There is meaningful opportunity to increase robotic adoption versus national peers.'}`);

  // Slide 5 — Market Profile
  scripts.push(`In the regional market, ${mp?.procedure_market_share?.headline || 'there is substantial untapped opportunity'}. ${mp?.growth_math ? `Each one percent of market share captured equals ${fmtMoneyShort(mp.growth_math.dollars_per_1_pct_share)} in annual revenue.` : ''}`);

  // Slide 6 — Clinical Outcomes
  scripts.push(`${co?.outcomes_benchmark?.headline || 'Examining clinical outcomes against national benchmarks shows meaningful improvement targets.'} ${co?.los_variability?.opportunity_procedures?.length ? `The biggest length-of-stay opportunities are in ${co.los_variability.opportunity_procedures.slice(0, 3).join(', ')}.` : ''}`);

  // Slide 7 — Clinical Benefit Overlay
  scripts.push(`This slide is the moat. The annual cost avoidance opportunity is ${cb?.bed_days_savings ? fmtMoneyShort(cb.bed_days_savings.total_dollar_savings) : 'substantial'} — dollarized from peer-reviewed clinical literature applied to ${hospitalName}'s actual case mix. ${cb?.investment_payback ? `Project IRR is ${cb.investment_payback.project_irr_pct} percent with payback in ${cb.investment_payback.estimated_payback_years || '5 plus'} years.` : ''} ${cb?.cost_of_waiting ? `Every month of delay costs ${fmtMoneyShort(cb.cost_of_waiting.monthly_cost_of_waiting)}.` : ''} AcuityMD cannot produce this slide. Intuitive cannot produce this slide internally. SurgicalMind AI can.`);

  // Slide 8 — Surgeon Commitments
  scripts.push(`${sc?.summary?.headline || 'We have captured surgeon-level volume commitments across three categories: open-to-MIS conversion, pull-forward capacity, and the training pipeline.'} This is what makes our business case defensible to your CFO — actual surgeon commitments, not theoretical conversions.`);

  // Slide 9 — Business Plan
  scripts.push(`The 5-year business plan delivers ${bp?.proforma?.headline || 'strong financial returns'}. ${bp?.two_phase_placement?.phase_1?.title || 'Phase 1 places the recommended systems at the main facility.'} ${bp?.two_phase_placement?.phase_2 ? bp.two_phase_placement.phase_2.title : ''}`);

  // Slide 10 — Performance Tracking
  scripts.push(`Once the program is live, performance tracking compares planned outcomes against monthly actuals. ${pt?.plan_vs_actual?.has_actuals ? 'Variance alerts surface surgeons or KPIs needing intervention.' : 'When monthly actuals are ingested, the system will surface variance alerts, surgeon performance gaps, and recommended interventions automatically.'}`);

  // Slide 11 — Executive Summary
  scripts.push(`To close: we recommend ${eb?.recommendation ? 'placing ' + eb.recommendation.total_systems + ' ' + eb.recommendation.primary_system + ' systems in two phases' : 'a phased da Vinci placement strategy'}. Next steps are: IT security review, surgeon survey distribution, a free trial period of 2 to 6 months with zero risk on cost, security, or data, and capital placement aligned to the phase plan. Thank you for reviewing the ${hospitalName} da Vinci System Assessment. We look forward to partnering on your robotic surgery program.`);

  return scripts;
}

// ─── Workflow Chart Data Builder (Chart.js configs per slide) ─────────

function buildWorkflowChartData(enrichments) {
  const { hp, sp, rp, mp, co, cb, sc, bp, pt, eb } = enrichments;
  const data = {};

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
      x: k.robotic_vol, y: k.publications_5yr, r: Math.max(5, Math.min(20, k.commitment_cases / 5)),
      label: k.surgeon_name, specialty: k.specialty || '',
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

  return data;
}

module.exports = {
  fetchAllEnrichments,
  buildWorkflowSlides,
  buildWorkflowNarration,
  buildWorkflowChartData,
};
