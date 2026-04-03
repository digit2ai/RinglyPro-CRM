import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts'

const COLORS = {
  sky: '#0ea5e9', emerald: '#10b981', yellow: '#eab308', red: '#ef4444',
  orange: '#f97316', purple: '#8b5cf6', slate: '#94a3b8', blue: '#3b82f6'
}

const PIE_COLORS = ['#0ea5e9', '#10b981', '#eab308', '#ef4444', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899']

const tooltipStyle = {
  contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' },
  labelStyle: { color: '#94a3b8' }
}

function MetricCard({ label, value, sub, color = 'sky' }) {
  const colorMap = { sky: 'text-sky-400', emerald: 'text-emerald-400', yellow: 'text-yellow-400', red: 'text-red-400', blue: 'text-blue-400' }
  return (
    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
      <p className={`text-2xl font-bold ${colorMap[color] || 'text-sky-400'}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

export default function PresentationPage() {
  const { projectId: paramProjectId } = useParams()
  const projectId = paramProjectId || localStorage.getItem('intuitive_project_id')
  const [project, setProject] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [activeSlide, setActiveSlide] = useState(0)
  const [loading, setLoading] = useState(true)
  const [proposalStatus, setProposalStatus] = useState(null)
  const [polling, setPolling] = useState(false)

  const fmt = (n) => {
    if (n == null || isNaN(n)) return '--'
    return Number(n).toLocaleString()
  }

  // Load data
  useEffect(() => {
    if (!projectId) { setLoading(false); return }
    Promise.all([
      api.getProject(projectId).catch(() => null),
      api.getResults(projectId).catch(() => null),
    ]).then(([projRes, analRes]) => {
      const proj = projRes?.data || projRes
      setProject(proj)

      // Analysis results come as array or map
      let analysisMap = {}
      if (analRes?.data) {
        if (Array.isArray(analRes.data)) {
          for (const r of analRes.data) {
            analysisMap[r.analysis_type] = r.result_data
          }
        } else {
          analysisMap = analRes.data
        }
      } else if (analRes && !analRes.data) {
        analysisMap = analRes
      }
      setAnalysisData(analysisMap)

      // Load recommendations from analysis or separate endpoint
      const recs = analysisMap._recommendations || []
      setRecommendations(recs)
      setLoading(false)
    })
  }, [projectId])

  // Generate proposal
  const startProposalGeneration = async () => {
    if (!projectId) return
    setProposalStatus({ status: 'generating', step: 'init', detail: 'Generating Rachel narration...' })
    try {
      await api.generateProposal(projectId)
      setPolling(true)
    } catch (err) {
      setProposalStatus({ status: 'error', step: 'error', detail: err.message })
    }
  }

  // Poll status
  useEffect(() => {
    if (!polling || !projectId) return
    const interval = setInterval(async () => {
      try {
        const res = await api.getProposalStatus(projectId)
        const data = res?.data || res
        setProposalStatus(data)
        if (data.status === 'completed' || data.status === 'error') {
          setPolling(false)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, projectId])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setActiveSlide(s => Math.min(s + 1, 12))
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setActiveSlide(s => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Extract data
  const hospitalName = project?.hospital_name || 'Your Hospital'
  const hasData = !!analysisData && Object.keys(analysisData).length > 0

  const procedurePareto = analysisData?.procedure_pareto || {}
  const monthlySeason = analysisData?.monthly_seasonality || {}
  const weekdayDist = analysisData?.weekday_distribution || {}
  const hourlyDist = analysisData?.hourly_distribution || {}
  const designDay = analysisData?.design_day_analysis || {}
  const robotCompat = analysisData?.robot_compatibility_matrix || {}
  const volProj = analysisData?.volume_projection || {}
  const financialDeep = analysisData?.financial_deep_dive || {}
  const growthExtrap = analysisData?.growth_extrapolation || {}
  const modelMatch = analysisData?.model_matching || {}
  const riskAssess = analysisData?.risk_assessment || {}
  const surgCap = analysisData?.surgeon_capacity || {}

  // Chart data builders
  const specialties = []
  if (project?.specialty_urology) specialties.push({ name: 'Urology', value: project.specialty_urology })
  if (project?.specialty_gynecology) specialties.push({ name: 'Gynecology', value: project.specialty_gynecology })
  if (project?.specialty_general) specialties.push({ name: 'General', value: project.specialty_general })
  if (project?.specialty_thoracic) specialties.push({ name: 'Thoracic', value: project.specialty_thoracic })
  if (project?.specialty_colorectal) specialties.push({ name: 'Colorectal', value: project.specialty_colorectal })
  if (project?.specialty_head_neck) specialties.push({ name: 'Head & Neck', value: project.specialty_head_neck })
  if (project?.specialty_cardiac) specialties.push({ name: 'Cardiac', value: project.specialty_cardiac })
  const specialtyData = specialties.filter(s => s.value > 0)

  const topProcs = (procedurePareto.top_procedures || []).slice(0, 10)
  const paretoChartData = topProcs.map(p => ({
    name: (p.name || p.procedure || '').substring(0, 25),
    cases: p.cases || p.count || 0
  }))

  const monthlyData = (monthlySeason.months || []).map(m => ({
    name: m.month || m.label || '',
    cases: m.cases || m.volume || m.count || 0
  }))

  const weekdayData = (weekdayDist.days || []).map(d => ({
    name: d.day || d.label || '',
    cases: d.cases || d.volume || d.count || 0
  }))

  const hourlyData = (hourlyDist.hours || []).map(h => ({
    name: String(h.hour || h.label || ''),
    cases: h.cases || h.volume || h.count || 0
  }))

  const compatData = (robotCompat.procedures || []).slice(0, 10).map(p => ({
    name: (p.name || p.procedure || '').substring(0, 20),
    dV5: p.dv5_score || p.dV5 || 0,
    Xi: p.xi_score || p.Xi || 0,
    X: p.x_score || p.X || 0,
    SP: p.sp_score || p.SP || 0
  }))

  const designDayData = [
    { name: 'P50', cases: (designDay.p50 || {}).cases || 0 },
    { name: 'P75', cases: (designDay.p75 || {}).cases || 0 },
    { name: 'P90', cases: (designDay.p90 || {}).cases || 0 },
    { name: 'P95', cases: (designDay.p95 || {}).cases || 0 }
  ]

  const yearlyProj = volProj.yearly_projections || volProj.projections || []
  const volumeRampData = yearlyProj.map(p => ({
    name: 'Y' + (p.year || ''),
    cases: p.total_cases || p.robotic_cases || 0
  }))

  const breakevenData = (financialDeep.monthly_cashflow || financialDeep.cashflow || []).map((m, i) => ({
    name: 'M' + (m.month || i + 1),
    cumulative: m.cumulative || m.net || 0
  }))

  const scenarios = growthExtrap.scenarios || []
  const growthData = (() => {
    if (scenarios.length === 0) return []
    const years = [1, 2, 3, 4, 5]
    return years.map(y => {
      const point = { name: `Y${y}` }
      for (const s of scenarios) {
        const key = s.name || s.label || 'scenario'
        point[key] = s[`year${y}_cases`] || s[`cases_y${y}`] || 0
      }
      return point
    })
  })()

  const tco = financialDeep.total_cost_of_ownership || financialDeep.tco || {}
  const primaryModel = modelMatch.primary_recommendation || modelMatch.recommended_model || '--'
  const fitScore = modelMatch.fit_score || modelMatch.overall_fit || 0
  const rationale = modelMatch.rationale || modelMatch.reasoning || ''
  const riskFactors = riskAssess.risk_factors || riskAssess.factors || []

  const RADIAN = Math.PI / 180
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return percent > 0.03 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null
  }

  const slides = [
    // Slide 0: Title
    {
      title: 'da Vinci System Assessment',
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-sky-900 to-sky-500 flex items-center justify-center shadow-lg shadow-sky-600/20">
            <span className="text-white font-bold text-3xl">dV</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white mb-3">{hospitalName}</h1>
            <p className="text-xl text-slate-300">Robotic Surgery System Assessment</p>
            <p className="text-sm text-slate-500 mt-4">{project?.hospital_type || ''} | {fmt(project?.bed_count)} beds | {project?.state || ''}</p>
            <p className="text-xs text-slate-500 mt-2">Project: {project?.project_code || ''}</p>
          </div>
          <div className="flex items-center gap-3 mt-8">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-emerald-400">Rachel Voice AI Ready -- Click the widget to begin</span>
          </div>
          {!hasData && !loading && (
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 max-w-md">
              <p className="text-sm text-yellow-300">{projectId ? 'Analysis not yet complete. Run the analysis first.' : 'Select a project to load presentation data.'}</p>
            </div>
          )}
        </div>
      )
    },

    // Slide 1: Hospital Profile
    {
      title: 'Hospital Profile',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Comprehensive hospital profile and surgical program overview.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Bed Count" value={fmt(project?.bed_count)} />
            <MetricCard label="Hospital Type" value={project?.hospital_type || '--'} />
            <MetricCard label="Annual Surgical Volume" value={fmt(project?.annual_surgical_volume)} />
            <MetricCard label="Current System" value={project?.current_system || 'None'} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Current Robots" value={fmt(project?.current_system_count || 0)} color="emerald" />
            <MetricCard label="Credentialed Surgeons" value={fmt(surgCap.credentialed_surgeons || project?.credentialed_robotic_surgeons || 0)} color="emerald" />
            <MetricCard label="Interested Surgeons" value={fmt(surgCap.interested_surgeons || project?.surgeons_interested || 0)} color="yellow" />
            <MetricCard label="Robot-Ready ORs" value={fmt(project?.robot_ready_ors || 0)} color="sky" />
          </div>
          {specialtyData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Specialty Mix</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={specialtyData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={2} dataKey="value" labelLine={false} label={renderLabel}>
                    {specialtyData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />)}
                  </Pie>
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )
    },

    // Slide 2: Procedure Pareto
    {
      title: 'Procedure Volume Analysis',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Pareto analysis of surgical procedures -- ABC classification by volume.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Gini Coefficient" value={procedurePareto.gini_coefficient || procedurePareto.gini || '--'} />
            <MetricCard label="Total Procedures" value={fmt(procedurePareto.total_procedures || procedurePareto.total || 0)} />
            <MetricCard label="Procedure Types" value={fmt(topProcs.length)} />
            <MetricCard label="ABC Separation" value={(procedurePareto.gini_coefficient || 0) >= 0.6 ? 'Strong' : 'Moderate'} color="emerald" />
          </div>
          {paretoChartData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Top Procedures by Volume</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={paretoChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={140} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="cases" name="Cases" fill={COLORS.sky} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {topProcs.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
                    <th className="py-2 px-2 text-left">#</th>
                    <th className="py-2 px-2 text-left">Procedure</th>
                    <th className="py-2 px-2 text-right">Cases</th>
                    <th className="py-2 px-2 text-right">%</th>
                    <th className="py-2 px-2 text-right">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {topProcs.map((p, i) => (
                    <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                      <td className="py-1.5 px-2 text-slate-400">{i + 1}</td>
                      <td className="py-1.5 px-2 text-white">{p.name || p.procedure}</td>
                      <td className="py-1.5 px-2 text-right text-white">{fmt(p.cases || p.count || 0)}</td>
                      <td className="py-1.5 px-2 text-right text-slate-300">{p.pct || p.percentage || 0}%</td>
                      <td className="py-1.5 px-2 text-right"><span className={`font-bold ${(p.abc_class || p.class) === 'A' ? 'text-emerald-400' : (p.abc_class || p.class) === 'B' ? 'text-yellow-400' : 'text-slate-400'}`}>{p.abc_class || p.class || ''}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )
    },

    // Slide 3: Monthly Seasonality
    {
      title: 'Monthly Surgical Volume',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Seasonal patterns in surgical volume across the calendar year.</p>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="CoV" value={monthlySeason.coefficient_of_variation || monthlySeason.cov || '--'} />
            <MetricCard label="Peak Month" value={monthlySeason.peak_month || '--'} color="emerald" />
            <MetricCard label="Seasonal Pattern" value={(monthlySeason.coefficient_of_variation || 0) >= 0.15 ? 'Notable' : 'Consistent'} color="yellow" />
          </div>
          {monthlyData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cases by Month</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="cases" name="Cases" fill={COLORS.sky} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )
    },

    // Slide 4: Weekday Distribution
    {
      title: 'Weekday Surgical Distribution',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Surgical volume distribution across weekdays for OR block scheduling.</p>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Peak Day" value={weekdayDist.peak_day || '--'} color="emerald" />
            <MetricCard label="Days Analyzed" value={fmt(weekdayDist.total_days || 0)} />
          </div>
          {weekdayData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cases by Weekday</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weekdayData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="cases" name="Cases" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )
    },

    // Slide 5: Hourly OR Utilization
    {
      title: 'Hourly OR Utilization',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Surgical activity distribution across the day for capacity planning.</p>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Peak Hour" value={hourlyDist.peak_hour || '--'} color="emerald" />
            <MetricCard label="Total ORs" value={fmt(project?.total_or_count || 0)} />
            <MetricCard label="Robot-Ready ORs" value={fmt(project?.robot_ready_ors || 0)} color="sky" />
          </div>
          {hourlyData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cases by Hour</p>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={hourlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.sky} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={COLORS.sky} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="cases" name="Cases" stroke={COLORS.sky} fill="url(#hourlyGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )
    },

    // Slide 6: Compatibility Matrix
    {
      title: 'Robot Compatibility Matrix',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Fit scores by procedure for each da Vinci system model.</p>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Procedures Analyzed" value={fmt((robotCompat.procedures || []).length)} />
            <MetricCard label="Best Overall Model" value={robotCompat.best_overall_model || '--'} color="emerald" />
          </div>
          {compatData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Fit Score by Procedure & Model</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={compatData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={120} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  <Bar dataKey="dV5" name="dV5" fill={COLORS.sky} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Xi" name="Xi" fill={COLORS.emerald} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="X" name="X" fill={COLORS.yellow} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="SP" name="SP" fill={COLORS.purple} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )
    },

    // Slide 7: Design Day
    {
      title: 'Design Day Analysis',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Percentile-based capacity planning for surgical volume.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-xs text-slate-400 mb-1">P50 (Typical)</p>
              <p className="text-3xl font-bold text-slate-300">{fmt((designDay.p50 || {}).cases || 0)}</p>
              <p className="text-xs text-slate-400 mt-1">cases/day</p>
            </div>
            <div className="p-5 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">P75 (Design)</p>
              <p className="text-3xl font-bold text-emerald-400">{fmt((designDay.p75 || {}).cases || 0)}</p>
              <p className="text-xs text-slate-400 mt-1">cases/day</p>
            </div>
            <div className="p-5 rounded-lg bg-yellow-900/20 border border-yellow-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">P90</p>
              <p className="text-3xl font-bold text-yellow-400">{fmt((designDay.p90 || {}).cases || 0)}</p>
              <p className="text-xs text-slate-400 mt-1">cases/day</p>
            </div>
            <div className="p-5 rounded-lg bg-red-900/20 border border-red-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">P95 (Peak)</p>
              <p className="text-3xl font-bold text-red-400">{fmt((designDay.p95 || {}).cases || 0)}</p>
              <p className="text-xs text-slate-400 mt-1">cases/day</p>
            </div>
          </div>
          {designDayData.some(d => d.cases > 0) && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Percentile Comparison</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={designDayData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="cases" name="Cases/Day" radius={[4, 4, 0, 0]}>
                    {designDayData.map((entry, i) => (
                      <Cell key={i} fill={['#94a3b8', '#10b981', '#eab308', '#ef4444'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30">
            <p className="text-sm text-emerald-300">The P75 design day at {fmt((designDay.p75 || {}).cases || 0)} cases ensures the system handles peak demand the majority of the time while remaining cost-effective.</p>
          </div>
        </div>
      )
    },

    // Slide 8: Volume Projection
    {
      title: '5-Year Volume Projection',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Robotic case volume ramp based on adoption modeling and surgeon pipeline.</p>
          {yearlyProj.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard label="Y1 Cases" value={fmt(yearlyProj[0]?.total_cases || yearlyProj[0]?.robotic_cases || 0)} />
              {yearlyProj.length >= 3 && <MetricCard label="Y3 Cases" value={fmt(yearlyProj[2]?.total_cases || yearlyProj[2]?.robotic_cases || 0)} color="yellow" />}
              {yearlyProj.length >= 5 && <MetricCard label="Y5 Cases" value={fmt(yearlyProj[4]?.total_cases || yearlyProj[4]?.robotic_cases || 0)} color="emerald" />}
              <MetricCard label="Adoption Rate" value={(volProj.adoption_rate || volProj.ramp_rate || '--') + '%'} />
            </div>
          )}
          {volumeRampData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Projected Robotic Cases by Year</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={volumeRampData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="cases" name="Robotic Cases" fill={COLORS.sky} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )
    },

    // Slide 9: Financial Deep Dive
    {
      title: 'Financial Deep Dive',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Total cost of ownership, breakeven analysis, and per-procedure economics.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="5-Year TCO" value={tco.five_year ? '$' + fmt(Math.round(tco.five_year / 1000)) + 'K' : '--'} />
            <MetricCard label="Breakeven" value={(financialDeep.breakeven_months || financialDeep.breakeven || '--') + ' months'} color="emerald" />
            <MetricCard label="Cost/Procedure" value={(financialDeep.per_procedure_cost || financialDeep.cost_per_case) ? '$' + fmt(Math.round(financialDeep.per_procedure_cost || financialDeep.cost_per_case)) : '--'} color="yellow" />
            <MetricCard label="5-Year ROI" value={(financialDeep.five_year_roi_pct || financialDeep.roi_pct || '--') + '%'} color="emerald" />
          </div>
          {breakevenData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cumulative Cash Flow</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={breakevenData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} formatter={(v) => '$' + Number(v).toLocaleString()} />
                  <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={COLORS.emerald} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="p-4 rounded-lg bg-sky-900/20 border border-sky-500/30">
            <p className="text-sm text-sky-300">Investment includes system acquisition, annual service, instruments per procedure, and facility modifications. ROI accounts for improved outcomes, shorter LOS, and reduced complications.</p>
          </div>
        </div>
      )
    },

    // Slide 10: Growth Extrapolation
    {
      title: 'Growth Extrapolation',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Three scenarios modeling fleet expansion needs and timing.</p>
          {scenarios.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {scenarios.map((s, i) => (
                <MetricCard key={i} label={`${s.name || s.label || 'Scenario'} Y5`} value={fmt(s.year5_cases || s.cases_y5 || 0) + ' cases'}
                  color={i === 0 ? 'sky' : i === 1 ? 'emerald' : 'yellow'} />
              ))}
            </div>
          )}
          {growthData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Scenario Comparison</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={growthData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  {scenarios.map((s, i) => (
                    <Line key={i} type="monotone" dataKey={s.name || s.label || 'scenario'} stroke={[COLORS.sky, COLORS.emerald, COLORS.yellow][i % 3]} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )
    },

    // Slide 11: System Recommendation
    {
      title: 'System Recommendation',
      content: (
        <div className="space-y-6">
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="px-10 py-6 rounded-2xl bg-gradient-to-br from-sky-900 to-sky-600 shadow-lg shadow-sky-600/20">
              <p className="text-xs text-sky-200 uppercase tracking-widest">Primary Recommendation</p>
              <p className="text-4xl font-extrabold text-white mt-2">da Vinci {primaryModel}</p>
              <p className="text-xl text-sky-200 mt-2">Fit Score: {Math.round(fitScore)}/100</p>
            </div>
          </div>
          {rationale && (
            <div className="p-4 rounded-lg bg-sky-900/20 border border-sky-500/30">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Rationale</p>
              <p className="text-sm text-sky-300">{rationale}</p>
            </div>
          )}
          {riskFactors.length > 0 && (
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Risk Factors</p>
              <div className="space-y-2">
                {riskFactors.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-yellow-400 font-medium">{r.name || r.factor || r}:</span>
                    <span className="text-slate-300">{r.description || r.detail || r.mitigation || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },

    // Slide 12: Next Steps
    {
      title: 'Next Steps',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Implementation roadmap for your da Vinci robotic surgery program.</p>
          <div className="space-y-3">
            {[
              { num: 1, title: 'Clinical Workflow Assessment', desc: 'Schedule on-site evaluation with our surgical planning team' },
              { num: 2, title: 'Infrastructure Survey', desc: 'Confirm OR readiness, ceiling height, and power requirements' },
              { num: 3, title: 'Surgeon Training Timeline', desc: 'Develop credentialing pathway for interested surgeons' },
              { num: 4, title: 'Financial Model Finalization', desc: 'Select acquisition structure: purchase, lease, or usage-based' },
              { num: 5, title: 'Implementation Timeline', desc: 'Establish go-live date and phased deployment plan' }
            ].map(step => (
              <div key={step.num} className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {step.num}
                </div>
                <div>
                  <p className="text-white font-semibold">{step.title}</p>
                  <p className="text-sm text-slate-400">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-lg bg-purple-900/20 border border-purple-500/30 text-center">
            <p className="text-sm text-purple-300">Thank you for exploring the da Vinci System Assessment for {hospitalName}. We look forward to partnering on your robotic surgery program.</p>
          </div>
        </div>
      )
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Presentation</h1>
          <p className="text-sm text-slate-400">{hospitalName} -- Slide {activeSlide + 1} of {slides.length}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Proposal generation button */}
          {!proposalStatus || proposalStatus.status === 'none' || proposalStatus.status === 'error' ? (
            <button onClick={startProposalGeneration} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors">
              Generate Proposal Link
            </button>
          ) : proposalStatus.status === 'generating' ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg">
              <div className="animate-spin w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full" />
              <span className="text-sm text-slate-300">{proposalStatus.detail || 'Generating...'}</span>
            </div>
          ) : proposalStatus.status === 'completed' ? (
            <a href={proposalStatus.proposalUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
              Open Proposal Link
            </a>
          ) : null}
          {proposalStatus?.status === 'error' && (
            <span className="text-xs text-red-400">{proposalStatus.detail}</span>
          )}
        </div>
      </div>

      {/* Rachel voice info */}
      <div className="p-3 rounded-lg bg-sky-900/20 border border-sky-500/30 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm text-sky-300">Rachel Voice AI is available via the widget in the corner. She can discuss any slide in detail using this hospital's data.</span>
      </div>

      {/* Slide content */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 sm:p-8 min-h-[500px]">
        <h2 className="text-xl font-bold text-white mb-6 pb-3 border-b border-slate-700">
          {slides[activeSlide]?.title}
        </h2>
        {slides[activeSlide]?.content}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
          disabled={activeSlide === 0}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
        >
          Previous
        </button>

        <div className="flex gap-1.5 flex-wrap justify-center">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              className={`w-3 h-3 rounded-full transition-all ${i === activeSlide ? 'bg-sky-500 scale-125' : 'bg-slate-600 hover:bg-slate-500'}`}
            />
          ))}
        </div>

        <button
          onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))}
          disabled={activeSlide === slides.length - 1}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
