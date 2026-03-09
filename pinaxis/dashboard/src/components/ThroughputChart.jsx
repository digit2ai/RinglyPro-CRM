import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const METRICS = [
  { key: 'orders', label: 'Orders', color: '#3b82f6' },
  { key: 'orderlines', label: 'Orderlines', color: '#8b5cf6' },
  { key: 'units', label: 'Units', color: '#06b6d4' }
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null

  return (
    <div className="tooltip-chart">
      <p className="font-medium text-slate-200 mb-1">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export default function ThroughputChart({ data = [] }) {
  const [activeMetrics, setActiveMetrics] = useState(['orders', 'orderlines'])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No throughput data available</p>
      </div>
    )
  }

  const chartData = data.map(item => ({
    ...item,
    month: item.month || item.label || item.period,
    orders: item.orders || 0,
    orderlines: item.orderlines || item.order_lines || 0,
    units: item.units || 0
  }))

  const toggleMetric = (key) => {
    setActiveMetrics(prev => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter(m => m !== key) : prev
      }
      return [...prev, key]
    })
  }

  return (
    <div>
      {/* Metric Toggle */}
      <div className="flex gap-2 mb-4">
        {METRICS.map(metric => (
          <button
            key={metric.key}
            onClick={() => toggleMetric(metric.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              activeMetrics.includes(metric.key)
                ? 'text-white shadow-sm'
                : 'bg-slate-700/50 text-slate-500 hover:text-slate-300'
            }`}
            style={activeMetrics.includes(metric.key) ? { backgroundColor: metric.color + '33', color: metric.color, borderWidth: 1, borderColor: metric.color + '55' } : {}}
          >
            {metric.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="horizontal" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="month"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={{ stroke: '#475569' }}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={value => <span className="text-slate-300 text-sm">{value}</span>}
          />
          {METRICS.filter(m => activeMetrics.includes(m.key)).map(metric => (
            <Bar
              key={metric.key}
              dataKey={metric.key}
              name={metric.label}
              fill={metric.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
