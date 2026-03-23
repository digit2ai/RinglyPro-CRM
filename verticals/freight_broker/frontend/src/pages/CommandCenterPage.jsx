import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard, getHealth, getFindings } from '../lib/api'

export default function CommandCenterPage() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [health, setHealth] = useState(null)
  const [recentFindings, setRecentFindings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [dashRes, healthRes, findingsRes] = await Promise.allSettled([
        getDashboard(),
        getHealth(),
        getFindings({ limit: 5 })
      ])

      if (dashRes.status === 'fulfilled' && dashRes.value) {
        setDashboard(dashRes.value)
      }
      if (healthRes.status === 'fulfilled' && healthRes.value) {
        setHealth(healthRes.value)
      }
      if (findingsRes.status === 'fulfilled') {
        const items = findingsRes.value?.data || findingsRes.value?.findings || []
        setRecentFindings(items.slice(0, 5).map(f => ({ ...f, module: f.scan_module || f.module })))
      }
    } catch {
      setRecentFindings([])
    }
    setLoading(false)
  }

  const dashData = dashboard?.data || dashboard || {}
  const metrics = [
    {
      label: 'Open Findings',
      value: dashData.open_findings != null ? dashData.open_findings : '--',
      sub: 'Pending review',
      color: 'text-freight-400',
    },
    {
      label: 'Est. Savings',
      value: dashData.total_estimated_monthly_savings ? `$${Math.round(dashData.total_estimated_monthly_savings).toLocaleString()}` : '--',
      sub: 'Per month',
      color: 'text-green-400',
    },
    {
      label: 'Modules',
      value: dashData.module_scores ? Object.keys(dashData.module_scores).length : '--',
      sub: 'Scan modules',
      color: 'text-yellow-400',
    },
    {
      label: 'OBD Score',
      value: dashData.overall_score || '--',
      sub: dashData.overall_score ? 'Last scan' : 'No scan yet',
      color: 'text-purple-400',
    },
  ]

  const severityDot = {
    critical: 'bg-red-500',
    warning: 'bg-orange-500',
    advisory: 'bg-yellow-500',
    info: 'bg-blue-500',
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Command Center</h1>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map(m => (
          <div key={m.label} className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{m.label}</p>
            <p className={`text-3xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-slate-600 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => navigate('/obd/scan')}
          className="bg-purple-600/15 border border-purple-500/30 hover:border-purple-500/60 rounded-xl p-5 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            <span className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">Run OBD Scan</span>
          </div>
          <p className="text-xs text-slate-400">Analyze all 7 diagnostic modules</p>
        </button>
        <button
          onClick={() => navigate('/obd/ingest')}
          className="bg-slate-800/60 border border-slate-700 hover:border-slate-600 rounded-xl p-5 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-5 h-5 text-freight-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm font-semibold text-white group-hover:text-freight-400 transition-colors">Upload Data</span>
          </div>
          <p className="text-xs text-slate-400">Import from TMS, CSV, or EDI</p>
        </button>
        <button
          onClick={() => navigate('/obd/findings')}
          className="bg-slate-800/60 border border-slate-700 hover:border-slate-600 rounded-xl p-5 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-sm font-semibold text-white group-hover:text-orange-400 transition-colors">View Findings</span>
          </div>
          <p className="text-xs text-slate-400">Review diagnostics and prescriptions</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Findings */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">Recent Findings</h2>
          {recentFindings.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No findings yet. Run a scan to get started.</p>
          ) : (
            <div className="space-y-3">
              {recentFindings.map(f => (
                <button
                  key={f.id}
                  onClick={() => navigate(`/obd/findings/${f.id}`)}
                  className="w-full flex items-start gap-2.5 text-left hover:bg-slate-700/30 rounded-lg p-2 -mx-2 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot[f.severity] || 'bg-slate-500'}`} />
                  <div>
                    <p className="text-xs font-medium text-slate-300">{f.title}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{f.module?.replace('_', ' ')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* System Status */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">System Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">FreightMind API</span>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${health?.status === 'ok' || health?.status === 'healthy' ? 'text-green-400' : 'text-slate-500'}`}>
                <span className={`w-2 h-2 rounded-full ${health?.status === 'ok' || health?.status === 'healthy' ? 'bg-green-400' : 'bg-slate-600'}`} />
                {health?.status === 'ok' || health?.status === 'healthy' ? 'Operational' : 'Unknown'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Database</span>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${health?.database ? 'text-green-400' : 'text-slate-500'}`}>
                <span className={`w-2 h-2 rounded-full ${health?.database ? 'bg-green-400' : 'bg-slate-600'}`} />
                {health?.database ? 'Connected' : 'Unknown'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">MCP Agent Mesh</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">OBD Scanner Engine</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                Ready
              </span>
            </div>
          </div>
          {health?.version && (
            <p className="text-[10px] text-slate-600 mt-4 pt-3 border-t border-slate-700/40">API Version: {health.version}</p>
          )}
        </div>
      </div>
    </div>
  )
}
