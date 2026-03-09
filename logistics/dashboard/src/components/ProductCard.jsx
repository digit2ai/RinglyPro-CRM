import React, { useState } from 'react'

function getScoreColor(score) {
  if (score >= 80) return { ring: 'ring-emerald-500', bg: 'bg-emerald-500', text: 'text-emerald-400', bgLight: 'bg-emerald-500/20' }
  if (score >= 60) return { ring: 'ring-blue-500', bg: 'bg-blue-500', text: 'text-blue-400', bgLight: 'bg-blue-500/20' }
  if (score >= 40) return { ring: 'ring-amber-500', bg: 'bg-amber-500', text: 'text-amber-400', bgLight: 'bg-amber-500/20' }
  return { ring: 'ring-slate-500', bg: 'bg-slate-500', text: 'text-slate-400', bgLight: 'bg-slate-500/20' }
}

function getCategoryColor(category) {
  const map = {
    'Storage': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    'Shuttle': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    'Conveyor': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    'Picking': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    'Sortation': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'WMS': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    'Software': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    'Robotics': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
  }
  return map[category] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'
}

export default function ProductCard({ product, isTopPick = false }) {
  const [expanded, setExpanded] = useState(false)

  const name = product.name || product.product_name || 'Unknown Product'
  const category = product.category || product.product_category || 'General'
  const score = product.fit_score ?? product.score ?? 0
  const description = product.description || ''
  const reasoning = product.reasoning || product.scoring_breakdown || product.details || []
  const scoreColors = getScoreColor(score)

  // Parse reasoning into array if it's a string
  const reasoningItems = Array.isArray(reasoning)
    ? reasoning
    : typeof reasoning === 'string'
      ? reasoning.split('\n').filter(Boolean).map(r => ({ text: r }))
      : typeof reasoning === 'object'
        ? Object.entries(reasoning).map(([key, value]) => ({
            label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            value: typeof value === 'number' ? value : undefined,
            text: typeof value === 'string' ? value : undefined
          }))
        : []

  return (
    <div className={`card transition-all duration-200 ${
      isTopPick
        ? 'border-logistics-500/40 bg-gradient-to-br from-logistics-900/30 to-slate-800 shadow-xl shadow-logistics-500/5'
        : 'hover:border-slate-600'
    }`}>
      <div className="flex items-start gap-5">
        {/* Score Circle */}
        <div className="flex-shrink-0">
          <div className={`w-16 h-16 rounded-full ${scoreColors.bgLight} ring-2 ${scoreColors.ring} flex flex-col items-center justify-center`}>
            <span className={`text-xl font-bold ${scoreColors.text}`}>{score}</span>
            <span className="text-[10px] text-slate-400 -mt-0.5">score</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {isTopPick && (
                  <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    Top Pick
                  </span>
                )}
                <span className={`badge border ${getCategoryColor(category)}`}>
                  {category}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white">{name}</h3>
            </div>
          </div>

          {description && (
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">{description}</p>
          )}

          {/* Scoring Breakdown Accordion */}
          {reasoningItems.length > 0 && (
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
                Scoring Breakdown ({reasoningItems.length} factors)
              </button>

              {expanded && (
                <div className="mt-3 space-y-2 animate-fade-in">
                  {reasoningItems.map((item, index) => {
                    const label = item.label || item.factor || item.criterion || `Factor ${index + 1}`
                    const text = item.text || item.explanation || item.reason || ''
                    const value = item.value ?? item.score ?? null

                    return (
                      <div
                        key={index}
                        className="flex items-start gap-3 bg-slate-700/30 rounded-lg p-3"
                      >
                        {value !== null && (
                          <div className="flex-shrink-0 mt-0.5">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${
                              value >= 8 ? 'bg-emerald-500/20 text-emerald-400' :
                              value >= 5 ? 'bg-blue-500/20 text-blue-400' :
                              value >= 3 ? 'bg-amber-500/20 text-amber-400' :
                              'bg-slate-600/30 text-slate-400'
                            }`}>
                              {typeof value === 'number' ? value.toFixed(0) : value}
                            </div>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200">{label}</p>
                          {text && <p className="text-xs text-slate-400 mt-0.5">{text}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
