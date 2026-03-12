import React from 'react'

function getFitColor(pct) {
  if (pct >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' }
  if (pct >= 60) return { bg: 'bg-blue-500', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' }
  if (pct >= 40) return { bg: 'bg-amber-500', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' }
  if (pct >= 20) return { bg: 'bg-orange-500', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' }
  return { bg: 'bg-red-500', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' }
}

export default function FitAnalysisTable({ data = [] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No bin fit analysis data available</p>
      </div>
    )
  }

  // Sort by fit_pct descending
  const sorted = [...data].sort((a, b) => {
    const aPct = a.fit_pct ?? a.fit_percentage ?? a.pct ?? 0
    const bPct = b.fit_pct ?? b.fit_percentage ?? b.pct ?? 0
    return bPct - aPct
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-2.5 px-3 text-slate-400 font-medium">Bin Size</th>
            <th className="text-right py-2.5 px-3 text-slate-400 font-medium">Dimensions (mm)</th>
            <th className="text-right py-2.5 px-3 text-slate-400 font-medium">SKUs Fit</th>
            <th className="text-right py-2.5 px-3 text-slate-400 font-medium">Fit %</th>
            <th className="text-left py-2.5 px-3 text-slate-400 font-medium min-w-[140px]">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => {
            const name = row.bin_name || row.name || row.label || `Bin ${index + 1}`
            const rawDim = row.dimensions || row.size || ''
            const dimensions = typeof rawDim === 'object' && rawDim !== null
              ? `${rawDim.length || 0} x ${rawDim.width || 0} x ${rawDim.height || 0}`
              : String(rawDim)
            const skusFit = row.skus_fit ?? row.fit_count ?? row.count ?? 0
            const fitPct = row.fit_pct ?? row.fit_percentage ?? row.pct ?? 0
            const colors = getFitColor(fitPct)

            return (
              <tr
                key={index}
                className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                    <span className="text-slate-200 font-medium">{name}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-right text-slate-400 font-mono text-xs">
                  {dimensions || '---'}
                </td>
                <td className="py-3 px-3 text-right text-slate-200">
                  {typeof skusFit === 'number' ? skusFit.toLocaleString() : skusFit}
                </td>
                <td className="py-3 px-3 text-right">
                  <span className={`badge ${colors.badge}`}>
                    {typeof fitPct === 'number' ? fitPct.toFixed(1) : fitPct}%
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${colors.bg}`}
                        style={{ width: `${Math.min(fitPct, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${colors.text} w-10 text-right`}>
                      {typeof fitPct === 'number' ? fitPct.toFixed(0) : fitPct}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Summary */}
      {sorted.length > 0 && (
        <div className="mt-4 p-3 bg-slate-700/30 rounded-lg">
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>80%+ Excellent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>60-80% Good</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span>40-60% Moderate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>&lt;40% Low</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
