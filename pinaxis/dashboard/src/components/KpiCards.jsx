import React from 'react'

const KPI_CONFIG = [
  {
    key: 'total_skus',
    label: 'Total SKUs',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
    format: 'number',
    color: 'from-blue-500/20 to-blue-600/10',
    iconColor: 'text-blue-400'
  },
  {
    key: 'active_skus',
    label: 'Active SKUs',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    format: 'number',
    color: 'from-emerald-500/20 to-emerald-600/10',
    iconColor: 'text-emerald-400'
  },
  {
    key: 'bin_capable_pct',
    label: 'Bin-Capable %',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    format: 'percent',
    color: 'from-violet-500/20 to-violet-600/10',
    iconColor: 'text-violet-400'
  },
  {
    key: 'total_orders',
    label: 'Total Orders',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    format: 'number',
    color: 'from-amber-500/20 to-amber-600/10',
    iconColor: 'text-amber-400'
  },
  {
    key: 'total_orderlines',
    label: 'Total Orderlines',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    format: 'number',
    color: 'from-cyan-500/20 to-cyan-600/10',
    iconColor: 'text-cyan-400'
  },
  {
    key: 'total_units',
    label: 'Total Units',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
      </svg>
    ),
    format: 'number',
    color: 'from-rose-500/20 to-rose-600/10',
    iconColor: 'text-rose-400'
  },
  {
    key: 'date_range',
    label: 'Date Range',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    format: 'text',
    color: 'from-indigo-500/20 to-indigo-600/10',
    iconColor: 'text-indigo-400'
  },
  {
    key: 'avg_lines_per_order',
    label: 'Avg Lines/Order',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
    format: 'decimal',
    color: 'from-teal-500/20 to-teal-600/10',
    iconColor: 'text-teal-400'
  }
]

function formatValue(value, format) {
  if (value === undefined || value === null) return '---'

  switch (format) {
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value)
    case 'percent':
      return `${typeof value === 'number' ? value.toFixed(1) : value}%`
    case 'decimal':
      return typeof value === 'number' ? value.toFixed(2) : String(value)
    case 'text':
      return String(value)
    default:
      return String(value)
  }
}

export default function KpiCards({ data = {} }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {KPI_CONFIG.map(kpi => {
        const value = data[kpi.key]
        return (
          <div
            key={kpi.key}
            className={`bg-gradient-to-br ${kpi.color} bg-slate-800 border border-slate-700/50 rounded-xl p-5 transition-all duration-200 hover:border-slate-600`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={kpi.iconColor}>{kpi.icon}</div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                {kpi.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-white">
              {formatValue(value, kpi.format)}
            </p>
          </div>
        )
      })}
    </div>
  )
}
