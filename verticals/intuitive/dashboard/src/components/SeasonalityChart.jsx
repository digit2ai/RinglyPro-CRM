import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
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

function getBarColor(value, mean) {
  if (!mean) return '#3b82f6'
  const ratio = value / mean
  if (ratio > 1.1) return '#22c55e'
  if (ratio > 0.95) return '#3b82f6'
  if (ratio > 0.8) return '#f59e0b'
  return '#ef4444'
}

export default function SeasonalityChart({ data = {} }) {
  const monthly = data.monthly_data || []
  const cov = data.coefficient_of_variation
  const seasonClass = data.seasonality_class
  const seasonLabel = data.seasonality_label

  if (!monthly.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No seasonality data available</p>
      </div>
    )
  }

  const mean = monthly.reduce((s, m) => s + m.cases, 0) / monthly.length

  return (
    <div>
      {/* CoV Badge */}
      <div className="flex items-center gap-3 mb-4">
        {cov !== undefined && (
          <div className="bg-intuitive-600/20 border border-intuitive-500/30 rounded-lg px-4 py-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">CoV</span>
            <p className="text-xl font-bold text-intuitive-400">{cov}%</p>
          </div>
        )}
        {seasonClass && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
            seasonClass === 'X' ? 'bg-green-900/40 text-green-300 border-green-700' :
            seasonClass === 'Y' ? 'bg-amber-900/40 text-amber-300 border-amber-700' :
            'bg-red-900/40 text-red-300 border-red-700'
          }`}>
            Class {seasonClass} -- {seasonLabel}
          </div>
        )}
        <p className="text-sm text-slate-400">
          {seasonClass === 'X' ? 'Stable volume throughout the year' :
           seasonClass === 'Y' ? 'Moderate seasonal variation -- plan staffing accordingly' :
           'High variability -- consider flexible staffing model'}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="month"
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
          <Bar dataKey="cases" name="Total Cases" radius={[3, 3, 0, 0]} maxBarSize={35}>
            {monthly.map((entry, index) => (
              <Cell key={index} fill={getBarColor(entry.cases, mean)} />
            ))}
          </Bar>
          <Bar dataKey="robotic_cases" name="Robotic Cases" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={35} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
