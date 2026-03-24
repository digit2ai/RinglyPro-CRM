import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFinding, updateFinding } from '../lib/api'

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', label: 'CRITICAL' },
  warning: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: 'WARNING' },
  advisory: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', label: 'ADVISORY' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', label: 'INFO' },
}

const MODULE_LABELS = {
  load_operations: 'Load Operations',
  rate_intelligence: 'Rate Intelligence',
  fleet_utilization: 'Fleet Utilization',
  financial_health: 'Financial Health',
  compliance_risk: 'Compliance Risk',
  driver_retention: 'Driver Retention',
  customer_health: 'Customer Health',
}

const DEMO_FINDINGS = {
  f1: {
    id: 'f1',
    severity: 'critical',
    title: 'Dead mile ratio exceeds 35% on I-95 corridor',
    module: 'load_operations',
    category: 'Dead Miles',
    status: 'open',
    created_at: '2026-03-22T14:30:00Z',
    estimated_monthly_savings: 8200,
    savings_confidence: 'high',
    diagnostic: 'Analysis of 1,247 loads over the past 90 days shows that the I-95 NE corridor (NJ-CT-MA) has a dead mile ratio of 35.2%, significantly above the industry benchmark of 18-22%. This is driven by a pattern of one-way loads from Newark to Boston without corresponding backhauls. The carrier pool for this lane is paying an average of $2.85/mile loaded but absorbing $1.40/mile in dead miles on the return. This inefficiency costs approximately $8,200/month in avoidable empty miles.',
    prescription: [
      'Activate DAT Power lane alerts for BOS-to-NWK loads with rate floor of $2.20/mile',
      'Contact top 3 Boston-area shippers (identified in supporting data) for southbound contract lanes',
      'Consider triangulating through Hartford (HFD) where load density is 40% higher',
      'Set up automated load matching for NE corridor returns via MCP tool: match_backhaul',
      'Review carrier contracts for NE corridor and add deadhead reimbursement clauses'
    ],
    recommended_agent: 'LoadOptimizer Agent',
    recommended_tools: ['match_backhaul', 'lane_analysis', 'rate_check', 'carrier_score'],
    supporting_data: {
      lane: 'NWK-BOS',
      total_loads: 187,
      dead_mile_ratio: 0.352,
      avg_loaded_rate: 2.85,
      avg_deadhead_cost: 1.40,
      monthly_deadhead_miles: 5857,
      top_boston_shippers: ['Acme Distribution', 'Northeast Freight Co', 'Harbor Logistics'],
      hartford_load_density: 0.40,
      period: '2025-12-22 to 2026-03-22'
    }
  },
  f2: {
    id: 'f2',
    severity: 'critical',
    title: '12 carriers operating with lapsed insurance',
    module: 'compliance_risk',
    category: 'Insurance Gaps',
    status: 'open',
    created_at: '2026-03-22T14:30:00Z',
    estimated_monthly_savings: null,
    savings_confidence: null,
    diagnostic: 'FMCSA cross-reference detected 12 active carriers in your network with insurance certificates that expired within the last 30 days. These carriers handled 34 loads in the current month. Operating with uninsured carriers exposes the brokerage to significant liability risk and potential FMCSA penalties.',
    prescription: [
      'Immediately suspend dispatching to all 12 flagged carriers',
      'Send automated certificate renewal requests via carrier portal',
      'Require updated COI before reactivation',
      'Implement automated insurance monitoring via MCP tool: monitor_carrier_compliance',
      'Add 30-day advance expiration alerts to carrier onboarding workflow'
    ],
    recommended_agent: 'Compliance Agent',
    recommended_tools: ['monitor_carrier_compliance', 'carrier_score', 'fmcsa_lookup'],
    supporting_data: {
      carriers_affected: 12,
      loads_at_risk: 34,
      earliest_lapse: '2026-02-28',
      latest_lapse: '2026-03-20',
      carrier_ids: ['MC-123456', 'MC-234567', 'MC-345678', 'MC-456789']
    }
  },
  f3: {
    id: 'f3',
    severity: 'warning',
    title: 'Spot rate margin below market on DAL-HOU lane',
    module: 'rate_intelligence',
    category: 'Margin Analysis',
    status: 'open',
    created_at: '2026-03-22T14:30:00Z',
    estimated_monthly_savings: 4500,
    savings_confidence: 'medium',
    diagnostic: 'Your average spot rate on DAL-HOU is $1.92/mile vs market average of $2.15/mile. This 10.7% discount is not justified by volume commitments. Over 62 loads/month on this lane, this represents $4,500 in foregone margin.',
    prescription: [
      'Increase spot rate floor for DAL-HOU to $2.10/mile minimum',
      'Negotiate volume contract with top 2 DAL-HOU shippers at $2.05/mile with 50-load commitment',
      'Review carrier cost basis — current carrier pay may be negotiable'
    ],
    recommended_agent: 'RateOptimizer Agent',
    recommended_tools: ['rate_check', 'lane_analysis', 'margin_calculator'],
    supporting_data: {
      lane: 'DAL-HOU',
      your_avg_rate: 1.92,
      market_avg_rate: 2.15,
      monthly_loads: 62,
      margin_gap_pct: 10.7
    }
  },
}

export default function FindingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [finding, setFinding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showTreatmentModal, setShowTreatmentModal] = useState(false)

  useEffect(() => {
    loadFinding()
  }, [id])

  async function loadFinding() {
    setLoading(true)
    try {
      const result = await getFinding(id)
      if (result && result.id) {
        setFinding(result)
      } else {
        setFinding(DEMO_FINDINGS[id] || DEMO_FINDINGS.f1)
      }
    } catch {
      setFinding(DEMO_FINDINGS[id] || DEMO_FINDINGS.f1)
    }
    setLoading(false)
  }

  async function handleStatusChange(newStatus) {
    setUpdating(true)
    try {
      await updateFinding(id, { status: newStatus })
      setFinding(prev => ({ ...prev, status: newStatus }))
    } catch {
      setFinding(prev => ({ ...prev, status: newStatus }))
    }
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!finding) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Finding not found.</p>
        <button onClick={() => navigate('/obd/findings')} className="text-purple-400 text-sm mt-2 hover:underline">Back to Findings</button>
      </div>
    )
  }

  const sev = SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate('/obd/findings')}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-purple-400 transition-colors mb-4"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Findings
      </button>

      {/* Severity Banner */}
      <div className={`${sev.bg} ${sev.border} border rounded-xl p-4 mb-6`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-lg text-xs font-bold ${sev.text} bg-black/20`}>{sev.label}</span>
            <h1 className="text-lg font-bold text-white">{finding.title}</h1>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
            finding.status === 'open' ? 'bg-slate-600/40 text-slate-400' :
            finding.status === 'acknowledged' ? 'bg-blue-500/20 text-blue-400' :
            finding.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            {finding.status.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
          <span>{MODULE_LABELS[finding.module] || finding.module}</span>
          <span className="text-slate-600">|</span>
          <span>{finding.category}</span>
          <span className="text-slate-600">|</span>
          <span>{new Date(finding.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Diagnostic */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 mb-4">
        <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">Diagnostic</h2>
        <p className="text-sm text-slate-300 leading-relaxed">{finding.diagnostic}</p>
      </div>

      {/* Prescription */}
      {finding.prescription && finding.prescription.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 mb-4">
          <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">Prescription</h2>
          <ol className="space-y-2">
            {finding.prescription.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-600/30 text-purple-300 text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Agent + Tools + Savings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {finding.recommended_agent && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Recommended Agent</h3>
            <p className="text-sm font-semibold text-purple-300">{finding.recommended_agent}</p>
          </div>
        )}
        {finding.recommended_tools && finding.recommended_tools.length > 0 && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Recommended Tools</h3>
            <div className="flex flex-wrap gap-1.5">
              {finding.recommended_tools.map(t => (
                <span key={t} className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-700 text-slate-300">{t}</span>
              ))}
            </div>
          </div>
        )}
        {finding.estimated_monthly_savings && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Estimated Savings</h3>
            <p className="text-xl font-bold text-green-400">${finding.estimated_monthly_savings.toLocaleString()}<span className="text-sm font-normal text-slate-500">/mo</span></p>
            {finding.savings_confidence && (
              <span className={`text-[10px] font-semibold capitalize mt-1 inline-block ${
                finding.savings_confidence === 'high' ? 'text-green-500' :
                finding.savings_confidence === 'medium' ? 'text-yellow-500' : 'text-orange-500'
              }`}>
                {finding.savings_confidence} confidence
              </span>
            )}
          </div>
        )}
      </div>

      {/* Supporting Data */}
      {finding.supporting_data && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 mb-6">
          <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">Supporting Data</h2>
          <pre className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 font-mono overflow-x-auto">
            {JSON.stringify(finding.supporting_data, null, 2)}
          </pre>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-700/60">
        {finding.status === 'open' && (
          <button
            onClick={() => handleStatusChange('acknowledged')}
            disabled={updating}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Acknowledge
          </button>
        )}
        {(finding.status === 'open' || finding.status === 'acknowledged') && (
          <button
            onClick={() => setShowTreatmentModal(true)}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-600/20"
          >
            Start Treatment
          </button>
        )}
        {finding.status !== 'resolved' && (
          <button
            onClick={() => handleStatusChange('resolved')}
            disabled={updating}
            className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Mark Resolved
          </button>
        )}
      </div>

      {/* Treatment Modal */}
      {showTreatmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTreatmentModal(false)}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-0 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600/20 to-slate-800 border-b border-purple-500/20 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Activate Treatment</h3>
                  <p className="text-xs text-purple-400">AI-Powered Auto-Execution</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Treatment converts this prescription into <strong className="text-white">automated actions</strong> executed by the <strong className="text-purple-400">{finding.recommended_agent || 'FreightMind AI'}</strong> agent.
              </p>

              <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 mb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">What Treatment Does</p>
                <div className="space-y-2">
                  {[
                    'AI agent executes each prescription step automatically',
                    'Monitors results and adjusts in real-time',
                    'Tracks improvement metrics over 30 days',
                    'Auto-closes finding when target KPIs are met',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      <span className="text-sm text-slate-400">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {finding.estimated_monthly_savings > 0 && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-400 font-medium">Projected monthly savings</span>
                    <span className="text-xl font-bold text-green-400">${parseFloat(finding.estimated_monthly_savings).toLocaleString()}/mo</span>
                  </div>
                </div>
              )}

              <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 mb-5">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Available Plans</p>
                <div className="space-y-2">
                  {[
                    { plan: 'Project-Based', price: '$250/hour', desc: 'Digit2AI implements the automation' },
                    { plan: 'Treatment License', price: '$2,000/mo', desc: 'Self-service auto-execution enabled' },
                    { plan: 'Managed Service', price: '$5,000/mo', desc: 'Digit2AI operates the Treatment layer' },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <div>
                        <span className="text-sm text-white font-medium">{p.plan}</span>
                        <span className="text-xs text-slate-500 ml-2">{p.desc}</span>
                      </div>
                      <span className="text-sm text-purple-400 font-semibold">{p.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-700/60 flex items-center justify-between gap-3">
              <button
                onClick={() => setShowTreatmentModal(false)}
                className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
              >
                Close
              </button>
              <a
                href="https://ringlypro.com/demo"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-600/20"
              >
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
