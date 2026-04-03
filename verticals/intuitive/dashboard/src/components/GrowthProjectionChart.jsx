import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-medium text-slate-200 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toLocaleString()} cases
        </p>
      ))}
    </div>
  )
}

export default function GrowthProjectionChart({ data = {} }) {
  const chartData = data.chart_data || []
  const scenarios = data.scenarios || {}
  const specGrowth = data.specialty_growth || {}

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No growth projection data available</p>
      </div>
    )
  }

  return (
    <div>
      {/* Scenario Summary */}
      <div className="flex items-center gap-3 mb-4">
        {Object.entries(scenarios).map(([key, s]) => (
          <div key={key} className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] uppercase text-slate-500 font-bold">{s.label}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: s.color }}>
              {Math.round(s.growth_rate * 100)}% CAGR
            </div>
          </div>
        ))}
        {data.base_year_cases > 0 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] uppercase text-slate-500 font-bold">Base Year</div>
            <div className="text-sm font-bold text-white mt-0.5">{data.base_year_cases?.toLocaleString()} cases</div>
          </div>
        )}
      </div>

      {/* Multi-scenario Line Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="year"
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
          <Line
            type="monotone"
            dataKey="conservative"
            name="Conservative (10%)"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#94a3b8', r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline (15%)"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ fill: '#3b82f6', r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="aggressive"
            name="Aggressive (20%)"
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#22c55e', r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Specialty Growth Table */}
      {Object.keys(specGrowth).length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">Specialty Growth Projections</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(specGrowth).map(([spec, g]) => (
              <div key={spec} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                <div className="text-[10px] uppercase text-slate-500 font-bold">{spec.replace('_', ' ')}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-sm text-slate-400">{g.current}</span>
                  <span className="text-slate-600">-&gt;</span>
                  <span className="text-sm font-bold text-emerald-400">{g.year5}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{g.cagr_pct}% CAGR</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
