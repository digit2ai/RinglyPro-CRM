import React from 'react'

export default function DesignDayCard({ data = {} }) {
  const percentiles = data.percentiles || {}
  const designDay = data.design_day
  const designLabel = data.design_day_label || 'P75'
  const recommendation = data.design_day_recommendation

  if (!Object.keys(percentiles).length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No design day data available</p>
      </div>
    )
  }

  const cards = [
    { label: 'P50', sublabel: 'Median Day', value: percentiles.P50, highlight: designLabel === 'P50' },
    { label: 'P75', sublabel: 'Design Day', value: percentiles.P75, highlight: designLabel === 'P75' },
    { label: 'P90', sublabel: 'Busy Day', value: percentiles.P90, highlight: designLabel === 'P90' },
    { label: 'P95', sublabel: 'Peak Day', value: percentiles.P95, highlight: designLabel === 'P95' },
    { label: 'P99', sublabel: 'Max Day', value: percentiles.P99, highlight: false }
  ]

  return (
    <div>
      {/* Design Day Recommendation */}
      {recommendation && (
        <div className="bg-intuitive-600/10 border border-intuitive-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-slate-300">{recommendation}</p>
        </div>
      )}

      {/* Percentile Cards */}
      <div className="grid grid-cols-5 gap-3">
        {cards.map(card => (
          <div
            key={card.label}
            className={`rounded-xl p-4 text-center transition-all ${
              card.highlight
                ? 'bg-intuitive-600/20 border-2 border-intuitive-500 shadow-lg shadow-intuitive-500/10'
                : 'bg-slate-800/50 border border-slate-700'
            }`}
          >
            <div className={`text-[10px] uppercase font-bold tracking-wider ${card.highlight ? 'text-intuitive-400' : 'text-slate-500'}`}>
              {card.label}
            </div>
            <div className={`text-2xl font-black mt-1 ${card.highlight ? 'text-intuitive-300' : 'text-white'}`}>
              {card.value || '--'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{card.sublabel}</div>
            <div className="text-[10px] text-slate-500">cases/day</div>
            {card.highlight && (
              <div className="mt-2 text-[10px] font-bold text-intuitive-400 uppercase">
                Design Basis
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="bg-slate-800/30 rounded-lg p-3 text-center">
          <div className="text-[10px] uppercase text-slate-500 font-bold">Mean Daily</div>
          <div className="text-lg font-bold text-white">{data.mean_daily_cases || '--'}</div>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-3 text-center">
          <div className="text-[10px] uppercase text-slate-500 font-bold">Std Dev</div>
          <div className="text-lg font-bold text-white">{data.std_dev || '--'}</div>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-3 text-center">
          <div className="text-[10px] uppercase text-slate-500 font-bold">Operating Days/Yr</div>
          <div className="text-lg font-bold text-white">{data.operating_days_per_year || 250}</div>
        </div>
      </div>
    </div>
  )
}
