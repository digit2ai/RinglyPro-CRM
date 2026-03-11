import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart
} from 'recharts'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="tooltip-chart">
      <p className="font-medium text-slate-200 mb-1">
        {point.cumulative_items_pct?.toFixed(1)}% of SKUs
      </p>
      <p className="text-sm text-blue-400">
        Account for {point.cumulative_volume_pct?.toFixed(1)}% of volume
      </p>
      {point.abc_class && (
        <p className="text-xs text-slate-400 mt-1">
          Class: {point.abc_class}
        </p>
      )}
    </div>
  )
}

export default function ABCLorenzCurve({ data = {} }) {
  const lorenzPoints = data.lorenz_curve || data.lorenz || []
  const gini = data.gini_coefficient ?? data.gini
  const rawSummary = data.abc_summary || data.classes || []
  // Convert object {A: {...}, B: {...}} to array [{class: 'A', ...}, ...]
  const abcSummary = Array.isArray(rawSummary)
    ? rawSummary
    : typeof rawSummary === 'object' && rawSummary !== null
      ? Object.entries(rawSummary).map(([key, val]) => ({
          class: key,
          count: val.count || 0,
          sku_pct: val.pct || 0,
          volume_pct: val.volume_pct || 0
        }))
      : []

  if (!lorenzPoints.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No ABC analysis data available</p>
      </div>
    )
  }

  // Normalize lorenz data
  const chartData = lorenzPoints.map(pt => ({
    cumulative_items_pct: pt.cumulative_items_pct ?? pt.x ?? pt.items_pct ?? 0,
    cumulative_volume_pct: pt.cumulative_volume_pct ?? pt.y ?? pt.volume_pct ?? 0,
    abc_class: pt.abc_class || pt.class || ''
  }))

  // Ensure starts at 0,0
  if (chartData[0]?.cumulative_items_pct > 0) {
    chartData.unshift({ cumulative_items_pct: 0, cumulative_volume_pct: 0, abc_class: '' })
  }

  // Generate diagonal reference points
  const diagonal = Array.from({ length: 11 }, (_, i) => ({
    cumulative_items_pct: i * 10,
    equality: i * 10
  }))

  // Merge diagonal into chart data for overlay
  const mergedData = chartData.map(pt => {
    const eqValue = pt.cumulative_items_pct
    return { ...pt, equality: eqValue }
  })

  return (
    <div>
      {/* Gini Coefficient */}
      {gini !== undefined && gini !== null && (
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-logistics-600/20 border border-logistics-500/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Gini Coefficient</span>
            <p className="text-xl font-bold text-logistics-400">
              {typeof gini === 'number' ? gini.toFixed(3) : gini}
            </p>
          </div>
          <p className="text-sm text-slate-400">
            {gini > 0.7 ? 'High concentration - few SKUs drive most volume' :
             gini > 0.4 ? 'Moderate concentration in SKU activity' :
             'Relatively even distribution across SKUs'}
          </p>
        </div>
      )}

      {/* Lorenz Curve */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={mergedData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="cumulative_items_pct"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            domain={[0, 100]}
            tickFormatter={v => `${v}%`}
            label={{ value: '% of SKUs', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
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
          {/* Diagonal line - perfect equality */}
          <Line
            type="linear"
            dataKey="equality"
            stroke="#475569"
            strokeDasharray="5 5"
            strokeWidth={1}
            dot={false}
            name="Perfect Equality"
            legendType="none"
          />
          {/* Lorenz curve */}
          <Line
            type="monotone"
            dataKey="cumulative_volume_pct"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ fill: '#3b82f6', r: 2 }}
            activeDot={{ r: 5, fill: '#60a5fa' }}
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
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">SKUs</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">% of SKUs</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">% of Volume</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {abcSummary.map((cls, index) => {
                  const className = cls.class || cls.abc_class || cls.name || `Class ${index + 1}`
                  const skuCount = cls.sku_count || cls.skus || cls.count || 0
                  const skuPct = cls.sku_pct || cls.items_pct || 0
                  const volumePct = cls.volume_pct || cls.activity_pct || 0
                  const thresholdLabel = cls.threshold_label || null
                  const barColor = className === 'A' ? '#22c55e' :
                                   className === 'B' ? '#eab308' :
                                   className === 'D' ? '#ef4444' : '#6b7280'

                  return (
                    <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md font-bold text-sm ${
                          className === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                          className === 'B' ? 'bg-amber-500/20 text-amber-400' :
                          className === 'D' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-600/30 text-slate-400'
                        }`}>
                          {className}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{skuCount.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-slate-200">{skuPct.toFixed(1)}%</span>
                        {thresholdLabel && <p className="text-xs text-slate-500 mt-0.5">{thresholdLabel}</p>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{volumePct.toFixed(1)}%</td>
                      <td className="py-2.5 px-3">
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(volumePct, 100)}%`, backgroundColor: barColor }}
                          />
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
