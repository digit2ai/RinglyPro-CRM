import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function KpiCard({ label, value, sub, color = 'text-intuitive-400' }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 text-center">
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-slate-300 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function RiskBadge({ level }) {
  const colors = { critical: 'bg-red-900/40 text-red-300 border-red-800', high: 'bg-orange-900/40 text-orange-300 border-orange-800', moderate: 'bg-yellow-900/40 text-yellow-300 border-yellow-800', low: 'bg-green-900/40 text-green-300 border-green-800' }
  return <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${colors[level] || colors.low}`}>{level}</span>
}

export default function AnalysisPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [results, setResults] = useState(null)
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    Promise.all([api.getProject(id), api.getResults(id)])
      .then(([pRes, aRes]) => { setProject(pRes.project); setResults(aRes.results) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No project selected. Complete the intake form first.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading analysis...</div>
  if (!results) return <div className="p-10 text-slate-400">No results yet.</div>

  const vol = results.volume_projection || {}
  const util = results.utilization_forecast || {}
  const surgeon = results.surgeon_capacity || {}
  const infra = results.infrastructure_assessment || {}
  const roi = results.roi_calculation || {}
  const risk = results.risk_assessment || {}
  const match = results.model_matching || {}
  const primary = match.primary_recommendation || {}

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{project?.hospital_name || 'Hospital'} -- Analysis</h1>
          <p className="text-slate-400 text-sm">Project {project?.project_code}</p>
        </div>
        <button onClick={() => navigate(`/recommendations/${id}`)} className="bg-intuitive-600 hover:bg-intuitive-700 text-white font-semibold py-2.5 px-5 rounded-lg text-sm transition-all">
          View System Recommendation &rarr;
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard label="Projected Annual Cases" value={vol.design_year_cases?.toLocaleString() || '0'} sub="Year 3 steady state" />
        <KpiCard label="Systems Needed" value={util.systems_needed || '0'} color="text-amber-400" />
        <KpiCard label="Recommended System" value={primary.system || '--'} color="text-emerald-400" />
        <KpiCard label="5-Year ROI" value={`${roi.five_year_roi_pct || 0}%`} color="text-green-400" />
      </div>

      {/* Volume Projection */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Volume Projection (5-Year Ramp)</h3>
        <div className="grid grid-cols-5 gap-3">
          {(vol.projections || []).map(p => (
            <div key={p.year} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
              <div className="text-[10px] uppercase font-bold text-slate-500">Year {p.year}</div>
              <div className="text-xl font-bold text-white mt-1">{p.projected_cases?.toLocaleString()}</div>
              <div className="text-[10px] text-slate-400">{p.cases_per_week} cases/wk</div>
              <div className="text-[10px] text-intuitive-400">{p.adoption_rate}% adoption</div>
            </div>
          ))}
        </div>
      </div>

      {/* Utilization + Surgeon + Infra */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-3">Utilization Forecast</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Cases/Day</span><span className="text-white font-semibold">{util.cases_per_day}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Avg Case Duration</span><span className="text-white font-semibold">{util.avg_case_duration_hrs}h</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Projected Utilization</span><span className="text-white font-semibold">{util.projected_utilization_pct}%</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Risk</span><RiskBadge level={util.utilization_risk || 'low'} /></div>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-3">Surgeon Capacity</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Credentialed</span><span className="text-white font-semibold">{surgeon.credentialed_surgeons}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Interested</span><span className="text-white font-semibold">{surgeon.interested_surgeons}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Cases/Surgeon</span><span className="text-white font-semibold">{surgeon.cases_per_surgeon}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status</span><RiskBadge level={surgeon.single_surgeon_risk ? 'critical' : surgeon.capacity_status === 'over_capacity' ? 'high' : 'low'} /></div>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-3">Infrastructure</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Readiness</span><span className="text-white font-semibold">{infra.readiness_score}/100</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-white font-semibold">{infra.readiness_label}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Robot-Ready ORs</span><span className="text-white font-semibold">{infra.robot_ready_ors}</span></div>
            {infra.total_renovation_estimate > 0 && <div className="flex justify-between"><span className="text-slate-400">Renovation Est.</span><span className="text-amber-400 font-semibold">${(infra.total_renovation_estimate / 1e6).toFixed(1)}M</span></div>}
          </div>
        </div>
      </div>

      {/* ROI Summary */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">ROI Summary -- {roi.recommended_system}</h3>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <KpiCard label="Capital Cost" value={roi.capital_cost > 0 ? `$${(roi.capital_cost/1e6).toFixed(1)}M` : 'Lease'} color="text-slate-300" />
          <KpiCard label="Annual Net Benefit" value={`$${(roi.annual_net_benefit/1e6).toFixed(1)}M`} color="text-green-400" />
          <KpiCard label="Payback" value={roi.payback_months > 0 ? `${roi.payback_months} mo` : 'N/A'} color="text-amber-400" />
          <KpiCard label="5-Year ROI" value={`${roi.five_year_roi_pct}%`} color="text-emerald-400" />
        </div>
      </div>

      {/* Risks */}
      {risk.risks?.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold text-white">Risk Assessment</h3>
            <RiskBadge level={risk.overall_risk} />
          </div>
          <div className="space-y-3">
            {risk.risks.map((r, i) => (
              <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <RiskBadge level={r.severity} />
                  <span className="text-sm font-semibold text-white">{r.category}</span>
                </div>
                <p className="text-sm text-slate-300">{r.description}</p>
                <p className="text-xs text-intuitive-400 mt-1">Mitigation: {r.mitigation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
