import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import PageNotes from '../components/PageNotes'

// Executive Presentation — slide+voice deck aligned to the new 10-step workflow.
//
// Fetches all 9 step enrichments + executive brief and renders one slide per
// workflow step. ElevenLabs Rachel voice widget is wired with per-slide
// narration context so she can discuss any slide using hospital-specific numbers.

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'
const fmtMoneyShort = (n) => {
  if (n == null) return '$0'
  const v = Number(n)
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

function SlideShell({ stepNum, label, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-lg p-10 shadow-md print:shadow-none min-h-[600px] flex flex-col" style={{ color: '#1f2937' }}>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: '#1e40af' }}>{label}</div>
        <h2 className="text-3xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-slate-600 mt-2">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export default function ExecutivePresentationPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const widgetRef = useRef(null)

  const [project, setProject] = useState(null)
  const [data, setData] = useState({})
  const [activeSlide, setActiveSlide] = useState(0)
  const [loading, setLoading] = useState(true)

  // Load all 10 enrichments in parallel
  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.getProject(id),
      api.getHospitalProfileEnrichment(id).catch(() => ({ data: null })),
      api.getSurgeonProfileEnrichment(id).catch(() => ({ data: null })),
      api.getRoboticsProgramEnrichment(id).catch(() => ({ data: null })),
      api.getMarketProfileEnrichment(id).catch(() => ({ data: null })),
      api.getClinicalOutcomesEnrichment(id).catch(() => ({ data: null })),
      api.getClinicalOverlayEnrichment(id, 15).catch(() => ({ data: null })),
      api.getSurgeonCommitmentsEnrichment(id).catch(() => ({ data: null })),
      api.getBusinessPlanEnrichment(id).catch(() => ({ data: null })),
      api.getPerformanceTrackingEnrichment(id).catch(() => ({ data: null })),
      api.getExecutiveBrief(id).catch(() => ({ data: null })),
    ]).then(([proj, hp, sp, rp, mp, co, cb, sc, bp, pt, eb]) => {
      setProject(proj.project)
      setData({
        hospital: hp.data,
        surgeon: sp.data,
        robotics: rp.data,
        market: mp.data,
        clinicalOutcomes: co.data,
        clinicalBenefit: cb.data,
        commitments: sc.data,
        businessPlan: bp.data,
        tracking: pt.data,
        executiveBrief: eb.data,
      })
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  // Wire up Rachel voice context per-slide
  useEffect(() => {
    if (!project) return
    const widget = document.querySelector('elevenlabs-convai')
    if (!widget) return
    const ctx = buildSlideContext(project, data, activeSlide)
    widget.setAttribute('context', ctx)
  }, [activeSlide, project, data])

  if (!id) return <div className="p-10 text-slate-400">No project selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading Executive Presentation deck...</div>
  if (!project) return <div className="p-10 text-slate-400">Project not found.</div>

  const hospitalName = project.hospital_name
  const slides = buildSlides(project, data, hospitalName)

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Action bar */}
      <div className="bg-slate-800 px-6 py-3 flex items-center justify-between print:hidden">
        <div className="text-white">
          <div className="text-xs uppercase tracking-widest text-slate-400">Executive Presentation · Slide + Rachel Voice</div>
          <div className="text-sm font-semibold">{hospitalName} · Slide {activeSlide + 1} of {slides.length}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
            Export PDF
          </button>
          <button onClick={() => navigate(`/executive/${id}`)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
            ← Back to Executive Brief
          </button>
        </div>
      </div>

      {/* Rachel info banner */}
      <div className="bg-sky-900/30 border-b border-sky-700/40 px-6 py-2 print:hidden">
        <div className="max-w-6xl mx-auto flex items-center gap-3 text-sky-300 text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Rachel Voice AI is wired to this slide. Tap the ElevenLabs widget in the corner — she can discuss any data point on the current slide.
        </div>
      </div>

      {/* Slide content */}
      <div className="max-w-6xl mx-auto px-6 pt-6">
        {slides[activeSlide]}
      </div>

      {/* How to read this page (hidden in print so it never breaks the slide-per-page deck) */}
      <div className="max-w-6xl mx-auto px-6 print:hidden">
        <PageNotes title="Executive Presentation">
          <ul className="space-y-1.5 list-disc pl-4">
            <li><span className="text-white font-semibold">What this is:</span> The slide deck version of the case, narrated by Rachel — a 10-slide <span className="text-cyan-300">executive summary</span> for a live CFO / board conversation. No slide computes anything new; each one displays figures already produced in the detailed steps.</li>
            <li><span className="text-white font-semibold">Every figure traces back to the steps:</span> hospital metrics from the <span className="text-cyan-300">Hospital Profile</span>, committed cases from <span className="text-cyan-300">Surgeon Commitments</span>, dollarized savings from the <span className="text-cyan-300">Clinical Benefit Overlay</span> (the MOAT slide), and IRR / payback from the <span className="text-cyan-300">Business Plan</span>. The deck reconciles with those pages exactly.</li>
            <li><span className="text-white font-semibold">Two kinds of dollars, never combined:</span> <span className="text-emerald-300">cost avoidance</span> (money the hospital stops losing when existing <span className="text-cyan-300">open</span> cases are converted to da Vinci — same case, different technique, no new volume) is kept separate from <span className="text-amber-300">revenue</span> (money earned from <span className="text-cyan-300">incremental / net-new</span> cases surgeons commit to bring). Only that incremental revenue drives the IRR / NPV.</li>
            <li><span className="text-white font-semibold">Bottom line:</span> The IRR / NPV on these slides equals the Business Plan's, and the <span className="text-emerald-300">cost avoidance</span> equals the Clinical Benefit Overlay's. This is the consistent summary view — the underlying steps are the source of truth.</li>
          </ul>
        </PageNotes>
      </div>

      {/* Slide navigation (hidden in print) */}
      <div className="max-w-6xl mx-auto px-6 mt-6 flex items-center justify-between print:hidden">
        <button
          onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
          disabled={activeSlide === 0}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded text-sm"
        >
          ← Previous
        </button>
        <div className="flex gap-1.5 flex-wrap justify-center">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              className={`w-3 h-3 rounded-full transition-all ${i === activeSlide ? 'bg-blue-500 scale-125' : 'bg-slate-400 hover:bg-slate-300'}`}
              title={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <button
          onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))}
          disabled={activeSlide === slides.length - 1}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// ─── Slide builder ────────────────────────────────────────────────────

function buildSlides(project, data, hospitalName) {
  const eb = data.executiveBrief || {}
  const hp = data.hospital || {}
  const sp = data.surgeon || {}
  const rp = data.robotics || {}
  const mp = data.market || {}
  const co = data.clinicalOutcomes || {}
  const cb = data.clinicalBenefit || {}
  const sc = data.commitments || {}
  const bp = data.businessPlan || {}
  const pt = data.tracking || {}

  return [
    // ───────── Slide 1: Cover ─────────
    <section className="rounded-lg p-12 text-white shadow-md print:break-after-page" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', minHeight: 600 }}>
      <div className="text-xs uppercase tracking-widest opacity-80 mb-3">Strategic Alignment Opportunity</div>
      <h1 className="text-5xl font-bold mb-3">{hospitalName}</h1>
      <p className="text-2xl opacity-90 mb-12">da Vinci System Assessment & Business Case</p>
      <div className="text-sm opacity-90 space-y-1">
        <div>Prepared by: <strong>SurgicalMind AI · Digit2AI</strong></div>
        <div>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div className="mt-6 text-[10px] opacity-60">CONFIDENTIAL · For executive review</div>
      </div>
    </section>,

    // ───────── Slide 2: Hospital Profile ─────────
    <SlideShell stepNum={1} label="Step 1 of 10 · Hospital Profile" title={hospitalName} subtitle={`${project.hospital_type || ''} · ${project.state || ''} · ${fmt(project.bed_count)} beds`}>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KPI label="Total Beds" value={fmt(project.bed_count)} />
        <KPI label="Annual Surgical Vol" value={fmt(project.annual_surgical_volume)} />
        <KPI label="OR Count" value={fmt(project.total_or_count)} />
        <KPI label="Operating Margin" value={project.operating_margin_pct ? project.operating_margin_pct + '%' : '--'} />
      </div>
      {hp?.strategic_impact && (
        <div>
          <div className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: '#1e40af' }}>Projected Strategic Impact</div>
          {hp.strategic_impact.metrics.slice(0, 5).map((m, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-slate-200 text-sm">
              <span className="text-slate-600">{m.label}</span>
              <strong className="text-emerald-600">{m.value}</strong>
            </div>
          ))}
        </div>
      )}
    </SlideShell>,

    // ───────── Slide 3: Surgeon Profile ─────────
    <SlideShell stepNum={2} label="Step 2 of 10 · Surgeon Profile" title="Surgeon Roster & KOLs">
      {sp?.training_pipeline && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <KPI label="Trained" value={sp.training_pipeline.trained.length} color="#10b981" />
          <KPI label="In Pipeline" value={sp.training_pipeline.untrained.length} color="#f59e0b" />
          <KPI label="Splitter" value={sp.training_pipeline.pull_forward.length} color="#06b6d4" />
        </div>
      )}
      {sp?.kol_signals?.top_kols?.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: '#1e40af' }}>Top 5 KOLs by Composite Signal</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="text-left pb-2">Surgeon</th><th className="text-left pb-2">Specialty</th><th className="text-right pb-2">Robotic Vol</th><th className="text-right pb-2">Publications</th><th className="text-right pb-2">Score</th></tr></thead>
            <tbody>
              {sp.kol_signals.top_kols.map((k, i) => (
                <tr key={i} className="border-t border-slate-200">
                  <td className="py-1.5 font-semibold">{k.surgeon_name}</td>
                  <td className="py-1.5">{k.specialty || '--'}</td>
                  <td className="py-1.5 text-right text-cyan-600">{fmt(k.robotic_vol)}</td>
                  <td className="py-1.5 text-right text-violet-600">{k.publications_5yr}</td>
                  <td className="py-1.5 text-right font-bold">{fmt(k.composite_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SlideShell>,

    // ───────── Slide 4: Robotics Program ─────────
    <SlideShell stepNum={3} label="Step 3 of 10 · Robotics Program" title="Current Installed Base & Utilization">
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KPI label="Systems Installed" value={fmt(project.current_system_count)} />
        <KPI label="Model" value={project.current_system || 'None'} />
        {rp?.system_utilization && <KPI label="Current Avg/Qtr" value={fmt(rp.system_utilization.current_avg_per_system_qtr)} color="#10b981" />}
        {rp?.system_utilization && <KPI label="Academic Avg" value={fmt(rp.system_utilization.academic_avg_per_qtr)} />}
      </div>
      {rp?.modality_by_year && (
        <div>
          <div className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: '#1e40af' }}>Modality Mix vs National Academic Peers</div>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs text-slate-500 mb-2">{hospitalName.split(' ')[0]} (current)</div>
              <div>Da Vinci: <strong className="text-blue-600">{rp.modality_by_year.current.davinci_pct}%</strong></div>
              <div>Laparoscopic: <strong>{rp.modality_by_year.current.lap_pct}%</strong></div>
              <div>Open: <strong>{rp.modality_by_year.current.open_pct}%</strong></div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">National Academic Peers (N=21,409)</div>
              <div>Da Vinci: <strong className="text-blue-600">{rp.modality_by_year.peer_benchmark.davinci_pct}%</strong></div>
              <div>Laparoscopic: <strong>{rp.modality_by_year.peer_benchmark.lap_pct}%</strong></div>
              <div>Open: <strong>{rp.modality_by_year.peer_benchmark.open_pct}%</strong></div>
            </div>
          </div>
          <div className="text-center mt-4 text-3xl font-bold" style={{ color: rp.modality_by_year.delta_vs_peer_davinci > 0 ? '#dc2626' : '#10b981' }}>
            {Math.abs(rp.modality_by_year.delta_vs_peer_davinci)}% Delta
          </div>
        </div>
      )}
    </SlideShell>,

    // ───────── Slide 5: Market Profile ─────────
    <SlideShell stepNum={4} label="Step 4 of 10 · Market Profile" title="Soft Tissue Surgery Market Share">
      {mp?.procedure_market_share && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <KPI label="Current Mkt Share" value={mp.procedure_market_share.blended_market_share_pct + '%'} color="#06b6d4" />
            <KPI label="Hospital Volume" value={fmt(mp.procedure_market_share.total_hospital_volume)} />
            <KPI label="Remaining Opportunity" value={fmt(mp.procedure_market_share.total_remaining_opportunity)} color="#dc2626" />
          </div>
          {mp.growth_math && (
            <div className="grid grid-cols-4 gap-3 mt-6">
              {mp.growth_math.scenarios.map((s, i) => (
                <div key={i} className="border border-slate-200 rounded p-3 text-center">
                  <div className="text-xs text-slate-500 font-bold">{s.name}</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">{fmtMoneyShort(s.dollars)}</div>
                  <div className="text-[10px] text-slate-500">{fmt(s.cases_added)} cases</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SlideShell>,

    // ───────── Slide 6: Clinical Outcomes ─────────
    <SlideShell stepNum={5} label="Step 5 of 10 · Clinical Outcomes" title="Current Outcome Baseline">
      {co?.los_variability && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: '#1e40af' }}>LOS Variability (Top Opportunity Procedures)</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="text-left pb-2">Procedure</th><th className="text-right pb-2">Open LOS</th><th className="text-right pb-2">MIS LOS</th><th className="text-right pb-2">dV LOS</th><th className="text-right pb-2">Days Saved/Case</th></tr></thead>
            <tbody>
              {co.los_variability.procedures.filter(p => p.opportunity).map((p, i) => (
                <tr key={i} className="border-t border-slate-200 bg-red-50">
                  <td className="py-1.5 font-semibold">{p.procedure}</td>
                  <td className="py-1.5 text-right">{p.open_los_days}</td>
                  <td className="py-1.5 text-right">{p.mis_los_days}</td>
                  <td className="py-1.5 text-right text-blue-600 font-bold">{p.davinci_los_days}</td>
                  <td className="py-1.5 text-right text-emerald-600 font-bold">{p.open_to_davinci_delta} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {co?.outcomes_benchmark && (
        <div className="text-sm">
          <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: '#1e40af' }}>Benchmark Status</div>
          <div className="text-slate-700">{co.outcomes_benchmark.headline}</div>
        </div>
      )}
    </SlideShell>,

    // ───────── Slide 7: Clinical Benefit Overlay (THE MOAT) ─────────
    <SlideShell stepNum={6} label="Step 6 of 10 · THE MOAT" title="Clinical Benefit Overlay">
      {cb?.bed_days_savings && (
        <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 border-2 border-emerald-300 rounded-lg p-6 mb-4 text-center">
          <div className="text-xs uppercase tracking-widest text-emerald-600 font-bold">Annual Cost Avoidance</div>
          <div className="text-6xl font-bold text-emerald-600 mt-2">{fmtMoneyShort(cb.bed_days_savings.total_dollar_savings)}</div>
          <div className="text-sm text-slate-700 mt-2">@ ${cb.bed_days_savings.bed_day_cost_used.toLocaleString()}/day · {cb.bed_days_savings.conversion_pct_assumed}% conversion · {fmt(cb.bed_days_savings.total_bed_days_saved)} bed days saved</div>
        </div>
      )}
      {cb?.investment_payback && (
        <div className="grid grid-cols-3 gap-3">
          <KPI label="Project IRR" value={cb.investment_payback.project_irr_pct + '%'} color="#10b981" />
          <KPI label="Payback" value={cb.investment_payback.estimated_payback_years ? cb.investment_payback.estimated_payback_years + ' yrs' : '5+'} color="#06b6d4" />
          <KPI label="Annual Net Benefit" value={fmtMoneyShort(cb.investment_payback.annual_net_benefit)} color="#8b5cf6" />
        </div>
      )}
      {cb?.cost_of_waiting && (
        <div className="mt-4 bg-red-50 border border-red-300 rounded p-3 text-center">
          <div className="text-xs uppercase tracking-widest text-red-600 font-bold">Cost of Waiting</div>
          <div className="text-2xl font-bold text-red-600">({fmtMoneyShort(cb.cost_of_waiting.monthly_cost_of_waiting)}/month)</div>
        </div>
      )}
    </SlideShell>,

    // ───────── Slide 8: Surgeon Commitments ─────────
    <SlideShell stepNum={7} label="Step 7 of 10 · Surgeon Commitments" title="Committed Volume from Surgeons">
      {sc?.summary && (
        <>
          <div className="grid grid-cols-5 gap-3 mb-6">
            <KPI label="Surgeons" value={sc.summary.total_surgeons} />
            <KPI label="Cases/Yr" value={fmt(sc.summary.total_incremental_cases)} color="#06b6d4" />
            <KPI label="Revenue" value={fmtMoneyShort(sc.summary.total_revenue_impact)} color="#8b5cf6" />
            <KPI label="Bed Days Saved" value={fmt(sc.summary.total_bed_days_saved)} color="#10b981" />
            <KPI label="Combined Impact" value={fmtMoneyShort(sc.summary.total_combined_impact)} color="#dc2626" />
          </div>
          {sc?.master_table?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: '#1e40af' }}>Top 5 Surgeons by Commitment</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="text-left pb-2">Surgeon</th><th className="text-left pb-2">Specialty</th><th className="text-left pb-2">Trained?</th><th className="text-right pb-2">Cases/Yr</th></tr></thead>
                <tbody>
                  {sc.master_table.slice(0, 5).map((s, i) => (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="py-1.5 font-semibold">{s.surgeon_name}</td>
                      <td className="py-1.5">{s.specialty}</td>
                      <td className="py-1.5">{s.trained ? 'Trained' : 'Pipeline'}</td>
                      <td className="py-1.5 text-right text-emerald-600 font-bold">{fmt(s.incremental_cases_yr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </SlideShell>,

    // ───────── Slide 9: Business Plan ─────────
    <SlideShell stepNum={8} label="Step 8 of 10 · Business Plan" title="5-Year Proforma + Capital Placement">
      {bp?.proforma && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <KPI label="Project IRR" value={bp.proforma.investment_summary.project_irr + '%'} color="#10b981" />
          <KPI label="Payback" value={bp.proforma.investment_summary.estimated_payback_years ? bp.proforma.investment_summary.estimated_payback_years + ' yrs' : '5+'} color="#06b6d4" />
          <KPI label="5yr Cost Avoidance" value={fmtMoneyShort(bp.proforma.investment_summary.total_cost_avoidance_5yr)} color="#f59e0b" />
          <KPI label="5yr Inc. Revenue" value={fmtMoneyShort(bp.proforma.investment_summary.incremental_revenue_5yr)} color="#8b5cf6" />
        </div>
      )}
      {bp?.two_phase_placement && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded p-4">
            <div className="text-xs uppercase tracking-widest text-emerald-700 font-bold">Phase 1</div>
            <div className="text-base font-bold">{bp.two_phase_placement.phase_1.title}</div>
            <div className="text-xs text-slate-600 mt-2">
              {bp.two_phase_placement.phase_1.new_trainings_required} trainings · {fmt(bp.two_phase_placement.phase_1.bed_days_saved)}+ bed days saved
            </div>
          </div>
          {bp.two_phase_placement.phase_2 && (
            <div className="bg-violet-50 border-l-4 border-violet-500 rounded p-4">
              <div className="text-xs uppercase tracking-widest text-violet-700 font-bold">Phase 2</div>
              <div className="text-base font-bold">{bp.two_phase_placement.phase_2.title}</div>
            </div>
          )}
        </div>
      )}
    </SlideShell>,

    // ───────── Slide 10: Performance Tracking ─────────
    <SlideShell stepNum={9} label="Step 9 of 10 · Performance Tracking" title="Post-Go-Live Monitoring Framework">
      {pt?.plan_vs_actual && (
        <div className="mb-6">
          <div className="text-sm text-slate-600 mb-2">{pt.plan_vs_actual.headline}</div>
          {pt.plan_vs_actual.has_actuals ? (
            <div className="grid grid-cols-3 gap-3">
              <KPI label="On-Track" value={pt.plan_vs_actual.on_track_count} color="#10b981" />
              <KPI label="At-Risk" value={pt.plan_vs_actual.at_risk_count} color="#f59e0b" />
              <KPI label="Off-Track" value={pt.plan_vs_actual.off_track_count} color="#dc2626" />
            </div>
          ) : (
            <div className="bg-sky-50 border border-sky-300 rounded p-4 text-sm">
              <strong className="text-sky-700">Baseline mode.</strong> Once monthly actuals are ingested post-go-live, this page surfaces plan vs actual variance, surgeon-level performance gaps, and intervention alerts ranked by urgency.
            </div>
          )}
        </div>
      )}
      <div className="text-sm text-slate-600">
        <strong>What this delivers:</strong> Plan vs Actual variance per KPI · Per-system quarterly utilization vs academic avg · Per-surgeon committed vs actual cases · Auto-generated variance watch list with specific intervention recommendations.
      </div>
    </SlideShell>,

    // ───────── Slide 11: Executive Brief (Closer) ─────────
    <SlideShell stepNum={10} label="Step 10 of 10 · Executive Summary" title={`${hospitalName} — Combined Impact`}>
      {eb?.kpi_header && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <KPI label="da Vinci Systems" value={eb.kpi_header.systems.value} color="#1e40af" />
          <KPI label="Surgeons Committed" value={eb.kpi_header.surgeons.value} color="#06b6d4" />
          <KPI label="Specialties" value={eb.kpi_header.specialties.value} color="#10b981" />
          <KPI label="Annual Cases" value={fmt(eb.kpi_header.patients.value)} color="#8b5cf6" />
        </div>
      )}
      {eb?.recommendation && (
        <div className="bg-blue-50 border-l-4 border-blue-500 rounded p-4 mb-4">
          <div className="text-xs uppercase tracking-widest text-blue-700 font-bold">Recommendation</div>
          <div className="text-base font-bold mt-1">Place {eb.recommendation.total_systems} {eb.recommendation.primary_system} systems in two phases</div>
        </div>
      )}
      <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded p-4">
        <div className="text-xs uppercase tracking-widest text-emerald-700 font-bold">Next Steps</div>
        <ol className="list-decimal list-inside text-sm mt-2 space-y-1">
          <li>IT security review of platform infrastructure (Render/AWS, Anthropic-grade)</li>
          <li>Surgeon survey distribution to confirm commitment volumes</li>
          <li>Free trial period (2-6 months) — zero risk on cost, security, data</li>
          <li>Capital placement timing aligned to Phase 1 / Phase 2 plan</li>
        </ol>
      </div>
    </SlideShell>,
  ]
}

// ─── Rachel voice context builder (per-slide narration) ───────────────

function buildSlideContext(project, data, slideIndex) {
  const hospitalName = project.hospital_name
  const eb = data.executiveBrief || {}
  const hp = data.hospital || {}
  const sp = data.surgeon || {}
  const rp = data.robotics || {}
  const mp = data.market || {}
  const co = data.clinicalOutcomes || {}
  const cb = data.clinicalBenefit || {}
  const sc = data.commitments || {}
  const bp = data.businessPlan || {}
  const pt = data.tracking || {}

  const slideContexts = [
    // Slide 1: Cover
    `You are Rachel, da Vinci voice AI for ${hospitalName}. The current slide is the cover. The hospital is ${project.hospital_type || 'a community hospital'} with ${project.bed_count || 'unknown'} beds in ${project.state || 'their state'}. Annual surgical volume is ${project.annual_surgical_volume || 'unknown'} cases.`,
    // Slide 2: Hospital Profile
    `Current slide: Hospital Profile. ${hospitalName}: ${project.bed_count} beds, ${project.annual_surgical_volume} annual cases, ${project.hospital_type}. ${hp?.strategic_impact?.headline || ''}`,
    // Slide 3: Surgeon Profile
    `Current slide: Surgeon Profile. ${sp?.training_pipeline?.headline || ''} ${sp?.kol_signals?.top_kols?.length ? `Top KOL: ${sp.kol_signals.top_kols[0].surgeon_name} (${sp.kol_signals.top_kols[0].specialty})` : ''}`,
    // Slide 4: Robotics Program
    `Current slide: Robotics Program. ${project.current_system_count} systems installed. ${rp?.modality_by_year?.headline || ''}`,
    // Slide 5: Market Profile
    `Current slide: Market Profile. ${mp?.procedure_market_share?.headline || ''} ${mp?.growth_math ? `Each 1% market share = $${mp.growth_math.dollars_per_1_pct_share.toLocaleString()}.` : ''}`,
    // Slide 6: Clinical Outcomes
    `Current slide: Clinical Outcomes baseline. ${co?.los_variability?.headline || ''} ${co?.outcomes_benchmark?.headline || ''}`,
    // Slide 7: Clinical Benefit Overlay (MOAT)
    `Current slide: Clinical Benefit Overlay — THE MOAT. ${cb?.bed_days_savings?.headline || ''} Cost avoidance: $${cb?.bed_days_savings?.total_dollar_savings?.toLocaleString() || 'unknown'}. Project IRR: ${cb?.investment_payback?.project_irr_pct || '?'}%. Cost of waiting: $${cb?.cost_of_waiting?.monthly_cost_of_waiting?.toLocaleString() || '?'} per month.`,
    // Slide 8: Surgeon Commitments
    `Current slide: Surgeon Commitments. ${sc?.summary?.headline || ''}`,
    // Slide 9: Business Plan
    `Current slide: Business Plan. ${bp?.proforma?.headline || ''} Capital placement: ${bp?.two_phase_placement?.phase_1?.title || ''}`,
    // Slide 10: Performance Tracking
    `Current slide: Performance Tracking. ${pt?.plan_vs_actual?.headline || 'Baseline mode — actuals not yet ingested.'} This page surfaces variance once the hospital goes live.`,
    // Slide 11: Executive Summary
    `Current slide: Executive Summary closer. Recommend: place ${eb?.recommendation?.total_systems || '?'} ${eb?.recommendation?.primary_system || 'dV5'} systems. Next steps: IT review, surgeon survey, free trial period.`,
  ]

  return slideContexts[slideIndex] || slideContexts[0]
}

// ─── Mini shared component ───
function KPI({ label, value, color }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
      <div className="text-2xl font-bold" style={{ color: color || '#1e40af' }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-1">{label}</div>
    </div>
  )
}
