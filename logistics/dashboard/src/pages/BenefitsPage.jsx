import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, computeBenefits, getBenefits, getActivePricingSnapshot, recordApproval, getApprovalStatus, getSimulation, getRecommendations } from '../lib/api'
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
  const [simulation, setSimulation] = useState(null)
  const [recommendations, setRecommendations] = useState([])

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
      // Load supplementary data in parallel
      await Promise.allSettled([
        getActivePricingSnapshot().then(s => setPricingSnapshot(s)).catch(() => {}),
        getApprovalStatus(projectId).then(s => setApprovalStatus(s)).catch(() => {}),
        getSimulation(projectId).then(s => setSimulation(s)).catch(() => {}),
        getRecommendations(projectId).then(r => setRecommendations(r?.recommendations || r || [])).catch(() => {})
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

  // Derive commercial package from simulation + recommendations + pricing snapshot
  const baselineMetrics = simulation?.scenarios?.find(s => s.id === 'baseline')?.metrics || {}
  const peakMetrics = simulation?.scenarios?.find(s => s.id === 'peak')?.metrics || {}
  const topRecs = Array.isArray(recommendations) ? recommendations.slice(0, 3) : []
  const snapshotPrices = pricingSnapshot?.product_prices || {}

  const installScopeItems = topRecs.map(r => {
    const productKey = (r.product_name || r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
    const unitPrice = snapshotPrices[productKey] || snapshotPrices[Object.keys(snapshotPrices)[0]] || null
    // r.reasoning is a JSONB object — use description text instead
    const reasonText = r.description || r.primary_reason ||
      (typeof r.reasoning === 'string' ? r.reasoning : '') || ''
    return {
      product: r.product_name || r.name,
      reason: reasonText,
      fit_score: r.fit_score || r.score,
      unit_price: unitPrice,
      qty: 1
    }
  })

  const budgetRange = project?.business_info?.budget_range || null
  const capexTiers = budgetRange ? [
    { label: 'Phased Approach', pct: 0.6, description: 'Phase 1: storage & inbound automation. Phase 2: outbound & software.' },
    { label: 'Full Scope', pct: 1.0, description: 'Complete automation stack delivered in a single project.' }
  ] : null

  const pricingRisks = []
  if (!pricingSnapshot) pricingRisks.push({ risk: 'No approved pricing snapshot — pricing subject to change', severity: 'High' })
  if (peakMetrics.orderlines_per_day > 3000) pricingRisks.push({ risk: 'Peak throughput >3,000 OL/day may require higher-spec equipment', severity: 'Medium' })
  if ((summary.payback_months_low || 0) > 24) pricingRisks.push({ risk: 'Payback period exceeds 24 months — budget sensitivity review recommended', severity: 'Low' })

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
            <h2 className="text-lg font-semibold text-white">Pinaxis Platform & AI Benefits</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">Based on Pinaxis ecosystem capabilities, anchored to your data profile.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {platformBenefits.map(b => (
              <BenefitCard key={b.id} benefit={b} />
            ))}
          </div>
        </div>
      )}

      {/* Commercial Package — Install Scope Line Items */}
      {installScopeItems.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-logistics-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            Commercial Package — Install Scope
          </h2>
          <p className="text-sm text-slate-400 mb-4">Proposed automation concepts with indicative pricing from the active snapshot.</p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Product / System</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">Fit Score</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Primary Justification</th>
                  {installScopeItems.some(i => i.unit_price) && (
                    <th className="text-right py-2 px-3 text-slate-400 font-medium">Indicative Price</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {installScopeItems.map((item, i) => (
                  <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="py-3 px-3 font-medium text-slate-200">{item.product}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`text-sm font-bold ${item.fit_score >= 80 ? 'text-emerald-400' : item.fit_score >= 60 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {item.fit_score}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-400 max-w-xs">{item.reason}</td>
                    {installScopeItems.some(i => i.unit_price) && (
                      <td className="py-3 px-3 text-right text-slate-300">
                        {item.unit_price ? `€${(item.unit_price / 1000).toFixed(0)}K` : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CAPEX Options */}
      {capexTiers && installScopeItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">CAPEX Options — based on {budgetRange} budget</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {capexTiers.map((tier, i) => (
              <div key={i} className="card border border-slate-700/60 flex items-start gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  i === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-logistics-500/20 text-logistics-400'
                }`}>
                  {i === 0 ? 'P1' : 'F'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-0.5">{tier.label}</p>
                  <p className="text-xs text-slate-400">{tier.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing Risks */}
      {pricingRisks.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Pricing Risk Flags</h3>
          <div className="space-y-2">
            {pricingRisks.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                r.severity === 'High' ? 'bg-red-500/10 border-red-500/30' :
                r.severity === 'Medium' ? 'bg-amber-500/10 border-amber-500/30' :
                'bg-slate-700/30 border-slate-600/40'
              }`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  r.severity === 'High' ? 'bg-red-500' : r.severity === 'Medium' ? 'bg-amber-500' : 'bg-slate-500'
                }`} />
                <div>
                  <p className={`text-xs font-medium ${
                    r.severity === 'High' ? 'text-red-300' : r.severity === 'Medium' ? 'text-amber-300' : 'text-slate-400'
                  }`}>{r.risk}</p>
                  <p className={`text-xs mt-0.5 ${
                    r.severity === 'High' ? 'text-red-500' : r.severity === 'Medium' ? 'text-amber-500' : 'text-slate-500'
                  }`}>{r.severity} risk</p>
                </div>
              </div>
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
