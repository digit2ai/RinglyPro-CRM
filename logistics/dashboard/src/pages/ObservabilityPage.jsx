import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTelemetryHealth, getTelemetryEvents, seedDemoTelemetry } from '../lib/api'

const BASE = '/pinaxis/api/v1'

function RefreshIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
    </svg>
  )
}

function StatusBadge({ status }) {
  const config = {
    healthy: { bg: 'bg-green-500/20', text: 'text-green-300', dot: 'bg-green-400', label: 'Healthy' },
    warning: { bg: 'bg-amber-500/20', text: 'text-amber-300', dot: 'bg-amber-400', label: 'Warning' },
    degraded: { bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400', label: 'Degraded' },
    critical: { bg: 'bg-red-500/20', text: 'text-red-300', dot: 'bg-red-400 animate-pulse', label: 'Critical' },
    no_telemetry: { bg: 'bg-slate-500/20', text: 'text-slate-300', dot: 'bg-slate-400', label: 'No Data' }
  }
  const c = config[status] || config.no_telemetry
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function SeverityTag({ severity }) {
  const colors = {
    info: 'bg-blue-500/20 text-blue-300',
    warning: 'bg-amber-500/20 text-amber-300',
    critical: 'bg-red-500/20 text-red-300'
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  )
}

export default function ObservabilityPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [health, setHealth] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [eventFilter, setEventFilter] = useState('all')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [projects, setProjects] = useState(null)
  const [seeding, setSeeding] = useState(false)

  const handleSeedDemo = async () => {
    setSeeding(true)
    try {
      await seedDemoTelemetry(projectId)
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSeeding(false)
    }
  }

  // If no projectId, fetch project list and show selector
  useEffect(() => {
    if (!projectId) {
      setLoading(true)
      fetch(`${BASE}/projects`)
        .then(r => r.json())
        .then(json => {
          const list = json.success ? json.data : json
          setProjects(Array.isArray(list) ? list : [])
          // Auto-redirect if only one project
          if (Array.isArray(list) && list.length === 1) {
            navigate(`/observability/${list[0].id}`, { replace: true })
          }
        })
        .catch(() => setProjects([]))
        .finally(() => setLoading(false))
    }
  }, [projectId, navigate])

  const fetchData = useCallback(async () => {
    if (!projectId) return
    try {
      setError(null)
      const [healthData, eventsData] = await Promise.all([
        getTelemetryHealth(projectId),
        getTelemetryEvents(projectId, { hours: 24, limit: 50 })
      ])
      setHealth(healthData)
      setEvents(eventsData?.events || [])
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) fetchData()
  }, [projectId, fetchData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const filteredEvents = eventFilter === 'all'
    ? events
    : events.filter(e => e.event_type === eventFilter)

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto animate-fade-in">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-logistics-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Loading observability data...</p>
          </div>
        </div>
      </div>
    )
  }

  // Project selector when no projectId
  if (!projectId) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Observability</h1>
          <p className="text-slate-400">Select a project to view live telemetry and equipment health.</p>
        </div>
        {projects && projects.length === 0 ? (
          <div className="card text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Projects Found</h3>
            <p className="text-slate-400 text-sm">Create a project first by uploading data on the Upload page.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {(projects || []).map(p => (
              <button
                key={p.id}
                onClick={() => navigate(`/observability/${p.id}`)}
                className="card flex items-center gap-4 text-left hover:border-logistics-500/50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-logistics-600/20 flex items-center justify-center flex-shrink-0 group-hover:bg-logistics-600/30">
                  <svg className="w-5 h-5 text-logistics-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium">{p.company_name || p.project_code || `Project ${p.id}`}</p>
                  <p className="text-xs text-slate-400">
                    {p.status || 'unknown'} — created {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                <svg className="w-5 h-5 text-slate-500 group-hover:text-logistics-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const noTelemetry = !health || health.status === 'no_telemetry'

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Observability</h1>
          <p className="text-slate-400">
            {health?.company_name ? `Live operational health for ${health.company_name}` : 'Real-time equipment monitoring and telemetry'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={health?.overall_status || 'no_telemetry'} />
          <button
            onClick={fetchData}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              autoRefresh
                ? 'bg-logistics-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* No Telemetry State */}
      {noTelemetry && (
        <div className="card border-slate-600">
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Observability Ready</h3>
            <p className="text-slate-400 max-w-lg mx-auto mb-4">
              No telemetry data has been received yet. Connect your WCS/WES systems to push
              equipment telemetry via the Production API, or generate POC data to preview the dashboard.
            </p>
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="px-6 py-3 rounded-lg bg-logistics-600 hover:bg-logistics-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
            >
              {seeding ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating RinglyPro Logistics equipment telemetry...
                </span>
              ) : (
                'Generate POC Telemetry'
              )}
            </button>
            <div className="max-w-2xl mx-auto text-left">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Example: Send equipment status</p>
              <pre className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 text-sm text-slate-300 overflow-x-auto whitespace-pre">{`curl -X POST /logistics/api/v1/telemetry/${projectId}/events \\
  -H "X-API-Key: pnx_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "equipment_status",
    "source": "shuttle-01",
    "data": {
      "status": "running",
      "cycles": 12450,
      "temperature_c": 42.5,
      "utilization_pct": 78
    },
    "severity": "info"
  }'`}</pre>
            </div>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
              {[
                { type: 'equipment_status', desc: 'Shuttle, conveyor, lift status' },
                { type: 'throughput_snapshot', desc: 'CPH, orders/hour metrics' },
                { type: 'fault', desc: 'Equipment faults and errors' },
                { type: 'kpi_update', desc: 'Pick accuracy, cycle time' }
              ].map(t => (
                <div key={t.type} className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-center">
                  <p className="text-xs font-mono text-logistics-300 mb-1">{t.type}</p>
                  <p className="text-xs text-slate-500">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live Dashboard */}
      {!noTelemetry && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Events</p>
              <p className="text-2xl font-bold text-white">{(health.total_events || 0).toLocaleString()}</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Last Hour - Info</p>
              <p className="text-2xl font-bold text-blue-300">{health.last_hour_summary?.info || 0}</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Last Hour - Warnings</p>
              <p className="text-2xl font-bold text-amber-300">{health.last_hour_summary?.warning || 0}</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Last Hour - Critical</p>
              <p className="text-2xl font-bold text-red-300">{health.last_hour_summary?.critical || 0}</p>
            </div>
          </div>

          {/* Equipment Status */}
          {health.equipment && health.equipment.length > 0 && (
            <div className="card mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Equipment Status</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {health.equipment.map((eq, i) => (
                  <div key={i} className="p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-white">{eq.source}</p>
                      <SeverityTag severity={eq.severity} />
                    </div>
                    <p className="text-xs text-slate-400 mb-1">{eq.event_type}</p>
                    {eq.status && typeof eq.status === 'object' && (
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {Object.entries(eq.status).slice(0, 6).map(([k, v]) => (
                          <div key={k} className="text-xs">
                            <span className="text-slate-500">{k}: </span>
                            <span className="text-slate-300">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-slate-600 mt-2">
                      {eq.last_seen ? new Date(eq.last_seen).toLocaleString() : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Faults */}
          {health.active_faults && health.active_faults.length > 0 && (
            <div className="card mb-6 border-red-500/30">
              <h3 className="text-lg font-semibold text-red-300 mb-4">Active Faults (24h)</h3>
              <div className="space-y-2">
                {health.active_faults.map((fault, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-900/10 border border-red-500/20">
                    <SeverityTag severity={fault.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{fault.source}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fault.details?.message || fault.details?.fault_code || JSON.stringify(fault.details).slice(0, 100)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 flex-shrink-0">
                      {fault.time ? new Date(fault.time).toLocaleTimeString() : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Throughput */}
          {health.recent_throughput && health.recent_throughput.length > 0 && (
            <div className="card mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Throughput (1h)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium">Metrics</th>
                      <th className="pb-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {health.recent_throughput.slice(0, 20).map((t, i) => (
                      <tr key={i} className="border-t border-slate-700/50">
                        <td className="py-2 font-medium text-white">{t.source}</td>
                        <td className="py-2 text-xs">
                          {t.metrics && typeof t.metrics === 'object'
                            ? Object.entries(t.metrics).map(([k, v]) => `${k}: ${v}`).join(' | ')
                            : '—'
                          }
                        </td>
                        <td className="py-2 text-xs text-slate-500">
                          {t.time ? new Date(t.time).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Event Log */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Event Log (24h)</h3>
              <div className="flex gap-1">
                {['all', 'equipment_status', 'throughput_snapshot', 'fault', 'kpi_update'].map(f => (
                  <button
                    key={f}
                    onClick={() => setEventFilter(f)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      eventFilter === f
                        ? 'bg-logistics-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
            {filteredEvents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No events matching filter</p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {filteredEvents.map((evt, i) => (
                  <div key={evt.id || i} className="flex items-center gap-3 px-3 py-2 rounded bg-slate-900/30 text-sm">
                    <SeverityTag severity={evt.severity} />
                    <span className="text-xs font-mono text-slate-500 w-20 flex-shrink-0">{evt.event_type?.replace(/_/g, ' ')}</span>
                    <span className="text-white font-medium w-28 flex-shrink-0 truncate">{evt.source}</span>
                    <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                      {evt.event_data ? JSON.stringify(evt.event_data).slice(0, 80) : '—'}
                    </span>
                    <span className="text-xs text-slate-600 flex-shrink-0">
                      {evt.recorded_at ? new Date(evt.recorded_at).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lastRefresh && (
            <p className="text-xs text-slate-600 text-center mt-4">
              Last refreshed: {lastRefresh.toLocaleTimeString()}
              {autoRefresh && ' (auto-refreshing every 30s)'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
