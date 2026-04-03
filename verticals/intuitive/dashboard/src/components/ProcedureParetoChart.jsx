import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-medium text-slate-200 mb-1 text-sm">
        {point.procedure_name || `${point.cumulative_items_pct?.toFixed(1)}% of procedures`}
      </p>
      <p className="text-sm text-blue-400">
        Covers {point.cumulative_volume_pct?.toFixed(1)}% of volume
      </p>
      {point.abc_class && (
        <p className="text-xs text-slate-400 mt-1">Class: {point.abc_class}</p>
      )}
    </div>
  )
}

export default function ProcedureParetoChart({ data = {} }) {
  const lorenzPoints = data.lorenz_curve || []
  const gini = data.gini_coefficient
  const rawClasses = data.classes || {}
  const abcSummary = typeof rawClasses === 'object' && !Array.isArray(rawClasses)
    ? Object.entries(rawClasses).map(([key, val]) => ({
        class: key,
        count: val.count || 0,
        pct: val.pct || 0,
        volume_pct: val.volume_pct || 0
      }))
    : Array.isArray(rawClasses) ? rawClasses : []

  if (!lorenzPoints.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No procedure data available</p>
      </div>
    )
  }

  const chartData = lorenzPoints.map(pt => ({
    cumulative_items_pct: pt.cumulative_items_pct ?? 0,
    cumulative_volume_pct: pt.cumulative_volume_pct ?? 0,
    procedure_name: pt.procedure_name || '',
    abc_class: pt.abc_class || '',
    equality: pt.cumulative_items_pct ?? 0
  }))

  if (chartData[0]?.cumulative_items_pct > 0) {
    chartData.unshift({ cumulative_items_pct: 0, cumulative_volume_pct: 0, procedure_name: '', abc_class: '', equality: 0 })
  }

  return (
    <div>
      {/* Gini Coefficient Badge */}
      {gini !== undefined && gini !== null && (
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-intuitive-600/20 border border-intuitive-500/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Gini Coefficient</span>
            <p className="text-xl font-bold text-intuitive-400">
              {typeof gini === 'number' ? gini.toFixed(3) : gini}
            </p>
          </div>
          <p className="text-sm text-slate-400">
            {gini > 0.7 ? 'High concentration -- a few procedures drive most volume' :
             gini > 0.4 ? 'Moderate concentration in procedure activity' :
             'Relatively even distribution across procedures'}
          </p>
        </div>
      )}

      {/* Lorenz Curve */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="cumulative_items_pct"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            domain={[0, 100]}
            tickFormatter={v => `${v}%`}
            label={{ value: '% of Procedures', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            tickFormatter={v => `${v}%`}
            label={{ value: '% of Volume', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="linear"
            dataKey="equality"
            stroke="#475569"
            strokeDasharray="5 5"
            strokeWidth={1}
            dot={false}
            name="Perfect Equality"
          />
          <Line
            type="monotone"
            dataKey="cumulative_volume_pct"
            stroke="#7c3aed"
            strokeWidth={2.5}
            dot={{ fill: '#7c3aed', r: 2 }}
            activeDot={{ r: 5, fill: '#a78bfa' }}
            name="Lorenz Curve"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* ABC Summary Table */}
      {abcSummary.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">ABC Classification</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Class</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">Procedures</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">% of Types</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">% of Volume</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {abcSummary.map((cls, index) => {
                  const className = cls.class || `Class ${index + 1}`
                  const barColor = className === 'A' ? '#22c55e' : className === 'B' ? '#eab308' : '#6b7280'
                  return (
                    <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md font-bold text-sm ${
                          className === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                          className === 'B' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-600/30 text-slate-400'
                        }`}>
                          {className}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{cls.count}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{(cls.pct || 0).toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{(cls.volume_pct || 0).toFixed(1)}%</td>
                      <td className="py-2.5 px-3">
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(cls.volume_pct || 0, 100)}%`, backgroundColor: barColor }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
