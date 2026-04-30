import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'

const fmt = (n) => (n != null && !isNaN(n)) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '--'
const fmtMoney = (n) => (n != null && !isNaN(n)) ? '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '--'
const fmtMoneyK = (n) => (n != null && !isNaN(n)) ? '$' + Math.round(Number(n) / 1000).toLocaleString() + 'K' : '--'
const fmtPct = (n) => (n != null && !isNaN(n)) ? Number(n).toFixed(1) + '%' : '--'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '--'

function Section({ title, subtitle, children, breakBefore = true }) {
  return (
    <section className={`report-section ${breakBefore ? 'page-break-before' : ''} mb-10`}>
      <div className="border-b-2 border-slate-900 pb-3 mb-6">
        <h2 className="text-2xl font-serif font-bold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="border border-slate-300 rounded p-4 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Table({ columns, rows }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-slate-900 text-white">
          {columns.map((c, i) => (
            <th key={i} className="px-3 py-2 text-left font-semibold text-xs uppercase tracking-wider">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
            {r.map((cell, j) => (
              <td key={j} className="px-3 py-2 border-b border-slate-200 text-slate-800">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ReportPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const [data, setData] = useState({ project: null, results: null, plans: [], surveys: [], tracking: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    let cancelled = false

    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const [pRes, aRes, plansRes, surveysRes] = await Promise.all([
          api.getProject(id).catch(() => null),
          api.getResults(id).catch(() => null),
          api.listBusinessPlans(id).catch(() => ({ plans: [] })),
          api.listSurveys(id).catch(() => ({ surveys: [] })),
        ])
        if (cancelled) return

        const plans = plansRes?.plans || plansRes?.data || []
        const surveys = surveysRes?.surveys || surveysRes?.data || []

        const planDetails = await Promise.all(plans.map(async (p) => {
          const [full, surgeons, outcomes, comparison, exec] = await Promise.all([
            api.getBusinessPlan(p.id).catch(() => null),
            api.listSurgeons(p.id).catch(() => ({ surgeons: [] })),
            api.getClinicalOutcomes(p.id).catch(() => null),
            api.getComparison(p.id).catch(() => null),
            api.getExecutiveSummary(p.id).catch(() => null),
          ])
          return {
            ...p,
            full: full?.plan || full?.data || full,
            surgeons: surgeons?.surgeons || surgeons?.data || [],
            outcomes: outcomes?.outcomes || outcomes?.data || outcomes,
            comparison: comparison?.comparison || comparison?.data || comparison,
            exec: exec?.summary || exec?.data || exec,
          }
        }))

        const surveyDetails = await Promise.all(surveys.map(async (s) => {
          const responses = await api.getSurveyResponses(s.id).catch(() => ({ responses: [] }))
          return { ...s, responses: responses?.responses || responses?.data || [] }
        }))

        if (cancelled) return
        setData({
          project: pRes?.project || pRes?.data || pRes,
          results: aRes?.results || aRes?.data || aRes,
          plans: planDetails,
          surveys: surveyDetails,
        })
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load report data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected. Pick a hospital from the Dashboard.</div>
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-400">
          <svg className="animate-spin w-10 h-10 text-intuitive-500 mx-auto mb-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p>Compiling executive report...</p>
          <p className="text-xs text-slate-500 mt-1">Aggregating analysis, recommendations, business plans, surveys, and tracking</p>
        </div>
      </div>
    )
  }
  if (error) return <div className="p-10 text-red-400">Error loading report: {error}</div>

  const { project, results, plans, surveys } = data
  const p = project || {}
  const r = results || {}

  const pareto = r.procedure_pareto || {}
  const seasonality = r.monthly_seasonality || {}
  const weekday = r.weekday_distribution || {}
  const hourly = r.hourly_distribution || {}
  const designDay = r.design_day_analysis || {}
  const compat = r.robot_compatibility_matrix || {}
  const vol = r.volume_projection || {}
  const surgeon = r.surgeon_capacity || {}
  const infra = r.infrastructure_assessment || {}
  const roi = r.roi_calculation || {}
  const risk = r.risk_assessment || {}
  const match = r.model_matching || {}
  const primary = match.primary_recommendation || {}
  const financial = r.financial_deep_dive || {}
  const growth = r.growth_extrapolation || {}

  const yearlyProj = vol.yearly_projections || vol.projections || []
  const topProcs = pareto.top_procedures || []
  const months = seasonality.months || []
  const days = weekday.days || []
  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="report-root bg-white text-slate-900 min-h-screen">
      {/* Print CSS + professional report typography */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700;8..60,900&family=Inter:wght@400;500;600;700&display=swap');

        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; }
          .page-break-before { page-break-before: always; break-before: page; }
          .report-root { padding: 0 !important; }
          .report-page { padding: 0.5in 0.6in !important; max-width: 100% !important; }
          @page { size: letter portrait; margin: 0; }
          h1, h2, h3, h4 { color: #0f172a !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
        .report-root { font-family: 'Source Serif 4', 'Source Serif Pro', 'Charter', 'Cambria', Georgia, serif; font-feature-settings: "kern" 1, "liga" 1, "onum" 1; -webkit-font-smoothing: antialiased; }
        .report-root h1, .report-root h2, .report-root h3, .report-root h4, .report-root .font-serif {
          font-family: 'Source Serif 4', 'Source Serif Pro', 'Charter', 'Cambria', Georgia, serif;
          font-feature-settings: "kern" 1, "liga" 1, "lnum" 1;
          letter-spacing: -0.01em;
        }
        .report-root table, .report-root .font-sans,
        .report-root .text-xs, .report-root .text-sm,
        .report-root .text-\\[10px\\], .report-root .text-\\[11px\\] {
          font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
          font-feature-settings: "kern" 1, "liga" 1, "tnum" 1;
        }
      `}</style>

      {/* Toolbar (hidden in print) */}
      <div className="no-print sticky top-0 z-40 bg-slate-100 border-b border-slate-300 px-6 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900">Executive Report</div>
          <div className="text-xs text-slate-600">{p.hospital_name || 'Hospital'} -- prepared {reportDate}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="bg-slate-900 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded text-sm transition-all"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="report-page max-w-[8.5in] mx-auto px-12 py-12">

        {/* ─── COVER PAGE ─── */}
        <div className="cover-page text-center" style={{ minHeight: '9in', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: '1.2in', paddingBottom: '0.6in' }}>
          <div>
            <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" style={{ width: '200px', height: 'auto', margin: '0 auto' }} />
            <div className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-600 font-sans font-semibold">SurgicalMind AI</div>
            <div className="text-[10px] text-slate-500 mt-1 font-sans tracking-wider uppercase">Powered by Digit2AI</div>
          </div>

          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.4em] text-slate-500 mb-3">Executive Assessment</div>
            <h1 className="font-serif font-bold text-5xl text-slate-900 leading-tight">
              da Vinci System<br/>Placement Report
            </h1>
            <div className="mt-8 mb-2 h-px bg-slate-300 mx-auto" style={{ width: '40%' }}></div>
            <div className="text-2xl font-serif text-slate-700 mt-6">{p.hospital_name || 'Hospital'}</div>
            <div className="text-sm text-slate-500 mt-1">{p.hospital_type ? p.hospital_type.charAt(0).toUpperCase() + p.hospital_type.slice(1) : ''} {p.bed_count ? `-- ${fmt(p.bed_count)} beds` : ''}</div>
            <div className="text-sm text-slate-500">{p.state}{p.country ? `, ${p.country}` : ''}</div>
            {p.project_code && <div className="text-xs text-slate-400 mt-3">Project {p.project_code}</div>}
          </div>

          <div className="text-center text-xs text-slate-500">
            <div>Prepared {reportDate}</div>
            <div className="mt-1">Confidential -- For executive review only</div>
            <div className="mt-3 text-[10px] text-slate-400 max-w-md mx-auto">
              This document contains proprietary analysis and forward-looking projections. Distribution should be limited to authorized
              executive personnel of {p.hospital_name || 'the recipient hospital'} and Intuitive Surgical.
            </div>
          </div>
        </div>

        {/* ─── EXECUTIVE SUMMARY ─── */}
        <Section title="Executive Summary" subtitle="One-page overview for the CEO and CFO">
          <p className="text-sm text-slate-700 leading-relaxed mb-5">
            This report presents a data-driven assessment of robotic surgery system placement at <strong>{p.hospital_name || 'the hospital'}</strong>.
            It synthesizes operational analytics across {Object.keys(r).length || 'multiple'} dimensions, matches the optimal da Vinci system configuration,
            quantifies the financial impact, and consolidates surgeon commitments and execution tracking against the proforma. The findings recommend
            placement of <strong>da Vinci {primary.system || match.recommended_model || '--'}</strong> with a clinical and economic fit score of
            <strong> {Math.round(primary.score || match.fit_score || 0)}/100</strong>, projecting a 5-year ROI of
            <strong> {fmtPct(roi.five_year_roi_pct || financial.five_year_roi_pct)}</strong> over the assessment horizon.
          </p>

          <div className="grid grid-cols-4 gap-3 mb-5">
            <Stat label="Recommended System" value={primary.system || match.recommended_model || '--'} sub={`Fit ${Math.round(primary.score || match.fit_score || 0)}/100`} />
            <Stat label="Annual Robotic Volume" value={fmt(vol.design_year_cases || vol.year_3_cases || 0)} sub="Year 3 steady state" />
            <Stat label="5-Year ROI" value={fmtPct(roi.five_year_roi_pct || financial.five_year_roi_pct)} sub="On total program investment" />
            <Stat label="Risk Profile" value={(risk.overall_risk || 'n/a').toUpperCase()} sub={`${(risk.risk_factors || risk.factors || []).length} factors`} />
          </div>

          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="text-base font-serif font-bold text-slate-900 mb-2">Key Findings</h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                <li>Procedure concentration (Gini): <strong>{pareto.gini_coefficient?.toFixed?.(3) || pareto.gini || '--'}</strong> -- {pareto.concentration_class || 'mixed'} portfolio</li>
                <li>Design day (P75) capacity: <strong>{fmt((designDay.p75 || {}).cases || designDay.design_day || 0)}</strong> cases/day</li>
                <li>Total OR utilization peak hour: <strong>{hourly.peak_hour || '--'}</strong></li>
                <li>Surgeons credentialed/interested: <strong>{fmt(surgeon.credentialed_surgeons || p.credentialed_robotic_surgeons || 0)} / {fmt(surgeon.interested_surgeons || p.surgeons_interested || 0)}</strong></li>
                <li>5-Year TCO: <strong>{fmtMoneyK((financial.total_cost_of_ownership || financial.tco || {}).five_year)}</strong></li>
                <li>Breakeven: <strong>{financial.breakeven_months || '--'} months</strong></li>
              </ul>
            </div>
            <div>
              <h3 className="text-base font-serif font-bold text-slate-900 mb-2">Strategic Rationale</h3>
              <p className="text-slate-700 leading-relaxed">{match.rationale || primary.rationale || 'The recommended configuration aligns the hospital procedure mix, OR availability, and surgeon capacity with the technology platform best suited for the projected case load.'}</p>
            </div>
          </div>
        </Section>

        {/* ─── HOSPITAL PROFILE ─── */}
        <Section title="1. Hospital Profile" subtitle="Intake parameters and operational baseline">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Hospital Name" value={p.hospital_name || '--'} />
            <Stat label="Type" value={p.hospital_type || '--'} />
            <Stat label="Bed Count" value={fmt(p.bed_count)} />
            <Stat label="State / Country" value={`${p.state || '--'} ${p.country ? '/ ' + p.country : ''}`} />
            <Stat label="Annual Surgical Volume" value={fmt(p.annual_surgical_volume)} sub="All procedures" />
            <Stat label="Current Robotic System" value={p.current_system || 'None'} sub={`${fmt(p.current_system_count || 0)} unit(s)`} />
            <Stat label="Robot-Ready ORs" value={`${fmt(p.robot_ready_ors || 0)} / ${fmt(p.total_or_count || 0)}`} />
            <Stat label="Credentialed Surgeons" value={fmt(p.credentialed_robotic_surgeons || surgeon.credentialed_surgeons)} />
            <Stat label="Surgeons Interested" value={fmt(p.surgeons_interested || surgeon.interested_surgeons)} />
          </div>

          <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-6">Specialty Mix</h3>
          <Table
            columns={['Specialty', 'Share of Volume']}
            rows={[
              ['Urology', p.specialty_urology ? `${p.specialty_urology}%` : '--'],
              ['Gynecology', p.specialty_gynecology ? `${p.specialty_gynecology}%` : '--'],
              ['General Surgery', p.specialty_general ? `${p.specialty_general}%` : '--'],
              ['Thoracic', p.specialty_thoracic ? `${p.specialty_thoracic}%` : '--'],
              ['Colorectal', p.specialty_colorectal ? `${p.specialty_colorectal}%` : '--'],
              ['Head & Neck', p.specialty_head_neck ? `${p.specialty_head_neck}%` : '--'],
              ['Cardiac', p.specialty_cardiac ? `${p.specialty_cardiac}%` : '--'],
            ].filter(row => row[1] !== '--')}
          />
        </Section>

        {/* ─── ANALYSIS FINDINGS ─── */}
        <Section title="2. Analysis Findings" subtitle="Quantitative findings across procedure, scheduling, capacity, and financial dimensions">
          {/* Procedure Pareto */}
          <h3 className="text-base font-serif font-bold text-slate-900 mb-2">2.1 Procedure Pareto (ABC Analysis)</h3>
          <p className="text-sm text-slate-600 mb-3">Concentration measured via Gini coefficient. Top procedures drive the majority of volume and should anchor system selection.</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Gini Coefficient" value={pareto.gini_coefficient?.toFixed?.(3) || pareto.gini || '--'} />
            <Stat label="Total Procedures" value={fmt(pareto.total_procedures || pareto.total)} />
            <Stat label="Concentration Class" value={pareto.concentration_class || '--'} />
          </div>
          {topProcs.length > 0 && (
            <Table
              columns={['#', 'Procedure', 'Cases', '% of Volume', 'ABC Class']}
              rows={topProcs.slice(0, 10).map((tp, i) => [
                i + 1,
                tp.name || tp.procedure || '--',
                fmt(tp.cases || tp.count),
                tp.pct ? `${tp.pct}%` : (tp.percentage ? `${tp.percentage}%` : '--'),
                tp.abc_class || tp.class || '--',
              ])}
            />
          )}

          {/* Seasonality */}
          {months.length > 0 && (
            <>
              <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-6">2.2 Monthly Seasonality</h3>
              <p className="text-sm text-slate-600 mb-3">CoV: <strong>{seasonality.coefficient_of_variation || seasonality.cov || '--'}</strong> -- Peak: <strong>{seasonality.peak_month || '--'}</strong></p>
              <Table
                columns={['Month', 'Cases']}
                rows={months.map(m => [m.month || m.label || '--', fmt(m.cases || m.volume || m.count)])}
              />
            </>
          )}

          {/* Weekday */}
          {days.length > 0 && (
            <>
              <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-6">2.3 Weekday Distribution</h3>
              <p className="text-sm text-slate-600 mb-3">Peak day: <strong>{weekday.peak_day || '--'}</strong></p>
              <Table
                columns={['Weekday', 'Cases']}
                rows={days.map(d => [d.day || d.label || '--', fmt(d.cases || d.volume || d.count)])}
              />
            </>
          )}

          {/* Design Day */}
          <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-6">2.4 Design Day Analysis</h3>
          <p className="text-sm text-slate-600 mb-3">P75 is the planning basis -- system capacity should comfortably absorb this load on most days.</p>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="P50 (Median)" value={fmt((designDay.p50 || {}).cases || 0)} sub="cases/day" />
            <Stat label="P75 (Design)" value={fmt((designDay.p75 || {}).cases || designDay.design_day || 0)} sub="cases/day" />
            <Stat label="P90" value={fmt((designDay.p90 || {}).cases || 0)} sub="cases/day" />
            <Stat label="P95" value={fmt((designDay.p95 || {}).cases || 0)} sub="cases/day" />
          </div>

          {/* Volume Projection */}
          {yearlyProj.length > 0 && (
            <>
              <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-6">2.5 5-Year Volume Projection</h3>
              <p className="text-sm text-slate-600 mb-3">Adoption ramp at <strong>{vol.adoption_rate || vol.ramp_rate || '--'}%</strong> per year</p>
              <Table
                columns={['Year', 'Robotic Cases', 'Total Surgical', '% Robotic']}
                rows={yearlyProj.map(yp => [
                  `Year ${yp.year}`,
                  fmt(yp.robotic_cases || yp.total_cases),
                  fmt(yp.total_surgical || yp.surgical_volume),
                  yp.pct_robotic ? `${yp.pct_robotic}%` : (yp.robotic_pct ? `${yp.robotic_pct}%` : '--'),
                ])}
              />
            </>
          )}

          {/* Risk */}
          {(risk.risk_factors || risk.factors || []).length > 0 && (
            <>
              <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-6">2.6 Risk Assessment</h3>
              <p className="text-sm text-slate-600 mb-3">Overall: <strong className="uppercase">{risk.overall_risk || 'n/a'}</strong></p>
              <Table
                columns={['Risk Factor', 'Severity', 'Mitigation']}
                rows={(risk.risk_factors || risk.factors || []).map(rf => [
                  rf.name || rf.factor || '--',
                  (rf.severity || rf.level || '--').toUpperCase(),
                  rf.mitigation || rf.action || '--',
                ])}
              />
            </>
          )}
        </Section>

        {/* ─── SYSTEM MATCH ─── */}
        <Section title="3. System Match Recommendation" subtitle="Matching the optimal da Vinci system configuration to the operational profile">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Stat label="Primary Recommendation" value={`da Vinci ${primary.system || match.recommended_model || '--'}`} />
            <Stat label="Fit Score" value={`${Math.round(primary.score || match.fit_score || 0)}/100`} />
            <Stat label="Quantity" value={fmt(primary.quantity || match.recommended_quantity || 1)} sub="systems" />
          </div>

          <h3 className="text-base font-serif font-bold text-slate-900 mb-2">Rationale</h3>
          <p className="text-sm text-slate-700 leading-relaxed mb-4">{match.rationale || primary.rationale || 'The recommended configuration aligns with the hospital procedure mix, OR availability, and surgeon capacity.'}</p>

          {(compat.procedures || []).length > 0 && (
            <>
              <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-5">Procedure-Level Compatibility Matrix</h3>
              <Table
                columns={['Procedure', 'dV5', 'Xi', 'X', 'SP', 'Best Fit']}
                rows={(compat.procedures || []).slice(0, 12).map(pr => [
                  pr.name || pr.procedure || '--',
                  pr.dv5_score || pr.dV5 || '--',
                  pr.xi_score || pr.Xi || '--',
                  pr.x_score || pr.X || '--',
                  pr.sp_score || pr.SP || '--',
                  pr.best_model || pr.best_fit || '--',
                ])}
              />
            </>
          )}

          {/* Financial Deep Dive */}
          <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-6">Financial Deep Dive</h3>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <Stat label="5-Year TCO" value={fmtMoneyK((financial.total_cost_of_ownership || financial.tco || {}).five_year)} />
            <Stat label="Breakeven" value={`${financial.breakeven_months || '--'} mo`} />
            <Stat label="Per-Case Cost" value={fmtMoney(financial.per_procedure_cost || financial.cost_per_case)} />
            <Stat label="5-Year ROI" value={fmtPct(financial.five_year_roi_pct || roi.five_year_roi_pct)} />
          </div>
          {financial.per_procedure_economics && (
            <Table
              columns={['Approach', 'Revenue/Case', 'Cost/Case', 'Margin/Case']}
              rows={[
                ['Robotic', fmtMoney(financial.per_procedure_economics.robotic?.revenue), fmtMoney(financial.per_procedure_economics.robotic?.cost), fmtMoney(financial.per_procedure_economics.robotic?.margin)],
                ['Laparoscopic', fmtMoney(financial.per_procedure_economics.laparoscopic?.revenue), fmtMoney(financial.per_procedure_economics.laparoscopic?.cost), fmtMoney(financial.per_procedure_economics.laparoscopic?.margin)],
                ['Open', fmtMoney(financial.per_procedure_economics.open?.revenue), fmtMoney(financial.per_procedure_economics.open?.cost), fmtMoney(financial.per_procedure_economics.open?.margin)],
              ]}
            />
          )}
        </Section>

        {/* ─── PRESENTATION (high-level talking points) ─── */}
        <Section title="4. Stakeholder Presentation Summary" subtitle="Talking points used in the executive presentation">
          <ol className="list-decimal pl-6 space-y-2 text-sm text-slate-700">
            <li><strong>Hospital baseline:</strong> {p.hospital_name || '--'} with {fmt(p.annual_surgical_volume)} annual surgical cases across {p.total_or_count || '--'} ORs.</li>
            <li><strong>Procedure concentration:</strong> Gini {pareto.gini_coefficient?.toFixed?.(3) || pareto.gini || '--'} -- {topProcs[0]?.name || 'top procedure'} alone drives a meaningful share of volume.</li>
            <li><strong>Capacity planning:</strong> P75 design day = {fmt((designDay.p75 || {}).cases || designDay.design_day || 0)} cases/day. Peak month: {seasonality.peak_month || '--'}; peak day: {weekday.peak_day || '--'}.</li>
            <li><strong>System recommendation:</strong> da Vinci {primary.system || match.recommended_model || '--'} -- fit {Math.round(primary.score || match.fit_score || 0)}/100.</li>
            <li><strong>Financials:</strong> 5-year TCO {fmtMoneyK((financial.total_cost_of_ownership || financial.tco || {}).five_year)}, breakeven {financial.breakeven_months || '--'} months, 5-year ROI {fmtPct(financial.five_year_roi_pct || roi.five_year_roi_pct)}.</li>
            <li><strong>Surgeon capacity:</strong> {fmt(surgeon.credentialed_surgeons || p.credentialed_robotic_surgeons || 0)} credentialed, {fmt(surgeon.interested_surgeons || p.surgeons_interested || 0)} interested.</li>
            <li><strong>Risk:</strong> {(risk.overall_risk || 'n/a').toUpperCase()} overall ({(risk.risk_factors || risk.factors || []).length} tracked factors).</li>
            <li><strong>Next steps:</strong> Clinical workflow assessment, infrastructure survey, surgeon training timeline, financial model finalization, implementation plan.</li>
          </ol>
        </Section>

        {/* ─── BUSINESS PLAN ─── */}
        <Section title="5. Business Plan" subtitle={`${plans.length} active plan${plans.length === 1 ? '' : 's'} -- pro forma, surgeon commitments, and clinical dollarization`}>
          {plans.length === 0 && <p className="text-sm text-slate-500 italic">No business plans created yet for this project.</p>}
          {plans.map((plan, idx) => {
            const f = plan.full || plan
            const surgeons = plan.surgeons || []
            const outcomes = plan.outcomes || {}
            return (
              <div key={plan.id || idx} className="mb-7">
                <h3 className="text-base font-serif font-bold text-slate-900 mb-1">{f.plan_name || `Plan ${idx + 1}`}</h3>
                <p className="text-xs text-slate-500 mb-3">System: {f.system_type || '--'} -- Status: {f.status || 'draft'} -- Last updated {fmtDate(f.updated_at)}</p>

                <div className="grid grid-cols-4 gap-3 mb-3">
                  <Stat label="Year 1 Robotic Cases" value={fmt(f.year_1_cases || f.target_cases_year_1)} />
                  <Stat label="Year 1 Revenue" value={fmtMoney(f.year_1_revenue || f.projected_revenue_y1)} />
                  <Stat label="Year 1 Margin" value={fmtMoney(f.year_1_margin || f.projected_margin_y1)} />
                  <Stat label="Surgeon Commitments" value={fmt(surgeons.length)} sub={`${surgeons.reduce((s, x) => s + (x.committed_cases || 0), 0)} cases`} />
                </div>

                {surgeons.length > 0 && (
                  <>
                    <h4 className="text-sm font-bold text-slate-800 mb-2 mt-3">Surgeon Commitments</h4>
                    <Table
                      columns={['Surgeon', 'Specialty', 'Procedure', 'Committed Cases', 'Status']}
                      rows={surgeons.map(s => [
                        s.surgeon_name || '--',
                        s.specialty || '--',
                        s.procedure_type || '--',
                        fmt(s.committed_cases),
                        s.commitment_status || s.status || 'pending',
                      ])}
                    />
                  </>
                )}

                {outcomes && (outcomes.total_savings || outcomes.total_value || outcomes.summary) && (
                  <>
                    <h4 className="text-sm font-bold text-slate-800 mb-2 mt-4">Clinical Dollarization</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Total Clinical Value" value={fmtMoney(outcomes.total_savings || outcomes.total_value)} sub="vs. open/lap baseline" />
                      <Stat label="LOS Reduction Value" value={fmtMoney(outcomes.los_value || outcomes.length_of_stay_value)} />
                      <Stat label="Complication Avoidance" value={fmtMoney(outcomes.complication_value || outcomes.readmission_value)} />
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </Section>

        {/* ─── SURGEON SURVEYS ─── */}
        <Section title="6. Surgeon Surveys" subtitle="Voice-of-surgeon data: commitment intent, training readiness, procedure preferences">
          {surveys.length === 0 && <p className="text-sm text-slate-500 italic">No surveys created yet for this project.</p>}
          {surveys.map((s, idx) => {
            const responses = s.responses || []
            const totalCommitted = responses.reduce((sum, r) => sum + (r.committed_cases || r.case_commitment || 0), 0)
            return (
              <div key={s.id || idx} className="mb-6">
                <h3 className="text-base font-serif font-bold text-slate-900 mb-1">{s.survey_name || s.name || `Survey ${idx + 1}`}</h3>
                <p className="text-xs text-slate-500 mb-3">Status: {s.status || 'draft'} -- Sent: {fmtDate(s.sent_at)} -- Responses: {responses.length} of {(s.recipients || []).length || s.recipient_count || '--'}</p>

                <div className="grid grid-cols-4 gap-3 mb-3">
                  <Stat label="Recipients" value={fmt((s.recipients || []).length || s.recipient_count)} />
                  <Stat label="Responses" value={fmt(responses.length)} sub={`${responses.length && s.recipient_count ? Math.round(100 * responses.length / s.recipient_count) : 0}% rate`} />
                  <Stat label="Total Committed Cases" value={fmt(totalCommitted)} />
                  <Stat label="Avg Cases/Surgeon" value={fmt(responses.length ? totalCommitted / responses.length : 0)} />
                </div>

                {responses.length > 0 && (
                  <Table
                    columns={['Surgeon', 'Specialty', 'Committed Cases', 'Training Status', 'Submitted']}
                    rows={responses.map(r => [
                      r.surgeon_name || r.respondent_name || '--',
                      r.specialty || '--',
                      fmt(r.committed_cases || r.case_commitment),
                      r.training_status || r.credential_status || '--',
                      fmtDate(r.submitted_at || r.created_at),
                    ])}
                  />
                )}
              </div>
            )
          })}
        </Section>

        {/* ─── PLAN TRACKING ─── */}
        <Section title="7. Plan Tracking & Variance Analysis" subtitle="Actuals vs. proforma -- monitoring program execution post-placement">
          {plans.filter(p => p.comparison || p.exec).length === 0 && (
            <p className="text-sm text-slate-500 italic">No tracking data yet -- import actuals to populate variance analysis.</p>
          )}
          {plans.map((plan, idx) => {
            const cmp = plan.comparison
            const exec = plan.exec
            if (!cmp && !exec) return null
            return (
              <div key={plan.id || idx} className="mb-6">
                <h3 className="text-base font-serif font-bold text-slate-900 mb-2">{(plan.full || plan).plan_name || `Plan ${idx + 1}`}</h3>

                {exec && (
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <Stat label="Cases YTD" value={fmt(exec.actual_cases_ytd || exec.cases_actual)} sub={`vs. plan ${fmt(exec.planned_cases_ytd || exec.cases_planned)}`} />
                    <Stat label="Revenue YTD" value={fmtMoney(exec.actual_revenue_ytd || exec.revenue_actual)} sub={`vs. plan ${fmtMoney(exec.planned_revenue_ytd || exec.revenue_planned)}`} />
                    <Stat label="Variance vs Plan" value={fmtPct(exec.variance_pct || exec.cases_variance_pct)} sub={(exec.on_track || exec.status || '--')} />
                    <Stat label="Forecast Year-End" value={fmtMoney(exec.forecast_revenue || exec.year_end_forecast)} />
                  </div>
                )}

                {cmp?.monthly && Array.isArray(cmp.monthly) && cmp.monthly.length > 0 && (
                  <Table
                    columns={['Period', 'Planned Cases', 'Actual Cases', 'Planned Rev', 'Actual Rev', 'Variance']}
                    rows={cmp.monthly.map(m => [
                      m.period || m.month || '--',
                      fmt(m.planned_cases),
                      fmt(m.actual_cases),
                      fmtMoney(m.planned_revenue),
                      fmtMoney(m.actual_revenue),
                      m.variance_pct ? fmtPct(m.variance_pct) : '--',
                    ])}
                  />
                )}
              </div>
            )
          })}
        </Section>

        {/* ─── CONCLUSION ─── */}
        <Section title="8. Conclusion & Next Steps">
          <p className="text-sm text-slate-700 leading-relaxed mb-4">
            The data supports placement of <strong>da Vinci {primary.system || match.recommended_model || '--'}</strong> at <strong>{p.hospital_name || 'the hospital'}</strong>.
            Procedure mix, surgeon capacity, OR availability, and projected case volume align with the recommended configuration's clinical and economic profile.
            Financial returns (5-year ROI {fmtPct(financial.five_year_roi_pct || roi.five_year_roi_pct)}; breakeven {financial.breakeven_months || '--'} months)
            justify the capital commitment under the assumptions disclosed in Section 3.
          </p>

          <h3 className="text-base font-serif font-bold text-slate-900 mb-2 mt-4">Recommended Next Steps</h3>
          <ol className="list-decimal pl-6 space-y-1 text-sm text-slate-700">
            <li>Clinical workflow assessment with surgical leadership</li>
            <li>Infrastructure and OR readiness survey</li>
            <li>Surgeon training and credentialing timeline</li>
            <li>Final financial model review with CFO and finance committee</li>
            <li>Implementation timeline and Go/No-Go decision</li>
          </ol>

          <div className="mt-10 pt-6 border-t border-slate-300 text-xs text-slate-500 font-sans">
            <p>Prepared by SurgicalMind AI &middot; Powered by Digit2AI &middot; {reportDate}</p>
            <p className="mt-1">Report ID: {p.project_code || `INTV-${id}`} &middot; Confidential</p>
          </div>
        </Section>
      </div>
    </div>
  )
}
