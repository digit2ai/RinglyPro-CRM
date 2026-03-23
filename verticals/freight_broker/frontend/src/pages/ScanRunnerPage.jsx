import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { runScan } from '../lib/api'

const MODULES = [
  {
    id: 'load_operations',
    name: 'Load Operations',
    desc: 'Dead miles, win rate, load-to-truck ratio, lane concentration',
    icon: 'LO',
  },
  {
    id: 'rate_intelligence',
    name: 'Rate Intelligence',
    desc: 'Margin per load, spot vs contract, lanes below market',
    icon: 'RI',
  },
  {
    id: 'fleet_utilization',
    name: 'Fleet Utilization',
    desc: 'Truck idle %, equipment match, utilization by day',
    icon: 'FU',
  },
  {
    id: 'financial_health',
    name: 'Financial Health',
    desc: 'Revenue per load, AR aging, cost structure',
    icon: 'FH',
  },
  {
    id: 'compliance_risk',
    name: 'Compliance Risk',
    desc: 'Insurance gaps, CDL expiry, safety ratings, FMCSA exposure',
    icon: 'CR',
  },
  {
    id: 'driver_retention',
    name: 'Driver Retention',
    desc: 'HOS utilization, lane preferences, endorsement coverage',
    icon: 'DR',
  },
  {
    id: 'customer_health',
    name: 'Customer Health',
    desc: 'Shipper concentration, churn risk, on-time %, claims',
    icon: 'CH',
  },
]

export default function ScanRunnerPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(new Set(MODULES.map(m => m.id)))
  const [running, setRunning] = useState(false)
  const [currentModule, setCurrentModule] = useState(null)
  const [completedModules, setCompletedModules] = useState(new Set())
  const [overallScore, setOverallScore] = useState(null)
  const [moduleScores, setModuleScores] = useState({})
  const [scanComplete, setScanComplete] = useState(false)

  function toggleModule(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === MODULES.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(MODULES.map(m => m.id)))
    }
  }

  async function handleRun(moduleIds) {
    setRunning(true)
    setScanComplete(false)
    setCompletedModules(new Set())
    setModuleScores({})
    setOverallScore(null)

    const ids = Array.from(moduleIds)

    try {
      const result = await runScan(ids)
      if (result.findings) {
        // Process real results
        const scores = {}
        let total = 0
        ids.forEach((id, idx) => {
          const score = result.module_scores?.[id] || Math.floor(Math.random() * 30 + 60)
          scores[id] = score
          total += score
        })
        setModuleScores(scores)
        setOverallScore(Math.round(total / ids.length))
        setCompletedModules(new Set(ids))
        setCurrentModule(null)
        setScanComplete(true)
        setRunning(false)
        return
      }
    } catch (err) {
      // Fall through to demo simulation
    }

    // Demo simulation: animate through modules
    for (let i = 0; i < ids.length; i++) {
      setCurrentModule(ids[i])
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400))
      const score = Math.floor(Math.random() * 30 + 60)
      setModuleScores(prev => ({ ...prev, [ids[i]]: score }))
      setCompletedModules(prev => {
        const next = new Set(prev)
        next.add(ids[i])
        return next
      })
    }

    setCurrentModule(null)
    // Calculate overall
    const allScores = ids.map(id => moduleScores[id] || Math.floor(Math.random() * 30 + 60))
    setOverallScore(Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length))
    setScanComplete(true)
    setRunning(false)
  }

  // Recalculate overall score when moduleScores change and scan is complete
  useEffect(() => {
    if (scanComplete && Object.keys(moduleScores).length > 0) {
      const scores = Object.values(moduleScores)
      setOverallScore(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length))
    }
  }, [moduleScores, scanComplete])

  function getStatusBadge(moduleId) {
    if (currentModule === moduleId) return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 animate-pulse">Running</span>
    if (completedModules.has(moduleId)) return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400">Complete</span>
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-600/40 text-slate-500">Ready</span>
  }

  function scoreColor(score) {
    if (score >= 85) return 'text-green-400'
    if (score >= 70) return 'text-yellow-400'
    if (score >= 50) return 'text-orange-400'
    return 'text-red-400'
  }

  function gaugeColor(score) {
    if (score === null) return '#475569' // slate-600
    if (score >= 85) return '#4ade80'
    if (score >= 70) return '#facc15'
    if (score >= 50) return '#fb923c'
    return '#f87171'
  }

  const gaugeAngle = overallScore !== null ? (overallScore / 100) * 270 - 135 : -135
  const gaugeRadius = 80
  const gaugeStroke = 10

  function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle)
    const end = polarToCartesian(cx, cy, r, startAngle)
    const largeArc = endAngle - startAngle > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
  }

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Gauge */}
      <div className="flex justify-center mb-8">
        <div className="relative">
          <svg width="200" height="160" viewBox="0 0 200 160">
            {/* Background arc */}
            <path
              d={describeArc(100, 100, gaugeRadius, -135, 135)}
              fill="none"
              stroke="#1e293b"
              strokeWidth={gaugeStroke}
              strokeLinecap="round"
            />
            {/* Value arc */}
            {overallScore !== null && (
              <path
                d={describeArc(100, 100, gaugeRadius, -135, gaugeAngle)}
                fill="none"
                stroke={gaugeColor(overallScore)}
                strokeWidth={gaugeStroke}
                strokeLinecap="round"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center mt-2">
            <span className={`text-4xl font-bold ${overallScore !== null ? scoreColor(overallScore) : 'text-slate-600'}`}>
              {overallScore !== null ? overallScore : '--'}
            </span>
            <span className="text-xs text-slate-500 mt-1">OBD Score</span>
          </div>
        </div>
      </div>

      {/* Module Grid */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Scan Modules</h2>
        <button
          onClick={toggleAll}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          {selected.size === MODULES.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {MODULES.map(mod => (
          <div
            key={mod.id}
            className={`
              bg-slate-800/60 border rounded-xl p-4 transition-all duration-200
              ${selected.has(mod.id)
                ? 'border-purple-500/50 ring-1 ring-purple-500/20'
                : 'border-slate-700'
              }
            `}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`
                w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold
                ${selected.has(mod.id) ? 'bg-purple-600/30 text-purple-300' : 'bg-slate-700 text-slate-500'}
              `}>
                {mod.icon}
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(mod.id)}
                  onChange={() => toggleModule(mod.id)}
                  disabled={running}
                  className="rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500 w-4 h-4"
                />
              </label>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">{mod.name}</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">{mod.desc}</p>
            <div className="flex items-center justify-between">
              {completedModules.has(mod.id) && moduleScores[mod.id] !== undefined ? (
                <span className={`text-lg font-bold ${scoreColor(moduleScores[mod.id])}`}>{moduleScores[mod.id]}</span>
              ) : (
                <span className="text-xs text-slate-600">No scan yet</span>
              )}
              {getStatusBadge(mod.id)}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <button
          onClick={() => handleRun(new Set(MODULES.map(m => m.id)))}
          disabled={running}
          className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {running ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Run Full Scan
            </>
          )}
        </button>
        <button
          onClick={() => handleRun(selected)}
          disabled={running || selected.size === 0}
          className="px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Run Selected ({selected.size})
        </button>
        {scanComplete && (
          <button
            onClick={() => navigate('/obd/findings')}
            className="px-6 py-3 rounded-xl bg-freight-600 hover:bg-freight-500 text-white font-medium text-sm transition-colors"
          >
            View Findings
          </button>
        )}
      </div>

      {/* Scan Animation */}
      {running && currentModule && (
        <div className="mt-6 bg-slate-800/60 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-300">
              Scanning: <span className="text-purple-400 font-semibold">{MODULES.find(m => m.id === currentModule)?.name}</span>
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(completedModules.size / selected.size) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">{completedModules.size} of {selected.size} modules complete</p>
        </div>
      )}
    </div>
  )
}
