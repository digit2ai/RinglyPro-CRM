import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFindings } from '../lib/api'

const MODULE_LABELS = {
  load_operations: 'Load Operations',
  rate_intelligence: 'Rate Intelligence',
  fleet_utilization: 'Fleet Utilization',
  financial_health: 'Financial Health',
  compliance_risk: 'Compliance Risk',
  driver_retention: 'Driver Retention',
  customer_health: 'Customer Health',
}

const DEMO_PRESCRIPTIONS = [
  {
    id: 'f1',
    title: 'Dead mile ratio exceeds 35% on I-95 corridor',
    module: 'load_operations',
    severity: 'critical',
    status: 'open',
    estimated_monthly_savings: 8200,
    savings_confidence: 'high',
    recommended_agent: 'LoadOptimizer Agent',
    prescription: [
      'Activate DAT Power lane alerts for BOS-to-NWK loads with rate floor of $2.20/mile',
      'Contact top 3 Boston-area shippers for southbound contract lanes',
      'Consider triangulating through Hartford where load density is 40% higher',
    ],
  },
  {
    id: 'f8',
    title: 'Win rate declined 15% month-over-month',
    module: 'load_operations',
    severity: 'warning',
    status: 'open',
    estimated_monthly_savings: 6700,
    savings_confidence: 'medium',
    recommended_agent: 'LoadOptimizer Agent',
    prescription: [
      'Review pricing engine rules -- current floor rates may be too aggressive',
      'Analyze lost loads by lane to identify pattern',
      'Enable real-time rate adjustment via MCP tool: dynamic_rate',
    ],
  },
  {
    id: 'f3',
    title: 'Spot rate margin below market on DAL-HOU lane',
    module: 'rate_intelligence',
    severity: 'warning',
    status: 'open',
    estimated_monthly_savings: 4500,
    savings_confidence: 'medium',
    recommended_agent: 'RateOptimizer Agent',
    prescription: [
      'Increase spot rate floor for DAL-HOU to $2.10/mile minimum',
      'Negotiate volume contract with top 2 DAL-HOU shippers at $2.05/mile',
    ],
  },
  {
    id: 'f5',
    title: 'Fleet utilization drops 28% on Fridays',
    module: 'fleet_utilization',
    severity: 'advisory',
    status: 'open',
    estimated_monthly_savings: 3100,
    savings_confidence: 'medium',
    recommended_agent: 'FleetOptimizer Agent',
    prescription: [
      'Shift Friday maintenance windows to Tuesday/Wednesday',
      'Offer Friday rate incentives to increase load volume',
    ],
  },
  {
    id: 'f6',
    title: 'AR aging: 18 invoices past 60 days ($47K outstanding)',
    module: 'financial_health',
    severity: 'advisory',
    status: 'in_progress',
    estimated_monthly_savings: 2300,
    savings_confidence: 'low',
    recommended_agent: 'BillingAgent',
    prescription: [
      'Escalate top 5 overdue accounts to collections workflow',
      'Implement automated 30/60/90-day dunning via billing automation',
    ],
  },
  {
    id: 'f7',
    title: 'Driver HOS utilization averaging 72% (industry avg 78%)',
    module: 'driver_retention',
    severity: 'info',
    status: 'open',
    estimated_monthly_savings: 1800,
    savings_confidence: 'low',
    recommended_agent: 'DriverAgent',
    prescription: [
      'Review dispatch patterns for HOS optimization opportunities',
      'Match driver lane preferences to reduce rejection rate',
    ],
  },
]

export default function PrescriptionsPage() {
  const navigate = useNavigate()
  const [findings, setFindings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFindings()
  }, [])

  async function loadFindings() {
    setLoading(true)
    try {
      const result = await getFindings({ status: 'open' })
      if (result.findings && result.findings.length > 0) {
        const withPrescriptions = result.findings.filter(f => f.prescription && f.estimated_monthly_savings)
        if (withPrescriptions.length > 0) {
          setFindings(withPrescriptions)
          setLoading(false)
          return
        }
      }
      setFindings(DEMO_PRESCRIPTIONS)
    } catch {
      setFindings(DEMO_PRESCRIPTIONS)
    }
    setLoading(false)
  }

  const totalSavings = findings.reduce((sum, f) => sum + (f.estimated_monthly_savings || 0), 0)
  const sorted = [...findings].sort((a, b) => (b.estimated_monthly_savings || 0) - (a.estimated_monthly_savings || 0))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Total ROI Card */}
      <div className="bg-gradient-to-r from-purple-900/40 to-slate-800/60 border border-purple-500/30 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">Total Projected Monthly ROI</p>
            <p className="text-4xl font-bold text-white">${totalSavings.toLocaleString()}<span className="text-lg text-slate-400 font-normal">/mo</span></p>
            <p className="text-xs text-slate-400 mt-1">If all {sorted.length} prescriptions are implemented</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-400">${(totalSavings * 12).toLocaleString()}</p>
            <p className="text-xs text-slate-500">Annualized savings</p>
          </div>
        </div>
      </div>

      {/* Prescriptions List */}
      <h2 className="text-lg font-bold text-white mb-4">Prescriptions by ROI</h2>
      <div className="space-y-4">
        {sorted.map((f, idx) => (
          <div
            key={f.id}
            className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all cursor-pointer"
            onClick={() => navigate(`/obd/findings/${f.id}`)}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-600 font-mono">#{idx + 1}</span>
                  <span className={`w-2 h-2 rounded-full ${
                    f.severity === 'critical' ? 'bg-red-500' :
                    f.severity === 'warning' ? 'bg-orange-500' :
                    f.severity === 'advisory' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                </div>
                <p className="text-xs text-slate-500">{MODULE_LABELS[f.module] || f.module}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="px-3 py-1 rounded-lg text-sm font-bold bg-green-500/15 text-green-400">
                  ${f.estimated_monthly_savings?.toLocaleString()}/mo
                </span>
                {f.savings_confidence && (
                  <span className={`text-[10px] font-semibold capitalize ${
                    f.savings_confidence === 'high' ? 'text-green-500' :
                    f.savings_confidence === 'medium' ? 'text-yellow-500' : 'text-orange-500'
                  }`}>
                    {f.savings_confidence}
                  </span>
                )}
              </div>
            </div>

            {/* Prescription Preview */}
            {f.prescription && (
              <div className="ml-6 border-l-2 border-purple-600/30 pl-4 space-y-1.5">
                {f.prescription.slice(0, 3).map((step, stepIdx) => (
                  <p key={stepIdx} className="text-xs text-slate-400 leading-relaxed">
                    <span className="text-purple-500 font-semibold mr-1">{stepIdx + 1}.</span>
                    {step}
                  </p>
                ))}
                {f.prescription.length > 3 && (
                  <p className="text-[10px] text-slate-600">+{f.prescription.length - 3} more steps</p>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/40">
              {f.recommended_agent && (
                <span className="text-[10px] text-purple-400 font-medium">Agent: {f.recommended_agent}</span>
              )}
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                f.status === 'open' ? 'bg-slate-600/40 text-slate-400' :
                f.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-green-500/20 text-green-400'
              }`}>
                {f.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
