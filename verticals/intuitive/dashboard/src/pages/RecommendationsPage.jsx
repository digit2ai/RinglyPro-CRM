import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import PageNotes from '../components/PageNotes'

export default function RecommendationsPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const [project, setProject] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    Promise.all([
      api.getProject(id).catch(() => null),
      api.getResults(id).catch(() => null),
    ])
      .then(([pRes, aRes]) => {
        setProject(pRes?.project || pRes)
        setResults(aRes?.results || aRes?.data || aRes || null)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading recommendations...</div>
  if (!project) return <div className="p-10 text-slate-400">Project not found.</div>

  const recs = project.recommendations || []
  const primary = recs.find(r => r.is_primary)
  const alternatives = recs.filter(r => !r.is_primary)

  const fmt = n => n != null ? Number(n).toLocaleString() : '--'
  const fmtM = n => n != null ? `$${(Number(n) / 1e6).toFixed(1)}M` : '--'

  // Greg fix: reconciliation between volume math (model_matching) and per-procedure scoring (compatibility matrix)
  const r = results || {}
  const matrix = r.robot_compatibility_matrix || {}
  const matching = r.model_matching || {}
  const utilForecast = r.utilization_forecast || {}
  const capacityModel = utilForecast.capacity_model || null

  const volumeModel = (matching.primary_recommendation && (matching.primary_recommendation.system || matching.primary_recommendation.model))
    || matching.recommended_model
    || (primary && primary.system_model)
    || null
  const volumeScore = (matching.primary_recommendation && matching.primary_recommendation.score)
    || matching.fit_score
    || (primary && primary.fit_score)
    || 0
  const clinicalModel = matrix.overall_best_model || matrix.best_overall_model || null
  // Find best per-procedure score from the matrix (averaged or top scoring model)
  const matrixProcs = matrix.compatibility_matrix || matrix.procedures || []
  let clinicalScore = 0
  if (clinicalModel && matrixProcs.length > 0) {
    const key = clinicalModel.toLowerCase()
    const scores = matrixProcs.map(pr => Number(pr[`${key}_score`] || pr[key] || pr[`${key}_fit`] || 0)).filter(Boolean)
    if (scores.length) clinicalScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }
  const showReconciliation = volumeModel && clinicalModel && (
    volumeModel !== clinicalModel || Math.abs(Number(clinicalScore) - Number(volumeScore)) > 10
  )

  function modelLabel(m) {
    if (!m) return '--'
    const k = String(m).toUpperCase()
    if (k === 'DV5') return 'da Vinci 5'
    if (k === 'XI') return 'da Vinci Xi'
    if (k === 'X') return 'da Vinci X'
    if (k === 'SP') return 'da Vinci SP'
    return `da Vinci ${m}`
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-white mb-1">{project.hospital_name} -- System Recommendation</h1>
      <p className="text-slate-400 text-sm mb-8">Project {project.project_code} | {project.hospital_type ? project.hospital_type.charAt(0).toUpperCase() + project.hospital_type.slice(1) : ''} | {project.bed_count || '?'} beds | {project.state || ''}</p>

      {/* ─── TWO PATHS reconciliation card (Greg fix) ─── */}
      {showReconciliation && (
        <div className="mb-6 bg-gradient-to-br from-violet-900/20 to-emerald-900/20 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="bg-slate-900/80 border-b border-slate-700 px-6 py-4">
            <div className="text-[11px] uppercase tracking-widest font-bold text-amber-400">Two Paths -- Choose Based on Strategic Priority</div>
            <div className="text-sm text-slate-300 mt-1">Per-procedure scoring and volume-capacity math point to different systems. Both are valid. The choice depends on what drives the decision.</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
            <div className="p-6">
              <div className="text-[10px] uppercase tracking-widest font-bold text-violet-300">Clinical Excellence Path</div>
              <h3 className="text-2xl font-bold text-violet-100 mt-1">{modelLabel(clinicalModel)}</h3>
              <div className="text-sm text-violet-300 mt-1">Per-procedure fit: <strong className="text-violet-100">{clinicalScore}/100</strong></div>
              <p className="text-xs text-slate-300 mt-3 leading-relaxed">Best per-procedure clinical fit across this hospital's procedure mix. Newest platform features, latest imaging, optimal for complex cases.</p>
              <p className="text-[11px] text-slate-400 mt-3 italic">Choose if surgeon outcomes and latest-generation technology drive the decision.</p>
            </div>
            <div className="p-6">
              <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-300">Volume Capacity Path</div>
              <h3 className="text-2xl font-bold text-emerald-100 mt-1">{modelLabel(volumeModel)} {primary && primary.quantity > 1 ? `(x${primary.quantity})` : ''}</h3>
              <div className="text-sm text-emerald-300 mt-1">Volume-math fit: <strong className="text-emerald-100">{volumeScore}/100</strong></div>
              <p className="text-xs text-slate-300 mt-3 leading-relaxed">Highest throughput at the projected case volume. Proven workflow, mature instrument library, optimal for case-mix breadth and ROI.</p>
              <p className="text-[11px] text-slate-400 mt-3 italic">Choose if maximizing case capacity and capital ROI is the primary driver.</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Capacity model breakdown (peak-hour math) ─── */}
      {capacityModel && (
        <div className="mb-6 bg-slate-900/40 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Capacity Model -- How Many Systems Are Needed</div>
              <div className="text-sm text-slate-300 mt-1">{capacityModel.rationale}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-amber-400">{capacityModel.systems_needed}</div>
              <div className="text-[10px] text-slate-500 uppercase">systems needed</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-slate-200">{capacityModel.peak_window_hours_per_day}h</div>
              <div className="text-[10px] text-slate-400">Peak window/day</div>
              <div className="text-[9px] text-slate-500">7:30am - 12:00pm</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-slate-200">{Math.round((capacityModel.target_utilization || 0) * 100)}%</div>
              <div className="text-[10px] text-slate-400">Target utilization</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-slate-200">{capacityModel.or_days_per_year}</div>
              <div className="text-[10px] text-slate-400">OR days/year</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-slate-200">{capacityModel.avg_robotic_case_hours}h</div>
              <div className="text-[10px] text-slate-400">Hrs/case (incl. turnover)</div>
            </div>
            <div className="bg-emerald-900/40 border border-emerald-700/40 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-emerald-200">{fmt(capacityModel.cases_per_robot_per_year)}</div>
              <div className="text-[10px] text-emerald-300">Cases/robot/year</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 italic">Math: ({capacityModel.peak_window_hours_per_day} x {Math.round((capacityModel.target_utilization || 0) * 100)}% x {capacityModel.or_days_per_year}) / {capacityModel.avg_robotic_case_hours} &asymp; {fmt(capacityModel.cases_per_robot_per_year)} cases/robot/year. Then ceil({fmt(utilForecast.design_cases)} / {fmt(capacityModel.cases_per_robot_per_year)}) = {capacityModel.systems_needed} systems.</div>
        </div>
      )}

      {/* Primary Recommendation */}
      {primary && (
        <div className="bg-gradient-to-br from-intuitive-900/40 to-slate-900/60 border-2 border-intuitive-600 rounded-2xl p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-intuitive-400 mb-2">Primary Recommendation</div>
              <h2 className="text-3xl font-black text-white">{primary.system_model === 'dV5' ? 'da Vinci 5' : primary.system_model === 'Xi' ? 'da Vinci Xi' : primary.system_model === 'X' ? 'da Vinci X' : 'da Vinci SP'}</h2>
              <p className="text-slate-400 text-sm mt-1">Quantity: {primary.quantity} system{primary.quantity > 1 ? 's' : ''}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-intuitive-400">{primary.fit_score}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Fit Score</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-white">{fmtM(primary.estimated_price)}</div>
              <div className="text-[10px] text-slate-400">System Price</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-amber-400">{fmt(primary.projected_annual_cases)}</div>
              <div className="text-[10px] text-slate-400">Projected Cases/Yr</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-green-400">{primary.projected_utilization_pct}%</div>
              <div className="text-[10px] text-slate-400">Utilization</div>
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-emerald-400">{primary.five_year_roi_pct}%</div>
              <div className="text-[10px] text-slate-400">5-Year ROI</div>
            </div>
          </div>

          <div className="bg-slate-800/30 rounded-lg p-4 mb-4">
            <div className="text-xs font-bold text-intuitive-400 uppercase mb-2">Rationale</div>
            <p className="text-sm text-slate-300 leading-relaxed">{primary.rationale}</p>
          </div>

          {primary.details?.warnings?.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-800/30 rounded-lg p-4">
              <div className="text-xs font-bold text-amber-400 uppercase mb-2">Considerations</div>
              <ul className="space-y-1">
                {primary.details.warnings.map((w, i) => <li key={i} className="text-sm text-amber-200/80">- {w}</li>)}
              </ul>
            </div>
          )}

          {primary.specialties_served?.length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {primary.specialties_served.map(s => (
                <span key={s} className="px-3 py-1 bg-intuitive-900/50 border border-intuitive-700 rounded-full text-[10px] font-semibold text-intuitive-300 uppercase">{s}</span>
              ))}
            </div>
          )}

          {primary.risk_factors?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold text-red-400 uppercase mb-2">Risk Factors</div>
              <ul className="space-y-1">
                {primary.risk_factors.map((r, i) => <li key={i} className="text-xs text-red-300/80">- {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Alternative */}
      {alternatives.map(alt => (
        <div key={alt.id} className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Alternative</div>
              <h3 className="text-xl font-bold text-white">{alt.system_model === 'Xi' ? 'da Vinci Xi' : alt.system_model === 'X' ? 'da Vinci X' : alt.system_model === 'dV5' ? 'da Vinci 5' : 'da Vinci SP'}</h3>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-400">{alt.fit_score}</div>
              <div className="text-[10px] text-slate-500">Fit Score</div>
            </div>
          </div>
          <p className="text-sm text-slate-400">{alt.rationale}</p>
          <p className="text-xs text-slate-500 mt-2">Estimated price: {fmtM(alt.estimated_price)}</p>
        </div>
      ))}

      {recs.length === 0 && <div className="text-slate-400 text-center py-10">No recommendations generated yet. Run the analysis first.</div>}

      <PageNotes title="System Recommendation">
        <p className="mb-2">This page answers: <span className="text-cyan-300">which da Vinci model, and how many of them, should this hospital buy?</span> It is the output of the same analysis engine — no new outside data is pulled here.</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><span className="text-white font-semibold">Fit Score (out of 100)</span> is a weighted match of the model to the hospital: volume fit (0–30), specialty coverage (0–25), budget fit (0–20), OR infrastructure (0–15), and a hospital-type bonus (0–10). Higher = better fit.</li>
          <li><span className="text-white font-semibold">How many systems</span> = projected design-year robotic cases ÷ what one robot can handle per year, rounded up. One robot's yearly capacity ≈ (4.5 peak OR-hours/day × 70% target utilization × ~250 OR-days) ÷ ~2.5 hours per robotic case. The capacity card shows this exact arithmetic.</li>
          <li>The projected case volume behind this is <span className="text-cyan-300">conversion-based</span> — existing open/laparoscopic cases that could shift to da Vinci (same cases, different technique), <span className="text-red-300">not net-new volume</span>. It sizes the equipment; it is not a revenue forecast.</li>
          <li>When per-procedure clinical fit and volume-capacity math point to different models, the <span className="text-white font-semibold">Two Paths</span> card shows both — both are valid; the choice depends on whether clinical outcomes or capacity/ROI drives the decision.</li>
        </ul>
        <p className="mt-2"><span className="text-white font-semibold">Bottom line:</span> this is a <span className="text-cyan-300">capital-sizing recommendation</span> built on modeled volume and published capacity benchmarks. It tells you what to buy — the <span className="text-amber-300">new revenue</span> case is made separately from surgeon commitments and the Business Plan.</p>
      </PageNotes>
    </div>
  )
}
