import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-medium text-slate-200 mb-1">Month {label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: ${(entry.value / 1e6).toFixed(2)}M
        </p>
      ))}
    </div>
  )
}

export default function BreakevenChart({ data = {} }) {
  const breakeven = data.breakeven_data || []
  const breakevenMonth = data.breakeven_month
  const tco = data.total_cost_of_ownership || {}

  if (!breakeven.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No financial data available</p>
      </div>
    )
  }

  // Show every 6th month label for readability
  const chartData = breakeven.map(d => ({
    ...d,
    cumulative_cost_m: d.cumulative_cost / 1e6,
    cumulative_benefit_m: d.cumulative_benefit / 1e6
  }))

  return (
    <div>
      {/* Breakeven Badge + TCO Summary */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {breakevenMonth && (
          <div className="bg-green-600/20 border border-green-500/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Breakeven</span>
            <p className="text-xl font-bold text-green-400">Month {breakevenMonth}</p>
          </div>
        )}
        {tco.total_5yr > 0 && (
          <div className="bg-slate-700/50 border border-slate-600/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">5-Year TCO</span>
            <p className="text-xl font-bold text-slate-200">${(tco.total_5yr / 1e6).toFixed(1)}M</p>
          </div>
        )}
      </div>

      {/* TCO Breakdown */}
      {tco.system_acquisition > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-4">
          {[
            { label: 'System', value: tco.system_acquisition, color: 'text-blue-400' },
            { label: 'Instruments', value: tco.instruments_5yr, color: 'text-violet-400' },
            { label: 'Service', value: tco.service_5yr, color: 'text-amber-400' },
            { label: 'Training', value: tco.training, color: 'text-cyan-400' },
            { label: 'Renovation', value: tco.renovation, color: 'text-rose-400' }
          ].map(item => (
            <div key={item.label} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase text-slate-500 font-bold">{item.label}</div>
              <div className={`text-sm font-bold ${item.color} mt-1`}>
                ${item.value > 0 ? (item.value / 1e6).toFixed(1) + 'M' : '0'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="month"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            tickFormatter={v => v % 6 === 0 ? `M${v}` : ''}
            label={{ value: 'Month', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            tickFormatter={v => `$${v.toFixed(0)}M`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={value => <span className="text-slate-300 text-sm">{value}</span>} />
          {breakevenMonth && (
            <ReferenceLine x={breakevenMonth} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Breakeven', fill: '#22c55e', fontSize: 10, position: 'top' }} />
          )}
          <Line type="monotone" dataKey="cumulative_cost" name="Cumulative Cost" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="cumulative_benefit" name="Cumulative Benefit" stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
