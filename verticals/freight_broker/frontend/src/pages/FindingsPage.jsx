import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFindings } from '../lib/api'

const SEVERITY_OPTIONS = ['all', 'critical', 'warning', 'advisory', 'info']
const MODULE_OPTIONS = [
  'all', 'load_operations', 'rate_intelligence', 'fleet_utilization',
  'financial_health', 'compliance_risk', 'driver_retention', 'customer_health'
]
const STATUS_OPTIONS = ['all', 'open', 'acknowledged', 'in_progress', 'resolved']

const SEVERITY_COLORS = {
  critical: { dot: 'bg-red-500', badge: 'bg-red-500/20 text-red-400' },
  warning: { dot: 'bg-orange-500', badge: 'bg-orange-500/20 text-orange-400' },
  advisory: { dot: 'bg-yellow-500', badge: 'bg-yellow-500/20 text-yellow-400' },
  info: { dot: 'bg-blue-500', badge: 'bg-blue-500/20 text-blue-400' },
}

const MODULE_LABELS = {
  load_operations: 'Load Operations',
  rate_intelligence: 'Rate Intelligence',
  fleet_utilization: 'Fleet Utilization',
  financial_health: 'Financial Health',
  compliance_risk: 'Compliance Risk',
  driver_retention: 'Driver Retention',
  customer_health: 'Customer Health',
}

const DEMO_FINDINGS = [
  {
    id: 'f1',
    severity: 'critical',
    title: 'Dead mile ratio exceeds 35% on I-95 corridor',
    module: 'load_operations',
    category: 'Dead Miles',
    estimated_monthly_savings: 8200,
    status: 'open',
    created_at: '2026-03-22T14:30:00Z',
  },
  {
    id: 'f2',
    severity: 'critical',
    title: '12 carriers operating with lapsed insurance',
    module: 'compliance_risk',
    category: 'Insurance Gaps',
    estimated_monthly_savings: null,
    status: 'open',
    created_at: '2026-03-22T14:30:00Z',
  },
  {
    id: 'f3',
    severity: 'warning',
    title: 'Spot rate margin below market on DAL-HOU lane',
    module: 'rate_intelligence',
    category: 'Margin Analysis',
    estimated_monthly_savings: 4500,
    status: 'open',
    created_at: '2026-03-22T14:30:00Z',
  },
  {
    id: 'f4',
    severity: 'warning',
    title: 'Top shipper accounts for 42% of revenue',
    module: 'customer_health',
    category: 'Concentration Risk',
    estimated_monthly_savings: null,
    status: 'acknowledged',
    created_at: '2026-03-21T10:00:00Z',
  },
  {
    id: 'f5',
    severity: 'advisory',
    title: 'Fleet utilization drops 28% on Fridays',
    module: 'fleet_utilization',
    category: 'Utilization Pattern',
    estimated_monthly_savings: 3100,
    status: 'open',
    created_at: '2026-03-21T10:00:00Z',
  },
  {
    id: 'f6',
    severity: 'advisory',
    title: 'AR aging: 18 invoices past 60 days ($47K outstanding)',
    module: 'financial_health',
    category: 'Accounts Receivable',
    estimated_monthly_savings: 2300,
    status: 'in_progress',
    created_at: '2026-03-20T16:45:00Z',
  },
  {
    id: 'f7',
    severity: 'info',
    title: 'Driver HOS utilization averaging 72% (industry avg 78%)',
    module: 'driver_retention',
    category: 'HOS Optimization',
    estimated_monthly_savings: 1800,
    status: 'open',
    created_at: '2026-03-20T16:45:00Z',
  },
  {
    id: 'f8',
    severity: 'warning',
    title: 'Win rate declined 15% month-over-month',
    module: 'load_operations',
    category: 'Win Rate',
    estimated_monthly_savings: 6700,
    status: 'open',
    created_at: '2026-03-19T08:00:00Z',
  },
]

export default function FindingsPage() {
  const navigate = useNavigate()
  const [findings, setFindings] = useState([])
  const [loading, setLoading] = useState(true)
  const [severity, setSeverity] = useState('all')
  const [module, setModule] = useState('all')
  const [status, setStatus] = useState('all')
  const [sortBy, setSortBy] = useState('severity')

  useEffect(() => {
    loadFindings()
  }, [])

  async function loadFindings() {
    setLoading(true)
    try {
      const result = await getFindings()
      if (result.data && result.data.length > 0) {
        setFindings(result.data.map(f => ({
          ...f,
          module: f.scan_module || f.module
        })))
      } else if (result.findings && result.findings.length > 0) {
        setFindings(result.findings.map(f => ({
          ...f,
          module: f.scan_module || f.module
        })))
      } else {
        setFindings([])
      }
    } catch {
      setFindings([])
    }
    setLoading(false)
  }

  const filtered = findings.filter(f => {
    if (severity !== 'all' && f.severity !== severity) return false
    if (module !== 'all' && f.module !== module) return false
    if (status !== 'all' && f.status !== status) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'severity') {
      const order = { critical: 0, warning: 1, advisory: 2, info: 3 }
      return (order[a.severity] || 9) - (order[b.severity] || 9)
    }
    if (sortBy === 'savings') {
      return (b.estimated_monthly_savings || 0) - (a.estimated_monthly_savings || 0)
    }
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warning: findings.filter(f => f.severity === 'warning').length,
    advisory: findings.filter(f => f.severity === 'advisory').length,
    info: findings.filter(f => f.severity === 'info').length,
  }

  function formatDate(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (findings.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-slate-800/60 border border-slate-700 rounded-xl p-12 max-w-md">
          <svg className="w-12 h-12 mx-auto mb-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2 className="text-xl font-bold text-white mb-3">No Findings Yet</h2>
          <p className="text-slate-400 text-sm">Run a scan to get started. FreightMind will analyze your data and surface actionable findings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Summary Stats */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.entries(counts).map(([sev, count]) => (
          <div key={sev} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${SEVERITY_COLORS[sev].badge}`}>
            <span className={`w-2 h-2 rounded-full ${SEVERITY_COLORS[sev].dot}`} />
            <span className="text-xs font-semibold capitalize">{sev}</span>
            <span className="text-xs font-bold">{count}</span>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 mb-6 bg-slate-800/40 border border-slate-700/60 rounded-xl p-3">
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          {SEVERITY_OPTIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All Severities' : o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
        </select>
        <select
          value={module}
          onChange={e => setModule(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          {MODULE_OPTIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All Modules' : MODULE_LABELS[o] || o}</option>)}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All Statuses' : o.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase">Sort:</span>
          {['severity', 'savings', 'date'].map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${sortBy === s ? 'bg-purple-600/30 text-purple-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Findings List */}
      <div className="space-y-3">
        {sorted.map(f => (
          <button
            key={f.id}
            onClick={() => navigate(`/obd/findings/${f.id}`)}
            className="w-full text-left bg-slate-800/60 border border-slate-700 hover:border-slate-600 rounded-xl p-4 transition-all duration-150 group"
          >
            <div className="flex items-start gap-3">
              <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_COLORS[f.severity]?.dot || 'bg-slate-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">{f.title}</h3>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{MODULE_LABELS[f.module] || f.module}</span>
                  <span className="text-slate-700">|</span>
                  <span>{f.category}</span>
                  <span className="text-slate-700">|</span>
                  <span>{formatDate(f.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {f.estimated_monthly_savings && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-400">
                    ${f.estimated_monthly_savings.toLocaleString()}/mo
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                  f.status === 'open' ? 'bg-slate-600/40 text-slate-400' :
                  f.status === 'acknowledged' ? 'bg-blue-500/20 text-blue-400' :
                  f.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {f.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-600 mt-4 text-center">{sorted.length} finding{sorted.length !== 1 ? 's' : ''} shown</p>
    </div>
  )
}
