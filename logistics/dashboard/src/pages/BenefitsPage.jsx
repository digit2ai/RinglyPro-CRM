import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, computeBenefits, getBenefits, getActivePricingSnapshot, recordApproval, getApprovalStatus } from '../lib/api'
import BenefitCard from '../components/BenefitCard'

export default function BenefitsPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [benefits, setBenefits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState(null)
  const [pricingSnapshot, setPricingSnapshot] = useState(null)
  const [approvalStatus, setApprovalStatus] = useState(null)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    loadData()
  }, [projectId])

  async function loadData() {
    try {
      setLoading(true)
      const proj = await getProject(projectId)
      setProject(proj)

      // Try to get existing benefits
      try {
        const data = await getBenefits(projectId)
        setBenefits(data)
      } catch {
        // Not computed yet — auto-compute
        setComputing(true)
        const data = await computeBenefits(projectId)
        setBenefits(data)
        setComputing(false)
      }
      // Load pricing snapshot and approval status in parallel
      await Promise.allSettled([
        getActivePricingSnapshot().then(s => setPricingSnapshot(s)).catch(() => {}),
        getApprovalStatus(projectId).then(s => setApprovalStatus(s)).catch(() => {})
      ])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      await recordApproval(projectId, 'pricing', 'Finance')
      const status = await getApprovalStatus(projectId)
      setApprovalStatus(status)
    } catch (err) {
      setError(err.message)
    } finally {
      setApproving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>{computing ? 'Computing ROI projections...' : 'Loading...'}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 mb-2">{error}</p>
          <button onClick={loadData} className="btn-primary text-sm">Retry</button>
        </div>
      </div>
    )
  }

  const projections = benefits?.projections || []
  const summary = benefits?.summary || {}
  const warehouseBenefits = projections.filter(p => p.category === 'warehouse_automation')
  const platformBenefits = projections.filter(p => p.category === 'platform_ai')

  const formatCurrency = (v) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `${Math.round(v / 1000)}K`
    return v.toLocaleString()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Commercial — ROI Projection</h1>
          <p className="text-slate-400 mt-1">
            {project?.company_name} — Data-driven benefit projections
          </p>
          {pricingSnapshot && (
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Pricing Snapshot {pricingSnapshot.version} active
              </span>
              <span className="text-xs text-slate-500">{pricingSnapshot.label}</span>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/simulation/${projectId}`)}
            className="btn-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Simulation
          </button>
          <button
            onClick={() => navigate(`/report/${projectId}`)}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Generate Report
          </button>
        </div>
      </div>

      {/* ROI Summary Banner */}
      <div className="card border-logistics-500/30 bg-gradient-to-br from-logistics-900/20 to-slate-800 mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Automation Readiness Score */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full ring-4 ring-logistics-500/40 bg-logistics-500/10 mb-2">
              <span className="text-2xl font-bold text-logistics-400">{summary.automation_readiness_score || 0}</span>
            </div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Readiness Score</p>
          </div>

          {/* Annual Savings */}
          <div className="text-center flex flex-col justify-center">
            <p className="text-2xl font-bold text-white">
              {formatCurrency(summary.annual_savings_low || 0)} – {formatCurrency(summary.annual_savings_high || 0)}
            </p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">
              {summary.annual_savings_currency || 'EUR'} Est. Annual Savings
            </p>
          </div>

          {/* Payback Period */}
          <div className="text-center flex flex-col justify-center">
            <p className="text-2xl font-bold text-white">
              {summary.payback_months_low || 12}–{summary.payback_months_high || 24}
            </p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">Months Payback</p>
          </div>

          {/* High Confidence */}
          <div className="text-center flex flex-col justify-center">
            <p className="text-2xl font-bold text-emerald-400">
              {summary.high_confidence_count || 0}/{summary.total_projections || 0}
            </p>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">High-Confidence Benefits</p>
          </div>
        </div>
      </div>

      {/* Warehouse Automation Benefits */}
      {warehouseBenefits.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <h2 className="text-lg font-semibold text-white">Warehouse Automation Benefits</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">Derived from your warehouse data analysis — mathematically defensible projections.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {warehouseBenefits.map(b => (
              <BenefitCard key={b.id} benefit={b} />
            ))}
          </div>
        </div>
      )}

      {/* Platform & AI Benefits */}
      {platformBenefits.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <h2 className="text-lg font-semibold text-white">RinglyPro Logistics Platform & AI Benefits</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">Based on RinglyPro Logistics ecosystem capabilities, anchored to your data profile.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {platformBenefits.map(b => (
              <BenefitCard key={b.id} benefit={b} />
            ))}
          </div>
        </div>
      )}

      {/* Human Review Gate — Pricing / Commercial */}
      <div className="card bg-slate-900/40 border border-logistics-500/20">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <svg className="w-5 h-5 text-logistics-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-slate-200 mb-1">Commercial Package — Human Review Gate</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Review ROI projections anchored to the active pricing snapshot. Approve to release the Commercial Package to the Proposal step.
              </p>
              {approvalStatus?.gates?.pricing?.approved && (
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  Approved by {approvalStatus.gates.pricing.approved_by} · {new Date(approvalStatus.gates.pricing.approved_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          {!approvalStatus?.gates?.pricing?.approved ? (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="btn-primary text-sm flex items-center gap-2 flex-shrink-0"
            >
              {approving ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Approving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Approve &amp; Proceed to Proposal
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => navigate(`/report/${projectId}`)}
              className="btn-primary text-sm flex items-center gap-2 flex-shrink-0"
            >
              Open Proposal
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
