import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

const sections = [
  { id: 'command-center', label: 'MCP Command Center' },
  { id: 'neural', label: 'Neural Intelligence' },
  { id: 'events', label: 'Event Automation' },
  { id: 'voice', label: 'Voice AI' }
]

function StatusBadge({ status }) {
  const colors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    building: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    planned: 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[status] || colors.planned}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function AgentCard({ name, tier, tools, description, status }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-white font-semibold text-sm">{name}</h4>
          <p className="text-xs text-slate-500 mt-0.5">Tier {tier} &middot; {tools} tools</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="text-slate-400 text-xs leading-relaxed">{description}</p>
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>
      {subtitle && <p className="text-slate-400 text-sm ml-11">{subtitle}</p>}
    </div>
  )
}

function CommandCenterSection() {
  return (
    <div>
      <SectionHeader
        title="MCP Command Center"
        subtitle="Central nervous system — routes every tool call, enforces tier access, logs everything."
      />

      {/* Architecture Diagram */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
        <h3 className="text-white font-semibold text-sm mb-4">Orchestrator Architecture</h3>
        <div className="font-mono text-xs text-slate-400 leading-relaxed whitespace-pre">
{`                    MCP SERVER ORCHESTRATOR
                   /pinaxis/mcp/tools/call
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    TIER CHECK       TOOL ROUTER       EVENT BUS
    "Does this       "Which agent       "Notify other
     tenant have      handles this       agents of
     access?"         tool?"             this event"
         │                │                │
         ▼                ▼                ▼
  ┌─────────────────────────────────────────────┐
  │               8 AI AGENTS                    │
  │  Tier 1: Warehouse Ops + OEE + Dock         │
  │  Tier 2: Inventory + Labor                   │
  │  Tier 3: Quality + Financial                 │
  │  Tier 4: Neural Intelligence                 │
  └─────────────────────────────────────────────┘`}
        </div>
      </div>

      {/* MCP Endpoints */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
        <h3 className="text-white font-semibold text-sm mb-4">MCP Server Endpoints</h3>
        <div className="space-y-2">
          {[
            { method: 'POST', path: '/pinaxis/mcp/tools/list', desc: 'List all tools (filtered by tenant tier)' },
            { method: 'POST', path: '/pinaxis/mcp/tools/call', desc: 'Execute a tool' },
            { method: 'POST', path: '/pinaxis/mcp/events', desc: 'Publish cross-tier events' },
            { method: 'GET', path: '/pinaxis/mcp/status', desc: 'System status (agents, tools, tiers)' },
            { method: 'GET', path: '/pinaxis/mcp/tiers', desc: 'Tier definitions and pricing' },
            { method: 'POST', path: '/pinaxis/mcp/tenants', desc: 'Onboard a new tenant' },
            { method: 'GET', path: '/pinaxis/mcp/tenants/:id', desc: 'Get tenant config & tier' }
          ].map((ep, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className={`px-2 py-0.5 rounded font-mono font-bold ${ep.method === 'POST' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                {ep.method}
              </span>
              <code className="text-slate-300 font-mono">{ep.path}</code>
              <span className="text-slate-500 ml-auto hidden sm:inline">{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Mesh */}
      <h3 className="text-white font-semibold text-sm mb-4">8 AI Agents &middot; 82+ MCP Tools</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgentCard name="Warehouse Operations" tier={1} tools={12} status="building"
          description="Continuous warehouse analytics — ABC classification, throughput trends, anomaly detection, peak analysis, volume forecasting." />
        <AgentCard name="OEE & Machine Intelligence" tier={1} tools={10} status="active"
          description="Real-time shop floor monitoring. OEE calculation, predictive maintenance, conveyor health, energy consumption." />
        <AgentCard name="Dock & Receiving" tier={1} tools={9} status="planned"
          description="Dock door scheduling, truck check-in, receiving workflows, yard visibility, carrier scorecards." />
        <AgentCard name="Inventory & Space Optimization" tier={2} tools={12} status="planned"
          description="Intelligent slotting, reorder points, dead stock detection, space utilization, layout simulation." />
        <AgentCard name="Labor & Workforce" tier={2} tools={10} status="planned"
          description="Picks/hour tracking, shift optimization, staffing forecasts, cost per pick, bottleneck detection." />
        <AgentCard name="Quality & Compliance" tier={3} tools={10} status="planned"
          description="Error rate tracking, regulatory compliance, damage reports, lot traceability, SLA performance." />
        <AgentCard name="Financial & ROI" tier={3} tools={10} status="building"
          description="Cost per order, ROI projections, revenue leakage detection, profitability analysis, contract generation." />
        <AgentCard name="Neural Intelligence" tier={4} tools={9} status="planned"
          description="The brain. Scheduled scans, diagnostics, prescriptions. Does NOT execute — that's Treatment (consulting upsell)." />
      </div>
    </div>
  )
}

function NeuralSection() {
  const severityLevels = [
    { level: 'critical', color: 'bg-red-500', meaning: 'Immediate action needed', example: 'OEE dropped below 50%, stockout imminent' },
    { level: 'warning', color: 'bg-orange-500', meaning: 'Attention within 24h', example: 'Error rate trending up 3 days straight' },
    { level: 'advisory', color: 'bg-yellow-500', meaning: 'Optimization opportunity', example: 'Slotting change could save 12% pick time' },
    { level: 'info', color: 'bg-blue-500', meaning: 'FYI, no action needed', example: 'Throughput up 8% vs. last month' }
  ]

  return (
    <div>
      <SectionHeader
        title="Neural Intelligence"
        subtitle="Diagnoses what happened & why. Prescribes what to do. Does NOT execute (that's Treatment)."
      />

      {/* Diagnostic Flow */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
        <h3 className="text-white font-semibold text-sm mb-4">Diagnostic &rarr; Prescription &rarr; Treatment</h3>
        <div className="space-y-4">
          <div className="border-l-2 border-green-500 pl-4">
            <p className="text-green-400 text-xs font-semibold mb-1">DIAGNOSTIC (included in Tier 4)</p>
            <p className="text-slate-300 text-xs italic">"Your pick error rate increased 340% on night shift this week. Root cause: 3 new hires in Zone C with no barcode scanner training."</p>
          </div>
          <div className="border-l-2 border-blue-500 pl-4">
            <p className="text-blue-400 text-xs font-semibold mb-1">PRESCRIPTION (included in Tier 4)</p>
            <p className="text-slate-300 text-xs italic">"1. Pair each new hire with a veteran for 2 shifts. 2. Enable scan-verify mode in Zone C. 3. Schedule 30-min refresher training before Thursday shift."</p>
          </div>
          <div className="border-l-2 border-purple-500 pl-4">
            <p className="text-purple-400 text-xs font-semibold mb-1">TREATMENT (consulting upsell &mdash; NOT included)</p>
            <p className="text-slate-300 text-xs italic">"Auto-enable scan-verify &rarr; Auto-schedule training &rarr; Auto-assign mentors &rarr; Auto-notify supervisors &rarr; Auto-track improvement &rarr; Auto-close finding."</p>
          </div>
        </div>
      </div>

      {/* Scan Schedule */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
        <h3 className="text-white font-semibold text-sm mb-4">Scan Schedule</h3>
        <div className="space-y-2">
          {[
            { scan: 'Operations (Tier 1)', freq: 'Daily', time: '6:00 AM' },
            { scan: 'Optimization (Tier 2)', freq: 'Daily', time: '7:00 AM' },
            { scan: 'Financial (Tier 3)', freq: 'Daily', time: '8:00 AM' },
            { scan: 'Full Diagnostic', freq: 'Weekly', time: 'Monday 5:00 AM' },
            { scan: 'Market Intelligence', freq: 'Every 4 hours', time: '—' }
          ].map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-slate-700/50 last:border-0">
              <span className="text-slate-300">{s.scan}</span>
              <div className="flex items-center gap-4">
                <span className="text-slate-500">{s.freq}</span>
                <span className="text-slate-400 font-mono w-28 text-right">{s.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Severity Levels */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6">
        <h3 className="text-white font-semibold text-sm mb-4">Finding Severity Levels</h3>
        <div className="space-y-3">
          {severityLevels.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-3 h-3 rounded-full mt-0.5 ${s.color}`} />
              <div>
                <p className="text-slate-300 text-xs font-semibold capitalize">{s.level} &mdash; {s.meaning}</p>
                <p className="text-slate-500 text-xs italic">{s.example}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EventsSection() {
  const eventFlows = [
    {
      trigger: 'MACHINE STOPS',
      agent: 'OEE Agent',
      color: 'border-red-500',
      actions: [
        'Neural diagnoses root cause',
        'Labor Agent adjusts staffing for affected zone',
        'Financial Agent calculates downtime cost',
        'Voice alerts plant manager',
        'Dock Agent delays inbound if receiving affected'
      ]
    },
    {
      trigger: 'ERROR SPIKE',
      agent: 'Quality Agent',
      color: 'border-orange-500',
      actions: [
        'Neural analyzes pattern (new hires? specific SKU? equipment?)',
        'Labor Agent identifies workers involved',
        'Financial Agent estimates cost of errors',
        'Voice alerts shift supervisor'
      ]
    },
    {
      trigger: 'STOCKOUT IMMINENT',
      agent: 'Inventory Agent',
      color: 'border-yellow-500',
      actions: [
        'Financial Agent calculates expedite cost vs. stockout cost',
        'Neural prescribes best reorder strategy',
        'Voice calls purchasing team',
        'Warehouse Ops adjusts pick waves to conserve remaining stock'
      ]
    },
    {
      trigger: 'VOLUME SURGE DETECTED',
      agent: 'Warehouse Ops Agent',
      color: 'border-blue-500',
      actions: [
        'Labor Agent recommends additional staffing',
        'Inventory Agent checks stock levels for surge SKUs',
        'Dock Agent opens additional dock doors',
        'Neural checks if surge matches seasonal pattern or is anomaly'
      ]
    },
    {
      trigger: 'NEW TRUCK ARRIVES',
      agent: 'Dock Agent',
      color: 'border-green-500',
      actions: [
        'Warehouse Ops updates inbound queue',
        'Labor Agent assigns receiving crew',
        'Inventory Agent prepares putaway plan',
        'Quality Agent flags if carrier has high damage rate'
      ]
    }
  ]

  return (
    <div>
      <SectionHeader
        title="Cross-Tier Event Automation"
        subtitle="Events flow between agents automatically. When something happens in one tier, it triggers actions in others."
      />

      {/* Event Schema */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
        <h3 className="text-white font-semibold text-sm mb-3">Event Schema</h3>
        <pre className="text-xs text-slate-400 font-mono leading-relaxed">
{`{
  event_type: 'machine_stopped',
  source_agent: 'oee_machine',
  tenant_id: 'warehouse_alpha',
  payload: {
    machine_id: 'CONV-003',
    reason: 'micro_stop',
    zone: 'B',
    duration_seconds: 45,
    oee_impact: -2.3
  },
  listeners: ['neural', 'labor', 'financial', 'voice']
}`}
        </pre>
      </div>

      {/* Event Flows */}
      <div className="space-y-4">
        {eventFlows.map((flow, i) => (
          <div key={i} className={`bg-slate-800/40 border-l-4 ${flow.color} border border-slate-700 rounded-r-xl p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-white font-semibold text-sm">{flow.trigger}</h4>
              <span className="text-xs text-slate-500">via {flow.agent}</span>
            </div>
            <div className="space-y-1.5">
              {flow.actions.map((action, j) => (
                <div key={j} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-slate-600">&rarr;</span>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VoiceSection() {
  const inboundCalls = [
    { caller: 'Client', intent: '"What\'s my order status?"', routes: 'Warehouse Ops Agent' },
    { caller: 'Client', intent: '"When will my shipment arrive?"', routes: 'Dock Agent' },
    { caller: 'Manager', intent: '"What\'s our OEE right now?"', routes: 'OEE Agent' },
    { caller: 'Manager', intent: '"How many picks did night shift do?"', routes: 'Labor Agent' },
    { caller: 'Manager', intent: '"Any quality issues today?"', routes: 'Quality Agent' },
    { caller: 'Supervisor', intent: '"Machine 3 is down, what do we do?"', routes: 'OEE Agent → Neural' },
    { caller: 'Finance', intent: '"What\'s our cost per order this month?"', routes: 'Financial Agent' },
    { caller: 'Supplier', intent: '"I\'m arriving at dock 4 in 20 minutes"', routes: 'Dock Agent' }
  ]

  const outboundCalls = [
    { trigger: 'OEE drops below 60%', agent: 'OEE Agent', calls: 'Plant manager', says: '"OEE on Line 2 dropped to 54%. Conveyor micro-stops detected."' },
    { trigger: 'Stockout imminent', agent: 'Inventory Agent', calls: 'Purchasing', says: '"SKU-4421 will stock out in 18 hours. Reorder 500 units."' },
    { trigger: 'Error spike', agent: 'Quality Agent', calls: 'Shift supervisor', says: '"Pick errors up 3x in Zone C last 2 hours."' },
    { trigger: 'Neural finding critical', agent: 'Neural Agent', calls: 'Operations director', says: '"Critical: throughput will miss SLA by Thursday at current rate."' }
  ]

  return (
    <div>
      <SectionHeader
        title="Voice AI (Rachel / Ana)"
        subtitle="Voice interface to every agent. Managers talk to Rachel instead of clicking screens."
      />

      {/* Voice Minutes */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
        <h3 className="text-white font-semibold text-sm mb-4">Voice Minutes by Tier</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { tier: 'Tier 1', mins: '100', overage: '$0.15/min' },
            { tier: 'Tier 2', mins: '300', overage: '$0.12/min' },
            { tier: 'Tier 3', mins: '500', overage: '$0.10/min' },
            { tier: 'Tier 4', mins: 'Unlimited', overage: '—' }
          ].map((t, i) => (
            <div key={i} className="text-center p-3 bg-slate-700/30 rounded-lg">
              <p className="text-xs text-slate-500">{t.tier}</p>
              <p className="text-lg font-bold text-white mt-1">{t.mins}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.overage}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Inbound Calls */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
        <h3 className="text-white font-semibold text-sm mb-4">Inbound Calls (People Call the Warehouse)</h3>
        <div className="space-y-2">
          {inboundCalls.map((c, i) => (
            <div key={i} className="flex items-center gap-3 text-xs py-2 border-b border-slate-700/50 last:border-0">
              <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-medium w-20 text-center">{c.caller}</span>
              <span className="text-slate-400 flex-1 italic">{c.intent}</span>
              <span className="text-slate-500 hidden sm:inline">&rarr;</span>
              <span className="text-slate-300 font-medium hidden sm:inline">{c.routes}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Outbound Calls */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6">
        <h3 className="text-white font-semibold text-sm mb-4">Outbound Calls (Agents Call People)</h3>
        <div className="space-y-3">
          {outboundCalls.map((c, i) => (
            <div key={i} className="p-3 bg-slate-700/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-red-400">{c.trigger}</span>
                <span className="text-xs text-slate-600">&middot;</span>
                <span className="text-xs text-slate-500">{c.agent} calls {c.calls}</span>
              </div>
              <p className="text-xs text-slate-400 italic">{c.says}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function WarehouseMindPage() {
  const { section } = useParams()
  const [activeSection, setActiveSection] = useState(section || 'command-center')

  useEffect(() => {
    if (section) setActiveSection(section)
  }, [section])

  const renderSection = () => {
    switch (activeSection) {
      case 'command-center': return <CommandCenterSection />
      case 'neural': return <NeuralSection />
      case 'events': return <EventsSection />
      case 'voice': return <VoiceSection />
      default: return <CommandCenterSection />
    }
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">WarehouseMind AI</h1>
        <p className="text-slate-400 text-sm">Your warehouse runs itself. 8 AI agents &middot; 82+ MCP tools &middot; 4 tiers &middot; Neural Intelligence</p>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === s.id
                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
                {s.label}
          </button>
        ))}
      </div>

      {/* Active Section */}
      {renderSection()}
    </div>
  )
}
