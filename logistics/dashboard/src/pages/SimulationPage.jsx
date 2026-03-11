import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, runSimulation, getSimulation } from '../lib/api'

const RISK_COLOR = {
  High:   { bg: 'bg-red-500/15',    border: 'border-red-500/30',    text: 'text-red-400',    dot: 'bg-red-500' },
  Medium: { bg: 'bg-amber-500/15',  border: 'border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-500' },
  Low:    { bg: 'bg-emerald-500/15',border: 'border-emerald-500/30',text: 'text-emerald-400',dot: 'bg-emerald-500' }
}

const SCENARIO_STYLE = {
  baseline:  { accent: 'border-l-blue-500',   badge: 'bg-blue-500/20 text-blue-300',   label: 'Baseline' },
  growth_30: { accent: 'border-l-amber-500',  badge: 'bg-amber-500/20 text-amber-300', label: 'Growth' },
  peak:      { accent: 'border-l-red-500',    badge: 'bg-red-500/20 text-red-300',     label: 'Stress' }
}

function MetricBox({ label, value, sub }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function ScenarioCard({ scenario, isSelected, onClick }) {
  const style = SCENARIO_STYLE[scenario.id] || SCENARIO_STYLE.baseline
  const highRisk = scenario.bottlenecks?.some(b => b.risk === 'High')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`card border-l-4 ${style.accent} text-left w-full transition-all ${
        isSelected ? 'ring-2 ring-logistics-500/50 bg-slate-700/60' : 'hover:bg-slate-700/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
            {style.label}
          </span>
          {highRisk && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
              Bottleneck risk
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0">×{scenario.multiplier?.toFixed(1)}</span>
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">{scenario.label}</h3>
      <p className="text-xs text-slate-400 leading-relaxed mb-3">{scenario.description}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">Orderlines / day</p>
          <p className="text-base font-bold text-white">{scenario.metrics?.orderlines_per_day?.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Picking zones</p>
          <p className="text-base font-bold text-white">{scenario.metrics?.picking_zones}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          scenario.confidence === 'High' ? 'bg-emerald-500' :
          scenario.confidence === 'Medium' ? 'bg-amber-500' : 'bg-slate-500'
        }`} />
        <span className="text-xs text-slate-400">{scenario.confidence} confidence</span>
      </div>
    </button>
  )
}

export default function SimulationPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [simulation, setSimulation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState('baseline')

  useEffect(() => { loadData() }, [projectId])

  async function loadData() {
    try {
      setLoading(true)
      const proj = await getProject(projectId)
      setProject(proj)
      try {
        const sim = await getSimulation(projectId)
        setSimulation(sim)
      } catch {
        // Auto-run on first visit
        await handleRun()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const result = await runSimulation(projectId)
      setSimulation(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  if (loading || running) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg className="animate-spin w-12 h-12 text-logistics-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-white font-semibold">Running simulation scenarios...</p>
          <p className="text-slate-400 text-sm mt-1">Stress testing throughput and bottleneck models</p>
        </div>
      </div>
    )
  }

  const scenarios = simulation?.scenarios || []
  const sensitivity = simulation?.sensitivity || {}
  const pkg = simulation?.package_summary || {}
  const activeScenario = scenarios.find(s => s.id === selected) || scenarios[0]

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Simulation Agent</h1>
          <p className="text-slate-400 mt-1 text-sm">
            {project?.company_name} — Throughput stress tests &amp; bottleneck analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/products/${projectId}`)} className="btn-secondary text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Concepts
          </button>
          <button onClick={handleRun} className="btn-secondary text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.990" />
            </svg>
            Re-run
          </button>
          <button onClick={() => navigate(`/benefits/${projectId}`)} className="btn-primary text-sm flex items-center gap-2">
            Commercial
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Simulation package status */}
      {pkg.status === 'complete' && (
        <div className="card border border-logistics-500/30 bg-gradient-to-br from-logistics-900/20 to-slate-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <MetricBox label="Scenarios Run" value={pkg.scenarios_run} />
            <MetricBox label="Bottlenecks Found" value={pkg.bottleneck_count} sub={pkg.bottleneck_count === 0 ? 'Clean' : 'Require review'} />
            <MetricBox
              label="Sensitivity Low → High"
              value={`${sensitivity.orderlines_range?.low?.toLocaleString()} → ${sensitivity.orderlines_range?.high?.toLocaleString()}`}
              sub="Orderlines / day"
            />
            <div className="text-center flex flex-col justify-center">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full mx-auto mb-1 ${
                pkg.ready_for_commercial ? 'bg-emerald-500/20' : 'bg-amber-500/20'
              }`}>
                {pkg.ready_for_commercial
                  ? <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  : <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                }
              </div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Ready for Commercial</p>
            </div>
          </div>
          {pkg.simulation_verdict && (
            <p className="text-sm text-slate-300 mt-4 pt-4 border-t border-slate-700/60">{pkg.simulation_verdict}</p>
          )}
        </div>
      )}

      {/* Scenario selector */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Select Scenario</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scenarios.map(s => (
            <ScenarioCard key={s.id} scenario={s} isSelected={selected === s.id} onClick={() => setSelected(s.id)} />
          ))}
        </div>
      </div>

      {/* Detail panel for selected scenario */}
      {activeScenario && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-logistics-400" />
            <h2 className="text-base font-semibold text-white">{activeScenario.label} — Detail</h2>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Orders / day', value: activeScenario.metrics?.orders_per_day?.toLocaleString() },
              { label: 'Orderlines / day', value: activeScenario.metrics?.orderlines_per_day?.toLocaleString() },
              { label: 'Inbound buffer slots', value: activeScenario.metrics?.inbound_buffer_slots?.toLocaleString() },
              { label: 'Outbound buffer slots', value: activeScenario.metrics?.outbound_buffer_slots?.toLocaleString() },
              { label: 'Picking zones', value: activeScenario.metrics?.picking_zones },
              { label: 'Storage locations', value: activeScenario.metrics?.storage_locations_needed?.toLocaleString() },
              { label: 'Volume multiplier', value: `×${activeScenario.multiplier?.toFixed(1)}` },
              { label: 'Confidence', value: activeScenario.confidence }
            ].map(m => (
              <div key={m.label} className="card py-4">
                <p className="text-xs text-slate-500 mb-1">{m.label}</p>
                <p className="text-lg font-bold text-white">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Bottleneck analysis */}
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Bottleneck Analysis
            </h3>
            <div className="space-y-3">
              {activeScenario.bottlenecks?.map((b, i) => {
                const style = RISK_COLOR[b.risk] || RISK_COLOR.Low
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg} ${style.border}`}>
                    <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${style.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{b.zone}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text}`}>
                          {b.risk} risk
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{b.reason}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sensitivity ranges */}
      {sensitivity.orderlines_range && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Sensitivity Ranges</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Orderlines / Day Range</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300 font-mono w-14">{sensitivity.orderlines_range.low?.toLocaleString()}</span>
                <div className="flex-1 relative h-4 bg-slate-700 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-blue-600 rounded-full" style={{ width: '33%' }} />
                  <div className="absolute inset-y-0 left-[33%] bg-amber-500 rounded-full" style={{ width: '33%' }} />
                  <div className="absolute inset-y-0 left-[66%] bg-red-500 rounded-full" style={{ width: '34%' }} />
                </div>
                <span className="text-sm text-slate-300 font-mono w-14 text-right">{sensitivity.orderlines_range.high?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Low</span><span>Mid: {sensitivity.orderlines_range.mid?.toLocaleString()}</span><span>Peak</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Storage Locations Range</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300 font-mono w-14">{sensitivity.storage_range?.low?.toLocaleString()}</span>
                <div className="flex-1 relative h-4 bg-slate-700 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-blue-600 rounded-full" style={{ width: '40%' }} />
                  <div className="absolute inset-y-0 left-[40%] bg-amber-500 rounded-full" style={{ width: '35%' }} />
                  <div className="absolute inset-y-0 left-[75%] bg-red-500 rounded-full" style={{ width: '25%' }} />
                </div>
                <span className="text-sm text-slate-300 font-mono w-14 text-right">{sensitivity.storage_range?.high?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Conservative</span><span>Recommended</span><span>Expanded</span>
              </div>
            </div>
          </div>
          {sensitivity.automation_justification && (
            <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-700/60 leading-relaxed">
              {sensitivity.automation_justification}
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Handoff footer */}
      <div className="card bg-slate-900/40 border border-logistics-500/20">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-logistics-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-slate-200 mb-1">Simulation Package</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              This simulation package — covering {pkg.scenarios_run} scenarios, sensitivity ranges, and bottleneck identification — is the handoff artifact to the Commercial step. Finance/Pricing will use these validated throughput bounds when applying the pricing snapshot.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
