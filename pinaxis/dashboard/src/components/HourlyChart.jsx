import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null

  return (
    <div className="tooltip-chart">
      <p className="font-medium text-slate-200 mb-1">{`${String(label).padStart(2, '0')}:00 - ${String(label).padStart(2, '0')}:59`}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

// Color intensity based on value - peak hours get stronger blue
function getBarColor(value, maxValue) {
  if (!maxValue || !value) return '#1e3a8a'
  const ratio = value / maxValue
  if (ratio > 0.8) return '#3b82f6'
  if (ratio > 0.6) return '#2563eb'
  if (ratio > 0.4) return '#1d4ed8'
  if (ratio > 0.2) return '#1e40af'
  return '#1e3a8a'
}

export default function HourlyChart({ data = [] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No hourly data available</p>
      </div>
    )
  }

  // Normalize data
  const chartData = data.map(item => ({
    hour: item.hour !== undefined ? item.hour : item.label,
    orders: item.orders || item.count || 0,
    orderlines: item.orderlines || item.order_lines || 0,
    units: item.units || 0
  }))

  // Ensure all 24 hours are represented
  const fullDay = []
  for (let h = 0; h < 24; h++) {
    const existing = chartData.find(d => Number(d.hour) === h)
    fullDay.push(existing || { hour: h, orders: 0, orderlines: 0, units: 0 })
  }

  const maxOrders = Math.max(...fullDay.map(d => d.orders))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={fullDay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="hour"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={{ stroke: '#475569' }}
          tickLine={{ stroke: '#475569' }}
          tickFormatter={v => `${String(v).padStart(2, '0')}`}
          label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
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
        <Bar dataKey="orders" name="Orders" radius={[2, 2, 0, 0]} maxBarSize={20}>
          {fullDay.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getBarColor(entry.orders, maxOrders)}
            />
          ))}
        </Bar>
        <Bar
          dataKey="orderlines"
          name="Orderlines"
          fill="#8b5cf6"
          radius={[2, 2, 0, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
