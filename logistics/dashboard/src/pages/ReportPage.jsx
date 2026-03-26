import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProject, getAnalysisAll, getRecommendations, generateReport, downloadReport, getSimulation, recordApproval, getApprovalStatus } from '../lib/api'

export default function ReportPage() {
  const { projectId } = useParams()

  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [simulation, setSimulation] = useState(null)
  const [approvalStatus, setApprovalStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState(null)
  const [showEmail, setShowEmail] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  useEffect(() => {
    loadData()
  }, [projectId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [proj, anal, recs, sim, approvals] = await Promise.all([
        getProject(projectId),
        getAnalysisAll(projectId).catch(() => null),
        getRecommendations(projectId).catch(() => []),
        getSimulation(projectId).catch(() => null),
        getApprovalStatus(projectId).catch(() => null)
      ])
      setProject(proj)
      setAnalysis(anal)
      const recsArray = recs?.recommendations || recs || []
      setRecommendations(Array.isArray(recsArray) ? recsArray : [])
      setSimulation(sim)
      setApprovalStatus(approvals)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    setDownloadLoading(true)
    try {
      // Generate report first, then download
      await generateReport(projectId)
      const blob = await downloadReport(projectId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `LOGISTICS-Report-${project?.company_name || projectId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleApprove = async () => {
    setApproving(true)
    try {
      await recordApproval(projectId, 'final', 'Proposal Manager')
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg className="animate-spin w-12 h-12 text-logistics-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-400 text-lg">Preparing report preview...</p>
        </div>
      </div>
    )
  }

  const ov = analysis?.overview_kpis || {}
  const kpis = {
    total_skus: ov.skus?.total,
    active_skus: ov.skus?.active,
    bin_capable_pct: ov.skus?.bin_capable_pct,
    total_orders: ov.orders?.total_orders,
    total_orderlines: ov.orders?.total_orderlines,
    total_units: ov.orders?.total_units,
  }
  const topProduct = recommendations.length > 0 ? recommendations[0] : null

  // Derive risk register from simulation bottlenecks
  const peakBottlenecks = simulation?.scenarios?.find(s => s.id === 'peak')?.bottlenecks || []
  const riskRegister = peakBottlenecks
    .filter(b => b.zone !== 'None identified')
    .map(b => ({
      zone: b.zone,
      severity: b.risk,
      description: b.reason,
      mitigation: b.risk === 'High'
        ? 'Include in system design scope — automation spec must address this zone'
        : b.risk === 'Medium'
        ? 'Monitor during implementation; flag for detailed engineering review'
        : 'Log for awareness; no immediate action required'
    }))

  // Scope inclusions / exclusions
  const scopeInclusions = [
    'Warehouse data analysis and baseline documentation',
    'ABC/D classification and dead stock identification',
    'Throughput stress testing (3 scenarios)',
    'Pinaxis automation concept recommendations',
    'ROI projection and commercial package',
    'Risk register derived from simulation bottlenecks'
  ]
  const scopeExclusions = [
    'Detailed mechanical / civil engineering design',
    'Site survey and building structural assessment',
    'IT/ERP integration specification',
    'Installation, commissioning, and training',
    'Ongoing support and maintenance contracts'
  ]

  // Gate status summary
  const gates = approvalStatus?.gates || {}
  const gateList = [
    { key: 'concept', label: 'Concept' },
    { key: 'simulation', label: 'Simulation' },
    { key: 'pricing', label: 'Commercial / Pricing' },
    { key: 'final', label: 'Proposal Final' }
  ]

  const reportSections = [
    {
      title: 'Executive Summary',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      description: 'Overview of warehouse analysis including company info, data scope, and key findings.'
    },
    {
      title: 'Key Performance Indicators',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
        </svg>
      ),
      description: `${kpis.total_skus?.toLocaleString() || '---'} SKUs analyzed, ${kpis.total_orders?.toLocaleString() || '---'} orders, ${kpis.bin_capable_pct ? kpis.bin_capable_pct + '%' : '---'} bin-capable items.`
    },
    {
      title: 'Order Structure Analysis',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      ),
      description: 'Distribution of orderlines per order with histogram and cumulative analysis.'
    },
    {
      title: 'Throughput Analysis',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      ),
      description: 'Monthly, weekday, and hourly throughput patterns for capacity planning.'
    },
    {
      title: 'ABC / Pareto Analysis',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
        </svg>
      ),
      description: 'Lorenz curve with Gini coefficient and A/B/C item classification.'
    },
    {
      title: 'Bin Fit Analysis',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
      ),
      description: 'SKU dimensional analysis showing fit percentages across standard bin sizes.'
    },
    {
      title: 'Concept Recommendations',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      ),
      description: topProduct
        ? `Top concept: ${topProduct.name || topProduct.product_name} (${topProduct.fit_score || topProduct.score}% match).`
        : 'Pinaxis product matching results with fit scores and reasoning.'
    },
    {
      title: 'Simulation Package',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
        </svg>
      ),
      description: 'Throughput stress tests (baseline, +30% growth, peak day), bottleneck analysis, and sensitivity ranges.'
    },
    {
      title: 'NDA',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      ),
      description: 'Non-Disclosure Agreement — electronically signed by all parties, securely stored in the database.'
    }
  ]

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Analysis Report</h1>
          <p className="text-slate-400">
            {project?.company_name || 'Project'} &mdash; LOGISTICS Warehouse Analytics Report
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={`/benefits/${projectId}`}
            className="btn-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Commercial
          </Link>
        </div>
      </div>

      {/* Report Preview Card */}
      <div className="card mb-8">
        <div className="flex items-start gap-6">
          {/* Report Icon */}
          <div className="w-24 h-32 bg-gradient-to-b from-logistics-600 to-logistics-900 rounded-lg flex flex-col items-center justify-center flex-shrink-0 shadow-lg">
            <svg className="w-10 h-10 text-white mb-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-xs text-blue-200 font-medium">PDF</span>
          </div>

          {/* Report Info */}
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white mb-1">
              LOGISTICS Warehouse Analytics Report
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Comprehensive analysis for {project?.company_name || 'your warehouse'} including KPIs,
              throughput patterns, ABC analysis, bin fit results, and Pinaxis product recommendations.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Company</p>
                <p className="text-sm text-slate-200 font-medium">{project?.company_name || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Industry</p>
                <p className="text-sm text-slate-200 font-medium">{project?.industry || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Country</p>
                <p className="text-sm text-slate-200 font-medium">{project?.country || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Products</p>
                <p className="text-sm text-slate-200 font-medium">{recommendations.length} matched</p>
              </div>
            </div>

            <button
              onClick={handleDownload}
              disabled={downloadLoading}
              className="btn-primary flex items-center gap-2"
            >
              {downloadLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating PDF...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download PDF Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Report Contents */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Report Contents</h2>
        <div className="space-y-3">
          {reportSections.map((section, index) => (
            <div
              key={index}
              className="card py-4 px-5 flex items-start gap-4 hover:bg-slate-750 transition-colors"
            >
              <div className="w-8 h-8 bg-logistics-600/20 rounded-lg flex items-center justify-center text-logistics-400 flex-shrink-0 mt-0.5">
                {section.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-mono">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h4 className="text-sm font-semibold text-white">{section.title}</h4>
                </div>
                <p className="text-xs text-slate-400 mt-1 ml-8">{section.description}</p>
              </div>
              <div className="flex-shrink-0">
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approval Gate Status */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Review Gate Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {gateList.map(g => {
            const gate = gates[g.key]
            return (
              <div key={g.key} className={`card py-3 px-4 text-center border ${
                gate?.approved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/60'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 ${
                  gate?.approved ? 'bg-emerald-500/20' : 'bg-slate-700/50'
                }`}>
                  {gate?.approved
                    ? <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    : <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  }
                </div>
                <p className="text-xs font-medium text-slate-300">{g.label}</p>
                <p className={`text-xs mt-0.5 ${gate?.approved ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {gate?.approved ? `${gate.approved_by}` : 'Pending'}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Scope inclusions / exclusions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Proposal Scope</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              Included in Scope
            </h3>
            <ul className="space-y-2">
              {scopeInclusions.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              Excluded from Scope
            </h3>
            <ul className="space-y-2">
              {scopeExclusions.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                  <span className="w-1 h-1 rounded-full bg-slate-600 mt-1.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Risk Register */}
      {riskRegister.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Risk Register</h2>
          <p className="text-sm text-slate-400 mb-4">Auto-generated from peak scenario bottleneck analysis.</p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Zone</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Severity</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Risk</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {riskRegister.map((r, i) => (
                  <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="py-2.5 px-3 text-slate-200 font-medium text-xs">{r.zone}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.severity === 'High' ? 'bg-red-500/20 text-red-400' :
                        r.severity === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-600/30 text-slate-400'
                      }`}>{r.severity}</span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-400 max-w-xs">{r.description}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-400 max-w-xs">{r.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Final Approval Gate */}
      <div className="card bg-slate-900/40 border border-logistics-500/20 mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <svg className="w-5 h-5 text-logistics-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-slate-200 mb-1">Proposal Package — Final Approval Gate</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Review scope, risk register, and all prior gate approvals. Final approval releases the Proposal Package for customer delivery.
              </p>
              {approvalStatus?.gates?.final?.approved && (
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  Final approval by {approvalStatus.gates.final.approved_by} · {new Date(approvalStatus.gates.final.approved_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          {!approvalStatus?.gates?.final?.approved ? (
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
                  Approve &amp; Release Proposal
                </>
              )}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Proposal Released
            </span>
          )}
        </div>
      </div>

      {/* Email Proposal — visible after final approval */}
      {approvalStatus?.gates?.final?.approved && (
        <div className="mb-8">
          <div className="card bg-slate-900/40 border border-logistics-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-logistics-600/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-logistics-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Email Proposal to Client</p>
                  <p className="text-xs text-slate-400">Send the released proposal with PDF report attached</p>
                </div>
              </div>
              <button
                onClick={() => setShowEmail(v => !v)}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                {showEmail ? 'Hide Template' : 'Compose Email'}
              </button>
            </div>

            {showEmail && (() => {
              const to = project?.contact_email || ''
              const contactName = project?.contact_name || 'there'
              const company = project?.company_name || 'your organisation'
              const subject = `Warehouse Automation Proposal — ${company}`
              const downloadUrl = `${window.location.origin}/pinaxis/api/v1/reports/${projectId}/download`
              const body = `Dear ${contactName},

Thank you for engaging with us on the warehouse automation opportunity for ${company}.

We are pleased to share your tailored Warehouse Analytics & Automation Proposal, which includes:

  • Warehouse KPIs and baseline performance analysis
  • ABC / Pareto classification and dead stock insights
  • Throughput stress testing (baseline, +30% growth, peak day)
  • Automation concept recommendations with fit scores
  • Commercial package: scope, CAPEX options, and ROI projections
  • Risk register derived from simulation bottleneck analysis

Please find the full PDF report attached to this email. You may also download it directly via the link below:

${downloadUrl}

We look forward to discussing the findings and next steps with you at your convenience.

Kind regards,
Pinaxis Team`

              const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

              const handleCopy = () => {
                const full = `To: ${to}\nSubject: ${subject}\n\n${body}`
                navigator.clipboard.writeText(full).then(() => {
                  setEmailCopied(true)
                  setTimeout(() => setEmailCopied(false), 2500)
                })
              }

              return (
                <div className="border-t border-slate-700/50 pt-4 space-y-3">
                  {/* To */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider">To</label>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200">
                      {to || <span className="text-slate-500 italic">No contact email on project</span>}
                    </div>
                  </div>
                  {/* Subject */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider">Subject</label>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200">
                      {subject}
                    </div>
                  </div>
                  {/* Body */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider">Body</label>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-3 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono max-h-64 overflow-y-auto">
                      {body}
                    </div>
                  </div>
                  {/* Attachment note */}
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    <p className="text-xs text-amber-300">
                      <span className="font-semibold">Attachment reminder:</span> Download the PDF report first, then manually attach it to the email before sending.
                    </p>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-1 flex-wrap">
                    <button
                      onClick={handleDownload}
                      disabled={downloadLoading}
                      className="btn-secondary text-sm flex items-center gap-2"
                    >
                      {downloadLoading ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      )}
                      Download PDF
                    </button>
                    <button
                      onClick={handleCopy}
                      className="btn-secondary text-sm flex items-center gap-2"
                    >
                      {emailCopied ? (
                        <>
                          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.375" />
                          </svg>
                          Copy Template
                        </>
                      )}
                    </button>
                    <a
                      href={mailto}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                      Open in Email Client
                    </a>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm mb-6">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        </div>
      )}
    </div>
  )
}
