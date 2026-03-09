import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

export default function WeekdayChart({ data = [] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No weekday data available</p>
      </div>
    )
  }

  // Normalize the data to consistent format
  const chartData = data.map(item => ({
    day: item.day || item.weekday || item.label,
    orders: item.orders || item.count || 0,
    orderlines: item.orderlines || item.order_lines || 0,
    units: item.units || 0
  }))

  // Sort by weekday order if possible
  const sorted = [...chartData].sort((a, b) => {
    const aIdx = WEEKDAY_ORDER.findIndex(d => a.day?.startsWith(d))
    const bIdx = WEEKDAY_ORDER.findIndex(d => b.day?.startsWith(d))
    if (aIdx === -1 && bIdx === -1) return 0
    if (aIdx === -1) return 1
    if (bIdx === -1) return -1
    return aIdx - bIdx
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={sorted} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={value => <span className="text-slate-300 text-sm">{value}</span>}
        />
        <Bar
          dataKey="orders"
          name="Orders"
          fill="#3b82f6"
          radius={[3, 3, 0, 0]}
          maxBarSize={35}
        />
        <Bar
          dataKey="orderlines"
          name="Orderlines"
          fill="#8b5cf6"
          radius={[3, 3, 0, 0]}
          maxBarSize={35}
        />
        <Bar
          dataKey="units"
          name="Units"
          fill="#06b6d4"
          radius={[3, 3, 0, 0]}
          maxBarSize={35}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
