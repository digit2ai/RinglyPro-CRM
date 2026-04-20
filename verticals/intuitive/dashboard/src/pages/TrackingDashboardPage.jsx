import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ─── Shared UI Helpers ────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-slate-700/60 text-slate-300 border-slate-600',
    finalized: 'bg-blue-900/40 text-blue-300 border-blue-800',
    tracking: 'bg-emerald-900/40 text-emerald-300 border-emerald-800'
  }
  return (
    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase border ${styles[status] || styles.draft}`}>
      {status || 'draft'}
    </span>
  )
}

function SummaryCard({ label, value, sub, color = 'text-intuitive-400' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center hover:border-slate-600 transition-all">
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-slate-300 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function SectionCard({ title, subtitle, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <div
        className={`flex items-center justify-between mb-4 ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
      >
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {collapsible && (
          <svg className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      {(!collapsible || open) && children}
    </div>
  )
}

function Spinner({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <svg className="animate-spin w-12 h-12 text-intuitive-500 mx-auto mb-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-slate-400 text-lg">{message}</p>
      </div>
    </div>
  )
}

// ─── Chart Tooltip ────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const projected = payload.find(p => p.dataKey === 'projected')
  const actual = payload.find(p => p.dataKey === 'actual')
  const projVal = projected?.value ?? 0
  const actVal = actual?.value ?? 0
  const variance = projVal > 0 ? (((actVal - projVal) / projVal) * 100).toFixed(1) : '---'
  const varColor = actVal >= projVal ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl text-sm">
      <p className="font-semibold text-white mb-1">{label}</p>
      <p className="text-slate-400">Projected: <span className="text-slate-200 font-medium">{projVal}</span></p>
      {actual && <p className="text-slate-400">Actual: <span className="text-intuitive-400 font-medium">{actVal}</span></p>}
      {actual && <p className={`${varColor} font-semibold mt-1`}>Variance: {variance}%</p>}
    </div>
  )
}

// ─── Variance Helper ──────────────────────────────────────────

function varianceColor(variance) {
  if (variance >= 0) return 'text-emerald-400'
  if (variance >= -20) return 'text-yellow-400'
  return 'text-red-400'
}

function varianceBg(variance) {
  if (variance >= 0) return 'bg-emerald-900/30'
  if (variance >= -20) return 'bg-yellow-900/30'
  return 'bg-red-900/30'
}

function trackingIcon(variance) {
  if (variance >= 0) {
    return <span className="text-emerald-400 font-bold text-lg" title="On Track">&#10003;</span>
  }
  return <span className="text-red-400 font-bold text-lg" title="Below Target">&#10007;</span>
}

// ─── Main Page ────────────────────────────────────────────────

export default function TrackingDashboardPage({ planId: propPlanId }) {
  const { planId: paramPlanId } = useParams()
  const planId = paramPlanId || propPlanId

  const [plan, setPlan] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [executiveSummary, setExecutiveSummary] = useState(null)
  const [showExecSummary, setShowExecSummary] = useState(false)
  const [loading, setLoading] = useState(true)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [execLoading, setExecLoading] = useState(false)
  const [error, setError] = useState(null)
  const [importSuccess, setImportSuccess] = useState(false)

  // Import form state
  const [importForm, setImportForm] = useState({
    period_start: '',
    period_end: '',
    period_label: '',
    notes: '',
    surgeon_actuals: [{ surgeon_name: '', actual_cases: '' }]
  })

  // ─── Data Loading ─────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!planId) return
    try {
      const [planRes, compRes] = await Promise.all([
        api.getBusinessPlan(planId),
        api.getComparison(planId)
      ])
      setPlan(planRes.plan || planRes)
      setComparison(compRes.comparison || compRes)
    } catch (err) {
      console.error('Failed to load tracking data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => { loadData() }, [loadData])

  // ─── Actions ──────────────────────────────────────────────

  const handleTakeSnapshot = async () => {
    setSnapshotLoading(true)
    try {
      await api.takeSnapshot(planId)
      await loadData()
    } catch (err) {
      console.error('Snapshot failed:', err)
      setError(err.message)
    } finally {
      setSnapshotLoading(false)
    }
  }

  const handleLoadExecutiveSummary = async () => {
    if (executiveSummary) {
      setShowExecSummary(s => !s)
      return
    }
    setExecLoading(true)
    try {
      const res = await api.getExecutiveSummary(planId)
      setExecutiveSummary(res.summary || res)
      setShowExecSummary(true)
    } catch (err) {
      console.error('Executive summary failed:', err)
      setError(err.message)
    } finally {
      setExecLoading(false)
    }
  }

  const handleImportActuals = async (e) => {
    e.preventDefault()
    setImportLoading(true)
    setImportSuccess(false)
    try {
      const payload = {
        period_start: importForm.period_start,
        period_end: importForm.period_end,
        period_label: importForm.period_label,
        notes: importForm.notes,
        surgeon_actuals: importForm.surgeon_actuals
          .filter(s => s.surgeon_name && s.actual_cases !== '')
          .map(s => ({ surgeon_name: s.surgeon_name, actual_cases: parseInt(s.actual_cases, 10) }))
      }
      await api.importActuals(planId, payload)
      setImportSuccess(true)
      setImportForm({
        period_start: '',
        period_end: '',
        period_label: '',
        notes: '',
        surgeon_actuals: [{ surgeon_name: '', actual_cases: '' }]
      })
      await loadData()
      setTimeout(() => setImportSuccess(false), 4000)
    } catch (err) {
      console.error('Import failed:', err)
      setError(err.message)
    } finally {
      setImportLoading(false)
    }
  }

  // ─── Import Form Helpers ──────────────────────────────────

  const updateSurgeonRow = (index, field, value) => {
    setImportForm(prev => {
      const rows = [...prev.surgeon_actuals]
      rows[index] = { ...rows[index], [field]: value }
      return { ...prev, surgeon_actuals: rows }
    })
  }

  const addSurgeonRow = () => {
    setImportForm(prev => ({
      ...prev,
      surgeon_actuals: [...prev.surgeon_actuals, { surgeon_name: '', actual_cases: '' }]
    }))
  }

  const removeSurgeonRow = (index) => {
    setImportForm(prev => ({
      ...prev,
      surgeon_actuals: prev.surgeon_actuals.filter((_, i) => i !== index)
    }))
  }

  // ─── Derived Data ─────────────────────────────────────────

  const surgeons = comparison?.surgeons || []
  const periods = comparison?.periods || []
  const summary = comparison?.summary || {}

  // Build committed surgeon names for dropdown
  const committedSurgeons = surgeons.map(s => s.surgeon_name || s.name).filter(Boolean)

  // Build timeline chart data from periods
  const timelineData = periods.map(p => ({
    period: p.period_label || p.label || p.period,
    projected: p.projected_cumulative ?? p.projected ?? 0,
    actual: p.actual_cumulative ?? p.actual ?? 0
  }))

  // Summary card values
  const cumulativeActual = summary.total_actual_cases ?? summary.cumulative_actual ?? 0
  const cumulativeProjected = summary.total_projected_cases ?? summary.cumulative_projected ?? 0
  const overallVariance = cumulativeProjected > 0
    ? (((cumulativeActual - cumulativeProjected) / cumulativeProjected) * 100).toFixed(1)
    : 0
  const projectedROI = summary.projected_annual_roi ?? summary.projected_roi ?? '---'
  const roiTrackingPct = summary.roi_tracking_pct ?? summary.roi_realized_pct ?? '---'

  // ─── Render ───────────────────────────────────────────────

  if (!planId) {
    return <div className="p-10 text-slate-400">No plan selected. Create a business plan first.</div>
  }

  if (loading) {
    return <Spinner message="Loading tracking dashboard..." />
  }

  if (error && !comparison) {
    return (
      <div className="p-10 text-center">
        <p className="text-red-400 text-lg mb-2">Failed to load tracking data</p>
        <p className="text-slate-500 text-sm">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); loadData() }} className="mt-4 px-4 py-2 bg-intuitive-600 hover:bg-intuitive-500 text-white rounded-lg text-sm transition-colors">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

      {/* ── Error Banner ──────────────────────────────────────── */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-sm font-bold ml-4">Dismiss</button>
        </div>
      )}

      {/* ── 1. Header ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {plan?.plan_name || plan?.name || 'Proforma Tracking'}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {plan?.hospital_name && (
              <span className="text-sm text-slate-400">{plan.hospital_name}</span>
            )}
            {plan?.system_type && (
              <span className="text-sm text-slate-500">| {plan.system_type}</span>
            )}
            <StatusBadge status={plan?.status} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTakeSnapshot}
            disabled={snapshotLoading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {snapshotLoading ? 'Saving...' : 'Take Snapshot'}
          </button>
          <button
            onClick={handleLoadExecutiveSummary}
            disabled={execLoading}
            className="px-4 py-2 bg-intuitive-600 hover:bg-intuitive-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {execLoading ? 'Loading...' : 'Executive Summary'}
          </button>
        </div>
      </div>

      {/* ── 2. Summary Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Cumulative Actual vs Projected"
          value={`${cumulativeActual} / ${cumulativeProjected}`}
          sub="Total cases"
          color="text-intuitive-400"
        />
        <SummaryCard
          label="Overall Variance"
          value={`${overallVariance > 0 ? '+' : ''}${overallVariance}%`}
          sub="Actual vs projected"
          color={parseFloat(overallVariance) >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <SummaryCard
          label="Projected Annual ROI"
          value={typeof projectedROI === 'number' ? `${projectedROI.toFixed(1)}%` : projectedROI}
          sub="Business plan target"
          color="text-intuitive-400"
        />
        <SummaryCard
          label="ROI Tracking"
          value={typeof roiTrackingPct === 'number' ? `${roiTrackingPct.toFixed(1)}%` : roiTrackingPct}
          sub="Of projected ROI realized"
          color={typeof roiTrackingPct === 'number' && roiTrackingPct >= 80 ? 'text-emerald-400' : typeof roiTrackingPct === 'number' && roiTrackingPct >= 50 ? 'text-yellow-400' : 'text-intuitive-400'}
        />
      </div>

      {/* ── 3. Timeline Chart ─────────────────────────────────── */}
      <SectionCard title="Proforma vs. Actual Timeline" subtitle="Cumulative case volume by period">
        {timelineData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="period"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  stroke="#475569"
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  stroke="#475569"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: 12 }}
                  formatter={(value) => <span className="text-slate-300 text-sm capitalize">{value}</span>}
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={{ fill: '#94a3b8', r: 4 }}
                  activeDot={{ r: 6, fill: '#94a3b8' }}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="#0ea5e9"
                  strokeWidth={3}
                  dot={{ fill: '#0ea5e9', r: 4 }}
                  activeDot={{ r: 6, fill: '#0ea5e9' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-12">No period data available yet. Import actuals to see the timeline.</p>
        )}
      </SectionCard>

      {/* ── 4. Surgeon Performance Table ──────────────────────── */}
      <SectionCard title="Surgeon Performance" subtitle="Individual surgeon tracking vs. commitments">
        {surgeons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Surgeon Name</th>
                  <th className="text-right py-3 px-4 text-slate-400 font-semibold">Projected Annual</th>
                  <th className="text-right py-3 px-4 text-slate-400 font-semibold">Total Actual</th>
                  <th className="text-right py-3 px-4 text-slate-400 font-semibold">Variance</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">On Track</th>
                </tr>
              </thead>
              <tbody>
                {[...surgeons]
                  .sort((a, b) => {
                    const aVar = (a.total_actual ?? 0) - (a.projected_annual ?? 0)
                    const bVar = (b.total_actual ?? 0) - (b.projected_annual ?? 0)
                    return aVar - bVar
                  })
                  .map((surgeon, idx) => {
                    const projected = surgeon.projected_annual ?? surgeon.projected ?? 0
                    const actual = surgeon.total_actual ?? surgeon.actual ?? 0
                    const varianceAbs = actual - projected
                    const variancePct = projected > 0 ? ((varianceAbs / projected) * 100).toFixed(1) : 0
                    const rowBg = idx % 2 === 0 ? '' : 'bg-slate-800/30'

                    return (
                      <tr key={surgeon.surgeon_name || surgeon.name || idx} className={`${rowBg} ${varianceBg(parseFloat(variancePct))} border-b border-slate-800/50 hover:bg-slate-700/30 transition-colors`}>
                        <td className="py-3 px-4 text-white font-medium">{surgeon.surgeon_name || surgeon.name}</td>
                        <td className="py-3 px-4 text-right text-slate-300">{projected}</td>
                        <td className="py-3 px-4 text-right text-slate-200 font-medium">{actual}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${varianceColor(parseFloat(variancePct))}`}>
                          {varianceAbs >= 0 ? '+' : ''}{varianceAbs} ({variancePct > 0 ? '+' : ''}{variancePct}%)
                        </td>
                        <td className="py-3 px-4 text-center">{trackingIcon(parseFloat(variancePct))}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8">No surgeon data available. Import actuals to populate this table.</p>
        )}
      </SectionCard>

      {/* ── 5. Import Actuals Form ────────────────────────────── */}
      <SectionCard title="Import Actuals" subtitle="Record actual case volumes for a reporting period">
        <form onSubmit={handleImportActuals} className="space-y-5">
          {/* Period info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Period Start</label>
              <input
                type="date"
                required
                value={importForm.period_start}
                onChange={e => setImportForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-intuitive-500 focus:border-intuitive-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Period End</label>
              <input
                type="date"
                required
                value={importForm.period_end}
                onChange={e => setImportForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-intuitive-500 focus:border-intuitive-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Period Label</label>
              <input
                type="text"
                required
                placeholder="e.g. Q1 2026"
                value={importForm.period_label}
                onChange={e => setImportForm(f => ({ ...f, period_label: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-intuitive-500 focus:border-intuitive-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Surgeon actuals rows */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">Surgeon Actuals</label>
            <div className="space-y-2">
              {importForm.surgeon_actuals.map((row, index) => (
                <div key={index} className="flex items-center gap-3">
                  {committedSurgeons.length > 0 ? (
                    <select
                      value={row.surgeon_name}
                      onChange={e => updateSurgeonRow(index, 'surgeon_name', e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-intuitive-500 focus:border-intuitive-500 outline-none transition-all"
                    >
                      <option value="">Select surgeon...</option>
                      {committedSurgeons.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Surgeon name"
                      value={row.surgeon_name}
                      onChange={e => updateSurgeonRow(index, 'surgeon_name', e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-intuitive-500 focus:border-intuitive-500 outline-none transition-all"
                    />
                  )}
                  <input
                    type="number"
                    min="0"
                    placeholder="Cases"
                    value={row.actual_cases}
                    onChange={e => updateSurgeonRow(index, 'actual_cases', e.target.value)}
                    className="w-28 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-intuitive-500 focus:border-intuitive-500 outline-none transition-all"
                  />
                  {importForm.surgeon_actuals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSurgeonRow(index)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                      title="Remove row"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSurgeonRow}
              className="mt-2 text-sm text-intuitive-400 hover:text-intuitive-300 font-medium transition-colors"
            >
              + Add Surgeon Row
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
            <textarea
              rows={3}
              placeholder="Optional notes about this period..."
              value={importForm.notes}
              onChange={e => setImportForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-intuitive-500 focus:border-intuitive-500 outline-none transition-all resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={importLoading}
              className="px-6 py-2.5 bg-intuitive-600 hover:bg-intuitive-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {importLoading ? 'Importing...' : 'Import Actuals'}
            </button>
            {importSuccess && (
              <span className="text-emerald-400 text-sm font-medium animate-pulse">
                Actuals imported successfully
              </span>
            )}
          </div>
        </form>
      </SectionCard>

      {/* ── 6. Executive Summary (collapsible) ────────────────── */}
      {showExecSummary && executiveSummary && (
        <SectionCard title="Executive Summary" subtitle="AI-generated tracking summary" collapsible defaultOpen={true}>
          <div className="space-y-4">
            {/* Header meta */}
            <div className="flex flex-wrap gap-4 text-sm">
              {executiveSummary.hospital_name && (
                <div className="bg-slate-800 rounded-lg px-3 py-2 border border-slate-700">
                  <span className="text-slate-500">Hospital:</span>{' '}
                  <span className="text-white font-medium">{executiveSummary.hospital_name}</span>
                </div>
              )}
              {executiveSummary.plan_name && (
                <div className="bg-slate-800 rounded-lg px-3 py-2 border border-slate-700">
                  <span className="text-slate-500">Plan:</span>{' '}
                  <span className="text-white font-medium">{executiveSummary.plan_name}</span>
                </div>
              )}
              {executiveSummary.system_type && (
                <div className="bg-slate-800 rounded-lg px-3 py-2 border border-slate-700">
                  <span className="text-slate-500">System:</span>{' '}
                  <span className="text-white font-medium">{executiveSummary.system_type}</span>
                </div>
              )}
            </div>

            {/* Key metrics */}
            {executiveSummary.key_metrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(executiveSummary.key_metrics).map(([key, val]) => (
                  <div key={key} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-intuitive-400">{typeof val === 'number' ? val.toLocaleString() : val}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 capitalize">{key.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tracking status */}
            {executiveSummary.tracking_status && (
              <div className={`rounded-lg p-4 border ${
                executiveSummary.tracking_status === 'on_track' || executiveSummary.tracking_status === 'On Track'
                  ? 'bg-emerald-900/20 border-emerald-800 text-emerald-300'
                  : executiveSummary.tracking_status === 'at_risk' || executiveSummary.tracking_status === 'At Risk'
                    ? 'bg-yellow-900/20 border-yellow-800 text-yellow-300'
                    : 'bg-red-900/20 border-red-800 text-red-300'
              }`}>
                <span className="font-semibold text-sm">Tracking Status: </span>
                <span className="font-bold uppercase text-sm">
                  {executiveSummary.tracking_status.replace(/_/g, ' ')}
                </span>
              </div>
            )}

            {/* Narrative */}
            {executiveSummary.narrative && (
              <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700">
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                  {executiveSummary.narrative}
                </p>
              </div>
            )}

            {/* Fallback: render entire summary as formatted text if no structured fields */}
            {typeof executiveSummary === 'string' && (
              <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700">
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                  {executiveSummary}
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
