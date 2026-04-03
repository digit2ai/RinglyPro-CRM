import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

import ProcedureParetoChart from '../components/ProcedureParetoChart'
import SeasonalityChart from '../components/SeasonalityChart'
import WeekdayChart from '../components/WeekdayChart'
import HourlyChart from '../components/HourlyChart'
import CompatibilityMatrix from '../components/CompatibilityMatrix'
import BreakevenChart from '../components/BreakevenChart'
import GrowthProjectionChart from '../components/GrowthProjectionChart'
import DesignDayCard from '../components/DesignDayCard'

// ─── Shared UI Components ─────────────────────────────────────

function KpiCard({ label, value, sub, color = 'text-intuitive-400' }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 text-center hover:border-slate-600 transition-all">
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-slate-300 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function RiskBadge({ level }) {
  const colors = {
    critical: 'bg-red-900/40 text-red-300 border-red-800',
    high: 'bg-orange-900/40 text-orange-300 border-orange-800',
    moderate: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    low: 'bg-green-900/40 text-green-300 border-green-800'
  }
  return <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${colors[level] || colors.low}`}>{level}</span>
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────

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
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg className="animate-spin w-12 h-12 text-intuitive-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-400 text-lg">Loading analysis results...</p>
          <p className="text-slate-500 text-sm mt-1">Computing hospital analytics</p>
        </div>
      </div>
    )
  }
  if (!results) return <div className="p-10 text-slate-400">No results yet. Run the analysis first.</div>

  const vol = results.volume_projection || {}
  const util = results.utilization_forecast || {}
  const surgeon = results.surgeon_capacity || {}
  const infra = results.infrastructure_assessment || {}
  const roi = results.roi_calculation || {}
  const risk = results.risk_assessment || {}
  const match = results.model_matching || {}
  const primary = match.primary_recommendation || {}
  const pareto = results.procedure_pareto || {}
  const seasonality = results.monthly_seasonality || {}
  const weekday = results.weekday_distribution || {}
  const hourly = results.hourly_distribution || {}
  const designDay = results.design_day_analysis || {}
  const compat = results.robot_compatibility_matrix || {}
  const financial = results.financial_deep_dive || {}
  const growth = results.growth_extrapolation || {}

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{project?.hospital_name || 'Hospital'} -- Full Analysis</h1>
          <p className="text-slate-400 text-sm">Project {project?.project_code} -- {Object.keys(results).length} analysis modules</p>
        </div>
        <button onClick={() => navigate(`/recommendations/${id}`)} className="bg-intuitive-600 hover:bg-intuitive-700 text-white font-semibold py-2.5 px-5 rounded-lg text-sm transition-all">
          View System Recommendation &rarr;
        </button>
      </div>

      {/* ─── 1. KPI Strip (8 cards) ─── */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        <KpiCard label="Annual Surgical Vol" value={vol.total_surgical?.toLocaleString() || '0'} sub="All procedures" />
        <KpiCard label="Projected Robotic" value={vol.design_year_cases?.toLocaleString() || '0'} sub="Year 3 steady state" color="text-violet-400" />
        <KpiCard label="Systems Needed" value={util.systems_needed || '0'} color="text-amber-400" />
        <KpiCard label="Recommended" value={primary.system || '--'} color="text-emerald-400" sub={`Score: ${primary.score || 0}/100`} />
        <KpiCard label="Gini Index" value={pareto.gini_coefficient?.toFixed(3) || '--'} color="text-blue-400" sub="Procedure concentration" />
        <KpiCard label="Design Day (P75)" value={designDay.design_day || '--'} color="text-cyan-400" sub="cases/day" />
        <KpiCard label="5-Year ROI" value={`${roi.five_year_roi_pct || 0}%`} color="text-green-400" />
        <KpiCard label="Risk Level" value={risk.overall_risk?.toUpperCase() || 'N/A'} color={risk.overall_risk === 'critical' ? 'text-red-400' : risk.overall_risk === 'high' ? 'text-orange-400' : risk.overall_risk === 'moderate' ? 'text-yellow-400' : 'text-green-400'} />
      </div>

      {/* ─── 2. Procedure Pareto (Lorenz + ABC) ─── */}
      <div className="mb-6">
        <SectionCard
          title="Procedure Pareto Analysis"
          subtitle="Lorenz curve and ABC classification of surgical procedure types by volume concentration"
        >
          <ProcedureParetoChart data={pareto} />
        </SectionCard>
      </div>

      {/* ─── 3+4. Seasonality + Weekday (side by side) ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <SectionCard
          title="Monthly Seasonality"
          subtitle="12-month volume patterns with coefficient of variation and seasonality classification"
        >
          <SeasonalityChart data={seasonality} />
        </SectionCard>

        <SectionCard
          title="Weekday Distribution"
          subtitle="Day-of-week surgical volume distribution for scheduling optimization"
        >
          <WeekdayChart data={weekday} />
        </SectionCard>
      </div>

      {/* ─── 5. Hourly OR Utilization ─── */}
      <div className="mb-6">
        <SectionCard
          title="Hourly OR Utilization"
          subtitle="Hour-by-hour operating room utilization pattern for capacity planning"
        >
          <HourlyChart data={hourly} />
        </SectionCard>
      </div>

      {/* ─── 6. Robot Compatibility Matrix ─── */}
      <div className="mb-6">
        <SectionCard
          title="Robot Compatibility Matrix"
          subtitle="Procedure-level fit scores for each da Vinci system model"
        >
          <CompatibilityMatrix data={compat} />
        </SectionCard>
      </div>

      {/* ─── 7. Design Day Analysis ─── */}
      <div className="mb-6">
        <SectionCard
          title="Design Day Analysis"
          subtitle="Daily volume percentiles for system capacity planning -- P75 recommended as design basis"
        >
          <DesignDayCard data={designDay} />
        </SectionCard>
      </div>

      {/* ─── 8. Financial Deep Dive ─── */}
      <div className="mb-6">
        <SectionCard
          title="Financial Deep Dive"
          subtitle="Total cost of ownership breakdown, payer-adjusted revenue, and breakeven analysis"
        >
          <BreakevenChart data={financial} />
          {/* Per-procedure economics */}
          {financial.per_procedure_economics && (
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
                <div className="text-[10px] uppercase text-slate-500 font-bold">Robotic Margin</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">${(financial.per_procedure_economics.robotic?.margin || 0).toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">per case</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
                <div className="text-[10px] uppercase text-slate-500 font-bold">Laparoscopic Margin</div>
                <div className="text-xl font-bold text-slate-300 mt-1">${(financial.per_procedure_economics.laparoscopic?.margin || 0).toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">per case</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
                <div className="text-[10px] uppercase text-slate-500 font-bold">Incremental Margin</div>
                <div className="text-xl font-bold text-green-400 mt-1">+${(financial.per_procedure_economics.incremental_margin || 0).toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">per robotic case</div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ─── 9. Growth Projections ─── */}
      <div className="mb-6">
        <SectionCard
          title="Growth Projections"
          subtitle="5-year volume forecasts under conservative, baseline, and aggressive growth scenarios"
        >
          <GrowthProjectionChart data={growth} />
        </SectionCard>
      </div>

      {/* ─── 10. Volume Projection (existing 5-year ramp) ─── */}
      <div className="mb-6">
        <SectionCard
          title="Robotic Adoption Ramp"
          subtitle="5-year adoption trajectory based on specialty-weighted conversion rates"
        >
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

          {/* Specialty Breakdown */}
          {vol.by_specialty && Object.keys(vol.by_specialty).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-400 mb-2">Specialty Breakdown</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {Object.entries(vol.by_specialty).map(([spec, data]) => (
                  <div key={spec} className="bg-slate-800/30 rounded-lg p-3">
                    <div className="text-[10px] uppercase text-slate-500 font-bold">{spec.replace('_', ' ')}</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-bold text-white">{data.convertible}</span>
                      <span className="text-[10px] text-slate-500">convertible of {data.volume}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                      <div className="h-1.5 rounded-full bg-intuitive-500" style={{ width: `${Math.min(data.rate * 100, 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{Math.round(data.rate * 100)}% conversion rate</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ─── Utilization + Surgeon + Infra (3-col) ─── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-3">Utilization Forecast</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Cases/Day</span><span className="text-white font-semibold">{util.cases_per_day}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Avg Case Duration</span><span className="text-white font-semibold">{util.avg_case_duration_hrs}h</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Max/System/Year</span><span className="text-white font-semibold">{util.max_cases_per_system_year}</span></div>
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
            <div className="flex justify-between"><span className="text-slate-400">Ideal</span><span className="text-slate-500 font-semibold">{surgeon.ideal_cases_per_surgeon}/yr</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status</span><RiskBadge level={surgeon.single_surgeon_risk ? 'critical' : surgeon.capacity_status === 'over_capacity' ? 'high' : 'low'} /></div>
          </div>
          {surgeon.recommendation && <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">{surgeon.recommendation}</p>}
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-3">Infrastructure</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Readiness</span><span className="text-white font-semibold">{infra.readiness_score}/100</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-white font-semibold">{infra.readiness_label}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Total ORs</span><span className="text-white font-semibold">{infra.total_ors}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Robot-Ready ORs</span><span className="text-white font-semibold">{infra.robot_ready_ors}</span></div>
            {infra.total_renovation_estimate > 0 && <div className="flex justify-between"><span className="text-slate-400">Renovation Est.</span><span className="text-amber-400 font-semibold">${(infra.total_renovation_estimate / 1e6).toFixed(1)}M</span></div>}
          </div>
        </div>
      </div>

      {/* ─── 11. Risk Assessment ─── */}
      {risk.risks?.length > 0 && (
        <div className="mb-6">
          <SectionCard
            title="Risk Assessment"
            subtitle={`${risk.risk_count} risk factor${risk.risk_count !== 1 ? 's' : ''} identified`}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-slate-400">Overall:</span>
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
          </SectionCard>
        </div>
      )}

      {/* ─── ROI Summary (existing) ─── */}
      <div className="mb-6">
        <SectionCard
          title={`ROI Summary -- ${roi.recommended_system || 'System'}`}
          subtitle="Capital investment return analysis for the recommended system"
        >
          <div className="grid grid-cols-4 gap-4 mb-4">
            <KpiCard label="Capital Cost" value={roi.capital_cost > 0 ? `$${(roi.capital_cost / 1e6).toFixed(1)}M` : 'Lease'} color="text-slate-300" />
            <KpiCard label="Annual Net Benefit" value={`$${((roi.annual_net_benefit || 0) / 1e6).toFixed(1)}M`} color="text-green-400" />
            <KpiCard label="Payback" value={roi.payback_months > 0 ? `${roi.payback_months} mo` : 'N/A'} color="text-amber-400" />
            <KpiCard label="5-Year ROI" value={`${roi.five_year_roi_pct || 0}%`} color="text-emerald-400" />
          </div>

          {/* 5-year P&L */}
          {roi.five_year_projections?.length > 0 && (
            <div className="grid grid-cols-5 gap-2 mt-4">
              {roi.five_year_projections.map(yr => (
                <div key={yr.year} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-center">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Year {yr.year}</div>
                  <div className={`text-sm font-bold mt-1 ${yr.cumulative_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${(yr.cumulative_net / 1e6).toFixed(1)}M
                  </div>
                  <div className="text-[10px] text-slate-500">cumulative net</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
