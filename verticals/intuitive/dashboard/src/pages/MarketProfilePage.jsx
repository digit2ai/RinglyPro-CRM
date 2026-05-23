import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, ReferenceLine, LabelList,
} from 'recharts'

// Step 4 — Market Profile: competitive landscape, peer hospitals, market opportunity
// Mirrors Deck 1 p13 (Soft Tissue Surgery Market Share + Remaining Opportunity)

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'
const fmtMoneyShort = (n) => {
  if (n == null) return '--'
  const v = Number(n)
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

const COLOR_HOSPITAL = '#06b6d4'  // cyan — your hospital
const COLOR_BENCHMARK = '#94a3b8' // gray — benchmark
const COLOR_OPP = '#ef4444'       // red — opportunity
const COLOR_PEER = '#1e40af'      // blue — peers

const SPECIALTY_COLORS = ['#1e40af', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#ef4444', '#84cc16', '#0891b2', '#7c3aed', '#db2777']

export default function MarketProfilePage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [peers, setPeers] = useState([])
  const [bedDayCost, setBedDayCost] = useState(null)
  const [enrichment, setEnrichment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    Promise.all([api.getProject(id), api.getPeerHospitals(id).catch(() => ({ data: { peers: [], target_state_bed_day_cost: null } }))])
      .then(([projRes, peerRes]) => {
        setProject(projRes.project)
        setPeers(peerRes.data?.peers || [])
        setBedDayCost(peerRes.data?.target_state_bed_day_cost)
      }).catch(console.error).finally(() => setLoading(false))

    setEnrichmentLoading(true)
    api.getMarketProfileEnrichment(id)
      .then(r => setEnrichment(r.data))
      .catch(e => console.error('market enrichment:', e))
      .finally(() => setEnrichmentLoading(false))
  }, [id])

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading market profile...</div>

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 4 of 9 · Hospital Workflow</div>
          <h1 className="text-2xl font-bold text-white">Market Profile — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Procedure market share · Remaining opportunity · Competitive landscape</p>
        </div>
        <button onClick={() => navigate(`/clinical-outcomes/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Clinical Outcomes →
        </button>
      </div>

      {/* ─── Local market context (existing 4-KPI strip) ─── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">State</div>
          <div className="text-2xl font-bold text-white mt-1">{project?.state || '--'}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Bed-Day Cost (state-local)</div>
          <div className="text-2xl font-bold text-amber-300 mt-1">{bedDayCost ? '$' + fmt(bedDayCost) : '--'}</div>
          <div className="text-[10px] text-slate-500">kff.org non-profit avg</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Hospital Type</div>
          <div className="text-xl font-bold text-white mt-1 capitalize">{project?.hospital_type || '--'}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Market Share</div>
          <div className="text-2xl font-bold text-cyan-300 mt-1">
            {enrichment?.procedure_market_share?.blended_market_share_pct != null ? enrichment.procedure_market_share.blended_market_share_pct + '%' : '--'}
          </div>
          <div className="text-[10px] text-slate-500">soft-tissue surgery, blended</div>
        </div>
      </div>

      {/* ═══ ADDITION #2: Market Share Growth Math (Deck 1 p13 headline) ═══ */}
      {enrichment?.growth_math && (
        <div className="bg-gradient-to-br from-emerald-900/30 to-slate-800/40 border border-emerald-700/40 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">Market Share Growth Math</h3>
            <span className="text-xs text-emerald-300 font-semibold">
              +1% share = {fmtMoneyShort(enrichment.growth_math.dollars_per_1_pct_share)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Current market share <strong className="text-white">{enrichment.growth_math.current_market_share_pct}%</strong> · Avg blended rate <strong className="text-white">{fmtMoneyShort(enrichment.growth_math.avg_blended_rate)}/case</strong>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {enrichment.growth_math.scenarios.map((s, i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{s.name}</div>
                <div className="text-2xl font-bold text-emerald-300 mt-1">{fmtMoneyShort(s.dollars)}</div>
                <div className="text-[11px] text-slate-400">{fmt(s.cases_added)} cases captured</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ INFOGRAPHIC #1: Hospital Volume vs Benchmark Line Chart (Deck 1 p13) ═══ */}
      {enrichment?.volume_benchmark_trend?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Volume vs Benchmark — 5-Year Trend</h3>
          <p className="text-xs text-slate-500 mb-4">Hospital volume trajectory (cyan) vs regional market volume (gray) — share % printed above bars.</p>
          <div className="h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrichment.volume_benchmark_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="market_volume" fill={COLOR_BENCHMARK} name="Regional Market Volume" />
                <Bar dataKey="hospital_volume" fill={COLOR_HOSPITAL} name="Hospital Volume">
                  <LabelList dataKey="market_share_pct" position="top" formatter={(v) => v + '%'} style={{ fill: '#06b6d4', fontSize: 11, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ ADDITION #1 + INFOGRAPHIC #2: Procedure-Level Market Share + Volume Bars ═══ */}
      {enrichment?.procedure_market_share && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Procedure-Level Market Share + Remaining Opportunity</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.procedure_market_share.headline}</p>

          {/* Chart: hospital vs benchmark per procedure */}
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Volume by Procedure (Hospital vs Market)</div>
          <div style={{ height: Math.max(450, enrichment.procedure_market_share.procedures.length * 28) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={enrichment.procedure_market_share.procedures}
                layout="vertical"
                margin={{ left: 110, right: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                <YAxis dataKey="procedure" type="category" stroke="#64748b" style={{ fontSize: 11 }} width={100} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="hospital_volume" fill={COLOR_HOSPITAL} name="Hospital Volume" />
                <Bar dataKey="market_volume" fill={COLOR_BENCHMARK} name="Total Market Volume">
                  <LabelList dataKey="market_share_pct" position="right" formatter={(v) => v + '%'} style={{ fill: '#fff', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table — the deck's flagship visual */}
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 mt-6">Procedure Market Share Detail (Deck 1 p13)</div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Procedure</th>
                <th className="text-right pb-2">Hospital Vol</th>
                <th className="text-right pb-2">Mkt Share</th>
                <th className="text-right pb-2">Remaining Opportunity</th>
                <th className="text-right pb-2">Opportunity $</th>
              </tr>
            </thead>
            <tbody>
              {enrichment.procedure_market_share.procedures.map((p, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white font-semibold">{p.procedure}</td>
                  <td className="py-2 text-right text-cyan-300">{fmt(p.hospital_volume)}</td>
                  <td className="py-2 text-right text-white font-bold">{p.market_share_pct}%</td>
                  <td className="py-2 text-right text-red-300 font-bold">{fmt(p.remaining_opportunity)}</td>
                  <td className="py-2 text-right text-amber-300">{fmtMoneyShort(p.remaining_opportunity_dollars)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-500 font-bold">
                <td className="py-2 text-white">Total</td>
                <td className="py-2 text-right text-cyan-300">{fmt(enrichment.procedure_market_share.total_hospital_volume)}</td>
                <td className="py-2 text-right text-white">{enrichment.procedure_market_share.blended_market_share_pct}%</td>
                <td className="py-2 text-right text-red-300">{fmt(enrichment.procedure_market_share.total_remaining_opportunity)}</td>
                <td className="py-2 text-right text-amber-300">{fmtMoneyShort(enrichment.procedure_market_share.procedures.reduce((s, p) => s + p.remaining_opportunity_dollars, 0))}</td>
              </tr>
            </tbody>
          </table>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.procedure_market_share.methodology}</div>
        </div>
      )}

      {/* ═══ INFOGRAPHIC #3 + #4: Market Share Pie + Remaining Opportunity Scatter (2-col) ═══ */}
      {enrichment?.competitive_landscape && enrichment?.procedure_market_share && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Market Share Pie */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-1">Regional Bed Capacity Share</h3>
            <p className="text-xs text-slate-500 mb-4">Your hospital vs regional competitors by bed count</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: project?.hospital_name + ' (you)', value: project?.bed_count || 0, color: COLOR_HOSPITAL, is_target: true },
                      ...enrichment.competitive_landscape.competitors.slice(0, 5).map((c, i) => ({
                        name: c.hospital_name,
                        value: c.beds,
                        color: SPECIALTY_COLORS[i],
                      })),
                    ]}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(e) => `${(e.value / enrichment.competitive_landscape.region_total_beds * 100).toFixed(0)}%`}
                    style={{ fontSize: 10, fill: '#fff' }}
                  >
                    {[
                      { color: COLOR_HOSPITAL },
                      ...enrichment.competitive_landscape.competitors.slice(0, 5).map((c, i) => ({ color: SPECIALTY_COLORS[i] })),
                    ].map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    formatter={(v) => [v.toLocaleString() + ' beds', '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mt-2 text-2xl font-bold text-cyan-300">
              {enrichment.competitive_landscape.your_bed_share_pct}% of region
            </div>
            <div className="text-[10px] text-slate-500 text-center mt-1">
              {enrichment.competitive_landscape.region_total_beds.toLocaleString()} total beds in region
            </div>
          </div>

          {/* Remaining Opportunity Scatter */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-1">Remaining Opportunity Quadrant</h3>
            <p className="text-xs text-slate-500 mb-4">Top-right = high opportunity remaining · dot size = current hospital volume</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    dataKey="market_share_pct"
                    name="Market Share %"
                    stroke="#64748b"
                    style={{ fontSize: 10 }}
                    label={{ value: 'Current Market Share %', fill: '#64748b', fontSize: 10, position: 'insideBottom', offset: -10 }}
                    unit="%"
                  />
                  <YAxis
                    type="number"
                    dataKey="remaining_opportunity"
                    name="Remaining Opportunity"
                    stroke="#64748b"
                    style={{ fontSize: 10 }}
                    label={{ value: 'Cases Remaining', fill: '#64748b', fontSize: 10, angle: -90, position: 'insideLeft' }}
                  />
                  <ZAxis type="number" dataKey="hospital_volume" range={[60, 400]} name="Volume" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: 8 }}>
                          <div className="text-white font-bold">{d.procedure}</div>
                          <div className="text-xs text-cyan-300">Hospital: {fmt(d.hospital_volume)} cases</div>
                          <div className="text-xs text-slate-400">Market share: {d.market_share_pct}%</div>
                          <div className="text-xs text-red-300">Remaining: {fmt(d.remaining_opportunity)} cases</div>
                          <div className="text-xs text-amber-300">$ opp: {fmtMoneyShort(d.remaining_opportunity_dollars)}</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={enrichment.procedure_market_share.procedures} fill={COLOR_OPP}>
                    {enrichment.procedure_market_share.procedures.map((p, i) => (
                      <Cell key={i} fill={p.remaining_opportunity > 1000 ? COLOR_OPP : COLOR_HOSPITAL} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADDITION #4: Service Area Demographics ═══ */}
      {enrichment?.demographics && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Service Area Demographics</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.demographics.headline}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900/60 rounded p-4 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">CBSA Population</div>
              <div className="text-2xl font-bold text-white mt-1">{(enrichment.demographics.cbsa_population / 1e6).toFixed(1)}M</div>
              <div className="text-[10px] text-slate-500">est. metro area</div>
            </div>
            <div className="bg-slate-900/60 rounded p-4 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Eligible Procedure Pool</div>
              <div className="text-2xl font-bold text-cyan-300 mt-1">{fmt(enrichment.demographics.estimated_eligible_procedure_pool)}</div>
              <div className="text-[10px] text-slate-500">robotic-eligible/yr</div>
            </div>
            <div className="bg-slate-900/60 rounded p-4 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Annual Growth Rate</div>
              <div className="text-2xl font-bold text-emerald-300 mt-1">{enrichment.demographics.annual_market_growth_pct}%</div>
              <div className="text-[10px] text-slate-500">Intuitive-published</div>
            </div>
            <div className="bg-slate-900/60 rounded p-4 border border-slate-700">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Expected Market (3yr)</div>
              <div className="text-2xl font-bold text-violet-300 mt-1">{fmt(enrichment.demographics.expected_market_in_3_years)}</div>
              <div className="text-[10px] text-slate-500">total procedures</div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.demographics.methodology}</div>
        </div>
      )}

      {/* ═══ ADDITION #3: Competitive Landscape ═══ */}
      {enrichment?.competitive_landscape?.competitors?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Competitive Landscape</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.competitive_landscape.headline}</p>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr><th className="text-left pb-2">Hospital</th><th className="text-left pb-2">State</th><th className="text-right pb-2">Beds</th><th className="text-right pb-2">Regional Bed Share</th></tr>
            </thead>
            <tbody>
              <tr className="bg-cyan-900/30 font-bold">
                <td className="py-2 text-cyan-300">{project?.hospital_name} (you)</td>
                <td className="py-2 text-slate-400">{project?.state}</td>
                <td className="py-2 text-right text-white">{fmt(project?.bed_count)}</td>
                <td className="py-2 text-right text-cyan-300">{enrichment.competitive_landscape.your_bed_share_pct}%</td>
              </tr>
              {enrichment.competitive_landscape.competitors.map((c, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white">{c.hospital_name}</td>
                  <td className="py-2 text-slate-400">{c.state}</td>
                  <td className="py-2 text-right text-slate-300">{fmt(c.beds)}</td>
                  <td className="py-2 text-right text-slate-400">{c.bed_share_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Peer hospital comparison (existing) */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
        <h3 className="font-bold text-white mb-1">Peer Hospital Comparison (Robotic Track Record)</h3>
        <p className="text-xs text-slate-500 mb-4">Comparable academic / community medical centers within ±30% bed count, same US Census region. Bed-day savings estimated from CMS Medicare Inpatient DRG volume × historical 30% robotic conversion × procedure-specific LOS deltas.</p>

        {peers.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No peer data available yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Peer Hospital</th>
                <th className="text-left pb-2">State</th>
                <th className="text-right pb-2">Beds</th>
                <th className="text-right pb-2">Robotic Procs (est)</th>
                <th className="text-right pb-2">Bed Days Saved</th>
                <th className="text-right pb-2">$ Impact</th>
              </tr>
            </thead>
            <tbody>
              {peers.map((p, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white font-semibold">{p.hospital_name}</td>
                  <td className="py-2 text-slate-400">{p.state}</td>
                  <td className="py-2 text-right text-slate-300">{fmt(p.beds)}</td>
                  <td className="py-2 text-right text-cyan-300">{fmt(p.robotic_procedures_estimated)}</td>
                  <td className="py-2 text-right text-emerald-300 font-semibold">{fmt(p.bed_days_saved_estimated)}</td>
                  <td className="py-2 text-right text-amber-300 font-semibold">{fmtMoneyShort(p.dollar_savings_estimated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {enrichmentLoading && !enrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6 text-center">
          <div className="text-sm text-slate-400">Loading market enrichment (Procedure Market Share · Growth Math · Competitive Landscape · Demographics)...</div>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/robotics-program/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Robotics Program</button>
        <button onClick={() => navigate(`/clinical-outcomes/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Clinical Outcomes →
        </button>
      </div>
    </div>
  )
}
