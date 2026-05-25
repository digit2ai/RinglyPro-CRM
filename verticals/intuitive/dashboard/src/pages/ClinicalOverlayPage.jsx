import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell, LabelList, ComposedChart, Area,
} from 'recharts'

// Step 6 — Clinical Benefit Overlay with $ ROI (THE MOAT)
// Mirrors Deck 1 p15 + Deck 3 p7/p8 (the CFO-grade payback + cost-of-waiting visuals)
const COLOR_EMERALD = '#10b981'
const COLOR_CYAN = '#06b6d4'
const COLOR_AMBER = '#f59e0b'
const COLOR_RED = '#ef4444'
const COLOR_VIOLET = '#8b5cf6'
const COLOR_SLATE = '#94a3b8'

const fmt = (n) => n != null ? Number(n).toLocaleString() : '--'
const fmtMoneyShort = (n) => {
  if (n == null) return '$0'
  const v = Number(n)
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v)
}

const SPECIALTIES = ['urology', 'gynecology', 'general', 'colorectal', 'thoracic', 'head_neck']

export default function ClinicalOverlayPage({ projectId: propId }) {
  const { projectId: paramId } = useParams()
  const id = paramId || propId
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [caseData, setCaseData] = useState({})
  const [error, setError] = useState(null)
  const [enrichment, setEnrichment] = useState(null)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)
  const [conversionPct, setConversionPct] = useState(15)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    api.getProject(id).then(r => {
      const p = r.project
      setProject(p)
      // Seed default case mix from project specialty splits
      const annual = parseInt(p.annual_surgical_volume) || 1000
      const defaults = {}
      const specialtyMap = {
        urology: parseInt(p.specialty_urology || 0),
        gynecology: parseInt(p.specialty_gynecology || 0),
        general: parseInt(p.specialty_general || 0),
        colorectal: parseInt(p.specialty_colorectal || 0),
        thoracic: parseInt(p.specialty_thoracic || 0),
        head_neck: parseInt(p.specialty_head_neck || 0),
      }
      const totalPct = Object.values(specialtyMap).reduce((s, v) => s + v, 0) || 100
      for (const [spec, pct] of Object.entries(specialtyMap)) {
        if (pct > 0) {
          const cases = Math.round(annual * pct / Math.max(totalPct, 100))
          defaults[spec] = { annual_cases: cases, open_pct: 35, lap_pct: 35, robotic_pct: 30 }
        }
      }
      // Fallback if no specialty mix
      if (Object.keys(defaults).length === 0) {
        defaults.general = { annual_cases: Math.round(annual * 0.4), open_pct: 35, lap_pct: 40, robotic_pct: 25 }
        defaults.urology = { annual_cases: Math.round(annual * 0.2), open_pct: 25, lap_pct: 25, robotic_pct: 50 }
      }
      setCaseData(defaults)
    }).catch(console.error).finally(() => setLoading(false))

    setEnrichmentLoading(true)
    api.getClinicalOverlayEnrichment(id, 15)
      .then(r => setEnrichment(r.data))
      .catch(e => console.error('clinical overlay enrichment:', e))
      .finally(() => setEnrichmentLoading(false))
  }, [id])

  async function reloadEnrichment(newPct) {
    setEnrichmentLoading(true)
    try {
      const r = await api.getClinicalOverlayEnrichment(id, newPct)
      setEnrichment(r.data)
    } catch (e) { console.error(e) }
    finally { setEnrichmentLoading(false) }
  }

  async function runDollarization() {
    if (!Object.keys(caseData).length) { alert('No case data to compute'); return }
    setComputing(true); setError(null)
    try {
      const r = await api.dollarize(caseData, { projected_robotic_pct: 60 })
      setResults(r?.data || r)
    } catch (e) {
      setError(e.message)
    } finally {
      setComputing(false)
    }
  }

  function updateCaseData(spec, field, val) {
    setCaseData({ ...caseData, [spec]: { ...caseData[spec], [field]: parseFloat(val) || 0 } })
  }

  if (!id) return <div className="p-10 text-slate-400">No hospital selected.</div>
  if (loading) return <div className="p-10 text-slate-400">Loading clinical benefit overlay...</div>

  const totalSavings = results?.total_clinical_savings_annual || 0
  const bySpecialty = results?.by_specialty || {}

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Step 6 of 9 · THE MOAT</div>
          <h1 className="text-2xl font-bold text-white">Clinical Benefit Overlay — {project?.hospital_name}</h1>
          <p className="text-sm text-slate-400">Dollarized clinical outcomes that Intuitive cannot produce internally · sourced from peer-reviewed literature</p>
        </div>
        <button onClick={() => navigate(`/commitments/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded">
          Next: Surgeon Commitments →
        </button>
      </div>

      <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-4 mb-6 text-sm text-emerald-200">
        <strong>The moat.</strong> This module shows the dollarized clinical improvement from converting open/lap volume to robotic. Reduced infection rates, reduced LOS, fewer complications — all multiplied by published cost-per-event. AcuityMD cannot produce this slide. <strong>Intuitive cannot produce this slide.</strong> We can.
      </div>

      {/* ═══ GUT-PUNCH: Cost of Staying Open — Daily Bleed (Greg fix #2) ═══ */}
      {enrichment?.complication_burden && (
        <div className="bg-gradient-to-br from-red-950/60 to-slate-900/40 border-2 border-red-600/60 rounded-xl p-6 mb-6">
          <div className="text-center mb-4">
            <div className="text-[10px] uppercase tracking-widest text-red-300 font-bold mb-1">The Cost of Staying Open — Daily Bleed</div>
            <div className="text-5xl font-bold text-red-400">(${fmt(enrichment.complication_burden.daily_avoidable)}/day)</div>
            <div className="text-sm text-red-200 mt-2">${fmt(enrichment.complication_burden.total_annual_avoidable)}/yr in complications, readmissions &amp; infections da Vinci would prevent — across {fmt(enrichment.complication_burden.total_open_cases)} open da Vinci-applicable cases</div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Open-Case Harm (CMS / peer-reviewed)</th>
                <th className="text-right pb-2">Open Rate</th>
                <th className="text-right pb-2">da Vinci</th>
                <th className="text-right pb-2">Events/yr</th>
                <th className="text-right pb-2">$ Lost/yr</th>
              </tr>
            </thead>
            <tbody>
              {enrichment.complication_burden.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white">{r.name}</td>
                  <td className="py-2 text-right text-red-300">{r.open_rate_pct}%</td>
                  <td className="py-2 text-right text-emerald-300">{r.davinci_rate_pct}%</td>
                  <td className="py-2 text-right text-amber-300">{fmt(r.avoidable_events_yr)}</td>
                  <td className="py-2 text-right text-red-300 font-bold">{fmtMoneyShort(r.annual_avoidable_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.complication_burden.methodology}</div>
        </div>
      )}

      {enrichment?.complication_burden && (
        <div className="bg-emerald-900/15 border border-emerald-700/40 rounded-lg p-3 mb-4 text-sm text-emerald-200">
          <strong>The da Vinci alternative.</strong> Converting open cases to robotic recovers that bleed — here is the bed-day cost avoidance alone:
        </div>
      )}

      {/* ═══ INFOGRAPHIC #4: Cost Avoidance Hero with 3-Panel (Deck 3 p8) ═══ */}
      {enrichment?.bed_days_savings && (
        <div className="bg-gradient-to-br from-emerald-900/40 via-cyan-900/30 to-slate-900/40 border-2 border-emerald-700/50 rounded-xl p-6 mb-6">
          <div className="text-center mb-4">
            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Cost Avoidance Opportunity</div>
            <div className="text-6xl font-bold text-emerald-300">
              ${(enrichment.bed_days_savings.total_dollar_savings / 1e6).toFixed(1)}M
            </div>
            <div className="text-sm text-slate-300 mt-1">@ ${enrichment.bed_days_savings.bed_day_cost_used.toLocaleString()}/day · {enrichment.bed_days_savings.conversion_pct_assumed}% conversion assumption</div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center bg-slate-900/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-cyan-300">{enrichment.bed_days_savings.total_bed_days_saved.toLocaleString()}</div>
              <div className="text-xs text-slate-300 mt-1">Annual bed days savings</div>
              <div className="text-[10px] text-slate-500">if {enrichment.bed_days_savings.conversion_pct_assumed}% of open cases convert</div>
            </div>
            <div className="text-center bg-slate-900/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-violet-300">6 day</div>
              <div className="text-xs text-slate-300 mt-1">Avg LOS savings/case</div>
              <div className="text-[10px] text-slate-500">with da Vinci vs open</div>
            </div>
            <div className="text-center bg-slate-900/50 rounded-lg p-4">
              <div className="text-3xl font-bold text-amber-300">{enrichment.bed_days_savings.top_3_procedures.length}</div>
              <div className="text-xs text-slate-300 mt-1">Top 3 procedures</div>
              <div className="text-[10px] text-slate-500">{enrichment.bed_days_savings.top_3_procedures.join(', ')}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADDITION #2: Cost of Waiting Calculator (Deck 1 p15 footer) ═══ */}
      {enrichment?.cost_of_waiting && (
        <div className="bg-red-950/30 border-2 border-red-700/50 rounded-lg p-5 mb-6">
          <div className="flex items-center gap-4 justify-between flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-red-400 font-bold mb-1">Est Monthly Cost of Waiting</div>
              <div className="text-4xl font-bold text-red-300">
                (${enrichment.cost_of_waiting.monthly_cost_of_waiting.toLocaleString()})
              </div>
              <div className="text-xs text-slate-400 mt-2">Every month of delay forfeits 1/12 of the annual opportunity.</div>
            </div>
            <div className="flex gap-4 text-right text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Per Week</div>
                <div className="text-lg font-bold text-red-200">${enrichment.cost_of_waiting.weekly_cost_of_waiting.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Per Day</div>
                <div className="text-lg font-bold text-red-200">${enrichment.cost_of_waiting.daily_cost_of_waiting.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Annual Total</div>
                <div className="text-lg font-bold text-amber-300">${enrichment.cost_of_waiting.annual_total_opportunity.toLocaleString()}</div>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.cost_of_waiting.methodology}</div>
        </div>
      )}

      {/* ═══ ADDITION #3 + INFOGRAPHIC #1: Investment Payback Analysis (Deck 1 p15) ═══ */}
      {enrichment?.investment_payback && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Investment Payback Analysis</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.investment_payback.headline}</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* KPI table */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">5-Year Proforma KPIs</div>
              <table className="w-full text-sm">
                <tbody>
                  {enrichment.investment_payback.kpis.map((k, i) => (
                    <tr key={i} className="border-b border-slate-700/50">
                      <td className="py-2 text-slate-400 text-xs">{k.label}</td>
                      <td className="py-2 text-right text-white font-bold">{k.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cumulative Return Chart */}
            <div className="lg:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Cumulative Return vs Investment Breakeven</div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={enrichment.investment_payback.cumulative_return_5yr}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="year" stroke="#64748b" style={{ fontSize: 11 }} label={{ value: 'Year', fill: '#64748b', fontSize: 10, position: 'insideBottom', offset: -5 }} />
                    <YAxis stroke="#64748b" style={{ fontSize: 10 }} tickFormatter={(v) => '$' + (v / 1e6).toFixed(1) + 'M'} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(v) => '$' + Number(v).toLocaleString()}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="cumulative_return" stroke={COLOR_EMERALD} strokeWidth={3} dot={{ r: 5, fill: COLOR_EMERALD }} name="Cumulative Return" />
                    <Line type="monotone" dataKey="breakeven" stroke={COLOR_RED} strokeWidth={2} strokeDasharray="6 4" dot={false} name="Investment Breakeven" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 italic">{enrichment.investment_payback.methodology}</div>
        </div>
      )}

      {/* ═══ ADDITION #1 + INFOGRAPHIC #2: Bed Days Savings dual-table + Pareto bar (Deck 3 p7) ═══ */}
      {enrichment?.bed_days_savings && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">Bed Days Savings by Procedure <span className="text-[10px] text-amber-300 font-normal ml-2">(OPEN volume only · laparoscopic excluded)</span></h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">% of OPEN converted:</span>
              <input
                type="range" min="5" max="50" step="5" value={conversionPct}
                onChange={e => setConversionPct(parseInt(e.target.value))}
                onMouseUp={() => reloadEnrichment(conversionPct)}
                onTouchEnd={() => reloadEnrichment(conversionPct)}
                className="w-32 accent-cyan-500"
              />
              <span className="text-cyan-300 font-bold w-12">{conversionPct}%</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">{enrichment.bed_days_savings.headline}</p>

          {/* Pareto bar chart */}
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Bed Days Saved per Procedure</div>
          <div className="h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={enrichment.bed_days_savings.procedures}
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
                <Bar dataKey="bed_days_saved_yr" name="Bed Days Saved/yr">
                  {enrichment.bed_days_savings.procedures.map((p, i) => (
                    <Cell key={i} fill={p.opportunity ? COLOR_EMERALD : COLOR_CYAN} />
                  ))}
                  <LabelList dataKey="bed_days_saved_yr" position="right" style={{ fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Deck 3 p7 dual-table */}
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Per-Procedure Detail (Deck 3 p7 pattern)</div>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="text-left pb-2">Procedure</th>
                  <th className="text-right pb-2"># Open</th>
                  <th className="text-right pb-2"># Lap</th>
                  <th className="text-right pb-2"># dV</th>
                  <th className="text-right pb-2">Open LOS</th>
                  <th className="text-right pb-2">dV LOS</th>
                  <th className="text-right pb-2">Days/Case</th>
                  <th className="text-right pb-2">Converted</th>
                  <th className="text-right pb-2">Bed Days Saved/yr</th>
                  <th className="text-right pb-2">$ Savings</th>
                </tr>
              </thead>
              <tbody>
                {enrichment.bed_days_savings.procedures.map((p, i) => (
                  <tr key={i} className={`border-t border-slate-700 ${p.opportunity ? 'bg-emerald-950/20' : ''}`}>
                    <td className="py-1.5 text-white">{p.procedure}</td>
                    <td className="py-1.5 text-right text-slate-400">{p.open_cases}</td>
                    <td className="py-1.5 text-right text-slate-400">{p.lap_cases}</td>
                    <td className="py-1.5 text-right text-slate-400">{p.davinci_cases}</td>
                    <td className="py-1.5 text-right text-slate-300">{p.open_los}</td>
                    <td className="py-1.5 text-right text-cyan-300">{p.davinci_los}</td>
                    <td className="py-1.5 text-right text-violet-300 font-semibold">{p.open_to_davinci_days_saved_per_case}</td>
                    <td className="py-1.5 text-right text-amber-300">{p.converted_cases}</td>
                    <td className="py-1.5 text-right text-emerald-300 font-bold">{p.bed_days_saved_yr.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-emerald-200">${(p.dollar_savings_yr / 1000).toFixed(0)}K</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-500 font-bold">
                  <td className="py-2 text-white">Total</td>
                  <td colSpan="4"></td>
                  <td colSpan="2"></td>
                  <td className="py-2 text-right text-amber-300">{enrichment.bed_days_savings.total_converted_cases.toLocaleString()}</td>
                  <td className="py-2 text-right text-emerald-300">{enrichment.bed_days_savings.total_bed_days_saved.toLocaleString()}</td>
                  <td className="py-2 text-right text-emerald-200">${(enrichment.bed_days_savings.total_dollar_savings / 1e6).toFixed(2)}M</td>
                </tr>
              </tbody>
            </table>
            <div className="text-[10px] text-slate-500 italic mt-2">{enrichment.bed_days_savings.methodology}</div>
          </div>
        </div>
      )}

      {/* ═══ ADDITION #4 + INFOGRAPHIC #3: Outcomes Driver Table + Waterfall ═══ */}
      {enrichment?.outcomes_driver && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
          <h3 className="font-bold text-white mb-1">Outcomes Driver Breakdown</h3>
          <p className="text-xs text-slate-500 mb-4">{enrichment.outcomes_driver.headline}</p>

          {/* Waterfall-style bar chart */}
          <div className="h-72 -ml-2 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enrichment.outcomes_driver.outcomes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: 10 }} angle={-15} textAnchor="end" height={70} />
                <YAxis stroke="#64748b" style={{ fontSize: 10 }} tickFormatter={(v) => '$' + (v / 1e6).toFixed(1) + 'M'} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(v) => '$' + Number(v).toLocaleString()}
                />
                <Bar dataKey="annual_savings" name="Annual $ Savings">
                  {enrichment.outcomes_driver.outcomes.map((o, i) => (
                    <Cell key={i} fill={[COLOR_EMERALD, COLOR_CYAN, COLOR_VIOLET, COLOR_AMBER, COLOR_RED][i]} />
                  ))}
                  <LabelList dataKey="annual_savings" position="top" formatter={(v) => '$' + (v / 1e6).toFixed(1) + 'M'} style={{ fill: '#fff', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Outcome</th>
                <th className="text-right pb-2">Baseline</th>
                <th className="text-right pb-2">Open→dV Delta</th>
                <th className="text-right pb-2">$ / Event</th>
                <th className="text-right pb-2">Events Avoided</th>
                <th className="text-right pb-2">Annual Savings</th>
              </tr>
            </thead>
            <tbody>
              {enrichment.outcomes_driver.outcomes.map((o, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white">{o.name}</td>
                  <td className="py-2 text-right text-slate-400">{o.baseline_pct != null ? o.baseline_pct + '%' : '—'}</td>
                  <td className="py-2 text-right text-violet-300">{o.delta_open_to_dv}</td>
                  <td className="py-2 text-right text-amber-300">${o.cost_per_event.toLocaleString()} <span className="text-[10px] text-slate-500">{o.unit}</span></td>
                  <td className="py-2 text-right text-cyan-300">{o.events_avoided.toLocaleString()}</td>
                  <td className="py-2 text-right text-emerald-300 font-bold">${(o.annual_savings / 1e6).toFixed(2)}M</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-500 font-bold">
                <td className="py-2 text-white">Total</td>
                <td colSpan="4"></td>
                <td className="py-2 text-right text-emerald-300">${(enrichment.outcomes_driver.total_driver_savings / 1e6).toFixed(2)}M</td>
              </tr>
            </tbody>
          </table>
          <div className="text-[10px] text-slate-500 italic mt-3">{enrichment.outcomes_driver.methodology}</div>
        </div>
      )}

      {enrichmentLoading && !enrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-6 text-center">
          <div className="text-sm text-slate-400">Loading the moat (Bed Days · Cost of Waiting · Payback · Outcomes Drivers)...</div>
        </div>
      )}

      {/* Case mix input */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 mb-6">
        <h3 className="font-bold text-white mb-3">Case Mix Inputs</h3>
        <p className="text-xs text-slate-500 mb-4">Auto-populated from hospital specialty mix. Adjust if you have more accurate data. Target conversion: 60% robotic share.</p>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left pb-2">Specialty</th>
              <th className="text-right pb-2">Annual Cases</th>
              <th className="text-right pb-2">% Open</th>
              <th className="text-right pb-2">% Lap</th>
              <th className="text-right pb-2">% Robotic</th>
              <th className="text-right pb-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(caseData).map(([spec, d]) => {
              const total = d.open_pct + d.lap_pct + d.robotic_pct
              return (
                <tr key={spec} className="border-t border-slate-700">
                  <td className="py-2 text-white capitalize">{spec.replace('_', ' ')}</td>
                  <td className="py-2"><input type="number" value={d.annual_cases} onChange={e => updateCaseData(spec, 'annual_cases', e.target.value)} className="w-24 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className="py-2"><input type="number" value={d.open_pct} onChange={e => updateCaseData(spec, 'open_pct', e.target.value)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className="py-2"><input type="number" value={d.lap_pct} onChange={e => updateCaseData(spec, 'lap_pct', e.target.value)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className="py-2"><input type="number" value={d.robotic_pct} onChange={e => updateCaseData(spec, 'robotic_pct', e.target.value)} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right" /></td>
                  <td className={`py-2 text-right text-xs ${Math.abs(total - 100) > 1 ? 'text-red-300' : 'text-slate-400'}`}>{total}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <button onClick={runDollarization} disabled={computing} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded">
            {computing ? 'Computing...' : 'Run Dollarization'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 mb-6 text-sm text-red-300">{error}</div>}

      {/* Results */}
      {results && (
        <>
          <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800/40 border border-emerald-700/50 rounded-lg p-6 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">Annual Cost Avoidance</div>
            <div className="text-5xl font-bold text-emerald-300">{fmtMoneyShort(totalSavings)}</div>
            <div className="text-sm text-slate-300 mt-2">Total dollarized clinical benefit from converting eligible open/lap volume to robotic, across {Object.keys(bySpecialty).length} specialties.</div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-3">Drivers by Specialty</h3>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr><th className="text-left pb-2">Specialty</th><th className="text-right pb-2">Cases Converted</th><th className="text-right pb-2">Annual Savings</th><th className="text-left pb-2">Top Driver</th></tr>
              </thead>
              <tbody>
                {Object.entries(bySpecialty).filter(([, v]) => v.total_specialty_savings > 0)
                  .sort((a, b) => b[1].total_specialty_savings - a[1].total_specialty_savings)
                  .map(([spec, data]) => {
                    const topMetric = Object.values(data.savings_by_metric || {})
                      .filter(m => m.savings > 0)
                      .sort((a, b) => b.savings - a.savings)[0]
                    return (
                      <tr key={spec} className="border-t border-slate-700">
                        <td className="py-2 text-white capitalize">{spec.replace('_', ' ')}</td>
                        <td className="py-2 text-right text-cyan-300">{fmt(data.cases_converted_to_robotic)}</td>
                        <td className="py-2 text-right text-emerald-300 font-semibold">{fmtMoneyShort(data.total_specialty_savings)}</td>
                        <td className="py-2 text-[11px] text-slate-400">{topMetric ? `${topMetric.metric_name} (${fmtMoneyShort(topMetric.savings)})` : '--'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            <div className="text-[10px] text-slate-500 mt-3 italic">{results.methodology}</div>
          </div>

          {results.all_citations?.length > 0 && (
            <div className="mt-6 bg-slate-800/30 border border-slate-700 rounded-lg p-4">
              <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Literature Citations ({results.all_citations.length})</h4>
              <ul className="text-[11px] text-slate-400 space-y-1">
                {results.all_citations.slice(0, 8).map((c, i) => (
                  <li key={i}>[{i + 1}] {c.authors || c.author || 'Unknown'}. {c.title}. {c.journal} {c.year ? `(${c.year})` : ''}</li>
                ))}
                {results.all_citations.length > 8 && <li className="italic text-slate-500">+ {results.all_citations.length - 8} more citations</li>}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={() => navigate(`/clinical-outcomes/${id}`)} className="text-sm text-slate-400 hover:text-slate-200">← Clinical Outcomes</button>
        <button onClick={() => navigate(`/commitments/${id}`)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded">
          Next: Surgeon Commitments →
        </button>
      </div>
    </div>
  )
}
