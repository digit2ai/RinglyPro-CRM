import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getProject, getAnalysisAll, getRecommendations, getBenefits } from '../lib/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts'

const COLORS = {
  emerald: '#10b981', blue: '#3b82f6', yellow: '#eab308', red: '#ef4444',
  orange: '#f97316', purple: '#8b5cf6', slate: '#94a3b8', gold: '#eab308'
}

const tooltipStyle = {
  contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' },
  labelStyle: { color: '#94a3b8' }
}

export default function PresentationPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [benefits, setBenefits] = useState(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [loading, setLoading] = useState(true)
  const [videoStatus, setVideoStatus] = useState(null) // null | { status, step, detail, downloadUrl, ... }
  const [videoPolling, setVideoPolling] = useState(false)

  const startProposalGeneration = async () => {
    if (!projectId) return
    setVideoStatus({ status: 'generating', step: 'init', detail: 'Generating Rachel narration...' })
    try {
      await fetch(`/pinaxis/api/v1/proposal/${projectId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      setVideoPolling(true)
    } catch (err) {
      setVideoStatus({ status: 'error', step: 'error', detail: err.message })
    }
  }

  // Poll proposal generation status
  useEffect(() => {
    if (!videoPolling || !projectId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/pinaxis/api/v1/proposal/${projectId}/status`)
        const data = await res.json()
        if (data.success) {
          setVideoStatus(data.data)
          if (data.data.status === 'completed' || data.data.status === 'error') {
            setVideoPolling(false)
          }
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [videoPolling, projectId])

  useEffect(() => {
    if (!projectId) { setLoading(false); return }
    Promise.all([
      getProject(projectId).catch(() => null),
      getAnalysisAll(projectId).catch(() => null),
      getRecommendations(projectId).catch(() => []),
      getBenefits(projectId).catch(() => null)
    ]).then(([proj, anal, recs, ben]) => {
      setProject(proj)
      setAnalysis(anal)
      setRecommendations(Array.isArray(recs) ? recs : recs?.recommendations || [])
      setBenefits(ben)
      setLoading(false)
    })
  }, [projectId])

  // Extract all data sections from analysis
  const ov = analysis?.overview_kpis || {}
  const skus = ov.skus || {}
  const orders = ov.orders || {}
  const dateRange = ov.date_range || {}
  const inv = ov.inventory || {}

  const byOrderType = ov.by_order_type || []
  const byPickingUnit = ov.by_picking_unit || []
  const byTemperature = ov.by_temperature || []

  const fitAnalysis = analysis?.fit_analysis || {}
  const fitBins = fitAnalysis.bins || []

  const abc = analysis?.abc_classification || {}
  const abcClasses = abc.classes || {}

  const xyz = analysis?.xyz_classification || {}
  const xyzClasses = xyz.classes || []

  const orderStructure = analysis?.order_structure || {}

  const dailyPerc = analysis?.daily_percentiles || {}
  const dailyVals = dailyPerc.daily_values || {}
  const hourlyVals = dailyPerc.hourly_values || {}

  const extrap = analysis?.extrapolation || {}
  const projections = extrap.projections || []
  const year5 = projections.find(p => p.year === 5) || {}

  const companyName = project?.company_name || 'Your Warehouse'

  // Helper to format numbers with commas
  const fmt = (n) => {
    if (n == null || isNaN(n)) return '—'
    return Number(n).toLocaleString()
  }

  // Compute fit percentages from bins data
  const totalItems = fitAnalysis.total_items || 0
  const itemsWithDims = fitAnalysis.items_with_dimensions || 0
  const itemsWithoutDims = fitAnalysis.items_without_dimensions || 0
  const missingPct = totalItems > 0 ? ((itemsWithoutDims / totalItems) * 100).toFixed(1) : '—'
  const largestBin = fitBins[fitBins.length - 1] || {}
  const fitPctTotal = largestBin.fit_pct_total || '—'
  const fitCount = largestBin.fit_count || 0

  // Daily percentiles
  const avgDay = dailyVals.average || {}
  const p75Day = dailyVals.p75 || {}
  const maxDay = dailyVals.max || {}
  const avgHr = hourlyVals.average || {}
  const p75Hr = hourlyVals.p75 || {}
  const maxHr = hourlyVals.max || {}

  // No data state
  const hasData = !!analysis

  // --- Chart data builders ---
  const PIE_COLORS = ['#10b981', '#3b82f6', '#eab308', '#ef4444', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899']

  const orderTypePieData = byOrderType.map(d => ({ name: d.name, value: d.pick_units || d.order_lines }))
  const pickingUnitPieData = byPickingUnit.map(d => ({ name: d.name, value: d.pick_units || d.order_lines }))
  const temperaturePieData = byTemperature.map(d => ({ name: d.name, value: d.pick_units || d.order_lines }))

  // Daily throughput from order_time_series (matches Pinaxis daily bars)
  const dailyData = (analysis?.order_time_series?.series || []).map(d => ({
    name: d.date,
    orderlines: d.orderlines || 0,
    orders: d.orders || 0
  }))

  const monthlyData = (analysis?.throughput_monthly?.months || []).map(m => ({
    name: m.month || m.label,
    orders: m.orders || 0,
    orderlines: m.orderlines || 0
  }))

  const fitDonutData = (() => {
    if (!totalItems) return []
    const fitItems = fitCount || 0
    const missingItems = itemsWithoutDims || 0
    // bulky = items with dims that don't fit largest bin
    const bulkyItems = Math.max(0, itemsWithDims - fitItems)
    // noFit remainder
    const noFitItems = Math.max(0, totalItems - fitItems - missingItems - bulkyItems)
    return [
      { name: 'Fit', value: fitItems, color: COLORS.emerald },
      { name: 'Missing Dims', value: missingItems, color: COLORS.yellow },
      { name: 'Bulky', value: bulkyItems, color: COLORS.red },
      { name: 'No Fit', value: noFitItems, color: COLORS.orange }
    ].filter(d => d.value > 0)
  })()

  const abcChartData = ['A', 'B', 'C', 'D'].map(cls => {
    const data = abcClasses[cls]
    if (!data) return null
    return { name: cls, pct: parseFloat(data.volume_pct) || 0, count: data.count || 0 }
  }).filter(Boolean)

  // Pareto curve — sample lorenz_curve to ~100 points for performance
  const rawLorenz = abc.lorenz_curve || []
  const paretoCurveData = (() => {
    if (rawLorenz.length <= 100) return rawLorenz
    const step = Math.max(1, Math.floor(rawLorenz.length / 100))
    const sampled = []
    for (let i = 0; i < rawLorenz.length; i += step) sampled.push(rawLorenz[i])
    if (sampled[sampled.length - 1] !== rawLorenz[rawLorenz.length - 1]) sampled.push(rawLorenz[rawLorenz.length - 1])
    return sampled
  })()

  const xyzChartData = xyzClasses.map(cls => ({
    name: cls.class,
    '% Lines': parseFloat(cls.pct_lines) || 0,
    '% Picks': parseFloat(cls.pct_picks) || 0,
    '% Orders': parseFloat(cls.pct_orders) || 0
  }))

  const histogramData = (orderStructure.histogram || []).map(bin => ({
    name: bin.label,
    count: bin.count || 0,
    pct: bin.pct || 0
  }))

  const percentileChartData = [
    { name: 'Order Lines', Average: avgDay.order_lines || 0, P75: p75Day.order_lines || 0, Max: maxDay.order_lines || 0 },
    { name: 'Pick Units', Average: avgDay.pick_units || 0, P75: p75Day.pick_units || 0, Max: maxDay.pick_units || 0 },
    { name: 'Orders', Average: avgDay.orders || 0, P75: p75Day.orders || 0, Max: maxDay.orders || 0 }
  ]

  const extrapChartData = projections.map(p => ({
    name: `Y${p.year}`,
    'Lines/Day': p.design_day?.order_lines || 0,
    'Picks/Day': p.design_day?.pick_units || 0,
    'Orders/Day': p.design_day?.orders || 0
  }))

  const recChartData = recommendations.map(r => ({
    name: r.product_name?.length > 25 ? r.product_name.slice(0, 25) + '...' : r.product_name,
    score: Math.round(r.fit_score || 0)
  }))

  const benefitChartData = (benefits?.projections || []).map(p => ({
    name: p.title?.length > 30 ? p.title.slice(0, 30) + '...' : p.title,
    improvement: parseFloat(p.improvement_pct) || 0,
    confidence: p.confidence
  }))

  const hourlyChartData = (analysis?.throughput_hourly?.hours || []).map(h => ({
    name: String(h.hour),
    orderlines: h.orderlines || 0
  }))

  const topSkusChartData = (analysis?.abc_classification?.top_skus || []).slice(0, 10).map(s => ({
    name: s.sku?.length > 20 ? s.sku.slice(0, 20) + '...' : s.sku,
    picks: Math.round(s.picks || 0)
  }))

  const RADIAN = Math.PI / 180
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return percent > 0.03 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    ) : null
  }

  const slides = [
    // Slide 0: Title
    {
      title: 'PINAXIS Warehouse Analytics',
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-3">Dashboard Playbook</h1>
            <p className="text-xl text-slate-300">{companyName}</p>
            <p className="text-sm text-slate-500 mt-4">PINAXIS Warehouse Analytics</p>
            {dateRange.from && dateRange.to && (
              <p className="text-xs text-slate-500 mt-2">Data range: {dateRange.from} to {dateRange.to}</p>
            )}
          </div>
          {!hasData && !loading && (
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 max-w-md">
              <p className="text-sm text-yellow-300">{projectId ? 'Analysis not yet complete. Run the analysis first from the Analysis page.' : 'Select a project from the Data Intake page to load presentation data.'}</p>
            </div>
          )}
        </div>
      )
    },
    // Slide 1: Data Overview
    {
      title: 'Data Analysis — Gaining Valuable Insights',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Comprehensive overview across the full time range of your order data, broken down by pick unit, order type, and temperature zone.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Total SKUs" value={fmt(skus.total)} />
            <MetricCard label="Moved SKUs" value={fmt(skus.active)} />
            <MetricCard label="Total Orders" value={fmt(orders.total_orders)} />
            <MetricCard label="Order Lines" value={fmt(orders.total_orderlines)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard label="Total Pick Units" value={fmt(orders.total_units)} color="blue" />
            <MetricCard label="Avg Lines/Order" value={orders.avg_lines_per_order || '—'} color="blue" />
            <MetricCard label="Bin Capable %" value={skus.bin_capable_pct ? `${skus.bin_capable_pct}%` : '—'} color="emerald" />
          </div>
          {/* Pie charts row: Order Type, Picking Unit, Temperature Zone */}
          {(orderTypePieData.length > 0 || pickingUnitPieData.length > 0 || temperaturePieData.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title: 'Order Type · Pick Units', data: orderTypePieData },
                { title: 'Picking Unit · Pick Units', data: pickingUnitPieData },
                { title: 'Temp. Zone · Pick Units', data: temperaturePieData }
              ].map(chart => chart.data.length > 0 && (
                <div key={chart.title} className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{chart.title}</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={chart.data} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2} dataKey="value" labelLine={false} label={renderCustomizedLabel}>
                        {chart.data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />)}
                      </Pie>
                      <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 10 }} />
                      <Tooltip {...tooltipStyle} formatter={(v) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
          {/* Daily Throughput (matches Pinaxis daily bars) */}
          {dailyData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Daily Throughput — Pick Units & Orders</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} interval={Math.max(0, Math.floor(dailyData.length / 15))} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  <Bar dataKey="orderlines" name="Order Lines" fill={COLORS.blue} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="orders" name="Orders" fill={COLORS.gold} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* KPI Summary Table */}
          {(byOrderType.length > 0 || byPickingUnit.length > 0) && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 overflow-x-auto">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">KPI Breakdown</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
                    <th className="py-2 px-2 text-left">Category</th>
                    <th className="py-2 px-2 text-right">Order Lines</th>
                    <th className="py-2 px-2 text-right">% Lines</th>
                    <th className="py-2 px-2 text-right">Pick Units</th>
                    <th className="py-2 px-2 text-right">% Units</th>
                  </tr>
                </thead>
                <tbody>
                  {byOrderType.length > 0 && <>
                    <tr className="border-b border-slate-700/50"><td colSpan={5} className="py-1 px-2 text-xs text-slate-500 font-bold uppercase">By Order Type</td></tr>
                    {byOrderType.map((d, i) => (
                      <tr key={`ot-${i}`} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                        <td className="py-1.5 px-2 text-slate-300">{d.name}</td>
                        <td className="py-1.5 px-2 text-right text-white">{fmt(d.order_lines)}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{d.pct_lines}%</td>
                        <td className="py-1.5 px-2 text-right text-white">{fmt(d.pick_units)}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{d.pct_units}%</td>
                      </tr>
                    ))}
                  </>}
                  {byPickingUnit.length > 0 && <>
                    <tr className="border-b border-slate-700/50"><td colSpan={5} className="py-1 px-2 text-xs text-slate-500 font-bold uppercase">By Picking Unit</td></tr>
                    {byPickingUnit.map((d, i) => (
                      <tr key={`pu-${i}`} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                        <td className="py-1.5 px-2 text-slate-300">{d.name}</td>
                        <td className="py-1.5 px-2 text-right text-white">{fmt(d.order_lines)}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{d.pct_lines}%</td>
                        <td className="py-1.5 px-2 text-right text-white">{fmt(d.pick_units)}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{d.pct_units}%</td>
                      </tr>
                    ))}
                  </>}
                  {byTemperature.length > 0 && <>
                    <tr className="border-b border-slate-700/50"><td colSpan={5} className="py-1 px-2 text-xs text-slate-500 font-bold uppercase">By Temperature Zone</td></tr>
                    {byTemperature.map((d, i) => (
                      <tr key={`tz-${i}`} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                        <td className="py-1.5 px-2 text-slate-300">{d.name}</td>
                        <td className="py-1.5 px-2 text-right text-white">{fmt(d.order_lines)}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{d.pct_lines}%</td>
                        <td className="py-1.5 px-2 text-right text-white">{fmt(d.pick_units)}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{d.pct_units}%</td>
                      </tr>
                    ))}
                  </>}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Date Range</p>
              <p className="text-sm text-white">{dateRange.from || '—'} to {dateRange.to || '—'}</p>
              <p className="text-xs text-slate-400 mt-1">{dailyPerc.days || '—'} operating days</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Inventory</p>
              <p className="text-sm text-white">{fmt(inv.total_locations)} locations</p>
              <p className="text-xs text-slate-400 mt-1">{fmt(inv.total_stock)} total stock units</p>
            </div>
          </div>
        </div>
      )
    },
    // Slide 2: Fit / No-Fit Analysis
    {
      title: 'Fit / No-Fit Analysis',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Analysis of whether items fit in standard automation bins, are bulky, or have missing dimensions.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Fit" value={fitPctTotal !== '—' ? `${fitPctTotal}%` : '—'} sub={`${fmt(fitCount)} SKUs`} color="emerald" />
            <MetricCard label="Dims Missing" value={missingPct !== '—' ? `${missingPct}%` : '—'} sub={`${fmt(itemsWithoutDims)} SKUs`} color="yellow" />
            <MetricCard label="Total Items" value={fmt(totalItems)} color="blue" />
            <MetricCard label="With Dimensions" value={fmt(itemsWithDims)} color="blue" />
          </div>
          {fitDonutData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Fit Distribution</p>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={fitDonutData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    label={renderCustomizedLabel}
                  >
                    {fitDonutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {fitBins.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Bin Compatibility</p>
              <div className="space-y-2">
                {fitBins.map(bin => (
                  <div key={bin.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{bin.name} mm</span>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">{fmt(bin.fit_count)} fit</span>
                      <span className="text-emerald-400">{bin.fit_pct}% of dimensioned</span>
                      <span className="text-slate-500">{bin.fit_pct_total}% of total</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30">
            <p className="text-sm text-emerald-300">Key Insight: {fitPctTotal !== '—' ? `${fitPctTotal}% of items are conveyable in standard bins — strong automation potential.` : 'Run analysis to see fit results.'}</p>
          </div>
        </div>
      )
    },
    // Slide 3: ABC Classification
    {
      title: 'ABC Classification',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Pareto analysis — distinguish fast, medium, and slow-moving articles by order line volume.</p>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {['A', 'B', 'C', 'D'].map(cls => {
              const data = abcClasses[cls]
              if (!data) return null
              const labels = { A: 'Fast Movers', B: 'Medium Movers', C: 'Slow Movers', D: 'Dead Stock' }
              const volLabels = { A: `${data.volume_pct}% of volume`, B: `${data.volume_pct}% of volume`, C: `${data.volume_pct}% of volume`, D: '0% of volume' }
              return (
                <div key={cls} className={`p-4 rounded-lg border text-center ${cls === 'A' ? 'bg-emerald-900/20 border-emerald-500/30' : cls === 'B' ? 'bg-yellow-900/20 border-yellow-500/30' : cls === 'D' ? 'bg-red-900/20 border-red-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                  <p className={`text-2xl font-bold ${cls === 'A' ? 'text-emerald-400' : cls === 'B' ? 'text-yellow-400' : cls === 'D' ? 'text-red-400' : 'text-white'}`}>{fmt(data.count)}</p>
                  <p className="text-xs text-slate-400 mt-1">{cls} Items ({data.pct}%)</p>
                  <p className="text-xs text-slate-500 mt-0.5">{labels[cls]}</p>
                  <p className="text-xs text-slate-500">{volLabels[cls]}</p>
                </div>
              )
            })}
          </div>
          {/* Pareto / ABC Curve */}
          {paretoCurveData.length > 2 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">ABC Curve — Accumulated Order Lines by SKU Rank</p>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={paretoCurveData} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
                  <defs>
                    <linearGradient id="abcGradientA" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.8} />
                      <stop offset={`${(abcClasses.A?.pct || 1)}%`} stopColor={COLORS.blue} stopOpacity={0.8} />
                      <stop offset={`${(abcClasses.A?.pct || 1) + (abcClasses.B?.pct || 1)}%`} stopColor={COLORS.emerald} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={COLORS.slate} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="x" tick={{ fill: '#94a3b8', fontSize: 10 }} label={{ value: 'SKU Rank %', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }} unit="%" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} label={{ value: 'Accumulated Volume %', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 11 }} unit="%" />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${v}%`} labelFormatter={(l) => `SKU Rank: ${l}%`} />
                  <Area type="monotone" dataKey="y" name="Cumulative Volume" stroke={COLORS.blue} fill="url(#abcGradientA)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Full KPI Table — matches Pinaxis format */}
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
                  <th className="py-2 px-2 text-left">ABC</th>
                  <th className="py-2 px-2 text-right">SKUs</th>
                  <th className="py-2 px-2 text-right">% of Total SKUs</th>
                  <th className="py-2 px-2 text-right">% of Order Lines</th>
                  <th className="py-2 px-2 text-right">% of Pick Units</th>
                  <th className="py-2 px-2 text-right">% of Orders</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-700/50 font-bold text-white">
                  <td className="py-2 px-2">Totals</td>
                  <td className="py-2 px-2 text-right">{fmt(abc.total_skus_including_dead || (abc.total_skus + (abc.dead_stock_count || 0)))}</td>
                  <td className="py-2 px-2 text-right">100%</td>
                  <td className="py-2 px-2 text-right">100%</td>
                  <td className="py-2 px-2 text-right">100%</td>
                  <td className="py-2 px-2 text-right">100%</td>
                </tr>
                {['A', 'B', 'C', 'D'].map(cls => {
                  const data = abcClasses[cls]
                  if (!data) return null
                  const clsColor = cls === 'A' ? 'text-emerald-400' : cls === 'B' ? 'text-yellow-400' : cls === 'D' ? 'text-red-400' : 'text-slate-300'
                  return (
                    <tr key={cls} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                      <td className={`py-2 px-2 font-bold ${clsColor}`}>{cls}</td>
                      <td className="py-2 px-2 text-right text-white">{fmt(data.count)}</td>
                      <td className="py-2 px-2 text-right text-slate-300">{data.pct}%</td>
                      <td className="py-2 px-2 text-right text-slate-300">{data.pct_lines != null ? `${data.pct_lines}%` : `${data.volume_pct}%`}</td>
                      <td className="py-2 px-2 text-right text-slate-300">{data.pct_picks != null ? `${data.pct_picks}%` : `${data.volume_pct}%`}</td>
                      <td className="py-2 px-2 text-right text-slate-300">{data.pct_orders != null ? `${data.pct_orders}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Volume % bar chart */}
          {abcChartData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Volume % by Class</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={abcChartData} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 13, fontWeight: 'bold' }} width={30} />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${v}%`} />
                  <Bar dataKey="pct" name="Volume %" radius={[0, 6, 6, 0]}>
                    {abcChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.name === 'A' ? COLORS.emerald : entry.name === 'B' ? COLORS.yellow : entry.name === 'D' ? COLORS.red : COLORS.slate} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Design Day / Design Hour + Gini */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Design Day</p>
              <p className="text-lg font-bold text-white">{fmt(p75Day.order_lines)}</p>
              <p className="text-xs text-slate-400">Order Lines</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Design Hour</p>
              <p className="text-lg font-bold text-white">{fmt(p75Hr.order_lines)}</p>
              <p className="text-xs text-slate-400">Order Lines</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Gini Coefficient</p>
              <p className="text-lg font-bold text-white">{abc.gini || '—'}</p>
              <p className="text-xs text-slate-400">{abc.gini >= 0.7 ? 'Strong ABC separation' : abc.gini >= 0.4 ? 'Moderate' : 'Even distribution'}</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Active SKUs</p>
              <p className="text-lg font-bold text-white">{fmt(abc.total_skus)}</p>
              <p className="text-xs text-slate-400">+ {fmt(abc.dead_stock_count)} dead stock</p>
            </div>
          </div>
        </div>
      )
    },
    // Slide 4: XYZ Seasonality
    {
      title: 'XYZ Seasonality Analysis',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Distinguish seasonal vs non-seasonal products. Limits determined by minimum days an article was active.</p>
          <div className="grid grid-cols-3 gap-4">
            {xyzClasses.map(cls => {
              const labels = { X: `≥${xyz.thresholds?.x_min_days || 30} days`, Y: `≥${xyz.thresholds?.y_min_days || 20} days`, Z: `<${xyz.thresholds?.y_min_days || 20} days` }
              return (
                <div key={cls.class} className={`p-5 rounded-lg border text-center ${cls.class === 'X' ? 'bg-red-900/20 border-red-500/30' : cls.class === 'Y' ? 'bg-yellow-900/20 border-yellow-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                  <p className={`text-3xl font-bold ${cls.class === 'X' ? 'text-red-400' : cls.class === 'Y' ? 'text-yellow-400' : 'text-slate-300'}`}>{fmt(cls.moved_skus)}</p>
                  <p className="text-xs text-slate-400 mt-1">{cls.class} Items ({labels[cls.class]})</p>
                  <p className={`text-sm mt-2 ${cls.class === 'X' ? 'text-red-300' : cls.class === 'Y' ? 'text-yellow-300' : 'text-slate-300'}`}>{cls.pct_moved_skus}% of moved SKUs</p>
                  <p className="text-xs text-slate-500">{cls.pct_lines}% Lines · {cls.pct_picks}% Picks · {cls.pct_orders}% Orders</p>
                </div>
              )
            })}
          </div>
          {xyzChartData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">XYZ Breakdown — Lines / Picks / Orders</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={xyzChartData} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 13, fontWeight: 'bold' }} width={30} />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${v}%`} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  <Bar dataKey="% Lines" fill={COLORS.red} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="% Picks" fill={COLORS.yellow} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="% Orders" fill={COLORS.slate} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {xyz.design_day && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Average Day ({xyz.design_day.working_hours}h working)</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-slate-400">Lines:</span> <span className="text-white font-medium">{fmt(xyz.design_day.avg_day?.order_lines)} ({fmt(xyz.design_day.avg_day?.lines_per_hour)}/hr)</span></div>
                <div><span className="text-slate-400">Picks:</span> <span className="text-white font-medium">{fmt(xyz.design_day.avg_day?.pick_units)} ({fmt(xyz.design_day.avg_day?.picks_per_hour)}/hr)</span></div>
                <div><span className="text-slate-400">Orders:</span> <span className="text-white font-medium">{fmt(xyz.design_day.avg_day?.orders)} ({fmt(xyz.design_day.avg_day?.orders_per_hour)}/hr)</span></div>
              </div>
            </div>
          )}
        </div>
      )
    },
    // Slide 5: Order Profile
    {
      title: 'Order Profile',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Insights regarding lines per order with min/max, average, and percentile values.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Total Orders" value={fmt(orderStructure.total_orders)} />
            <MetricCard label="Single-Line" value={`${orderStructure.single_line_pct || '—'}%`} sub={fmt(orderStructure.single_line_orders)} color="blue" />
            <MetricCard label="Multi-Line" value={`${orderStructure.multi_line_pct || '—'}%`} sub={fmt(orderStructure.multi_line_orders)} color="emerald" />
            <MetricCard label="Avg Lines/Order" value={orders.avg_lines_per_order || '—'} color="yellow" />
          </div>
          {histogramData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Order Lines Distribution</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={histogramData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} label={{ value: 'Lines per Order', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} formatter={(v, name) => name === 'count' ? fmt(v) : `${v}%`} />
                  <Bar dataKey="count" name="Orders" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
            <p className="text-sm text-blue-300">The order structure {orderStructure.multi_line_pct > 50 ? 'is predominantly multi-line, indicating complex fulfillment suited for zone-based or wave picking automation.' : 'shows a balanced mix suitable for flexible automation strategies.'}</p>
          </div>
        </div>
      )
    },
    // Slide 6: Percentiles & Design Basis
    {
      title: 'Percentiles — Design Basis',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">The chosen percentile determines the design day and design hour values — the planning basis for the automation solution.</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-5 rounded-lg bg-blue-900/20 border border-blue-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">Average</p>
              <p className="text-3xl font-bold text-blue-400">{fmt(avgDay.order_lines)}</p>
              <p className="text-xs text-slate-400 mt-1">Daily Order Lines</p>
              <p className="text-sm text-blue-300 mt-2">{fmt(avgHr.order_lines)} / hour</p>
            </div>
            <div className="p-5 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">75th Percentile</p>
              <p className="text-3xl font-bold text-emerald-400">{fmt(p75Day.order_lines)}</p>
              <p className="text-xs text-slate-400 mt-1">Daily Order Lines</p>
              <p className="text-sm text-emerald-300 mt-2">{fmt(p75Hr.order_lines)} / hour</p>
            </div>
            <div className="p-5 rounded-lg bg-red-900/20 border border-red-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">Maximum</p>
              <p className="text-3xl font-bold text-red-400">{fmt(maxDay.order_lines)}</p>
              <p className="text-xs text-slate-400 mt-1">Daily Order Lines</p>
              <p className="text-sm text-red-300 mt-2">{fmt(maxHr.order_lines)} / hour</p>
            </div>
          </div>
          {(avgDay.order_lines || p75Day.order_lines || maxDay.order_lines) && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Daily Metrics Comparison</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={percentileChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  <Bar dataKey="Average" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="P75" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Max" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Pick Units</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-slate-400">Avg:</span> <span className="text-white">{fmt(avgDay.pick_units)}</span></div>
                <div><span className="text-slate-400">P75:</span> <span className="text-white">{fmt(p75Day.pick_units)}</span></div>
                <div><span className="text-slate-400">Max:</span> <span className="text-white">{fmt(maxDay.pick_units)}</span></div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Orders</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-slate-400">Avg:</span> <span className="text-white">{fmt(avgDay.orders)}</span></div>
                <div><span className="text-slate-400">P75:</span> <span className="text-white">{fmt(p75Day.orders)}</span></div>
                <div><span className="text-slate-400">Max:</span> <span className="text-white">{fmt(maxDay.orders)}</span></div>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Working Hours: {dailyPerc.working_hours || 12}h</p>
            <p className="text-sm text-yellow-300">The 75th percentile design day at {fmt(p75Day.order_lines)} lines/day ({fmt(p75Hr.order_lines)}/hr) ensures the system handles peak demand 75% of the time.</p>
          </div>
        </div>
      )
    },
    // Slide 7: Extrapolation
    {
      title: 'Data Analysis — Using Data to Your Advantage',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">{extrap.years || 5}-year extrapolation at {extrap.growth_rate_pct || 5}% annual growth across all key metrics.</p>
          {year5.design_day && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 text-center">
                <p className="text-xs text-slate-400 mb-1">Lines/day (Y5)</p>
                <p className="text-2xl font-bold text-yellow-400">{fmt(year5.design_day.order_lines)}</p>
                <p className="text-xs text-slate-400">{fmt(year5.design_day.lines_per_hour)} / hour</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
                <p className="text-xs text-slate-400 mb-1">Picks/day (Y5)</p>
                <p className="text-2xl font-bold text-slate-200">{fmt(year5.design_day.pick_units)}</p>
                <p className="text-xs text-slate-400">{fmt(year5.design_day.picks_per_hour)} / hour</p>
              </div>
              <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-center">
                <p className="text-xs text-slate-400 mb-1">Orders/day (Y5)</p>
                <p className="text-2xl font-bold text-emerald-400">{fmt(year5.design_day.orders)}</p>
                <p className="text-xs text-slate-400">{fmt(year5.design_day.orders_per_hour)} / hour</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30 text-center">
                <p className="text-xs text-slate-400 mb-1">SKU Growth (Y5)</p>
                <p className="text-2xl font-bold text-blue-400">{fmt(year5.skus)}</p>
                <p className="text-xs text-slate-400">x{year5.growth_factor} from baseline</p>
              </div>
            </div>
          )}
          {extrapChartData.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">5-Year Growth Projection</p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={extrapChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                  <Bar dataKey="Lines/Day" fill={COLORS.yellow} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Orders/Day" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {extrap.baseline && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Baseline (Year 0)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-slate-400">Lines/day:</span> <span className="text-white font-medium">{fmt(extrap.baseline.order_lines)}</span></div>
                <div><span className="text-slate-400">Picks/day:</span> <span className="text-white font-medium">{fmt(extrap.baseline.pick_units)}</span></div>
                <div><span className="text-slate-400">Orders/day:</span> <span className="text-white font-medium">{fmt(extrap.baseline.orders)}</span></div>
                <div><span className="text-slate-400">SKUs:</span> <span className="text-white font-medium">{fmt(extrap.baseline.skus)}</span></div>
              </div>
            </div>
          )}
          <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30">
            <p className="text-sm text-emerald-300">The PINAXIS solution is designed to scale with projected {extrap.growth_rate_pct || 5}% YoY growth, ensuring headroom for Year 5 peak throughput demands.</p>
          </div>
        </div>
      )
    },
    // Slide 8: Product Recommendations
    {
      title: 'Product Recommendations',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Based on the complete warehouse data analysis, the following PINAXIS intralogistics solutions are recommended for this operation.</p>
          {recommendations.length > 0 ? (
            <>
              {recChartData.length > 0 && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Fit Score by Product</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={recChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={140} />
                      <Tooltip {...tooltipStyle} formatter={(v) => `${v}/100`} />
                      <Bar dataKey="score" name="Fit Score" radius={[0, 6, 6, 0]}>
                        {recChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.score >= 70 ? COLORS.emerald : entry.score >= 40 ? COLORS.orange : COLORS.slate} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-3">
                {recommendations.map((rec, i) => {
                  const score = rec.fit_score || 0
                  const barColor = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-yellow-500' : 'bg-slate-500'
                  return (
                    <div key={i} className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-white font-semibold">{rec.product_name}</h3>
                          <p className="text-xs text-blue-400">{rec.product_category}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-yellow-400' : 'text-slate-300'}`}>{Math.round(score)}</p>
                          <p className="text-xs text-slate-500">/ 100</p>
                        </div>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                        <div className={`${barColor} h-2 rounded-full`} style={{ width: `${Math.min(score, 100)}%` }} />
                      </div>
                      {(rec.description || rec.rationale) && (
                        <p className="text-xs text-slate-400 mt-1">{rec.description || rec.rationale}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
              <p className="text-sm text-yellow-300">No product recommendations available yet. Run the recommendation engine first.</p>
            </div>
          )}
        </div>
      )
    },
    // Slide 9: Client Benefit Projections
    {
      title: 'Client Benefit Projections',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Data-driven ROI projections based on warehouse analytics and PINAXIS product matching.</p>
          {benefits ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Automation Readiness" value={`${benefits.summary?.automation_readiness_score || 0}/100`} color="blue" />
                <MetricCard label="Est. Annual Savings" value={benefits.summary?.annual_savings_high ? `€${Math.round(benefits.summary.annual_savings_high / 1000)}K` : '—'} color="emerald" />
                <MetricCard label="Payback Period" value={benefits.summary?.payback_months_low && benefits.summary?.payback_months_high ? `${benefits.summary.payback_months_low}–${benefits.summary.payback_months_high} mo` : '—'} color="yellow" />
                <MetricCard label="High-Confidence" value={`${benefits.summary?.high_confidence_count || 0} of ${benefits.summary?.total_projections || 0}`} sub="benefits" color="blue" />
              </div>
              {benefitChartData.length > 0 && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Improvement % by Benefit Area</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={benefitChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" />
                      <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={160} />
                      <Tooltip {...tooltipStyle} formatter={(v) => `+${v}%`} />
                      <Bar dataKey="improvement" name="Improvement %" radius={[0, 6, 6, 0]}>
                        {benefitChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.confidence === 'high' ? COLORS.emerald : entry.confidence === 'medium' ? COLORS.yellow : COLORS.slate} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {benefits.projections && benefits.projections.length > 0 && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Benefit Improvements</p>
                  <div className="space-y-2">
                    {benefits.projections.map((p, i) => {
                      const confColor = p.confidence === 'high' ? 'text-emerald-400' : p.confidence === 'medium' ? 'text-yellow-400' : 'text-slate-400'
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300 flex-1">{p.title}</span>
                          <span className="text-emerald-400 font-medium w-20 text-right">+{p.improvement_pct}%</span>
                          <span className={`${confColor} w-20 text-right text-xs`}>{p.confidence === 'high' ? 'High' : p.confidence === 'medium' ? 'Medium' : 'Benchmark'}</span>
                          <span className="text-slate-500 flex-1 text-xs text-right">{p.data_drivers?.[0]?.explanation || ''}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
              <p className="text-sm text-yellow-300">No benefit projections available yet. Run the benefit analysis first.</p>
            </div>
          )}
        </div>
      )
    },
    // Slide 10: Hourly Throughput
    {
      title: 'Hourly Throughput',
      content: (() => {
        return (
          <div className="space-y-6">
            <p className="text-slate-300">Orderlines per hour across a 24-hour cycle, highlighting peak activity windows for system dimensioning.</p>
            {hourlyChartData.length > 0 ? (
              <>
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Orderlines by Hour (0-23)</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={hourlyChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} label={{ value: 'Hour', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="orderlines" name="Order Lines" radius={[4, 4, 0, 0]}>
                        {hourlyChartData.map((entry, i) => {
                          const maxVal = Math.max(...hourlyChartData.map(h => h.orderlines), 1)
                          const isPeak = entry.orderlines >= maxVal * 0.8
                          return <Cell key={i} fill={isPeak ? COLORS.yellow : COLORS.blue} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                  <p className="text-sm text-yellow-300">Peak hours (highlighted in gold) represent periods where the automation system must sustain highest throughput.</p>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                <p className="text-sm text-yellow-300">No hourly throughput data available yet.</p>
              </div>
            )}
          </div>
        )
      })()
    },
    // Slide 11: Top 10 SKUs
    {
      title: 'Top 10 SKUs',
      content: (() => {
        const topSkus = analysis?.abc_classification?.top_skus || []
        return (
          <div className="space-y-6">
            <p className="text-slate-300">The highest-frequency SKUs by pick volume — prime candidates for goods-to-person automation zones.</p>
            {topSkus.length > 0 ? (
              <>
                {topSkusChartData.length > 0 && (
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Pick Count by SKU</p>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={topSkusChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={130} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="picks" name="Picks" fill={COLORS.purple} radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="grid grid-cols-5 gap-2 mb-2 text-xs text-slate-500 uppercase tracking-wider">
                    <span>Rank</span><span>SKU</span><span className="text-right">Picks</span><span className="text-right">% Total</span><span className="text-right">Class</span>
                  </div>
                  {topSkus.slice(0, 10).map((s, i) => {
                    const clsColor = s.class === 'A' ? 'text-emerald-400' : s.class === 'B' ? 'text-yellow-400' : 'text-slate-400'
                    return (
                      <div key={i} className={`grid grid-cols-5 gap-2 py-2 text-sm ${i % 2 === 0 ? 'bg-slate-900/30' : ''} rounded px-1`}>
                        <span className="text-slate-400 font-medium">{i + 1}</span>
                        <span className="text-white truncate">{s.sku}</span>
                        <span className="text-white text-right">{fmt(Math.round(s.picks))}</span>
                        <span className="text-slate-300 text-right">{s.pct}%</span>
                        <span className={`${clsColor} font-bold text-right`}>{s.class}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                <p className="text-sm text-yellow-300">No top SKU data available yet.</p>
              </div>
            )}
          </div>
        )
      })()
    },
    // Slide 12: Next Steps
    {
      title: 'Next Steps',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Based on the data analysis, here are the recommended next steps for your warehouse automation journey with PINAXIS.</p>
          <div className="space-y-4">
            {[
              { num: '1', title: 'Review Concept Designs', desc: `Explore the PINAXIS product recommendations with fit scores tailored to ${companyName}'s warehouse profile.` },
              { num: '2', title: 'Simulation & Layout', desc: 'Run warehouse simulations to validate throughput targets and optimize system layout.' },
              { num: '3', title: 'Commercial Proposal', desc: 'Review ROI projections, cost-benefit analysis, and payback period estimates.' },
              { num: '4', title: 'API Integration', desc: 'Connect your WMS/ERP for live data feeds and real-time monitoring.' },
              { num: '5', title: 'Implementation', desc: 'Phased deployment with PINAXIS engineering support and OEE tracking from day one.' }
            ].map(step => (
              <div key={step.num} className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">{step.num}</div>
                <div>
                  <h3 className="text-white font-semibold">{step.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-lg bg-purple-900/20 border border-purple-500/30 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <p className="text-sm text-purple-300">Ask Rachel any questions about this proposal — she can walk you through every metric and recommendation.</p>
          </div>
        </div>
      )
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Presentation Mode</h1>
          <p className="text-slate-400">PINAXIS proposal for {companyName} — powered by Rachel Voice AI</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Slide {activeSlide + 1} / {slides.length}</span>
          {projectId && hasData && (
            videoStatus?.status === 'completed' && videoStatus.proposalUrl ? (
              <a href={videoStatus.proposalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                Open Proposal Link
              </a>
            ) : videoStatus?.status === 'generating' ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-blue-400">{videoStatus.detail || 'Generating...'}</span>
              </div>
            ) : videoStatus?.status === 'error' ? (
              <button onClick={startProposalGeneration} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm hover:bg-red-900/50 transition-all" title={videoStatus.detail}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
                Retry
              </button>
            ) : (
              <button onClick={startProposalGeneration} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                Generate Proposal Link
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {slides.map((s, i) => (
          <button key={i} onClick={() => setActiveSlide(i)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${i === activeSlide ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {i + 1}. {s.title.length > 20 ? s.title.slice(0, 20) + '...' : s.title}
          </button>
        ))}
      </div>

      <div className="card min-h-[500px]">
        <h2 className="text-2xl font-bold text-white mb-6 pb-4 border-b border-slate-700">{slides[activeSlide].title}</h2>
        {slides[activeSlide].content}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))} disabled={activeSlide === 0} className={`px-6 py-2.5 rounded-lg font-medium transition-all ${activeSlide === 0 ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>Previous</button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (<div key={i} className={`w-2 h-2 rounded-full transition-all ${i === activeSlide ? 'bg-blue-500 w-6' : 'bg-slate-700'}`} />))}
        </div>
        <button onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))} disabled={activeSlide === slides.length - 1} className={`px-6 py-2.5 rounded-lg font-medium transition-all ${activeSlide === slides.length - 1 ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>Next</button>
      </div>

      <div className="mt-8 p-5 rounded-lg bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">Rachel — PINAXIS Voice AI</h3>
            <p className="text-xs text-slate-400">Powered by ElevenLabs Conversational AI</p>
          </div>
        </div>
        <p className="text-sm text-slate-300">Click the voice widget in the bottom-right corner to have Rachel walk you through this presentation. She knows all the metrics for {companyName}.</p>
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub, color = 'slate' }) {
  const colorMap = {
    slate: 'bg-slate-800/50 border-slate-700', emerald: 'bg-emerald-900/20 border-emerald-500/30',
    blue: 'bg-blue-900/20 border-blue-500/30', yellow: 'bg-yellow-900/20 border-yellow-500/30',
    red: 'bg-red-900/20 border-red-500/30', orange: 'bg-orange-900/20 border-orange-500/30'
  }
  const textMap = {
    slate: 'text-white', emerald: 'text-emerald-400', blue: 'text-blue-400',
    yellow: 'text-yellow-400', red: 'text-red-400', orange: 'text-orange-400'
  }
  return (
    <div className={`p-4 rounded-lg border text-center ${colorMap[color]}`}>
      <p className={`text-2xl font-bold ${textMap[color]}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}
