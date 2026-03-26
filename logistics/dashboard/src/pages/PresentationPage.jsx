import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getProject, getAnalysisAll, getRecommendations, getBenefits } from '../lib/api'

export default function PresentationPage() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [benefits, setBenefits] = useState(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [loading, setLoading] = useState(true)

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

  const slides = [
    // Slide 0: Title
    {
      title: 'PINAXIS Warehouse Analytics',
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
          <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-lg shadow-blue-600/20">
            <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69b02d62034886f7c9e996d9.png" alt="PINAXIS" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white mb-3">Dashboard Playbook</h1>
            <p className="text-xl text-slate-300">{companyName}</p>
            <p className="text-sm text-slate-500 mt-4">PINAXIS Warehouse Automation</p>
            {dateRange.from && dateRange.to && (
              <p className="text-xs text-slate-500 mt-2">Data range: {dateRange.from} to {dateRange.to}</p>
            )}
          </div>
          <div className="flex items-center gap-3 mt-8">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-emerald-400">Rachel Voice AI Ready — Click the widget to begin</span>
          </div>
          {!hasData && !loading && (
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 max-w-md">
              <p className="text-sm text-yellow-300">{projectId ? 'Analysis not yet complete. Run the analysis first from the Analysis page.' : 'Select a project from the sidebar to load presentation data.'}</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {['A', 'B', 'C', 'D'].map(cls => {
              const data = abcClasses[cls]
              if (!data) return null
              const colors = { A: 'emerald', B: 'yellow', C: 'slate', D: 'red' }
              const labels = { A: 'Fast Movers', B: 'Medium Movers', C: 'Slow Movers', D: 'Dead Stock' }
              return (
                <div key={cls} className={`p-4 rounded-lg border text-center ${cls === 'A' ? 'bg-emerald-900/20 border-emerald-500/30' : cls === 'B' ? 'bg-yellow-900/20 border-yellow-500/30' : cls === 'D' ? 'bg-red-900/20 border-red-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                  <p className={`text-2xl font-bold ${cls === 'A' ? 'text-emerald-400' : cls === 'B' ? 'text-yellow-400' : cls === 'D' ? 'text-red-400' : 'text-white'}`}>{fmt(data.count)}</p>
                  <p className="text-xs text-slate-400 mt-1">{cls} Items ({data.pct}%)</p>
                  <p className="text-xs text-slate-500 mt-0.5">{labels[cls]}</p>
                  <p className="text-xs text-slate-500">{data.volume_pct}% of volume</p>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Gini Coefficient</p>
              <p className="text-2xl font-bold text-white">{abc.gini || '—'}</p>
              <p className="text-xs text-slate-400 mt-1">{abc.gini >= 0.7 ? 'Highly concentrated — strong ABC separation' : abc.gini >= 0.4 ? 'Moderate concentration' : 'Relatively even distribution'}</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Total Active SKUs</p>
              <p className="text-2xl font-bold text-white">{fmt(abc.total_skus)}</p>
              <p className="text-xs text-slate-400 mt-1">Including {fmt(abc.dead_stock_count)} dead stock</p>
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
              const colors = { X: 'red', Y: 'yellow', Z: 'slate' }
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
          {orderStructure.histogram && (
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Order Lines Distribution</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {orderStructure.histogram.map(bin => (
                  <div key={bin.label} className="text-center p-2 rounded bg-slate-900/50">
                    <p className="text-xs text-slate-500">{bin.label} lines</p>
                    <p className="text-sm font-medium text-white">{fmt(bin.count)}</p>
                    <p className="text-xs text-slate-400">{bin.pct}%</p>
                  </div>
                ))}
              </div>
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
                <p className="text-xs text-slate-400">×{year5.growth_factor} from baseline</p>
              </div>
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
        const hours = analysis?.throughput_hourly?.hours || []
        const maxLines = Math.max(...hours.map(h => h.orderlines || 0), 1)
        return (
          <div className="space-y-6">
            <p className="text-slate-300">Orderlines per hour across a 24-hour cycle, highlighting peak activity windows for system dimensioning.</p>
            {hours.length > 0 ? (
              <>
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Orderlines by Hour (0–23)</p>
                  <div className="flex items-end gap-1" style={{ height: '200px' }}>
                    {hours.map((h, i) => {
                      const val = h.orderlines || 0
                      const pct = (val / maxLines) * 100
                      const isPeak = val >= maxLines * 0.8
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className={`text-[9px] mb-1 ${isPeak ? 'text-yellow-400 font-bold' : 'text-slate-500'}`}>{fmt(val)}</span>
                          <div className={`w-full rounded-t ${isPeak ? 'bg-yellow-500' : 'bg-blue-600'}`} style={{ height: `${Math.max(pct, 2)}%` }} />
                          <span className="text-[9px] text-slate-500 mt-1">{h.hour}</span>
                        </div>
                      )
                    })}
                  </div>
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
        <span className="text-xs text-slate-500">Slide {activeSlide + 1} / {slides.length}</span>
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
