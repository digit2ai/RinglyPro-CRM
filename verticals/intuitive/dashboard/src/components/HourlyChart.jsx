import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-medium text-slate-200 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}{entry.dataKey === 'or_utilization_pct' ? '%' : ''}
        </p>
      ))}
    </div>
  )
}

export default function HourlyChart({ data = {} }) {
  const hourly = data.hourly_data || []

  if (!hourly.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No hourly data available</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        {data.peak_hour && (
          <div className="bg-amber-600/20 border border-amber-500/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Peak Hour</span>
            <p className="text-lg font-bold text-amber-400">{data.peak_hour}</p>
          </div>
        )}
        {data.first_case_start && (
          <p className="text-sm text-slate-400">
            Operating window: {data.first_case_start} - {data.last_case_end}
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={hourly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="utilGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="hour"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="or_utilization_pct"
            name="OR Utilization"
            stroke="#7c3aed"
            strokeWidth={2.5}
            fill="url(#utilGradient)"
            dot={{ fill: '#7c3aed', r: 3 }}
            activeDot={{ r: 5, fill: '#a78bfa' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
