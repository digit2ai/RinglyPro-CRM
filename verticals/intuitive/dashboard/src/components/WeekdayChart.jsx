import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-medium text-slate-200 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export default function WeekdayChart({ data = {} }) {
  const weekday = data.weekday_data || []

  if (!weekday.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No weekday data available</p>
      </div>
    )
  }

  return (
    <div>
      {data.peak_day && (
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Peak Day</span>
            <p className="text-lg font-bold text-blue-400">{data.peak_day}</p>
          </div>
          <p className="text-sm text-slate-400">
            {data.operating_days_per_week} operating days per week
          </p>
        </div>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={weekday} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="day"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={value => <span className="text-slate-300 text-sm">{value}</span>} />
          <Bar dataKey="cases" name="Total Cases" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={40} />
          <Bar dataKey="robotic_cases" name="Robotic Cases" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
