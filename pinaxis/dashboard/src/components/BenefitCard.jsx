import React, { useState } from 'react'

const CONFIDENCE_STYLES = {
  high: { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'High confidence' },
  medium: { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Medium confidence' },
  low: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Benchmark-based' }
}

const CATEGORY_STYLES = {
  warehouse_automation: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  platform_ai: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
}

const CATEGORY_LABELS = {
  warehouse_automation: 'Warehouse Automation',
  platform_ai: 'Platform & AI'
}

export default function BenefitCard({ benefit }) {
  const [expanded, setExpanded] = useState(false)

  const conf = CONFIDENCE_STYLES[benefit.confidence] || CONFIDENCE_STYLES.medium
  const catStyle = CATEGORY_STYLES[benefit.category] || CATEGORY_STYLES.warehouse_automation
  const catLabel = CATEGORY_LABELS[benefit.category] || benefit.category

  const pct = benefit.improvement_pct
  const ringColor = pct >= 80 ? 'text-emerald-400 ring-emerald-500' :
    pct >= 50 ? 'text-blue-400 ring-blue-500' :
    pct >= 30 ? 'text-amber-400 ring-amber-500' :
    'text-slate-400 ring-slate-500'

  return (
    <div className="card hover:border-slate-600 transition-all duration-200">
      <div className="flex items-start gap-4">
        {/* Score circle */}
        <div className="flex-shrink-0">
          <div className={`w-16 h-16 rounded-full ring-2 ${ringColor} bg-slate-700/50 flex flex-col items-center justify-center`}>
            <span className={`text-lg font-bold ${ringColor.split(' ')[0]}`}>{Math.round(pct)}%</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`badge border text-xs ${catStyle}`}>{catLabel}</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${conf.dot}`} />
              <span className={`text-xs ${conf.text}`}>{conf.label}</span>
            </div>
          </div>

          <h3 className="text-base font-semibold text-white mb-1">{benefit.title}</h3>

          {/* Baseline → Projected */}
          {benefit.baseline_value && benefit.projected_value && (
            <div className="flex items-center gap-2 text-sm mb-2">
              <span className="text-slate-400">{benefit.baseline_value}</span>
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <span className="text-emerald-400 font-medium">{benefit.projected_value}</span>
            </div>
          )}

          <p className="text-sm text-slate-400 leading-relaxed mb-3">{benefit.reasoning}</p>

          {/* Data Drivers accordion */}
          {benefit.data_drivers && benefit.data_drivers.length > 0 && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                Data Drivers ({benefit.data_drivers.length} metrics)
              </button>

              {expanded && (
                <div className="mt-2 space-y-2 animate-fade-in">
                  {benefit.data_drivers.map((driver, i) => (
                    <div key={i} className="flex items-start gap-3 bg-slate-700/30 rounded-lg p-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold bg-blue-500/20 text-blue-400 font-mono">
                          {typeof driver.value === 'number' ? (driver.value >= 100 ? Math.round(driver.value) : driver.value.toFixed(1)) : driver.value}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">{driver.metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{driver.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
