import React from 'react'

function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function ServerIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  )
}

function Section({ title, children, accent = 'blue' }) {
  const colors = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-emerald-500/30 bg-emerald-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    teal: 'border-teal-500/30 bg-teal-500/5',
  }
  return (
    <div className={`border rounded-xl p-6 mb-6 ${colors[accent]}`}>
      <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-slate-700/50 last:border-0">
      <span className="text-sm text-slate-400 w-2/5">{label}</span>
      <span className="text-sm text-slate-200 w-3/5 text-right">{value}</span>
    </div>
  )
}

function Phase({ number, title, duration, items, accent = 'blue' }) {
  const colors = {
    blue: 'bg-blue-600',
    green: 'bg-emerald-600',
    amber: 'bg-amber-600',
    purple: 'bg-purple-600',
  }
  return (
    <div className="border border-slate-700/50 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg ${colors[accent]} flex items-center justify-center text-white text-sm font-bold`}>
          {number}
        </div>
        <div className="flex-1">
          <h4 className="text-white font-semibold text-sm">{title}</h4>
          <span className="text-[11px] text-slate-500 font-mono">{duration}</span>
        </div>
      </div>
      <ul className="space-y-1.5 ml-11">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
            <span className="text-slate-600 mt-0.5">--</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function OnPremisesPage() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldIcon className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">On-Premises Integration Plan</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Strategic deployment of the PINAXIS Warehouse Analytics Platform inside your corporate firewall.
          Full data sovereignty, zero external dependencies, enterprise-grade security.
        </p>
        <div className="flex gap-3 mt-4 flex-wrap">
          <span className="px-3 py-1 rounded-full text-[11px] font-mono bg-blue-500/10 border border-blue-500/30 text-blue-400">CONFIDENTIAL</span>
          <span className="px-3 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">v1.0 -- April 2026</span>
          <span className="px-3 py-1 rounded-full text-[11px] font-mono bg-slate-500/10 border border-slate-500/30 text-slate-400">PINAXIS Internal</span>
        </div>
      </div>

      {/* 1. Executive Summary */}
      <Section title="1. Executive Summary" accent="blue">
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          This document outlines the strategic plan for deploying the PINAXIS Warehouse Analytics Platform
          as an on-premises solution within your corporate infrastructure. The deployment ensures complete
          data sovereignty -- all warehouse data, analysis results, and AI processing remain inside your
          firewall with zero dependency on external cloud services.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-400 font-mono">100%</div>
            <div className="text-xs text-slate-500 mt-1">Data Sovereignty</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400 font-mono">6-8 wk</div>
            <div className="text-xs text-slate-500 mt-1">Deployment Timeline</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-amber-400 font-mono">Zero</div>
            <div className="text-xs text-slate-500 mt-1">External Data Transfer</div>
          </div>
        </div>
      </Section>

      {/* 2. Architecture Overview */}
      <Section title="2. Architecture Overview" accent="teal">
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          The on-premises deployment mirrors the PINAXIS cloud architecture but runs entirely within your
          data center or private cloud infrastructure. All components are containerized for consistent deployment.
        </p>
        <div className="bg-slate-900/60 rounded-lg p-5 font-mono text-xs text-slate-400 leading-loose mb-4">
          <div className="text-blue-400 mb-2">{'// PINAXIS On-Premises Architecture'}</div>
          <div className="border border-slate-700 rounded-lg p-4 mb-3">
            <div className="text-emerald-400 font-bold mb-1">PRESENTATION LAYER</div>
            <div className="ml-4">React Dashboard (Nginx) ........... port 443</div>
            <div className="ml-4">Voice AI (optional, local TTS) .... port 8443</div>
          </div>
          <div className="border border-slate-700 rounded-lg p-4 mb-3">
            <div className="text-amber-400 font-bold mb-1">APPLICATION LAYER</div>
            <div className="ml-4">Node.js API Server ................ port 3000</div>
            <div className="ml-4">Analysis Engine (12 modules) ...... internal</div>
            <div className="ml-4">Proposal Generator ................ internal</div>
            <div className="ml-4">WarehouseMind MCP Gateway ......... port 3100</div>
            <div className="ml-4">OEE Real-Time Processor ........... port 3200</div>
          </div>
          <div className="border border-slate-700 rounded-lg p-4 mb-3">
            <div className="text-purple-400 font-bold mb-1">DATA LAYER</div>
            <div className="ml-4">PostgreSQL 15+ .................... port 5432</div>
            <div className="ml-4">File Storage (NFS/S3-compat) ...... internal</div>
            <div className="ml-4">Redis Cache (optional) ............ port 6379</div>
          </div>
          <div className="border border-slate-700 rounded-lg p-4">
            <div className="text-red-400 font-bold mb-1">AI LAYER (OPTIONAL -- AIR-GAPPED OR PROXY)</div>
            <div className="ml-4">Option A: Local LLM (Ollama/vLLM) . GPU node</div>
            <div className="ml-4">Option B: API Proxy (filtered) .... egress-only</div>
            <div className="ml-4">Option C: No AI (manual mode) ..... n/a</div>
          </div>
        </div>
      </Section>

      {/* 3. Infrastructure Requirements */}
      <Section title="3. Infrastructure Requirements" accent="green">
        <h4 className="text-sm font-semibold text-white mb-3">3.1 Minimum Hardware</h4>
        <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
          <Row label="Application Server" value="4 vCPU, 16 GB RAM, 100 GB SSD" />
          <Row label="Database Server" value="4 vCPU, 16 GB RAM, 500 GB SSD (RAID)" />
          <Row label="AI/GPU Node (optional)" value="8 vCPU, 32 GB RAM, NVIDIA A10/L4 GPU" />
          <Row label="Load Balancer" value="Nginx / HAProxy / F5" />
          <Row label="Network" value="1 Gbps internal, 100 Mbps to WMS/ERP" />
        </div>

        <h4 className="text-sm font-semibold text-white mb-3">3.2 Software Stack</h4>
        <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
          <Row label="OS" value="RHEL 8+, Ubuntu 22.04+, or Windows Server 2022" />
          <Row label="Container Runtime" value="Docker 24+ or Podman 4+" />
          <Row label="Orchestration" value="Docker Compose (single node) or Kubernetes" />
          <Row label="Database" value="PostgreSQL 15+ with SSL" />
          <Row label="Reverse Proxy" value="Nginx 1.24+ with TLS termination" />
          <Row label="Node.js" value="v20 LTS or v22 LTS" />
        </div>

        <h4 className="text-sm font-semibold text-white mb-3">3.3 Recommended Production</h4>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <Row label="Application (HA)" value="2x servers, load-balanced" />
          <Row label="Database (HA)" value="Primary + streaming replica" />
          <Row label="Backup" value="Daily pg_dump + WAL archiving" />
          <Row label="Monitoring" value="Prometheus + Grafana or existing APM" />
          <Row label="Log Aggregation" value="ELK / Splunk / existing SIEM" />
        </div>
      </Section>

      {/* 4. Network & Firewall Configuration */}
      <Section title="4. Network & Firewall Configuration" accent="red">
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          PINAXIS operates entirely within the internal network. The only optional outbound connection
          is for AI model API calls, which can be disabled for fully air-gapped deployments.
        </p>

        <h4 className="text-sm font-semibold text-white mb-3">4.1 Inbound Rules (Internal Only)</h4>
        <div className="bg-slate-800/50 rounded-lg p-4 mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Port</th>
                <th className="pb-2 pr-4">Service</th>
                <th className="pb-2 pr-4">Source</th>
                <th className="pb-2">Protocol</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 font-mono text-blue-400">443</td><td className="py-2 pr-4">PINAXIS Dashboard</td><td className="py-2 pr-4">Corporate LAN</td><td className="py-2">HTTPS</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 font-mono text-blue-400">3000</td><td className="py-2 pr-4">API Server</td><td className="py-2 pr-4">App Server only</td><td className="py-2">HTTP (internal)</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 font-mono text-blue-400">5432</td><td className="py-2 pr-4">PostgreSQL</td><td className="py-2 pr-4">App Server only</td><td className="py-2">TCP</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 font-mono text-blue-400">8443</td><td className="py-2 pr-4">Webhook Receiver</td><td className="py-2 pr-4">PLC/MES network</td><td className="py-2">HTTPS</td></tr>
            </tbody>
          </table>
        </div>

        <h4 className="text-sm font-semibold text-white mb-3">4.2 Outbound Rules</h4>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <Row label="AI API Proxy (optional)" value="api.anthropic.com:443 or api.openai.com:443" />
          <Row label="TTS API (optional)" value="api.elevenlabs.io:443" />
          <Row label="Fully Air-Gapped Mode" value="All outbound blocked -- local LLM or manual mode" />
          <Row label="NTP" value="Internal NTP server for time sync" />
        </div>
      </Section>

      {/* 5. Data Security & Compliance */}
      <Section title="5. Data Security & Compliance" accent="purple">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-purple-400 mb-2">Encryption</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- TLS 1.3 for all HTTP traffic</li>
              <li>-- PostgreSQL SSL connections enforced</li>
              <li>-- AES-256 at-rest encryption for file storage</li>
              <li>-- Secrets managed via Vault or env injection</li>
            </ul>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-purple-400 mb-2">Access Control</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- LDAP / Active Directory SSO integration</li>
              <li>-- Role-based access: Admin, Analyst, Viewer</li>
              <li>-- API key authentication for M2M</li>
              <li>-- Session timeout configurable (default 8h)</li>
            </ul>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-purple-400 mb-2">Audit & Logging</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- Full audit trail for all data operations</li>
              <li>-- Login/logout events logged to SIEM</li>
              <li>-- File upload/download tracking</li>
              <li>-- API call logging with request IDs</li>
            </ul>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-purple-400 mb-2">Data Residency</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- All data stored on-premises exclusively</li>
              <li>-- No telemetry or usage data leaves the network</li>
              <li>-- GDPR / CCPA compliant by architecture</li>
              <li>-- Data retention policies configurable</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 6. System Integration */}
      <Section title="6. System Integration Map" accent="amber">
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          PINAXIS connects to your existing warehouse systems through standard protocols.
          All integrations run within the firewall.
        </p>
        <div className="bg-slate-900/60 rounded-lg p-5 font-mono text-xs text-slate-400 leading-loose mb-4">
          <div className="text-amber-400 mb-3">{'// Integration Topology'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-slate-700 rounded-lg p-3">
              <div className="text-emerald-400 font-bold mb-2">WMS / ERP</div>
              <div>SAP, Oracle, JDA, Manhattan</div>
              <div className="text-slate-600 mt-1">via REST API or CSV/SFTP</div>
              <div className="text-blue-400 mt-1">Item Master, Inventory</div>
              <div className="text-blue-400">Inbound, Outbound</div>
            </div>
            <div className="border border-slate-700 rounded-lg p-3">
              <div className="text-emerald-400 font-bold mb-2">MES / PLC</div>
              <div>Siemens, Rockwell, Beckhoff</div>
              <div className="text-slate-600 mt-1">via OPC-UA or Webhook</div>
              <div className="text-blue-400 mt-1">Machine Events</div>
              <div className="text-blue-400">OEE Data, Status</div>
            </div>
            <div className="border border-slate-700 rounded-lg p-3">
              <div className="text-emerald-400 font-bold mb-2">BI / Reporting</div>
              <div>Power BI, Tableau, Grafana</div>
              <div className="text-slate-600 mt-1">via PostgreSQL direct</div>
              <div className="text-blue-400 mt-1">Analysis Results</div>
              <div className="text-blue-400">KPIs, OEE Metrics</div>
            </div>
          </div>
        </div>

        <h4 className="text-sm font-semibold text-white mb-3">6.1 API Endpoints (Internal)</h4>
        <div className="bg-slate-800/50 rounded-lg p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Endpoint</th>
                <th className="pb-2 pr-4">Method</th>
                <th className="pb-2">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-slate-300 font-mono text-xs">
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 text-blue-400">/api/v1/ingest/:id/item-master</td><td className="py-2 pr-4">POST</td><td className="py-2 font-sans">Bulk import item master data</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 text-blue-400">/api/v1/ingest/:id/inventory</td><td className="py-2 pr-4">POST</td><td className="py-2 font-sans">Import inventory snapshot</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 text-blue-400">/api/v1/ingest/:id/inbound</td><td className="py-2 pr-4">POST</td><td className="py-2 font-sans">Import inbound receipts</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 text-blue-400">/api/v1/ingest/:id/outbound</td><td className="py-2 pr-4">POST</td><td className="py-2 font-sans">Import outbound shipments</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 text-blue-400">/api/oee/webhooks/machine-event</td><td className="py-2 pr-4">POST</td><td className="py-2 font-sans">Real-time machine status from PLC</td></tr>
              <tr className="border-t border-slate-700/50"><td className="py-2 pr-4 text-blue-400">/api/v1/analysis/:id/all</td><td className="py-2 pr-4">GET</td><td className="py-2 font-sans">Retrieve all analysis results</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* 7. Authentication & SSO */}
      <Section title="7. Authentication & SSO" accent="blue">
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          PINAXIS supports multiple authentication methods for enterprise environments.
          The recommended setup uses your existing identity provider.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-400 mb-2">SSO Options</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- SAML 2.0 (Okta, Azure AD, Ping)</li>
              <li>-- OAuth 2.0 / OpenID Connect</li>
              <li>-- LDAP / Active Directory bind</li>
              <li>-- Local accounts (fallback)</li>
            </ul>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-400 mb-2">Role Mapping</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- <span className="text-white font-medium">Admin</span>: full platform + user management</li>
              <li>-- <span className="text-white font-medium">Analyst</span>: create/edit projects + run analysis</li>
              <li>-- <span className="text-white font-medium">Viewer</span>: read-only dashboards + reports</li>
              <li>-- <span className="text-white font-medium">API</span>: machine-to-machine (key-based)</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 8. Deployment Phases */}
      <Section title="8. Deployment Roadmap" accent="green">
        <Phase
          number={1}
          title="Infrastructure Provisioning"
          duration="Week 1-2"
          accent="blue"
          items={[
            'Provision application and database servers per Section 3',
            'Configure network rules and firewall per Section 4',
            'Install Docker/Podman and PostgreSQL',
            'Set up TLS certificates (internal CA or Let\'s Encrypt)',
            'Configure LDAP/SSO integration',
          ]}
        />
        <Phase
          number={2}
          title="Platform Deployment"
          duration="Week 2-3"
          accent="green"
          items={[
            'Deploy PINAXIS containers via Docker Compose or Kubernetes',
            'Run database migrations and seed reference data',
            'Configure Nginx reverse proxy with TLS termination',
            'Validate health endpoints and API connectivity',
            'Connect to WMS/ERP test environment for data flow validation',
          ]}
        />
        <Phase
          number={3}
          title="Integration & Testing"
          duration="Week 3-5"
          accent="amber"
          items={[
            'Configure WMS/ERP data ingestion (item master, inventory, inbound/outbound)',
            'Set up OEE webhook receiver for PLC/MES integration',
            'Run end-to-end test with real warehouse data sample',
            'Validate all 12 analysis modules produce correct results',
            'Performance testing: 50K+ SKU dataset, concurrent users',
            'Security penetration testing (internal team or vendor)',
          ]}
        />
        <Phase
          number={4}
          title="Go-Live & Handover"
          duration="Week 6-8"
          accent="purple"
          items={[
            'Production data migration and initial analysis run',
            'User training sessions (Admin, Analyst, Viewer roles)',
            'Monitoring setup: Prometheus/Grafana dashboards',
            'Backup automation: daily pg_dump + WAL archiving',
            'Runbook handover: troubleshooting, scaling, upgrades',
            'Post-deployment support period (4 weeks)',
          ]}
        />
      </Section>

      {/* 9. AI Layer Options */}
      <Section title="9. AI Layer Configuration" accent="purple">
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          The WarehouseMind AI features can operate in three modes depending on your security requirements.
          The core analytics engine (12 modules) runs fully offline with zero AI dependency.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-emerald-500/20">
            <h4 className="text-sm font-semibold text-emerald-400 mb-2">Option A: Local LLM</h4>
            <p className="text-xs text-slate-400 mb-2">Fully air-gapped. No outbound traffic.</p>
            <ul className="text-xs text-slate-300 space-y-1">
              <li>-- Ollama or vLLM on GPU node</li>
              <li>-- Llama 3.1 70B or Mixtral 8x7B</li>
              <li>-- Natural language queries</li>
              <li>-- Anomaly narration</li>
            </ul>
            <div className="mt-3 text-[10px] font-mono text-emerald-500">RECOMMENDED FOR AIR-GAP</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-blue-500/20">
            <h4 className="text-sm font-semibold text-blue-400 mb-2">Option B: API Proxy</h4>
            <p className="text-xs text-slate-400 mb-2">Controlled egress. Data filtered.</p>
            <ul className="text-xs text-slate-300 space-y-1">
              <li>-- Forward proxy with allow-list</li>
              <li>-- Only analysis prompts sent out</li>
              <li>-- No raw warehouse data leaves</li>
              <li>-- Full model capability</li>
            </ul>
            <div className="mt-3 text-[10px] font-mono text-blue-500">RECOMMENDED FOR HYBRID</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-500/20">
            <h4 className="text-sm font-semibold text-slate-400 mb-2">Option C: No AI</h4>
            <p className="text-xs text-slate-400 mb-2">Manual mode. Analytics only.</p>
            <ul className="text-xs text-slate-300 space-y-1">
              <li>-- All 12 analysis modules work</li>
              <li>-- Product matching works</li>
              <li>-- Proposal generation works</li>
              <li>-- No NL queries or narration</li>
            </ul>
            <div className="mt-3 text-[10px] font-mono text-slate-500">MAXIMUM SECURITY</div>
          </div>
        </div>
      </Section>

      {/* 10. Support & Maintenance */}
      <Section title="10. Support & Maintenance" accent="teal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-teal-400 mb-2">Update Delivery</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- Container image updates via private registry</li>
              <li>-- Quarterly feature releases</li>
              <li>-- Security patches within 48h of disclosure</li>
              <li>-- Database migrations included in release notes</li>
              <li>-- Zero-downtime rolling updates (K8s)</li>
            </ul>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-teal-400 mb-2">Support Tiers</h4>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>-- <span className="text-white font-medium">Standard</span>: email support, 24h response</li>
              <li>-- <span className="text-white font-medium">Premium</span>: dedicated Slack channel, 4h response</li>
              <li>-- <span className="text-white font-medium">Enterprise</span>: on-site engineer, 1h response</li>
              <li>-- Remote monitoring dashboard (opt-in)</li>
              <li>-- Annual architecture review</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <div className="text-center py-8 border-t border-slate-700/50 mt-8">
        <p className="text-xs text-slate-500 font-mono">PINAXIS ON-PREMISES INTEGRATION PLAN -- CONFIDENTIAL</p>
        <p className="text-xs text-slate-600 mt-1">Prepared for internal distribution. Contact your PINAXIS representative for deployment scheduling.</p>
      </div>
    </div>
  )
}
