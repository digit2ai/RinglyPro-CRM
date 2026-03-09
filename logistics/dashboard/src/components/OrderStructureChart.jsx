import React from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null

  return (
    <div className="tooltip-chart">
      <p className="font-medium text-slate-200 mb-1">{label} lines per order</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.name === 'Cumulative %'
            ? `${entry.value?.toFixed(1)}%`
            : entry.value?.toLocaleString()
          }
        </p>
      ))}
    </div>
  )
}

export default function OrderStructureChart({ data = [] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No order structure data available</p>
      </div>
    )
  }

  // Ensure data has cumulative percentage
  const chartData = data.map((item, index) => {
    const totalOrders = data.reduce((sum, d) => sum + (d.count || d.orders || 0), 0)
    const cumulativeOrders = data
      .slice(0, index + 1)
      .reduce((sum, d) => sum + (d.count || d.orders || 0), 0)

    return {
      ...item,
      bin: item.bin || item.lines_per_order || item.label || `${index + 1}`,
      count: item.count || item.orders || 0,
      cumulative_pct: item.cumulative_pct !== undefined
        ? item.cumulative_pct
        : totalOrders > 0
          ? (cumulativeOrders / totalOrders) * 100
          : 0
    }
  })

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="bin"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={{ stroke: '#475569' }}
          tickLine={{ stroke: '#475569' }}
          label={{ value: 'Lines per Order', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 11 }}
        />
        <YAxis
          yAxisId="left"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={{ stroke: '#475569' }}
          tickLine={{ stroke: '#475569' }}
          label={{ value: 'Orders', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={{ stroke: '#475569' }}
          tickLine={{ stroke: '#475569' }}
          tickFormatter={v => `${v}%`}
          label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', fill: '#64748b', fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '10px' }}
          formatter={value => <span className="text-slate-300 text-sm">{value}</span>}
        />
        <Bar
          yAxisId="left"
          dataKey="count"
          name="Orders"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
          maxBarSize={50}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulative_pct"
          name="Cumulative %"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ fill: '#f59e0b', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
