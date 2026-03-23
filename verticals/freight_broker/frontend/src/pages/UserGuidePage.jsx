import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const DEMO_FILES = [
  { name: 'Freight Broker', file: 'freight-broker-demo.csv', rows: 50, desc: 'Load history with margins, lanes, equipment' },
  { name: 'Asset Carrier', file: 'asset-carrier-demo.csv', rows: 25, desc: 'Fleet trucks with maintenance, insurance, ELD' },
  { name: '3PL', file: '3pl-demo.csv', rows: 40, desc: 'Multi-client shipments with modes, on-time' },
  { name: 'Fleet Operator', file: 'fleet-operator-demo.csv', rows: 20, desc: 'Driver roster with HOS, CDL, medical cards' },
  { name: 'Intermodal', file: 'intermodal-demo.csv', rows: 30, desc: 'Container/drayage with demurrage, rail carriers' },
  { name: 'Freight Forwarder', file: 'freight-forwarder-demo.csv', rows: 25, desc: 'International shipments with customs, Incoterms' },
]

function StepCard({ number, title, desc, action, actionLabel, accent = 'purple' }) {
  const colors = {
    purple: 'bg-purple-600 border-purple-500/30 hover:border-purple-500/60',
    blue: 'bg-freight-600 border-freight-500/30 hover:border-freight-500/60',
    green: 'bg-green-600 border-green-500/30 hover:border-green-500/60',
    orange: 'bg-orange-600 border-orange-500/30 hover:border-orange-500/60',
  }
  return (
    <div className={`bg-slate-800/60 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl ${colors[accent]?.split(' ')[0] || 'bg-purple-600'} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
          {number}
        </div>
        <div className="flex-1">
          <h3 className="text-white font-semibold mb-1">{title}</h3>
          <p className="text-sm text-slate-400 leading-relaxed mb-3">{desc}</p>
          {action && (
            <button
              onClick={action}
              className="px-4 py-2 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 text-xs font-semibold hover:bg-purple-600/30 transition-colors"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-slate-700/60">{title}</h2>
      {children}
    </div>
  )
}

export default function UserGuidePage() {
  const navigate = useNavigate()
  const [expandedFaq, setExpandedFaq] = useState(null)

  const faqs = [
    {
      q: 'What file formats does the ingestion wizard support?',
      a: 'CSV, JSON, and EDI (X12 204/210/214). The wizard auto-detects the format. For CSV files, any delimiter is supported. Column headers are fuzzy-matched against 500+ known field name aliases from 30+ TMS systems.',
    },
    {
      q: 'Does the scanner modify my data?',
      a: 'No. The OBD Scanner is read-only. It ingests a copy of your data for analysis. Your source systems (TMS, ELD, accounting) are never modified. All findings and prescriptions are stored in a separate diagnostic database.',
    },
    {
      q: 'What does the OBD Score mean?',
      a: 'The OBD Score (0-100) is a composite health index across all 7 diagnostic modules. 85+ is excellent, 70-84 is good, 50-69 needs attention, below 50 is critical. Each finding reduces the score based on its severity: critical (-15), warning (-8), advisory (-3).',
    },
    {
      q: 'How are monthly savings estimated?',
      a: 'Each finding includes an estimated monthly savings figure based on industry benchmarks and your actual data. For example, idle trucks are costed at ~$1,000/month each (insurance + depreciation + parking). These are estimates, not guarantees.',
    },
    {
      q: 'What are the 7 scan modules?',
      a: 'Load Operations (dead miles, win rate, lane concentration), Rate Intelligence (margins, market benchmarks), Fleet Utilization (idle trucks, dispatch coverage), Financial Health (revenue, AR aging, cost ratios), Compliance Risk (insurance, CDL, safety ratings), Driver Retention (HOS, medical cards, endorsements), Customer Health (shipper concentration, on-time delivery, volume trends).',
    },
    {
      q: 'What is a Prescription?',
      a: 'A prescription is an actionable recommendation tied to a diagnostic finding. Each prescription includes: numbered steps to resolve the issue, which FreightMind AI agent can automate it, which MCP tools are relevant, and the estimated ROI if implemented.',
    },
    {
      q: 'Can I run the scanner on a schedule?',
      a: 'Not yet in the current version. Scheduled scans (daily/weekly automated diagnostics) are planned for the Neural Intelligence tier. Currently, scans are run manually via the Run Scan page.',
    },
    {
      q: 'What TMS systems are supported out of the box?',
      a: 'The ingestion engine has pre-built profiles for: McLeod LoadMaster, TMW Suite, MercuryGate, Turvo, DAT, Truckstop, 123Loadboard, Samsara, Motive (KeepTruckin), and QuickBooks. For other systems, the fuzzy field matcher handles most CSV exports automatically.',
    },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">User Guide</h1>
        <p className="text-slate-400 text-sm">Learn how to use the FreightMind OBD Scanner to diagnose your freight operations and uncover savings opportunities.</p>
      </div>

      {/* Quick Start */}
      <Section title="Quick Start (5 minutes)">
        <div className="space-y-4">
          <StepCard
            number="1"
            title="Download a Demo File"
            desc="Pick the sample CSV that matches your business type. These contain realistic data designed to trigger meaningful diagnostic findings."
            accent="purple"
          />
          <div className="ml-14 grid grid-cols-2 sm:grid-cols-3 gap-2 -mt-2 mb-2">
            {DEMO_FILES.map(s => (
              <a
                key={s.file}
                href={`/freight_broker/samples/${s.file}`}
                download={s.file}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-600/40 hover:border-purple-500/40 hover:bg-slate-700/60 transition-all"
              >
                <svg className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <div>
                  <p className="text-[11px] font-medium text-white">{s.name}</p>
                  <p className="text-[9px] text-slate-500">{s.rows} rows</p>
                </div>
              </a>
            ))}
          </div>

          <StepCard
            number="2"
            title="Open the Ingestion Wizard"
            desc="Navigate to OBD Scanner > Ingestion Wizard. Select your business type in Step 1, skip Step 2 (data sources), then drag and drop your downloaded CSV file into the upload zone in Step 3."
            action={() => navigate('/obd/ingest')}
            actionLabel="Open Ingestion Wizard"
            accent="blue"
          />

          <StepCard
            number="3"
            title="Review Field Mapping"
            desc="The scanner auto-detects your column names and maps them to canonical fields. Green = high confidence (auto-mapped). Yellow = medium confidence (verify). Red = low confidence (select manually). Click 'Confirm Mapping' when satisfied."
            accent="blue"
          />

          <StepCard
            number="4"
            title="Run the OBD Scan"
            desc="Go to OBD Scanner > Run Scan. All 7 diagnostic modules are selected by default. Click 'Run Full Scan'. The scan analyzes your data in under 2 seconds and produces an OBD Score (0-100)."
            action={() => navigate('/obd/scan')}
            actionLabel="Go to Run Scan"
            accent="green"
          />

          <StepCard
            number="5"
            title="Review Findings and Prescriptions"
            desc="Each finding includes a severity level, detailed diagnostic (what happened and why), and a prescription (what to do about it, which AI agent handles it, and estimated monthly savings)."
            action={() => navigate('/obd/findings')}
            actionLabel="View Findings"
            accent="orange"
          />
        </div>
      </Section>

      {/* OBD Scanner Modules */}
      <Section title="The 7 Diagnostic Modules">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: 'Load Operations', code: 'LO', color: 'bg-blue-500', desc: 'Analyzes dead miles, load-to-truck ratio, quote win rate, lane concentration, and short-haul load mix.' },
            { name: 'Rate Intelligence', code: 'RI', color: 'bg-green-500', desc: 'Evaluates margins per load, negative margin loads, spot vs contract mix, and lanes priced below market benchmarks.' },
            { name: 'Fleet Utilization', code: 'FU', color: 'bg-yellow-500', desc: 'Identifies idle trucks, equipment mismatches, dispatch coverage gaps, and utilization patterns by day of week.' },
            { name: 'Financial Health', code: 'FH', color: 'bg-purple-500', desc: 'Monitors revenue volatility, carrier cost ratios, AR aging, and projects cash flow impact of outstanding invoices.' },
            { name: 'Compliance Risk', code: 'CR', color: 'bg-red-500', desc: 'Flags lapsed carrier insurance, low reliability scores, expired compliance documents, and items expiring within 30 days.' },
            { name: 'Driver Retention', code: 'DR', color: 'bg-orange-500', desc: 'Checks expired medical cards, CDL expiry, endorsement gaps (no HazMat), and HOS utilization rates across the roster.' },
            { name: 'Customer Health', code: 'CH', color: 'bg-cyan-500', desc: 'Detects shipper revenue concentration (top 3 > 60% = critical), volume trends, on-time delivery rates, and churn risk.' },
          ].map(m => (
            <div key={m.code} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center text-white text-xs font-bold`}>{m.code}</div>
                <h3 className="text-sm font-semibold text-white">{m.name}</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Severity Levels */}
      <Section title="Finding Severity Levels">
        <div className="space-y-3">
          {[
            { level: 'Critical', color: 'bg-red-500', impact: '-15 pts', desc: 'Immediate action required. Exposure to liability, direct financial loss, or regulatory violation.', example: 'Carriers with lapsed insurance, trucks overdue for DOT inspection.' },
            { level: 'Warning', color: 'bg-orange-500', impact: '-8 pts', desc: 'Attention within 24-48 hours. Trending toward a problem or below industry benchmarks.', example: 'Margins below 12%, driver medical cards expiring in 60 days.' },
            { level: 'Advisory', color: 'bg-yellow-500', impact: '-3 pts', desc: 'Optimization opportunity. Not urgent, but fixing it improves profitability or efficiency.', example: 'Rate benchmarks available for pricing optimization, lane diversification.' },
            { level: 'Info', color: 'bg-blue-500', impact: '0 pts', desc: 'FYI. No action needed, or data quality note (missing tables, scan errors).', example: 'No load data found for a module, scan encountered a schema mismatch.' },
          ].map(s => (
            <div key={s.level} className="flex items-start gap-4 bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
              <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${s.color}`} />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-sm font-semibold text-white">{s.level}</span>
                  <span className="text-[10px] text-slate-500 font-mono">Score impact: {s.impact}</span>
                </div>
                <p className="text-xs text-slate-400 mb-1">{s.desc}</p>
                <p className="text-xs text-slate-500 italic">Example: {s.example}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* The OBD Metaphor */}
      <Section title="Why OBD Scanner?">
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-bold text-slate-300 mb-3">Vehicle OBD Scanner</h3>
              <div className="space-y-2">
                {[
                  'Plug into OBD-II port',
                  'Read trouble codes (DTCs)',
                  'Show live sensor data',
                  'Diagnose root cause',
                  'Recommend repair',
                  'Clear codes after fix',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="text-slate-600">{i + 1}.</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-purple-400 mb-3">FreightMind OBD Scanner</h3>
              <div className="space-y-2">
                {[
                  'Connect to your TMS / ELD / data',
                  'Scan 7 operational modules',
                  'Show real-time health dashboard',
                  'AI-powered root cause analysis',
                  'Prescribe agent solutions + ROI',
                  'Mark resolved, track improvement',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-purple-300">
                    <span className="text-purple-600">{i + 1}.</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Ingestion Profiles */}
      <Section title="Supported TMS / ELD Systems">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            'McLeod LoadMaster', 'TMW Suite', 'MercuryGate', 'Turvo', 'DAT',
            'Truckstop', '123Loadboard', 'Samsara', 'Motive', 'QuickBooks',
          ].map(name => (
            <div key={name} className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-center">
              <span className="text-xs text-slate-300 font-medium">{name}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">Pre-built column mapping profiles. For unlisted systems, the fuzzy matcher handles most CSV exports automatically.</p>
      </Section>

      {/* FAQ */}
      <Section title="Frequently Asked Questions">
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-slate-800/40 border border-slate-700/60 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-700/20 transition-colors"
              >
                <span className="text-sm font-medium text-white pr-4">{faq.q}</span>
                <svg
                  className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${expandedFaq === i ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {expandedFaq === i && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-slate-400 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <div className="bg-gradient-to-r from-purple-900/30 to-slate-800/60 border border-purple-500/20 rounded-xl p-8 text-center mb-8">
        <h2 className="text-xl font-bold text-white mb-2">Ready to scan your operations?</h2>
        <p className="text-sm text-slate-400 mb-6">Download a demo file, upload it, and see findings in under 60 seconds.</p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => navigate('/obd/ingest')}
            className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-colors"
          >
            Start Ingestion Wizard
          </button>
          <button
            onClick={() => navigate('/obd/scan')}
            className="px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium text-sm transition-colors"
          >
            Run a Scan
          </button>
        </div>
      </div>
    </div>
  )
}
