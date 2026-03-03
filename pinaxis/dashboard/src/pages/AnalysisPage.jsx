import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProject, getAnalysisAll, runAnalysis, matchProducts, downloadReport } from '../lib/api'
import KpiCards from '../components/KpiCards'
import OrderStructureChart from '../components/OrderStructureChart'
import ThroughputChart from '../components/ThroughputChart'
import WeekdayChart from '../components/WeekdayChart'
import HourlyChart from '../components/HourlyChart'
import ABCLorenzCurve from '../components/ABCLorenzCurve'
import FitAnalysisTable from '../components/FitAnalysisTable'

export default function AnalysisPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [matchLoading, setMatchLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [projectId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [proj, anal] = await Promise.all([
        getProject(projectId),
        getAnalysisAll(projectId)
      ])
      setProject(proj)
      setAnalysis(anal)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMatchProducts = async () => {
    setMatchLoading(true)
    try {
      await matchProducts(projectId)
      navigate(`/products/${projectId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setMatchLoading(false)
    }
  }

  const handleDownloadReport = async () => {
    setReportLoading(true)
    try {
      const blob = await downloadReport(projectId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PINAXIS-Report-${projectId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setReportLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg className="animate-spin w-12 h-12 text-pinaxis-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-slate-400 text-lg">Loading analysis results...</p>
          <p className="text-slate-500 text-sm mt-1">This may take a moment for large datasets</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="card text-center">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">Analysis Error</h3>
          <p className="text-slate-400 mb-6">{error}</p>
          <button onClick={loadData} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const kpis = analysis?.kpis || {}
  const orderStructure = analysis?.order_structure || []
  const throughput = analysis?.throughput || []
  const weekday = analysis?.weekday || []
  const hourly = analysis?.hourly || []
  const abc = analysis?.abc_analysis || {}
  const fitAnalysis = analysis?.fit_analysis || []

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">
            Warehouse Analysis
          </h1>
          <p className="text-slate-400">
            {project?.company_name || 'Project'} &mdash; {project?.industry || 'Warehouse'} Analysis Results
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadReport}
            disabled={reportLoading}
            className="btn-secondary flex items-center gap-2"
          >
            {reportLoading ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            Download Report
          </button>
          <button
            onClick={handleMatchProducts}
            disabled={matchLoading}
            className="btn-primary flex items-center gap-2"
          >
            {matchLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Matching...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
                Match Products
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCards data={kpis} />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
        {/* Order Structure */}
        <div className="card">
          <h3 className="card-header flex items-center gap-2">
            <svg className="w-5 h-5 text-pinaxis-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
            </svg>
            Order Structure (Lines per Order)
          </h3>
          <OrderStructureChart data={orderStructure} />
        </div>

        {/* ABC / Lorenz */}
        <div className="card">
          <h3 className="card-header flex items-center gap-2">
            <svg className="w-5 h-5 text-pinaxis-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
            ABC Analysis (Lorenz Curve)
          </h3>
          <ABCLorenzCurve data={abc} />
        </div>

        {/* Throughput */}
        <div className="card">
          <h3 className="card-header flex items-center gap-2">
            <svg className="w-5 h-5 text-pinaxis-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            Monthly Throughput
          </h3>
          <ThroughputChart data={throughput} />
        </div>

        {/* Weekday */}
        <div className="card">
          <h3 className="card-header flex items-center gap-2">
            <svg className="w-5 h-5 text-pinaxis-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            Weekday Distribution
          </h3>
          <WeekdayChart data={weekday} />
        </div>

        {/* Hourly */}
        <div className="card">
          <h3 className="card-header flex items-center gap-2">
            <svg className="w-5 h-5 text-pinaxis-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Hourly Distribution
          </h3>
          <HourlyChart data={hourly} />
        </div>

        {/* Fit Analysis */}
        <div className="card">
          <h3 className="card-header flex items-center gap-2">
            <svg className="w-5 h-5 text-pinaxis-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            Bin Fit Analysis
          </h3>
          <FitAnalysisTable data={fitAnalysis} />
        </div>
      </div>
    </div>
  )
}
