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

  const kpis = analysis?.kpis || analysis?.summary || {}
  const abc = analysis?.abc || {}
  const fit = analysis?.fit_analysis || {}
  const orderProfile = analysis?.order_profile || {}

  const companyName = project?.company_name || 'Your Warehouse'

  const slides = [
    // Slide 0: Title
    {
      title: 'PINAXIS Warehouse Analytics',
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
          <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-lg shadow-blue-600/20">
            <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="PINAXIS" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white mb-3">Dashboard Playbook</h1>
            <p className="text-xl text-slate-300">{companyName}</p>
            <p className="text-sm text-slate-500 mt-4">PINAXIS Warehouse Automation</p>
          </div>
          <div className="flex items-center gap-3 mt-8">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-emerald-400">Rachel Voice AI Ready — Click the widget to begin</span>
          </div>
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
            <MetricCard label="Total SKUs" value={kpis.total_skus || kpis.moved_skus || '43,680'} />
            <MetricCard label="Total Orders" value={kpis.total_orders || '60,016'} />
            <MetricCard label="Order Lines" value={kpis.total_order_lines || '637,002'} />
            <MetricCard label="Pick Units" value={kpis.total_pick_units || '89,533,743'} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard label="Pieces Equivalent" value={kpis.pieces_equivalent || '657,885,754'} color="blue" />
            <MetricCard label="Cartons Equivalent" value={kpis.cartons_equivalent || '89,193,443'} color="blue" />
            <MetricCard label="Pallets Equivalent" value={kpis.pallets_equivalent || '2,227,374'} color="blue" />
          </div>
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Pick Unit Breakdown</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-slate-400">Case:</span> <span className="text-white font-medium">30,578 SKUs</span></div>
              <div><span className="text-slate-400">Single:</span> <span className="text-white font-medium">12,884 SKUs</span></div>
              <div><span className="text-slate-400">Pallet:</span> <span className="text-white font-medium">218 SKUs</span></div>
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
          <p className="text-slate-300">Analysis of whether items fit in the selected bin (600 x 400 x 200), are bulky, or have missing dimensions.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Fit" value={fit.fit_pct || '65.7%'} sub={fit.fit_skus || '149,969 SKUs'} color="emerald" />
            <MetricCard label="Dimension Missing" value={fit.missing_pct || '27.7%'} sub={fit.missing_skus || '63,126 SKUs'} color="yellow" />
            <MetricCard label="Bulky" value={fit.bulky_pct || '3.2%'} sub={fit.bulky_skus || '7,186 SKUs'} color="red" />
            <MetricCard label="No-Fit" value={fit.nofit_pct || '3.4%'} sub={fit.nofit_skus || '7,793 SKUs'} color="orange" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">By SKUs</p>
              <p className="text-sm text-slate-300">65.7% of total SKUs fit the standard bin. Moved SKU fit rate is <strong className="text-emerald-400">86.0%</strong> — the items that matter most are conveyable.</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">By Lines</p>
              <p className="text-sm text-slate-300">87.6% of order lines are fit items, covering <strong className="text-emerald-400">91.8%</strong> of pick quantity — strong automation potential.</p>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30">
            <p className="text-sm text-emerald-300">Key Insight: The overwhelming majority of moved volume is conveyable, making this warehouse an excellent candidate for PINAXIS automation solutions.</p>
          </div>
        </div>
      )
    },
    // Slide 3: ABC Classification
    {
      title: 'ABC Classification',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Distinguish between slow, medium, and fast-moving articles. ABC classification by SKU Rank % on Order Lines.</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-5 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-center">
              <p className="text-3xl font-bold text-emerald-400">{abc.a_skus || '785'}</p>
              <p className="text-xs text-slate-400 mt-1">A Items (10% SKUs)</p>
              <p className="text-sm text-emerald-300 mt-2">60% of Order Lines</p>
              <p className="text-xs text-slate-500">59% Pick Units · 91% Orders</p>
            </div>
            <div className="p-5 rounded-lg bg-yellow-900/20 border border-yellow-500/30 text-center">
              <p className="text-3xl font-bold text-yellow-400">{abc.b_skus || '785'}</p>
              <p className="text-xs text-slate-400 mt-1">B Items (10% SKUs)</p>
              <p className="text-sm text-yellow-300 mt-2">17% of Order Lines</p>
              <p className="text-xs text-slate-500">17% Pick Units · 71% Orders</p>
            </div>
            <div className="p-5 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-3xl font-bold text-slate-300">{abc.c_skus || '6,281'}</p>
              <p className="text-xs text-slate-400 mt-1">C Items (80% SKUs)</p>
              <p className="text-sm text-slate-300 mt-2">23% of Order Lines</p>
              <p className="text-xs text-slate-500">23% Pick Units · 77% Orders</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Design Day (75th Percentile)</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-slate-400">Lines:</span> <span className="text-white font-medium">16,711/hr</span></div>
                <div><span className="text-slate-400">Picks:</span> <span className="text-white font-medium">22,870/hr</span></div>
                <div><span className="text-slate-400">Orders:</span> <span className="text-white font-medium">1,666/hr</span></div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Working Hours: 7.5h</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-slate-400">Lines/day:</span> <span className="text-white font-medium">125,326</span></div>
                <div><span className="text-slate-400">Picks/day:</span> <span className="text-white font-medium">171,521</span></div>
                <div><span className="text-slate-400">Orders/day:</span> <span className="text-white font-medium">12,491</span></div>
              </div>
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
          <p className="text-slate-300">Distinguish between seasonal and non-seasonal products. X, Y, Z limits determined by minimum days an article was touched by an order.</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-5 rounded-lg bg-red-900/20 border border-red-500/30 text-center">
              <p className="text-3xl font-bold text-red-400">4,994</p>
              <p className="text-xs text-slate-400 mt-1">X Items (≥30 days)</p>
              <p className="text-sm text-red-300 mt-2">11% of moved SKUs</p>
              <p className="text-xs text-slate-500">44% Lines · 40% Picks · 60% Orders</p>
            </div>
            <div className="p-5 rounded-lg bg-yellow-900/20 border border-yellow-500/30 text-center">
              <p className="text-3xl font-bold text-yellow-400">5,350</p>
              <p className="text-xs text-slate-400 mt-1">Y Items (≥20 days)</p>
              <p className="text-sm text-yellow-300 mt-2">12% of moved SKUs</p>
              <p className="text-xs text-slate-500">21% Lines · 19% Picks · 41% Orders</p>
            </div>
            <div className="p-5 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-3xl font-bold text-slate-300">33,336</p>
              <p className="text-xs text-slate-400 mt-1">Z Items (&lt;20 days)</p>
              <p className="text-sm text-slate-300 mt-2">76% of moved SKUs</p>
              <p className="text-xs text-slate-500">36% Lines · 41% Picks · 61% Orders</p>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Design Day (XYZ-filtered, 12h working)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><span className="text-slate-400">Lines:</span> <span className="text-white font-medium">2,365 (198/hr)</span></div>
              <div><span className="text-slate-400">Pick Units:</span> <span className="text-white font-medium">338,037 (28,170/hr)</span></div>
              <div><span className="text-slate-400">Orders:</span> <span className="text-white font-medium">227 (19/hr)</span></div>
              <div><span className="text-slate-400">Volume:</span> <span className="text-white font-medium">4,575 m³ (382/hr)</span></div>
            </div>
          </div>
        </div>
      )
    },
    // Slide 5: Order Profile
    {
      title: 'Order Profile',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Insights regarding pick-units per order, lines per order, volume per order with min/max, average, and percentile values.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Min Lines/Order" value="1.0" color="blue" />
            <MetricCard label="Average Lines/Order" value="9.9" color="yellow" />
            <MetricCard label="75th Percentile" value="13.0" color="emerald" />
            <MetricCard label="Max Lines/Order" value="138.0" color="red" />
          </div>
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Order Lines Distribution</p>
            <p className="text-sm text-slate-300">Orders with 1-10 lines represent the bulk of volume. The distribution shows a right-skewed pattern typical of mixed fulfillment operations, with the most frequent order sizes between 3-8 lines.</p>
          </div>
          <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
            <p className="text-sm text-blue-300">Key Insight: The moderate average of ~10 lines/order with a 75th percentile at 13 lines indicates well-structured orders suitable for zone-based or wave picking automation.</p>
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
              <p className="text-3xl font-bold text-blue-400">1,722</p>
              <p className="text-xs text-slate-400 mt-1">Daily Order Lines</p>
              <p className="text-sm text-blue-300 mt-2">144 / hour</p>
            </div>
            <div className="p-5 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">75th Percentile</p>
              <p className="text-3xl font-bold text-emerald-400">2,364</p>
              <p className="text-xs text-slate-400 mt-1">Daily Order Lines</p>
              <p className="text-sm text-emerald-300 mt-2">197 / hour</p>
            </div>
            <div className="p-5 rounded-lg bg-red-900/20 border border-red-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">Maximum</p>
              <p className="text-3xl font-bold text-red-400">3,002</p>
              <p className="text-xs text-slate-400 mt-1">Daily Order Lines</p>
              <p className="text-sm text-red-300 mt-2">250 / hour</p>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Working Hours: 12h</p>
            <p className="text-sm text-yellow-300">The 75th percentile design day at 2,364 lines/day (197/hr) ensures the system handles peak demand 75% of the time without bottlenecks.</p>
          </div>
        </div>
      )
    },
    // Slide 7: Extrapolation & Growth
    {
      title: 'Data Analysis — Using Data to Your Advantage',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">5-year extrapolation at 5% annual growth across all key metrics.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">Order Lines/day (Y5)</p>
              <p className="text-2xl font-bold text-yellow-400">40,754</p>
              <p className="text-xs text-slate-400">5,434 / hour</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
              <p className="text-xs text-slate-400 mb-1">Pick Units/day (Y5)</p>
              <p className="text-2xl font-bold text-slate-200">150,564</p>
              <p className="text-xs text-slate-400">20,076 / hour</p>
            </div>
            <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">Orders/day (Y5)</p>
              <p className="text-2xl font-bold text-emerald-400">8,246</p>
              <p className="text-xs text-slate-400">1,100 / hour</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30 text-center">
              <p className="text-xs text-slate-400 mb-1">SKU Growth (Y5)</p>
              <p className="text-2xl font-bold text-blue-400">18,389</p>
              <p className="text-xs text-slate-400">+27% from baseline</p>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Average Day (projected Year 5)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><span className="text-slate-400">Lines:</span> <span className="text-white font-medium">26,711</span></div>
              <div><span className="text-slate-400">Picks:</span> <span className="text-white font-medium">100,710</span></div>
              <div><span className="text-slate-400">Orders:</span> <span className="text-white font-medium">4,399</span></div>
              <div><span className="text-slate-400">Volume:</span> <span className="text-white font-medium">476 m³</span></div>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-emerald-900/20 border border-emerald-500/30">
            <p className="text-sm text-emerald-300">The PINAXIS solution is designed to scale with your projected 5% YoY growth, ensuring headroom for Year 5 peak throughput demands.</p>
          </div>
        </div>
      )
    },
    // Slide 8: Next Steps
    {
      title: 'Next Steps',
      content: (
        <div className="space-y-6">
          <p className="text-slate-300">Based on the data analysis, here are the recommended next steps for your warehouse automation journey with PINAXIS.</p>
          <div className="space-y-4">
            {[
              { num: '1', title: 'Review Concept Designs', desc: 'Explore the PINAXIS product recommendations with fit scores tailored to your warehouse profile.' },
              { num: '2', title: 'Simulation & Layout', desc: 'Run warehouse simulations to validate throughput targets and optimize system layout.' },
              { num: '3', title: 'Commercial Proposal', desc: 'Review ROI projections, cost-benefit analysis, and payback period estimates.' },
              { num: '4', title: 'API Integration', desc: 'Connect your WMS/ERP for live data feeds and real-time monitoring.' },
              { num: '5', title: 'Implementation', desc: 'Phased deployment with PINAXIS engineering support and OEE tracking from day one.' }
            ].map(step => (
              <div key={step.num} className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {step.num}
                </div>
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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Presentation Mode</h1>
          <p className="text-slate-400">
            PINAXIS proposal for {companyName} — powered by Rachel Voice AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Slide {activeSlide + 1} / {slides.length}</span>
        </div>
      </div>

      {/* Slide Navigation Dots */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {slides.map((s, i) => (
          <button
            key={i}
            onClick={() => setActiveSlide(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              i === activeSlide
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
            }`}
          >
            {i + 1}. {s.title.length > 20 ? s.title.slice(0, 20) + '...' : s.title}
          </button>
        ))}
      </div>

      {/* Active Slide */}
      <div className="card min-h-[500px]">
        <h2 className="text-2xl font-bold text-white mb-6 pb-4 border-b border-slate-700">
          {slides[activeSlide].title}
        </h2>
        {slides[activeSlide].content}
      </div>

      {/* Prev / Next Controls */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
          disabled={activeSlide === 0}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
            activeSlide === 0
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-slate-700 text-white hover:bg-slate-600'
          }`}
        >
          Previous
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === activeSlide ? 'bg-blue-500 w-6' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))}
          disabled={activeSlide === slides.length - 1}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
            activeSlide === slides.length - 1
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-500'
          }`}
        >
          Next
        </button>
      </div>

      {/* Rachel Voice AI Info */}
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
        <p className="text-sm text-slate-300">
          Click the voice widget in the bottom-right corner to have Rachel walk you through this presentation.
          She can explain any metric, answer questions about the warehouse analysis, and discuss PINAXIS automation recommendations.
        </p>
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub, color = 'slate' }) {
  const colorMap = {
    slate: 'bg-slate-800/50 border-slate-700',
    emerald: 'bg-emerald-900/20 border-emerald-500/30',
    blue: 'bg-blue-900/20 border-blue-500/30',
    yellow: 'bg-yellow-900/20 border-yellow-500/30',
    red: 'bg-red-900/20 border-red-500/30',
    orange: 'bg-orange-900/20 border-orange-500/30'
  }
  const textColorMap = {
    slate: 'text-white',
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    orange: 'text-orange-400'
  }
  return (
    <div className={`p-4 rounded-lg border text-center ${colorMap[color]}`}>
      <p className={`text-2xl font-bold ${textColorMap[color]}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}
