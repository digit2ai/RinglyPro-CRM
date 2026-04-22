import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────

const ago = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return s + 's ago'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

const TYPE_BADGE = {
  academic:   'bg-blue-900/40 text-blue-300 border-blue-800',
  community:  'bg-green-900/40 text-green-300 border-green-800',
  specialty:  'bg-purple-900/40 text-purple-300 border-purple-800',
  VA:         'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  rural:      'bg-slate-700/60 text-slate-300 border-slate-600',
}

const STAGE_BADGE = {
  Intake:     'bg-slate-700/60 text-slate-300 border-slate-600',
  Analyzed:   'bg-blue-900/40 text-blue-300 border-blue-800',
  Planning:   'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  Finalized:  'bg-green-900/40 text-green-300 border-green-800',
  Tracking:   'bg-purple-900/40 text-purple-300 border-purple-800',
}

const STAGE_OPTIONS = ['All', 'Intake', 'Analyzed', 'Planning', 'Finalized', 'Tracking']
const TYPE_OPTIONS  = ['All', 'academic', 'community', 'specialty', 'VA', 'rural']

// ─── Sub-components ──────────────────────────────────────────

function KpiCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-slate-400 mt-1.5 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function Badge({ text, classes }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${classes}`}>
      {text}
    </span>
  )
}

function ActionButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-1.5 rounded hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
    >
      {children}
    </button>
  )
}

// ─── Icons (inline SVG, no external deps) ────────────────────

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

// ─── Main Component ──────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [hospitalFilter, setHospitalFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [stateFilter, setStateFilter] = useState('')

  // Sorting
  const [sortCol, setSortCol] = useState('hospital_name')
  const [sortDir, setSortDir] = useState('asc')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getDashboardOverview()
      setData(res.data)
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Filtered + sorted hospitals
  const hospitals = useMemo(() => {
    if (!data?.hospitals) return []
    let list = [...data.hospitals]

    if (hospitalFilter.trim()) {
      const words = hospitalFilter.trim().toLowerCase().split(/\s+/)
      list = list.filter(h => words.every(w => (h.hospital_name || '').toLowerCase().includes(w)))
    }
    if (stageFilter !== 'All') {
      list = list.filter(h => h.pipeline_stage === stageFilter)
    }
    if (typeFilter !== 'All') {
      list = list.filter(h => h.hospital_type === typeFilter)
    }
    if (stateFilter.trim()) {
      const q = stateFilter.trim().toLowerCase()
      list = list.filter(h => (h.state || '').toLowerCase().includes(q))
    }

    list.sort((a, b) => {
      let va = a[sortCol]
      let vb = b[sortCol]

      // Handle nested fields
      if (sortCol === 'system') {
        va = a.system_recommendation?.score ?? -1
        vb = b.system_recommendation?.score ?? -1
      } else if (sortCol === 'plan_status') {
        va = a.business_plan?.status ?? ''
        vb = b.business_plan?.status ?? ''
      }

      if (va == null) va = ''
      if (vb == null) vb = ''

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }

      const sa = String(va).toLowerCase()
      const sb = String(vb).toLowerCase()
      if (sa < sb) return sortDir === 'asc' ? -1 : 1
      if (sa > sb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [data, hospitalFilter, stageFilter, typeFilter, stateFilter, sortCol, sortDir])

  const toggleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const SortHeader = ({ col, children, className = '' }) => (
    <th
      className={`px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-200 transition-colors ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortCol === col && (
          <span className="text-intuitive-400">{sortDir === 'asc' ? ' ^' : ' v'}</span>
        )}
      </span>
    </th>
  )

  // ─── Loading / Error States ──────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 border border-red-800 rounded-xl p-8 text-center max-w-md">
          <div className="text-red-400 font-semibold mb-2">Error Loading Dashboard</div>
          <div className="text-slate-400 text-sm mb-4">{error}</div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-intuitive-600 hover:bg-intuitive-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const summary = data?.summary || {}

  // ─── Empty State ─────────────────────────────────────────────

  if (!data?.hospitals?.length) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <h1 className="text-2xl font-bold text-white mb-8">SurgicalMind AI -- Sales Operations Dashboard</h1>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center max-w-lg mx-auto">
          <div className="text-slate-400 text-lg mb-4">No hospitals in pipeline yet</div>
          <button
            onClick={() => navigate('/intake')}
            className="px-6 py-3 bg-intuitive-600 hover:bg-intuitive-500 text-white rounded-lg font-semibold transition-colors"
          >
            Generate Your First Report
          </button>
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <div className="max-w-[1600px] mx-auto px-6 py-8">

        {/* Header */}
        <h1 className="text-2xl font-bold text-white mb-6">SurgicalMind AI -- Sales Operations Dashboard</h1>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard label="Total Hospitals" value={summary.total_hospitals ?? 0} color="text-white" />
          <KpiCard label="Pending Actions" value={summary.pending_actions ?? 0} color="text-yellow-400" />
          <KpiCard label="Active Surveys" value={summary.active_surveys ?? 0} color="text-intuitive-400" />
          <KpiCard label="Plans Tracking" value={summary.plans_tracking ?? 0} color="text-green-400" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="text"
              value={hospitalFilter}
              onChange={e => setHospitalFilter(e.target.value)}
              placeholder="Filter hospitals..."
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2 w-56 focus:outline-none focus:border-intuitive-500"
            />
          </div>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-intuitive-500"
          >
            {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Stages' : s}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-intuitive-500"
          >
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <input
            type="text"
            placeholder="Filter by state..."
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 w-44 focus:outline-none focus:border-intuitive-500 placeholder-slate-500"
          />
          {(hospitalFilter || stageFilter !== 'All' || typeFilter !== 'All' || stateFilter) && (
            <button
              onClick={() => { setHospitalFilter(''); setStageFilter('All'); setTypeFilter('All'); setStateFilter('') }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {hospitals.length} hospital{hospitals.length !== 1 ? 's' : ''} shown
          </span>
        </div>

        {/* Pipeline Table */}
        <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 sticky top-0 z-10">
                <tr>
                  <SortHeader col="hospital_name">Hospital</SortHeader>
                  <SortHeader col="state">State</SortHeader>
                  <SortHeader col="hospital_type">Type</SortHeader>
                  <SortHeader col="bed_count">Beds</SortHeader>
                  <SortHeader col="pipeline_stage">Stage</SortHeader>
                  <SortHeader col="system">System</SortHeader>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Survey</th>
                  <SortHeader col="plan_status">Plan</SortHeader>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Actions</th>
                  <SortHeader col="last_updated">Updated</SortHeader>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {hospitals.map(h => {
                  const rec = h.system_recommendation
                  const survey = h.survey_status
                  const plan = h.business_plan
                  const actions = h.pending_actions || []

                  const surveyLabel = survey
                    ? survey.status === 'not_sent' || (!survey.total_sent && !survey.responses)
                      ? 'Not sent'
                      : `${survey.responses}/${survey.total_sent}`
                    : '--'

                  const surveyColor = survey
                    ? survey.responses === survey.total_sent && survey.total_sent > 0
                      ? 'text-green-400'
                      : survey.responses > 0
                        ? 'text-yellow-400'
                        : 'text-slate-500'
                    : 'text-slate-500'

                  return (
                    <tr key={h.id} className="hover:bg-slate-800/80 transition-colors">
                      {/* Hospital Name */}
                      <td className="px-3 py-3">
                        <button
                          onClick={() => navigate(`/analysis/${h.id}`)}
                          className="font-semibold text-white hover:text-intuitive-400 transition-colors text-left"
                        >
                          {h.hospital_name}
                        </button>
                        {h.project_code && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{h.project_code}</div>
                        )}
                      </td>

                      {/* State */}
                      <td className="px-3 py-3 text-slate-400 text-xs">{h.state || '--'}</td>

                      {/* Type */}
                      <td className="px-3 py-3">
                        {h.hospital_type ? (
                          <Badge
                            text={h.hospital_type}
                            classes={TYPE_BADGE[h.hospital_type] || TYPE_BADGE.rural}
                          />
                        ) : '--'}
                      </td>

                      {/* Beds */}
                      <td className="px-3 py-3 text-slate-300 tabular-nums">
                        {h.bed_count != null ? h.bed_count.toLocaleString() : '--'}
                      </td>

                      {/* Stage */}
                      <td className="px-3 py-3">
                        {h.pipeline_stage ? (
                          <Badge
                            text={h.pipeline_stage}
                            classes={STAGE_BADGE[h.pipeline_stage] || STAGE_BADGE.Intake}
                          />
                        ) : '--'}
                      </td>

                      {/* System */}
                      <td className="px-3 py-3 text-slate-300 text-xs">
                        {rec ? `${rec.model} (${rec.score})` : '--'}
                      </td>

                      {/* Survey */}
                      <td className={`px-3 py-3 text-xs font-medium ${surveyColor}`}>
                        {surveyLabel}
                      </td>

                      {/* Plan Status */}
                      <td className="px-3 py-3 text-xs text-slate-300">
                        {plan?.status || '--'}
                      </td>

                      {/* Pending Actions */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {actions.slice(0, 2).map((a, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-700/60 text-slate-300 rounded text-[10px] font-medium whitespace-nowrap">
                              {a}
                            </span>
                          ))}
                          {actions.length > 2 && (
                            <span className="px-1.5 py-0.5 bg-slate-700/40 text-slate-500 rounded text-[10px] font-medium">
                              +{actions.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Updated */}
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {h.last_updated ? ago(h.last_updated) : '--'}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <ActionButton title="View Analysis" onClick={() => navigate(`/analysis/${h.id}`)}>
                            <EyeIcon />
                          </ActionButton>
                          <ActionButton title="Business Plan" onClick={() => navigate(`/business-plan/${h.id}`)}>
                            <DocumentIcon />
                          </ActionButton>
                          {plan?.id && (
                            <ActionButton title="Tracking" onClick={() => navigate(`/tracking/${plan.id}`)}>
                              <ChartIcon />
                            </ActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        {data.recent_activity?.length > 0 && (
          <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Activity</h2>
            <ul className="space-y-2">
              {data.recent_activity.slice(0, 5).map((a, i) => (
                <li key={i} className="text-sm text-slate-400">
                  <span className="text-slate-300 font-medium">{a.hospital_name}</span>
                  {' -- '}
                  <span>{a.action}</span>
                  <span className="text-slate-600 ml-2 text-xs">({a.timestamp ? ago(a.timestamp) : ''})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  )
}
