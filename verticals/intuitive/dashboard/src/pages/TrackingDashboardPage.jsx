import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, LabelList, Cell,
} from 'recharts'
import PageNotes from '../components/PageNotes'

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
  const navigate = useNavigate()

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
  const [robotSyncLoading, setRobotSyncLoading] = useState(false)
  const [robotSyncResult, setRobotSyncResult] = useState(null)
  const [robotForm, setRobotForm] = useState({
    period_start: '',
    period_end: '',
    period_label: '',
    robot_serial: ''
  })
  const [ptEnrichment, setPtEnrichment] = useState(null)
  const [ptEnrichmentLoading, setPtEnrichmentLoading] = useState(false)

  // Import form state
  const [importForm, setImportForm] = useState({
    period_start: '',
    period_end: '',
    period_label: '',
    notes: '',
    surgeon_actuals: [{ surgeon_name: '', actual_cases: '' }]
  })

  // The URL param could be either a plan_id OR a project_id (the project-workflow
  // nav passes the active project's id). Resolve to the actual plan_id.
  const [resolvedPlanId, setResolvedPlanId] = useState(null)

  // ─── Data Loading ─────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!planId) return
    try {
      // 1. Try as plan_id directly
      let plan = null
      try {
        const r = await api.getBusinessPlan(planId)
        plan = r?.plan || r?.data || r
        if (!plan?.id) plan = null
      } catch (e) { /* fall through to project-id resolution */ }

      // 2. If not found as a plan, treat the param as a project_id and pull the active plan
      if (!plan) {
        try {
          const r = await api.listBusinessPlans(planId)
          const list = r?.business_plans || r?.data || []
          plan = list.find(p => p.status !== 'archived') || list[0] || null
        } catch (e) { /* will fall through to error display */ }
      }

      if (!plan?.id) {
        throw new Error('Business plan not found. Try /tracking/<plan_id> or run "Generate Business Plan from Analysis" first.')
      }

      setPlan(plan)
      setResolvedPlanId(plan.id)
      // Now fetch comparison data for the resolved plan id
      try {
        const compRes = await api.getComparison(plan.id)
        setComparison(compRes?.comparison || compRes?.data || compRes || null)
      } catch (e) {
        // Plans with no actuals yet legitimately have no comparison — don't fail the whole page
        setComparison(null)
      }
      // Load deck-aligned performance tracking enrichment using project_id
      try {
        const projId = plan.project_id
        if (projId) {
          setPtEnrichmentLoading(true)
          const r = await api.getPerformanceTrackingEnrichment(projId)
          setPtEnrichment(r.data)
        }
      } catch (e) { console.error('PT enrichment:', e) }
      finally { setPtEnrichmentLoading(false) }
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
      await api.takeSnapshot(resolvedPlanId || planId)
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
      const res = await api.getExecutiveSummary(resolvedPlanId || planId)
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
      await api.importActuals(resolvedPlanId || planId, payload)
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

  // ─── Robot Data Sync ───────────────────────────────────────

  const handleRobotSync = async (e) => {
    e.preventDefault()
    setRobotSyncLoading(true)
    setRobotSyncResult(null)
    try {
      const res = await api.syncRobotToPlan(resolvedPlanId || planId, {
        period_start: robotForm.period_start,
        period_end: robotForm.period_end,
        period_label: robotForm.period_label || undefined,
        robot_serial: robotForm.robot_serial || undefined
      })
      setRobotSyncResult(res.sync_summary || res)
      setRobotForm({ period_start: '', period_end: '', period_label: '', robot_serial: '' })
      await loadData()
    } catch (err) {
      console.error('Robot sync failed:', err)
      setError(err.message)
    } finally {
      setRobotSyncLoading(false)
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

  // BASELINE MODE: when no actuals/comparison exist yet, synthesize a baseline view
  // from the business plan + surgeon commitments. The rep still sees their forecast
  // numbers — they're not staring at zeros before go-live.
  const hasComparison = !!(comparison && (
    (comparison.summary && (comparison.summary.total_actual_cases > 0 || comparison.summary.cumulative_actual > 0))
    || (comparison.periods && comparison.periods.length > 0)
    || (comparison.surgeons && comparison.surgeons.length > 0)
  ))

  // Pull surgeon commitments from the plan-include payload (api.getBusinessPlan returns these)
  const planCommitments = plan?.surgeonCommitments || plan?.surgeon_commitments || []

  // Build baseline-only summary if no actuals
  const baselineSummary = plan ? {
    total_projected_cases: Number(plan.total_incremental_cases_annual) || 0,
    total_actual_cases: 0,
    total_projected_revenue: Number(plan.total_incremental_revenue) || 0,
    total_actual_revenue: 0,
    projected_annual_roi: Number(plan.total_combined_roi) || 0,
    roi_tracking_pct: '0',
    payback_months: plan.payback_months,
    five_year_net_benefit: Number(plan.five_year_net_benefit) || 0,
  } : {}

  const baselineSurgeons = planCommitments.map(c => ({
    surgeon_name: c.surgeon_name,
    name: c.surgeon_name,
    specialty: c.surgeon_specialty || c.specialty,
    projected_annual_cases: c.total_incremental_annual,
    projected_revenue: c.total_revenue_impact,
    actual_cases: 0,
    actual_revenue: 0,
    variance_pct: null,
  }))

  const surgeons = hasComparison ? (comparison?.surgeons || []) : baselineSurgeons
  const periods = hasComparison ? (comparison?.periods || []) : []
  const summary = hasComparison ? (comparison?.summary || {}) : baselineSummary

  // Build committed surgeon names for dropdown
  const committedSurgeons = surgeons.map(s => s.surgeon_name || s.name).filter(Boolean)

  // Build timeline chart data from periods
  const timelineData = periods.map(p => ({
    period: p.period_label || p.label || p.period,
    projected: p.projected_cumulative ?? p.projected ?? 0,
    actual: p.actual_cumulative ?? p.actual ?? 0
  }))

  // Summary card values (work for both baseline + actuals modes)
  const cumulativeActual = summary.total_actual_cases ?? summary.cumulative_actual ?? 0
  const cumulativeProjected = summary.total_projected_cases ?? summary.cumulative_projected ?? 0
  const overallVariance = cumulativeProjected > 0 && cumulativeActual > 0
    ? (((cumulativeActual - cumulativeProjected) / cumulativeProjected) * 100).toFixed(1)
    : (hasComparison ? 0 : '—')
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

  // Resolve project_id from plan to enable Prev navigation
  const projectIdForNav = plan?.project_id || planId

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

      {/* ── Step 9 of 9 Header + Prev nav ──────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">Step 9 of 9 · Hospital Workflow · Final Step</div>
          <h1 className="text-2xl font-bold text-white">Performance Tracking</h1>
          <p className="text-sm text-slate-500 mt-1">
            Post-go-live tracking: plan vs actual comparison + variance alerts + surgeon performance
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => navigate(`/business-plan/${projectIdForNav}`)} className="text-sm text-slate-400 hover:text-slate-200">← Business Plan</button>
          <button onClick={() => navigate(`/executive/${projectIdForNav}`)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
            Executive Brief
          </button>
          <button onClick={() => navigate('/')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded">
            ✓ Workflow Complete · Back to Dashboard
          </button>
        </div>
      </div>

      {/* ── Error Banner ──────────────────────────────────────── */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 flex items-center justify-between">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-sm font-bold ml-4">Dismiss</button>
        </div>
      )}

      {/* ── Baseline Mode Banner ─────────────────────────────── */}
      {!hasComparison && plan && (
        <div className="bg-sky-900/30 border border-sky-700/60 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <div className="text-sky-200 font-semibold text-sm">Baseline Mode — pre-installation view</div>
              <div className="text-sky-300/80 text-xs mt-1">
                Showing projected case volumes, revenue, and ROI from the locked business plan baseline.
                Variance / actuals will populate once the system is installed and monthly actuals stream in.
                Use <strong>Import Actuals</strong> below to enter your first reporting period, or sync from
                robot telemetry via the Robot Data Sync section.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ DECK-ALIGNED PERFORMANCE TRACKING ENRICHMENT (Step 9) ═══ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ═══ ADDITION #4: Alert / Variance Watch List (top of page = highest priority) ═══ */}
      {ptEnrichment?.watch_list && ptEnrichment.watch_list.alerts.length > 0 && (
        <div className="bg-gradient-to-r from-red-950/40 to-amber-950/30 border-2 border-red-700/50 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-white">⚠ Variance Watch List</h3>
              <p className="text-xs text-slate-400">{ptEnrichment.watch_list.headline}</p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="text-red-300 font-bold">{ptEnrichment.watch_list.critical_count} critical</span>
              <span className="text-amber-300 font-bold">{ptEnrichment.watch_list.warning_count} warnings</span>
            </div>
          </div>
          <div className="space-y-2">
            {ptEnrichment.watch_list.alerts.slice(0, 8).map((a, i) => (
              <div key={i} className={`flex gap-3 p-3 rounded border-l-4 ${a.severity === 'critical' ? 'bg-red-950/40 border-red-500' : 'bg-amber-950/30 border-amber-500'}`}>
                <span className={`text-lg ${a.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>{a.severity === 'critical' ? '⚠' : '⚡'}</span>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">
                    {a.target}
                    {a.variance_pct != null && <span className={`ml-2 text-xs font-bold ${a.variance_pct < 0 ? 'text-red-300' : 'text-amber-300'}`}>{a.variance_pct >= 0 ? '+' : ''}{a.variance_pct}%</span>}
                    {a.specialty && <span className="ml-2 text-xs text-slate-400">{a.specialty}</span>}
                  </div>
                  <div className="text-xs text-slate-300 mt-1">{a.recommendation}</div>
                </div>
              </div>
            ))}
            {ptEnrichment.watch_list.alerts.length > 8 && (
              <div className="text-xs text-slate-500 italic text-center">+ {ptEnrichment.watch_list.alerts.length - 8} more alerts</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ADDITION #1: Plan vs Actual Variance Table ═══ */}
      {ptEnrichment?.plan_vs_actual && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">Plan vs Actual Variance</h3>
            <div className="flex gap-3 text-xs">
              <span className="text-emerald-300 font-bold">↑ {ptEnrichment.plan_vs_actual.on_track_count} on-track</span>
              <span className="text-amber-300 font-bold">→ {ptEnrichment.plan_vs_actual.at_risk_count} at-risk</span>
              <span className="text-red-300 font-bold">↓ {ptEnrichment.plan_vs_actual.off_track_count} off-track</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">{ptEnrichment.plan_vs_actual.headline}</p>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Metric</th>
                <th className="text-right pb-2">Plan (to-date)</th>
                <th className="text-right pb-2">Actual (to-date)</th>
                <th className="text-right pb-2">Variance</th>
                <th className="text-right pb-2">% Var</th>
                <th className="text-center pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {ptEnrichment.plan_vs_actual.metrics.map((m, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-2 text-white">{m.metric}</td>
                  <td className="py-2 text-right text-slate-400">{m.unit === '$' ? '$' + (m.plan / 1000).toFixed(0) + 'K' : m.plan.toLocaleString()}</td>
                  <td className="py-2 text-right text-cyan-300 font-semibold">{m.unit === '$' ? '$' + (m.actual / 1000).toFixed(0) + 'K' : m.actual.toLocaleString()}</td>
                  <td className={`py-2 text-right font-bold ${m.variance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {m.variance >= 0 ? '+' : ''}{m.unit === '$' ? '$' + (m.variance / 1000).toFixed(0) + 'K' : m.variance.toLocaleString()}
                  </td>
                  <td className={`py-2 text-right font-bold ${m.variance_pct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {m.variance_pct >= 0 ? '+' : ''}{m.variance_pct}%
                  </td>
                  <td className="py-2 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      m.status === 'green' ? 'bg-emerald-900/50 text-emerald-300'
                      : m.status === 'yellow' ? 'bg-amber-900/50 text-amber-300'
                      : m.status === 'red_under' || m.status === 'red_over' ? 'bg-red-900/50 text-red-300'
                      : 'bg-slate-700 text-slate-400'
                    }`}>
                      {m.status === 'green' ? 'ON TRACK' : m.status === 'yellow' ? 'AT RISK' : m.status === 'red_under' ? 'OFF TRACK ↓' : m.status === 'red_over' ? 'OFF TRACK ↑' : 'BASELINE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ INFOGRAPHIC #1: Plan vs Actual Burn-Down Line + INFOGRAPHIC #3: YoY Growth Bars (2-col) ═══ */}
      {ptEnrichment?.utilization && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Plan vs Actual quarterly burn-down */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-1">Plan vs Actual — Quarterly Burn-Down</h3>
            <p className="text-xs text-slate-500 mb-4">Cumulative trajectory vs plan baseline</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ptEnrichment.utilization.quarters}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="quarter" stroke="#64748b" style={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }} labelStyle={{ color: '#e2e8f0' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="plan_cases" fill="#64748b" name="Plan Cases" />
                  <Bar dataKey="actual_cases" fill="#06b6d4" name="Actual Cases" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* INFOGRAPHIC #4: Per-System Utilization Tracker (Deck 1 p6) */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
            <h3 className="font-bold text-white mb-1">Per-System Utilization vs Academic Avg</h3>
            <p className="text-xs text-slate-500 mb-4">Academic average: {ptEnrichment.utilization.academic_avg_per_qtr} cases/qtr/system</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ptEnrichment.utilization.per_system}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="system_id" stroke="#64748b" style={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }} labelStyle={{ color: '#e2e8f0' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={ptEnrichment.utilization.academic_avg_per_qtr} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Academic avg ${ptEnrichment.utilization.academic_avg_per_qtr}`, fill: '#ef4444', fontSize: 9, position: 'top' }} />
                  <Bar dataKey="plan_per_qtr" fill="#64748b" name="Plan/Qtr" />
                  <Bar dataKey="actual_per_qtr" fill="#10b981" name="Actual/Qtr" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADDITION #3 + INFOGRAPHIC #2: Surgeon Performance Tracking + Variance Heat Map ═══ */}
      {ptEnrichment?.surgeon_performance?.surgeons?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">Surgeon Performance Tracking</h3>
            <div className="flex gap-3 text-xs">
              <span className="text-emerald-300 font-bold">↑ {ptEnrichment.surgeon_performance.on_track}</span>
              <span className="text-amber-300 font-bold">→ {ptEnrichment.surgeon_performance.at_risk}</span>
              <span className="text-red-300 font-bold">↓ {ptEnrichment.surgeon_performance.off_track}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">{ptEnrichment.surgeon_performance.headline}</p>

          {/* Variance heat map bar */}
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Variance by Surgeon (Plan-to-Date vs Actual)</div>
          <div className="h-64 -ml-2 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ptEnrichment.surgeon_performance.surgeons.slice(0, 12)}
                layout="vertical"
                margin={{ left: 130, right: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: 10 }} />
                <YAxis dataKey="surgeon_name" type="category" stroke="#64748b" style={{ fontSize: 10 }} width={125} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }} labelStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="plan_to_date" fill="#64748b" name="Plan-to-Date">
                  <LabelList dataKey="plan_to_date" position="right" style={{ fill: '#94a3b8', fontSize: 9 }} />
                </Bar>
                <Bar dataKey="actual_to_date" name="Actual-to-Date">
                  {ptEnrichment.surgeon_performance.surgeons.slice(0, 12).map((s, i) => {
                    const color = s.status === 'green' ? '#10b981' : s.status === 'yellow' ? '#f59e0b' : s.status === 'red_under' ? '#ef4444' : s.status === 'red_over' ? '#3b82f6' : '#06b6d4'
                    return <Cell key={i} fill={color} />
                  })}
                  <LabelList dataKey="actual_to_date" position="right" style={{ fill: '#06b6d4', fontSize: 9, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left pb-2">Surgeon</th>
                <th className="text-left pb-2">Specialty</th>
                <th className="text-right pb-2">Committed (Annual)</th>
                <th className="text-right pb-2">Plan-to-Date</th>
                <th className="text-right pb-2">Actual-to-Date</th>
                <th className="text-right pb-2">Variance</th>
                <th className="text-right pb-2">% Var</th>
                <th className="text-center pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {ptEnrichment.surgeon_performance.surgeons.map((s, i) => (
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-1.5 text-white font-semibold">{s.surgeon_name}</td>
                  <td className="py-1.5 text-slate-400">{s.specialty || '—'}</td>
                  <td className="py-1.5 text-right text-slate-300">{s.committed_annual}</td>
                  <td className="py-1.5 text-right text-slate-400">{s.plan_to_date}</td>
                  <td className="py-1.5 text-right text-cyan-300 font-semibold">{s.actual_to_date}</td>
                  <td className={`py-1.5 text-right font-bold ${s.variance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {s.variance >= 0 ? '+' : ''}{s.variance}
                  </td>
                  <td className={`py-1.5 text-right font-bold ${s.variance_pct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {s.variance_pct >= 0 ? '+' : ''}{s.variance_pct}%
                  </td>
                  <td className="py-1.5 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      s.status === 'green' ? 'bg-emerald-900/50 text-emerald-300'
                      : s.status === 'yellow' ? 'bg-amber-900/50 text-amber-300'
                      : s.status === 'red_under' ? 'bg-red-900/50 text-red-300'
                      : s.status === 'red_over' ? 'bg-blue-900/50 text-blue-300'
                      : 'bg-slate-700 text-slate-400'
                    }`}>
                      {s.status === 'green' ? '↑ OK' : s.status === 'yellow' ? '→ RISK' : s.status === 'red_under' ? '↓ UNDER' : s.status === 'red_over' ? '↑ OVER' : 'BASELINE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ptEnrichmentLoading && !ptEnrichment && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 text-center">
          <div className="text-sm text-slate-400">Loading deck-aligned performance tracking (Plan vs Actual · Utilization · Surgeon Performance · Watch List)...</div>
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

      {/* ── 5. Sync from da Vinci Robot ──────────────────────── */}
      <SectionCard title="Sync from da Vinci Robot" subtitle="Pull actual case data directly from Intuitive's robot telemetry" collapsible defaultOpen={true}>
        <form onSubmit={handleRobotSync} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Period Start</label>
              <input type="date" value={robotForm.period_start} onChange={e => setRobotForm(f => ({...f, period_start: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Period End</label>
              <input type="date" value={robotForm.period_end} onChange={e => setRobotForm(f => ({...f, period_end: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Period Label</label>
              <input type="text" placeholder="e.g. Q1 2026" value={robotForm.period_label} onChange={e => setRobotForm(f => ({...f, period_label: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Robot Serial (optional)</label>
              <input type="text" placeholder="Auto-match by hospital" value={robotForm.robot_serial} onChange={e => setRobotForm(f => ({...f, robot_serial: e.target.value}))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={robotSyncLoading || !robotForm.period_start || !robotForm.period_end}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center gap-2">
              {robotSyncLoading ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Syncing...</>
              ) : 'Sync Robot Data'}
            </button>
            <span className="text-xs text-slate-500">Matches robot cases to committed surgeons automatically</span>
          </div>
        </form>

        {robotSyncResult && (
          <div className={`mt-4 p-4 rounded-lg border ${robotSyncResult.robot_cases_found > 0 ? 'bg-emerald-900/20 border-emerald-800' : 'bg-slate-800 border-slate-700'}`}>
            <div className="text-sm font-semibold text-white mb-2">Sync Results</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-lg font-bold text-intuitive-400">{robotSyncResult.robot_cases_found}</div>
                <div className="text-[10px] text-slate-500 uppercase">Robot Cases Found</div>
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-400">{robotSyncResult.surgeons_matched}</div>
                <div className="text-[10px] text-slate-500 uppercase">Surgeons Matched</div>
              </div>
              <div>
                <div className="text-lg font-bold text-yellow-400">{robotSyncResult.unmatched_cases}</div>
                <div className="text-[10px] text-slate-500 uppercase">Unmatched Cases</div>
              </div>
              <div>
                <div className={`text-lg font-bold ${robotSyncResult.variance_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {robotSyncResult.variance_pct >= 0 ? '+' : ''}{robotSyncResult.variance_pct}%
                </div>
                <div className="text-[10px] text-slate-500 uppercase">vs Projected</div>
              </div>
            </div>
            {robotSyncResult.unmatched_details && robotSyncResult.unmatched_details.length > 0 && (
              <div className="mt-3 text-xs text-slate-400">
                <span className="font-semibold">Unmatched surgeons:</span>{' '}
                {[...new Set(robotSyncResult.unmatched_details.map(d => d.surgeon_name))].join(', ')}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── 6. Import Actuals Form (Manual) ──────────────────── */}
      <SectionCard title="Manual Import" subtitle="Manually enter case volumes if robot data is unavailable" collapsible defaultOpen={false}>
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

      <PageNotes title="Performance Tracking (Plan vs Actual)">
        <ul className="space-y-1.5 list-disc pl-4">
          <li><span className="text-white font-semibold">What this answers:</span> After the system is live, is the hospital actually hitting what the Business Plan promised?</li>
          <li><span className="text-white font-semibold">Where the numbers come from:</span> "Plan" is the <span className="text-white font-semibold">Business Plan proforma</span> (the same committed cases, revenue, and savings). "Actual" is <span className="text-white font-semibold">real tracked results</span> — monthly post-go-live data ingested for this program. Until actuals are loaded the page shows baseline mode (plan trajectory only).</li>
          <li><span className="text-white font-semibold">Key formula:</span> the plan target is pro-rated to the months elapsed (for example 6 of 12 months = half the annual plan), then variance = actual minus that pro-rated plan, as a percent.</li>
          <li><span className="text-white font-semibold">The color codes</span> flag where to intervene: <span className="text-emerald-300">green</span> within ±5% of plan, <span className="text-amber-300">yellow</span> within ±15%, <span className="text-red-300">red</span> beyond 15% off plan. Per-system utilization is compared to an <span className="text-cyan-300">academic benchmark of 77 cases/quarter</span>.</li>
          <li><span className="text-white font-semibold">Kept separate:</span> <span className="text-amber-300">incremental (net-new) revenue</span> and <span className="text-emerald-300">clinical cost avoidance</span> are tracked as distinct lines — money earned and money saved are never combined.</li>
          <li><span className="text-white font-semibold">Bottom line:</span> this is the accountability scorecard and early-warning list — it shows whether the promised return is materializing and which surgeons or metrics need attention.</li>
        </ul>
      </PageNotes>
    </div>
  )
}
