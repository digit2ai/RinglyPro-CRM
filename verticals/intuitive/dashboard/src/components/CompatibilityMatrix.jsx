import React from 'react'

function getFitColor(pct) {
  if (pct >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' }
  if (pct >= 60) return { bg: 'bg-blue-500', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' }
  if (pct >= 40) return { bg: 'bg-amber-500', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' }
  if (pct >= 20) return { bg: 'bg-orange-500', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' }
  return { bg: 'bg-red-500', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' }
}

function FitBar({ value }) {
  const colors = getFitColor(value)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colors.bg}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-medium ${colors.text} w-8 text-right`}>{value}</span>
    </div>
  )
}

export default function CompatibilityMatrix({ data = {} }) {
  const matrix = data.compatibility_matrix || []
  const averages = data.model_averages || {}
  const bestModel = data.overall_best_model
  const bestScore = data.overall_best_score

  if (!matrix.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No compatibility data available</p>
      </div>
    )
  }

  return (
    <div>
      {/* Overall Best Model */}
      {bestModel && (
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-emerald-600/20 border border-emerald-500/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Best Overall Fit</span>
            <p className="text-lg font-bold text-emerald-400">da Vinci {bestModel === 'dV5' ? '5' : bestModel}</p>
          </div>
          <p className="text-sm text-slate-400">
            Average fit score: {bestScore}% across all procedures
          </p>
        </div>
      )}

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2.5 px-3 text-slate-400 font-medium">Procedure</th>
              <th className="text-left py-2.5 px-3 text-slate-400 font-medium w-10">Spec</th>
              <th className="text-center py-2.5 px-3 text-slate-400 font-medium min-w-[100px]">dV5</th>
              <th className="text-center py-2.5 px-3 text-slate-400 font-medium min-w-[100px]">Xi</th>
              <th className="text-center py-2.5 px-3 text-slate-400 font-medium min-w-[100px]">X</th>
              <th className="text-center py-2.5 px-3 text-slate-400 font-medium min-w-[100px]">SP</th>
              <th className="text-center py-2.5 px-3 text-slate-400 font-medium">Best</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="py-3 px-3 text-slate-200 font-medium text-xs">{row.procedure}</td>
                <td className="py-3 px-3">
                  <span className="text-[10px] uppercase text-slate-500 font-bold">{row.specialty?.replace('_', ' ')}</span>
                </td>
                <td className="py-3 px-3"><FitBar value={row.dV5_fit} /></td>
                <td className="py-3 px-3"><FitBar value={row.Xi_fit} /></td>
                <td className="py-3 px-3"><FitBar value={row.X_fit} /></td>
                <td className="py-3 px-3"><FitBar value={row.SP_fit} /></td>
                <td className="py-3 px-3 text-center">
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                    {row.recommended_model === 'dV5' ? 'dV5' : row.recommended_model}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Model Averages */}
      {Object.keys(averages).length > 0 && (
        <div className="mt-4 p-3 bg-slate-700/30 rounded-lg">
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Avg Fit:</span>
            {Object.entries(averages).map(([model, score]) => {
              const colors = getFitColor(score)
              return (
                <div key={model} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                  <span>{model}: <span className={`font-bold ${colors.text}`}>{score}%</span></span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
