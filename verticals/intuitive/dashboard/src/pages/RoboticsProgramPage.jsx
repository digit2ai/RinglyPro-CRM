import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

// Step 3 — Robotics Program Profile: current systems, utilization, specialty mix
// Mirrors Deck 1 Slide 6 (System Utilization by Quarter) + Slide 8/9 + Deck 2 p15

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'

// Intuitive specialty + modality color palette (locked from deck analysis)
const COLOR_DV = '#1e40af'        // dark blue — Da Vinci
const COLOR_LAP = '#93c5fd'       // light blue — Laparoscopic
const COLOR_OPEN = '#1f2937'      // black/dark gray — Open
const COLOR_BENCHMARK = '#94a3b8' // gray — Peer benchmark
const COLOR_IN_HOURS = '#22c55e'  // green — in-hours
const COLOR_AFTER_HOURS = '#ef4444' // red — after-hours

const GEN_COLORS = { S: '#3b82f6', Si: '#f59e0b', Xi: '#22c55e', dV5: '#2563eb' }

export default function RoboticsProgramPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState({})
  const [loading, setLoading] = useState(true)
  const [enrichment, setEnrichment] = useState(null)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    Promise.all([api.getProject(id), api.getResults(id).catch(() => ({ results: {} }))])
      .then(([projRes, aRes]) => { setProject(projRes.project); setAnalysis(aRes.results || {}) })
      .catch(console.error).finally(() => setLoading(false))

    setEnrichmentLoading(true)
    api.getRoboticsProgramEnrichment(id)
      .then(r => setEnrichment(r.data))
      .catch(e => console.error('robotics enrichment:', e))
      .finally(() => setEnrichmentLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading robotics program...</div>

  const systems = parseInt(project?.current_system_count || 0)
  const systemModel = project?.current_system || 'None'
  const util = analysis.utilization_forecast || {}
  const pareto = analysis.procedure_pareto || {}

  // Specialty mix from project
  const specialties = []
  if (project?.specialty_urology) specialties.push({ name: 'Urology', pct: parseInt(project.specialty_urology), color: '#06b6d4' })
  if (project?.specialty_gynecology) specialties.push({ name: 'Gynecology', pct: parseInt(project.specialty_gynecology), color: '#8b5cf6' })
  if (project?.specialty_general) specialties.push({ name: 'General', pct: parseInt(project.specialty_general), color: '#1e40af' })
  if (project?.specialty_thoracic) specialties.push({ name: 'Thoracic', pct: parseInt(project.specialty_thoracic), color: '#10b981' })
  if (project?.specialty_colorectal) specialties.push({ name: 'Colorectal', pct: parseInt(project.specialty_colorectal), color: '#f59e0b' })
  if (project?.specialty_head_neck) specialties.push({ name: 'Head & Neck', pct: parseInt(project.specialty_head_neck), color: '#ec4899' })
  if (project?.specialty_cardiac) specialties.push({ name: 'Cardiac', pct: parseInt(project.specialty_cardiac), color: '#1f2937' })

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 3 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">Robotics Program — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Current systems · Utilization · Specialty mix</p>
        </div>
        <button onClick={() => navigate(`/market-profile/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Market Profile →
        </button>
      </div>

      {/* Current installed base */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
        <h3 className="font-bold text-white mb-4">Current Installed Base</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Systems Installed</div>
            <div className="text-3xl font-bold text-white mt-1">{systems}</div>
            <div className="text-[11px] text-slate-500">{systemModel === 'None' ? 'no current systems' : systemModel}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Projected Utilization</div>
            <div className={`text-3xl font-bold mt-1 ${(util.projected_utilization_pct || 0) > 85 ? 'text-red-300' : (util.projected_utilization_pct || 0) > 70 ? 'text-amber-300' : 'text-emerald-300'}`}>
              {util.projected_utilization_pct || '--'}%
            </div>
            <div className="text-[11px] text-slate-500">{(util.projected_utilization_pct || 0) > 85 ? 'oversaturated' : (util.projected_utilization_pct || 0) > 70 ? 'high' : 'healthy'}</div>
          </div>
          {/* Design Day (P75) tile removed per 2026-05-26 review — no defendable source data. */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Systems Needed</div>
            <div className="text-3xl font-bold text-violet-300 mt-1">{util.systems_needed || '--'}</div>
            <div className="text-[11px] text-slate-500">recommended</div>
          </div>
        </div>
      </div>

      {/* ─── CHART #1: System Utilization by Quarter (Deck 1 p6 / Deck 3 p3) ─── */}
      {enrichment?.system_utilization && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">System Utilization by Quarter</h3>
            <span className="text-xs text-red-300 font-semibold">*{enrichment.system_utilization.academic_avg_per_qtr}/qtr Academic Avg</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Current avg: <strong className="text-white">{enrichment.system_utilization.current_avg_per_system_qtr} cases/qtr/system</strong>
            {' '}
            <span className={enrichment.system_utilization.delta_vs_academic >= 0 ? 'text-emerald-300' : 'text-amber-300'}>
              ({enrichment.system_utilization.delta_vs_academic >= 0 ? '+' : ''}{enrichment.system_utilization.delta_vs_academic} vs academic avg)
            </span>
          </p>

          {/* Per-system table */}
          <table className="w-full text-xs mb-5">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Model</th>
                <th className="text-left pb-2">System</th>
                {enrichment.system_utilization.quarters.map(q => (
                  <th key={q} className="text-right pb-2">{q.replace(' 20', ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrichment.system_utilization.systems.map((s, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-slate-400">{s.model_label}</td>
                  <td className="py-2 text-white font-semibold">{s.system_name}</td>
                  {enrichment.system_utilization.quarters.map(q => {
                    const val = s[q] || 0
                    const aboveAvg = val > enrichment.system_utilization.academic_avg_per_qtr
                    return (
                      <td key={q} className={`py-2 text-right ${aboveAvg ? 'text-emerald-300 font-semibold' : 'text-slate-300'}`}>
                        {val}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Procedure Volume stacked bar chart (in-hours green + after-hours red) */}
          <div className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Procedure Volume (Total Across All Systems)</div>
          <div className="h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrichment.system_utilization.procedure_volume_by_qtr}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="quarter" stroke="#64748b" style={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="in_hours" stackId="a" fill={COLOR_IN_HOURS} name="In-Hours (7AM-6PM)" />
                <Bar dataKey="after_hours" stackId="a" fill={COLOR_AFTER_HOURS} name="After-Hours (6PM-7AM)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-500 italic mt-2">
            After-hours volume signals OR saturation — strongest capacity-expansion argument.
            Current after-hours rate: <strong className="text-amber-300">{enrichment.system_utilization.after_hours_pct}%</strong>
          </p>
        </div>
      )}

      {/* ─── CHART #2: Modality Mix by Year + Peer Comparison (Deck 1 p8) ─── */}
      {enrichment?.modality_by_year && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Modality Mix vs National Academic Peers</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.modality_by_year.headline}</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 5-year line chart */}
            <div className="lg:col-span-2">
              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Modality Trend (5 yr)</div>
              <div className="h-64 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={enrichment.modality_by_year.trend_by_year}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" style={{ fontSize: 11 }} unit="%" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="davinci_pct" stroke={COLOR_DV} strokeWidth={2.5} name="Da Vinci" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="lap_pct" stroke={COLOR_LAP} strokeWidth={2.5} name="Lap" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="open_pct" stroke="#cbd5e1" strokeWidth={2.5} name="Open" dot={{ r: 4 }} strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Peer comparison pies */}
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Current vs Peer ({enrichment.modality_by_year.peer_benchmark.n.toLocaleString()} hospitals)</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-[10px] text-slate-400 mb-1">{project?.hospital_name?.split(/[\s,]/)[0] || 'Hospital'}</div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Da Vinci', value: enrichment.modality_by_year.current.davinci_pct },
                            { name: 'Lap', value: enrichment.modality_by_year.current.lap_pct },
                            { name: 'Open', value: enrichment.modality_by_year.current.open_pct },
                          ]}
                          dataKey="value" cx="50%" cy="50%" outerRadius={50} label={(e) => `${e.value}%`} labelLine={false} style={{ fontSize: 10, fill: '#fff' }}
                        >
                          <Cell fill={COLOR_DV} /><Cell fill={COLOR_LAP} /><Cell fill={COLOR_OPEN} />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-slate-400 mb-1">Academic Peers</div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Da Vinci', value: enrichment.modality_by_year.peer_benchmark.davinci_pct },
                            { name: 'Lap', value: enrichment.modality_by_year.peer_benchmark.lap_pct },
                            { name: 'Open', value: enrichment.modality_by_year.peer_benchmark.open_pct },
                          ]}
                          dataKey="value" cx="50%" cy="50%" outerRadius={50} label={(e) => `${e.value}%`} labelLine={false} style={{ fontSize: 10, fill: '#fff' }}
                        >
                          <Cell fill={COLOR_DV} /><Cell fill={COLOR_LAP} /><Cell fill={COLOR_OPEN} />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className={`text-center mt-2 text-2xl font-bold ${enrichment.modality_by_year.delta_vs_peer_davinci > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {Math.abs(enrichment.modality_by_year.delta_vs_peer_davinci)}% Delta
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.modality_by_year.methodology}</div>
        </div>
      )}

      {/* ─── CHART #3: Modality Breakdown by Procedure (Deck 1 p9) ─── */}
      {enrichment?.modality_by_procedure && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Modality Breakdown by Procedure</h3>
          <p className="text-xs text-slate-500 mb-4">
            Red-highlighted rows = high open volume (robotic conversion opportunity).
            Total opportunity: <strong className="text-red-300">{fmt(enrichment.modality_by_procedure.total_opportunity_open_cases)} open cases</strong> across opportunity procedures.
          </p>
          <div style={{ height: Math.max(400, enrichment.modality_by_procedure.procedures.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={enrichment.modality_by_procedure.procedures.map(p => ({
                  procedure: p.name,
                  Da_Vinci: p.davinci_volume,
                  Lap: p.lap_volume,
                  Open: p.open_volume,
                  Avg_Benchmark_Open: p.benchmark_open_volume,
                  opportunity: p.opportunity,
                }))}
                layout="vertical"
                margin={{ left: 80, right: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: 11 }} />
                <YAxis dataKey="procedure" type="category" stroke="#64748b" style={{ fontSize: 11 }} width={120} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Da_Vinci" stackId="a" fill={COLOR_DV} name="Da Vinci" />
                <Bar dataKey="Lap" stackId="a" fill={COLOR_LAP} name="Lap" />
                <Bar dataKey="Open" stackId="a" fill={COLOR_OPEN} name="Open" />
                <Bar dataKey="Avg_Benchmark_Open" fill={COLOR_BENCHMARK} name="Avg Benchmark Open" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.modality_by_procedure.methodology}</div>
        </div>
      )}

      {/* ─── CHART #4: Tech Generation Mix Over Time (Deck 2 p15) ─── */}
      {enrichment?.tech_generation_mix && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Tech Generation Mix Over Time</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.tech_generation_mix.headline}</p>

          <div className="h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrichment.tech_generation_mix.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="S" stackId="a" fill={GEN_COLORS.S} name="da Vinci S" />
                <Bar dataKey="Si" stackId="a" fill={GEN_COLORS.Si} name="da Vinci Si" />
                <Bar dataKey="Xi" stackId="a" fill={GEN_COLORS.Xi} name="da Vinci Xi" />
                <Bar dataKey="dV5" stackId="a" fill={GEN_COLORS.dV5} name="da Vinci 5" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Current breakdown + recommended */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Current Si</div>
              <div className="text-2xl font-bold text-amber-300 mt-1">{enrichment.tech_generation_mix.current_fleet_breakdown.Si}</div>
            </div>
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Current Xi</div>
              <div className="text-2xl font-bold text-emerald-300 mt-1">{enrichment.tech_generation_mix.current_fleet_breakdown.Xi}</div>
            </div>
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Current dV5</div>
              <div className="text-2xl font-bold text-blue-300 mt-1">{enrichment.tech_generation_mix.current_fleet_breakdown.dV5}</div>
            </div>
            <div className="bg-blue-950/40 rounded p-3 border border-blue-700/60">
              <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Recommended dV5</div>
              <div className="text-2xl font-bold text-blue-300 mt-1">+{enrichment.tech_generation_mix.recommended_additions}</div>
            </div>
            <div className="bg-slate-900/60 rounded p-3 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Fleet Growth (10yr)</div>
              <div className="text-2xl font-bold text-violet-300 mt-1">+{enrichment.tech_generation_mix.fleet_growth_pct_over_decade}%</div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.tech_generation_mix.methodology}</div>
        </div>
      )}

      {/* Enrichment loading state */}
      {enrichmentLoading && !enrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6 text-center">
          <div className="text-sm text-slate-400">Loading deck-aligned charts (Utilization · Modality Trends · Procedure Breakdown · Tech Generations)...</div>
        </div>
      )}

      {/* Specialty mix */}
      {specialties.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-3">Specialty Mix</h3>
          <div className="space-y-2">
            {specialties.sort((a, b) => b.pct - a.pct).map(sp => (
              <div key={sp.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sp.color }}></span>
                    {sp.name}
                  </span>
                  <span className="text-slate-400">{sp.pct}% of mix</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: `${Math.min(sp.pct, 100)}%`, backgroundColor: sp.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top procedures */}
      {pareto.top_procedures?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
          <h3 className="font-bold text-white mb-3">Top Procedures (ABC Analysis)</h3>
          <div className="text-[11px] text-slate-500 mb-3">Gini coefficient: {pareto.gini_coefficient?.toFixed(3) || '--'} · Total: {fmt(pareto.total_procedures)}</div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr><th className="text-left pb-2">#</th><th className="text-left pb-2">Procedure</th><th className="text-right pb-2">Cases</th><th className="text-right pb-2">% of Total</th><th className="text-right pb-2">Class</th></tr>
            </thead>
            <tbody>
              {pareto.top_procedures.slice(0, 10).map((p, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-slate-500">{i + 1}</td>
                  <td className="py-2 text-white">{p.name || p.procedure}</td>
                  <td className="py-2 text-right text-white">{fmt(p.cases || p.count)}</td>
                  <td className="py-2 text-right text-slate-400">{p.pct || p.percentage}%</td>
                  <td className="py-2 text-right">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.abc_class === 'A' ? 'bg-emerald-900/40 text-emerald-300' : p.abc_class === 'B' ? 'bg-amber-900/40 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                      Class {p.abc_class || p.class}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/surgeon-profile/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Surgeon Profile</button>
        <button onClick={() => navigate(`/market-profile/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Market Profile →
        </button>
      </div>
    </div>
  )
}
