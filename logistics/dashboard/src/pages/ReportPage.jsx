import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProject, getAnalysisAll, getRecommendations, generateReport, downloadReport } from '../lib/api'

export default function ReportPage() {
  const { projectId } = useParams()

  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [proj, anal, recs] = await Promise.all([
        getProject(projectId),
        getAnalysisAll(projectId).catch(() => null),
        getRecommendations(projectId).catch(() => [])
      ])
      setProject(proj)
      setAnalysis(anal)
      const recsArray = recs?.recommendations || recs || []
      setRecommendations(Array.isArray(recsArray) ? recsArray : [])
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
      title: 'Product Recommendations',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      ),
      description: topProduct
        ? `Top pick: ${topProduct.name || topProduct.product_name} (${topProduct.fit_score || topProduct.score}% match).`
        : 'RinglyPro Logistics product matching results with fit scores and reasoning.'
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
            to={`/products/${projectId}`}
            className="btn-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Products
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
              throughput patterns, ABC analysis, bin fit results, and RinglyPro Logistics product recommendations.
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
