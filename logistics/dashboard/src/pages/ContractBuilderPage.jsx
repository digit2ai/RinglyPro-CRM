import React, { useState } from 'react'

export default function ContractBuilderPage() {
  const [step, setStep] = useState(1)
  const [toast, setToast] = useState(null)

  const [form, setForm] = useState({
    client_name: '',
    client_address: '',
    effective_date: new Date().toISOString().split('T')[0],
    initial_term_months: 24,
    jurisdiction: 'Florida',
    // New consumption-based SaaS pricing
    platform_access_fee: 2500,
    implementation_fee: 15000,
    ai_consumption_rate: 0.012,
    included_units: 50000,
    overage_rate: 0.015,
    outcome_fee_pct: 5,
    onboarding_hours: 10,
    impl_timeline_weeks: 8,
    billing_model: 'hybrid',
    renewal_uplift_pct: 3,
    usage_tier: 'growth',
  })

  const fmt = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const TIERS = {
    starter: { label: 'Starter', units: 25000, platform: 1500, desc: 'Small teams, single workflow' },
    growth:  { label: 'Growth',  units: 50000, platform: 2500, desc: 'Multi-workflow, analytics + alerts' },
    enterprise: { label: 'Enterprise', units: 150000, platform: 5000, desc: 'Full platform, custom integrations' },
  }

  const selectTier = (tier) => {
    const t = TIERS[tier]
    update('usage_tier', tier)
    update('included_units', t.units)
    update('platform_access_fee', t.platform)
  }

  const totalMonthly = () => {
    return form.platform_access_fee + (form.included_units * form.ai_consumption_rate)
  }

  const totalAnnual = () => totalMonthly() * 12

  const goStep = (n) => setStep(n)

  const printContract = () => {
    const el = document.getElementById('contractPreview')
    if (!el) return
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Enterprise Services Agreement — ${form.client_name || 'Draft'}</title>
      <style>
        @page{margin:1in}body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.6;color:#1E293B;max-width:8.5in;margin:0 auto;padding:1in}
        h1{font-size:18pt;text-align:center;margin-bottom:.5em;color:#1B2A4A}h2{font-size:13pt;color:#1B2A4A;border-bottom:1px solid #CBD5E1;padding-bottom:4px;margin-top:1.5em}
        ul,ol{padding-left:1.2em}li{margin-bottom:.5em}table{width:100%;border-collapse:collapse;margin:1em 0}th,td{border:1px solid #CBD5E1;padding:8px 12px;text-align:left;font-size:10pt}th{background:#F1F5F9;font-weight:600}
        .sig-block{margin-top:3em;display:flex;justify-content:space-between}.sig-col{width:45%}.sig-line{border-top:1px solid #1E293B;margin-top:3em;padding-top:4px;font-size:10pt}
      </style></head><body>${el.innerHTML}</body></html>`)
    w.document.close()
    w.print()
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-white mb-1">Enterprise Services Agreement</h1>
      <p className="text-slate-400 text-sm mb-8">Consumption-based SaaS contract with usage metering, outcome fees, and automated billing</p>

      {/* Progress */}
      <div className="flex mb-8 gap-2">
        {['Parties & Dates', 'Pricing Model', 'Preview', 'Export'].map((label, i) => {
          const n = i + 1
          const isDone = n < step
          const isActive = n === step
          return (
            <button key={n} onClick={() => goStep(n)} className="flex-1 flex flex-col items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
              }`}>{isDone ? '✓' : n}</div>
              <span className={`text-xs font-medium ${isActive ? 'text-blue-400' : isDone ? 'text-emerald-400' : 'text-slate-500'}`}>{label}</span>
            </button>
          )
        })}
      </div>

      {/* Step 1: Parties & Dates */}
      {step === 1 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">Step 1 — Parties & Dates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Client Legal Name *" value={form.client_name} onChange={v => update('client_name', v)} placeholder="e.g. GEBHARDT Intralogistics Group" />
            <Field label="Effective Date *" type="date" value={form.effective_date} onChange={v => update('effective_date', v)} />
            <Field label="Client Address" type="textarea" value={form.client_address} onChange={v => update('client_address', v)} placeholder="Full legal address" full />
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Initial Term</label>
              <select value={form.initial_term_months} onChange={e => update('initial_term_months', parseInt(e.target.value))} className="input-field w-full">
                {[12, 18, 24, 36].map(m => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
            <Field label="Jurisdiction" value={form.jurisdiction} onChange={v => update('jurisdiction', v)} />
          </div>
          <div className="flex justify-end pt-2">
            <button className="btn-primary" onClick={() => goStep(2)}>Next: Pricing Model →</button>
          </div>
        </div>
      )}

      {/* Step 2: Consumption-Based Pricing */}
      {step === 2 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">Step 2 — Consumption-Based Pricing Model</h3>

          {/* Billing Model Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Revenue Model</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'hybrid', label: 'Hybrid ARR + Consumption', desc: 'Platform fee + usage-based AI billing' },
                { key: 'consumption', label: 'Pure Consumption', desc: 'Pay only for what you use' },
                { key: 'outcome', label: 'Outcome-Based', desc: 'Fees tied to measurable value delivered' },
              ].map(m => (
                <button key={m.key} onClick={() => update('billing_model', m.key)}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    form.billing_model === m.key ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'
                  }`}>
                  <div className={`text-sm font-semibold mb-1 ${form.billing_model === m.key ? 'text-blue-400' : 'text-white'}`}>{m.label}</div>
                  <div className="text-xs text-slate-400">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Usage Tiers */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Usage Tier</label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(TIERS).map(([key, t]) => (
                <button key={key} onClick={() => selectTier(key)}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    form.usage_tier === key ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 hover:border-slate-500'
                  }`}>
                  <div className={`text-sm font-bold mb-1 ${form.usage_tier === key ? 'text-emerald-400' : 'text-white'}`}>{t.label}</div>
                  <div className="text-xs text-slate-400 mb-2">{t.desc}</div>
                  <div className="text-xs text-slate-300">{t.units.toLocaleString()} units/mo · {fmt(t.platform)}/mo</div>
                </button>
              ))}
            </div>
          </div>

          {/* Pricing Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Monthly Platform Access Fee ($)" type="number" value={form.platform_access_fee} onChange={v => update('platform_access_fee', parseFloat(v) || 0)} />
            <Field label="One-Time Implementation Fee ($)" type="number" value={form.implementation_fee} onChange={v => update('implementation_fee', parseFloat(v) || 0)} />
            <Field label="AI Consumption Rate ($/unit)" type="number" value={form.ai_consumption_rate} onChange={v => update('ai_consumption_rate', parseFloat(v) || 0)} step="0.001" />
            <Field label="Included Units/Month" type="number" value={form.included_units} onChange={v => update('included_units', parseInt(v) || 0)} />
            <Field label="Overage Rate ($/unit)" type="number" value={form.overage_rate} onChange={v => update('overage_rate', parseFloat(v) || 0)} step="0.001" />
            {form.billing_model === 'outcome' && (
              <Field label="Outcome Fee (% of measured value)" type="number" value={form.outcome_fee_pct} onChange={v => update('outcome_fee_pct', parseFloat(v) || 0)} />
            )}
            <Field label="Onboarding Hours" type="number" value={form.onboarding_hours} onChange={v => update('onboarding_hours', parseInt(v) || 0)} />
            <Field label="Implementation Timeline (weeks)" type="number" value={form.impl_timeline_weeks} onChange={v => update('impl_timeline_weeks', parseInt(v) || 0)} />
            <Field label="Annual Renewal Uplift (%)" type="number" value={form.renewal_uplift_pct} onChange={v => update('renewal_uplift_pct', parseFloat(v) || 0)} />
          </div>

          {/* Monthly Summary Card */}
          <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-white mb-3">Estimated Monthly Revenue</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-blue-400">{fmt(form.platform_access_fee)}</div>
                <div className="text-xs text-slate-400">Platform Fee</div>
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-400">{fmt(form.included_units * form.ai_consumption_rate)}</div>
                <div className="text-xs text-slate-400">Base Consumption</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white">{fmt(totalMonthly())}</div>
                <div className="text-xs text-slate-400">Total Monthly</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-600 text-center">
              <span className="text-sm text-slate-300">Projected Annual Contract Value: </span>
              <span className="text-sm font-bold text-white">{fmt(totalAnnual())}</span>
              <span className="text-xs text-slate-500 ml-2">+ implementation {fmt(form.implementation_fee)}</span>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button className="btn-secondary" onClick={() => goStep(1)}>← Back</button>
            <button className="btn-primary" onClick={() => goStep(3)}>Next: Preview →</button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">Step 3 — Contract Preview</h3>
          <div id="contractPreview" className="bg-white rounded-lg p-8 max-h-[600px] overflow-y-auto" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '11pt', lineHeight: 1.6, color: '#1E293B' }}>
            <ContractPreview form={form} fmt={fmt} totalMonthly={totalMonthly} />
          </div>
          <div className="flex justify-between pt-2">
            <button className="btn-secondary" onClick={() => goStep(2)}>← Back</button>
            <button className="btn-primary" onClick={() => goStep(4)}>Next: Export →</button>
          </div>
        </div>
      )}

      {/* Step 4: Export */}
      {step === 4 && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">Step 4 — Export & Save</h3>
          <p className="text-slate-400 text-sm">Print or save your contract as PDF directly from the browser.</p>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={printContract}
              className="p-6 bg-slate-700/30 border border-slate-600 rounded-lg text-center hover:border-blue-500 transition-all">
              <div className="text-3xl mb-3">📄</div>
              <h4 className="text-sm font-semibold text-white mb-1">Print / Save as PDF</h4>
              <p className="text-xs text-slate-400">Opens print dialog — use "Save as PDF" for a downloadable copy</p>
            </button>
            <button onClick={() => { goStep(3); showToast('Preview loaded — you can copy the contract text') }}
              className="p-6 bg-slate-700/30 border border-slate-600 rounded-lg text-center hover:border-emerald-500 transition-all">
              <div className="text-3xl mb-3">📋</div>
              <h4 className="text-sm font-semibold text-white mb-1">Copy to Clipboard</h4>
              <p className="text-xs text-slate-400">Go back to preview and select text to copy</p>
            </button>
          </div>
          <div className="flex justify-start pt-2">
            <button className="btn-secondary" onClick={() => goStep(3)}>← Back to Preview</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-500 text-white px-5 py-3 rounded-lg font-semibold text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function ContractPreview({ form, fmt, totalMonthly }) {
  const billingLabel = {
    hybrid: 'Hybrid ARR + Consumption',
    consumption: 'Pure Consumption',
    outcome: 'Outcome-Based',
  }[form.billing_model]

  return (
    <>
      <h1 style={{ fontSize: '18pt', textAlign: 'center', marginBottom: '.5em', color: '#1B2A4A' }}>ENTERPRISE SERVICES AGREEMENT</h1>
      <p style={{ textAlign: 'center', color: '#475569', fontSize: '10pt', marginBottom: '2em' }}>
        This Enterprise Services Agreement ("Agreement") is entered into as of{' '}
        <strong>{form.effective_date || '___'}</strong> ("Effective Date") by and between:<br /><br />
        <strong>Digit2AI LLC d/b/a RinglyPro</strong> ("Provider")<br />
        and<br />
        <strong>{form.client_name || '_______________'}</strong> ("Client")<br />
        {form.client_address}
      </p>

      <H2>1. DEFINITIONS</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>"Services"</strong> means the AI-powered analytics, automation, and consulting services described in Exhibit A.</li>
        <li><strong>"Platform"</strong> means Provider's proprietary RinglyPro AI platform, including all AI agents, MCP tools, dashboards, and integrations.</li>
        <li><strong>"Consumption Units"</strong> means the aggregate usage of AI model tokens, API calls, workflow executions, and compute resources consumed through the Platform on Client's behalf, as metered by Provider's automated usage tracking system.</li>
        <li><strong>"Outcome Metrics"</strong> means the measurable business outcomes defined in Exhibit B, including but not limited to cost reduction, throughput improvement, error reduction, and revenue impact.</li>
        <li><strong>"Confidential Information"</strong> means all non-public information disclosed by either party.</li>
      </ol>

      <H2>2. SCOPE OF SERVICES</H2>
      <p>Provider shall deliver the Services described in Exhibit A, including:</p>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li>AI-powered data analysis, optimization, and intelligent recommendations via the Platform</li>
        <li>Automated usage metering, billing validation, and consumption reporting</li>
        <li>Real-time monitoring, anomaly detection, and predictive analytics</li>
        <li>AI agent orchestration across the Lead-to-Cash lifecycle</li>
        <li>Dynamic packaging adjustments based on usage behavior</li>
        <li>Ongoing platform access, maintenance, and support</li>
      </ol>
      <p>Implementation: <strong>{form.impl_timeline_weeks} weeks</strong>. Onboarding: <strong>{form.onboarding_hours} hours</strong>.</p>

      <H2>3. REVENUE MODEL & PRICING</H2>
      <p><strong>Billing Model:</strong> {billingLabel}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '1em 0' }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            <th style={thStyle}>Fee Component</th>
            <th style={thStyle}>Amount</th>
            <th style={thStyle}>Frequency</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}>One-Time Implementation Fee</td>
            <td style={tdStyle}><strong>{fmt(form.implementation_fee)}</strong></td>
            <td style={tdStyle}>Due upon execution</td>
          </tr>
          {form.billing_model !== 'consumption' && (
            <tr>
              <td style={tdStyle}>Monthly Platform Access Fee</td>
              <td style={tdStyle}><strong>{fmt(form.platform_access_fee)}</strong></td>
              <td style={tdStyle}>Monthly</td>
            </tr>
          )}
          <tr>
            <td style={tdStyle}>AI Consumption Rate (per unit)</td>
            <td style={tdStyle}><strong>${form.ai_consumption_rate.toFixed(4)}</strong></td>
            <td style={tdStyle}>Monthly (metered)</td>
          </tr>
          <tr>
            <td style={tdStyle}>Included Consumption Units</td>
            <td style={tdStyle}><strong>{form.included_units.toLocaleString()}</strong></td>
            <td style={tdStyle}>Per month</td>
          </tr>
          <tr>
            <td style={tdStyle}>Overage Rate (per unit beyond included)</td>
            <td style={tdStyle}><strong>${form.overage_rate.toFixed(4)}</strong></td>
            <td style={tdStyle}>Monthly (metered)</td>
          </tr>
          {form.billing_model === 'outcome' && (
            <tr>
              <td style={tdStyle}>Outcome Fee</td>
              <td style={tdStyle}><strong>{form.outcome_fee_pct}%</strong> of measured value</td>
              <td style={tdStyle}>Quarterly (reconciled)</td>
            </tr>
          )}
        </tbody>
      </table>
      <p><strong>Estimated Monthly Total:</strong> {fmt(totalMonthly())} (platform + base consumption at included tier)</p>

      <H2>4. CONSUMPTION METERING & BILLING CONTROLS</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Automated Usage Metering:</strong> Provider shall maintain automated metering of all Consumption Units. Client shall have access to a real-time consumption dashboard showing current usage, historical trends, and projected billing.</li>
        <li><strong>Overage Threshold Enforcement:</strong> When consumption exceeds 80% of the included tier, Provider shall notify Client. Consumption beyond the included tier is billed at the Overage Rate with five (5) business days' written notice.</li>
        <li><strong>Usage Reports:</strong> Provider shall deliver a monthly consumption report detailing usage by category, AI model, workflow, and cost center.</li>
        <li><strong>Dynamic Packaging:</strong> Client may upgrade or downgrade usage tiers with thirty (30) days' notice, effective at the next billing cycle.</li>
        <li><strong>Payment Terms:</strong> All invoices are due within thirty (30) days. Late payments accrue interest at 1.5% per month.</li>
      </ol>

      {form.billing_model === 'outcome' && (
        <>
          <H2>5. OUTCOME-BASED FEE RECONCILIATION</H2>
          <ol style={{ paddingLeft: '1.2em' }}>
            <li><strong>Measurement:</strong> Outcome Metrics shall be measured quarterly using mutually agreed baselines established during implementation.</li>
            <li><strong>Reconciliation:</strong> At the end of each quarter, Provider and Client shall jointly review Outcome Metrics. The Outcome Fee ({form.outcome_fee_pct}%) applies to the net measurable value delivered above baseline.</li>
            <li><strong>Audit Rights:</strong> Either party may audit Outcome Metrics with fifteen (15) days' written notice.</li>
          </ol>
        </>
      )}

      <H2>{form.billing_model === 'outcome' ? '6' : '5'}. TERM & RENEWAL</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Initial Term:</strong> {form.initial_term_months} months from the Effective Date.</li>
        <li><strong>Auto-Renewal:</strong> Renews for successive twelve (12) month periods unless sixty (60) days' written notice given. Renewal pricing subject to {form.renewal_uplift_pct}% annual uplift aligned to platform value delivery.</li>
        <li><strong>Termination for Cause:</strong> Either party may terminate upon thirty (30) days' written notice for uncured material breach.</li>
        <li><strong>Effect of Termination:</strong> Client pays all fees through termination date. Provider delivers completed Deliverables and provides thirty (30) days' transition assistance.</li>
      </ol>

      <H2>{form.billing_model === 'outcome' ? '7' : '6'}. INTELLECTUAL PROPERTY</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Provider IP:</strong> All rights in the Platform — software, algorithms, models, prompts, configurations, and methodologies — remain exclusive property of Provider.</li>
        <li><strong>Client Data:</strong> Client retains all rights to its proprietary data. Provider receives a limited license to perform the Services.</li>
        <li><strong>Deliverables:</strong> Client receives a non-exclusive, non-transferable license for internal use. Provider retains underlying IP.</li>
      </ol>

      <H2>{form.billing_model === 'outcome' ? '8' : '7'}. NON-CIRCUMVENTION & ANTI-REVERSE ENGINEERING</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Non-Circumvention:</strong> During the term and for twenty-four (24) months thereafter, Client shall not directly or indirectly replicate or substitute the Services using substantially similar AI tools, prompts, workflows, or methodologies.</li>
        <li><strong>Anti-Reverse Engineering:</strong> Client shall not reverse engineer, decompile, or attempt to derive Platform source code, algorithms, prompts, or architecture.</li>
        <li><strong>Remedies:</strong> Breach entitles Provider to injunctive relief in addition to all other remedies at law or equity.</li>
      </ol>

      <H2>{form.billing_model === 'outcome' ? '9' : '8'}. CONFIDENTIALITY</H2>
      <p>Each party agrees to hold in strict confidence all Confidential Information. This obligation survives termination for three (3) years.</p>

      <H2>{form.billing_model === 'outcome' ? '10' : '9'}. LIMITATION OF LIABILITY</H2>
      <p style={{ textTransform: 'uppercase', fontSize: '10pt' }}>
        Neither party's aggregate liability shall exceed the total fees paid in the twelve (12) months preceding the claim. Neither party shall be liable for indirect, incidental, special, consequential, or punitive damages.
      </p>

      <H2>{form.billing_model === 'outcome' ? '11' : '10'}. GOVERNING LAW</H2>
      <p>State of {form.jurisdiction}. Disputes resolved in state or federal courts located in {form.jurisdiction}.</p>

      <H2>{form.billing_model === 'outcome' ? '12' : '11'}. GENERAL PROVISIONS</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Entire Agreement:</strong> This Agreement, including all exhibits, constitutes the entire agreement and supersedes all prior negotiations.</li>
        <li><strong>Amendments:</strong> No modification effective unless in writing and signed by both parties.</li>
        <li><strong>Severability:</strong> Invalid provisions do not affect the remainder.</li>
        <li><strong>Assignment:</strong> Requires prior written consent, except in merger/acquisition.</li>
        <li><strong>Force Majeure:</strong> Neither party liable for delays beyond reasonable control.</li>
      </ol>

      {/* Signature blocks */}
      <div style={{ marginTop: '3em', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: '45%' }}>
          <div style={sigLine}><strong>Digit2AI LLC d/b/a RinglyPro</strong></div>
          <br /><div style={sigLine}>Authorized Signature</div>
          <br /><div style={sigLine}>Name & Title</div>
          <br /><div style={sigLine}>Date</div>
        </div>
        <div style={{ width: '45%' }}>
          <div style={sigLine}><strong>{form.client_name || '_______________'}</strong></div>
          <br /><div style={sigLine}>Authorized Signature</div>
          <br /><div style={sigLine}>Name & Title</div>
          <br /><div style={sigLine}>Date</div>
        </div>
      </div>

      {/* Exhibit A */}
      <div style={{ pageBreakBefore: 'always', marginTop: '3em' }}>
        <H2>EXHIBIT A — SCOPE OF SERVICES & CONSUMPTION TIERS</H2>
        <p><strong>A1. Platform Services:</strong></p>
        <ol style={{ paddingLeft: '1.2em' }}>
          <li>Full access to the RinglyPro AI platform, including all AI agents, dashboards, analytics, and integrations.</li>
          <li>Data intake, analysis, and AI-powered optimization recommendations.</li>
          <li>Automated usage metering with real-time consumption dashboards.</li>
          <li>Real-time monitoring, anomaly detection, and automated alerting.</li>
          <li>AI agent orchestration — pipeline scoring, pricing governance, billing control, and renewal optimization.</li>
          <li>Document generation: proposals, reports, and contracts.</li>
          <li>{form.onboarding_hours} hours onboarding support including training, data import, and workflow configuration.</li>
          <li>Business-hours support via email and platform chat, 24-hour SLA for critical issues.</li>
        </ol>

        <p style={{ marginTop: '1.5em' }}><strong>A2. Consumption Tier Details:</strong></p>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '1em 0' }}>
          <thead>
            <tr style={{ background: '#F1F5F9' }}>
              <th style={thStyle}>Tier</th>
              <th style={thStyle}>Included Units/Mo</th>
              <th style={thStyle}>Platform Fee/Mo</th>
              <th style={thStyle}>Best For</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>Starter</td><td style={tdStyle}>25,000</td><td style={tdStyle}>$1,500</td><td style={tdStyle}>Small teams, single workflow</td></tr>
            <tr><td style={tdStyle}>Growth</td><td style={tdStyle}>50,000</td><td style={tdStyle}>$2,500</td><td style={tdStyle}>Multi-workflow, analytics + alerts</td></tr>
            <tr><td style={tdStyle}>Enterprise</td><td style={tdStyle}>150,000</td><td style={tdStyle}>$5,000</td><td style={tdStyle}>Full platform, custom integrations</td></tr>
          </tbody>
        </table>

        <p style={{ marginTop: '1.5em' }}><strong>A3. Agentified Revenue Engine — Value Delivery Framework:</strong></p>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '1em 0' }}>
          <thead>
            <tr style={{ background: '#F1F5F9' }}>
              <th style={thStyle}>Lifecycle Stage</th>
              <th style={thStyle}>AI Capabilities</th>
              <th style={thStyle}>Expected Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}><strong>Pipeline & Demand Generation</strong></td>
              <td style={tdStyle}>AI scoring, signal-driven prioritization, campaign orchestration</td>
              <td style={tdStyle}>Higher conversion, improved pipeline quality</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Pricing & Deal Governance</strong></td>
              <td style={tdStyle}>Guardrailed pricing, automated discount compliance, margin protection</td>
              <td style={tdStyle}>Reduced discount sprawl, protected gross margin</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Consumption & Billing Control</strong></td>
              <td style={tdStyle}>Automated metering, overage enforcement, under-billing detection</td>
              <td style={tdStyle}>Reduced post-sale leakage, improved revenue capture</td>
            </tr>
            <tr>
              <td style={tdStyle}><strong>Renewal & Expansion</strong></td>
              <td style={tdStyle}>Renewal risk scoring, consumption-triggered upsell, automated repricing</td>
              <td style={tdStyle}>Higher NRR (+2-5%), improved expansion velocity</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

function H2({ children }) {
  return <h2 style={{ fontSize: '13pt', color: '#1B2A4A', borderBottom: '1px solid #CBD5E1', paddingBottom: 4, marginTop: '1.5em', marginBottom: '.5em' }}>{children}</h2>
}

function Field({ label, value, onChange, placeholder, type = 'text', full, step }) {
  const cls = full ? 'sm:col-span-2' : ''
  if (type === 'textarea') {
    return (
      <div className={cls}>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{label}</label>
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input-field w-full" rows={3} />
      </div>
    )
  }
  return (
    <div className={cls}>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} step={step} className="input-field w-full" />
    </div>
  )
}

const thStyle = { border: '1px solid #CBD5E1', padding: '8px 12px', textAlign: 'left', fontSize: '10pt', fontWeight: 600, background: '#F1F5F9' }
const tdStyle = { border: '1px solid #CBD5E1', padding: '8px 12px', textAlign: 'left', fontSize: '10pt' }
const sigLine = { borderTop: '1px solid #1E293B', marginTop: '3em', paddingTop: 4, fontSize: '10pt' }