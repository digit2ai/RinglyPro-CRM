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
    // Outcome-based pricing: implementation + usage (client pays) + % of cost reduction
    implementation_fee: 14000,
    ai_consumption_rate: 0.012,
    outcome_fee_pct: 2.5,
    outcome_categories: ['labor_cost_reduction', 'throughput_improvement', 'error_reduction', 'leakage_reduction'],
    baseline_period_days: 90,
    onboarding_hours: 10,
    impl_timeline_weeks: 8,
  })

  const fmt = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

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

  const OUTCOME_OPTIONS = [
    { key: 'labor_cost_reduction', label: 'Labor Cost Reduction' },
    { key: 'throughput_improvement', label: 'Throughput Improvement' },
    { key: 'error_reduction', label: 'Error / Quality Improvement' },
    { key: 'leakage_reduction', label: 'Revenue Leakage Reduction' },
    { key: 'space_optimization', label: 'Space / Capacity Optimization' },
    { key: 'inventory_accuracy', label: 'Inventory Accuracy Gains' },
  ]

  const toggleOutcome = (key) => {
    setForm(f => {
      const cats = f.outcome_categories.includes(key)
        ? f.outcome_categories.filter(c => c !== key)
        : [...f.outcome_categories, key]
      return { ...f, outcome_categories: cats }
    })
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-white mb-1">Enterprise Services Agreement</h1>
      <p className="text-slate-400 text-sm mb-8">Outcome-based contract — implementation + AI usage (paid by client) + 2.5% of documented cost reduction</p>

      {/* Progress */}
      <div className="flex mb-8 gap-2">
        {['Parties & Dates', 'Pricing & Outcomes', 'Preview', 'Export'].map((label, i) => {
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
            <button className="btn-primary" onClick={() => goStep(2)}>Next: Pricing & Outcomes →</button>
          </div>
        </div>
      )}

      {/* Step 2: Pricing & Outcome Model */}
      {step === 2 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">Step 2 — Pricing & Outcome-Based Fees</h3>

          {/* Base Pricing Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="One-Time Implementation Fee ($)" type="number" value={form.implementation_fee} onChange={v => update('implementation_fee', parseFloat(v) || 0)} />
            <Field label="AI Consumption Rate ($/unit) — paid by Client" type="number" value={form.ai_consumption_rate} onChange={v => update('ai_consumption_rate', parseFloat(v) || 0)} step="0.001" />
            <Field label="Onboarding Hours" type="number" value={form.onboarding_hours} onChange={v => update('onboarding_hours', parseInt(v) || 0)} />
            <Field label="Implementation Timeline (weeks)" type="number" value={form.impl_timeline_weeks} onChange={v => update('impl_timeline_weeks', parseInt(v) || 0)} />
          </div>

          {/* Outcome Fee Section */}
          <div className="bg-slate-700/30 border border-blue-500/30 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <h4 className="text-sm font-semibold text-white">Outcome-Based Fee — Value Capture Layer</h4>
            </div>
            <p className="text-xs text-slate-400">Charged as a percentage of documented, measurable cost reduction and value delivered by the platform. Reconciled quarterly against an agreed pre-implementation baseline.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Outcome Fee (% of documented savings)" type="number" value={form.outcome_fee_pct} onChange={v => update('outcome_fee_pct', parseFloat(v) || 0)} />
              <Field label="Baseline Measurement Period (days)" type="number" value={form.baseline_period_days} onChange={v => update('baseline_period_days', parseInt(v) || 90)} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Measurable Outcome Categories</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {OUTCOME_OPTIONS.map(o => (
                  <button key={o.key} onClick={() => toggleOutcome(o.key)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      form.outcome_categories.includes(o.key)
                        ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}>
                    {form.outcome_categories.includes(o.key) ? '✓ ' : ''}{o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Example calculation */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
              <p className="text-xs text-slate-400 mb-2">Example at $500K/month documented savings:</p>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400">{form.outcome_fee_pct}%</div>
                  <div className="text-xs text-slate-500">Fee rate</div>
                </div>
                <div className="text-slate-500">×</div>
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-300">$500K</div>
                  <div className="text-xs text-slate-500">Monthly savings</div>
                </div>
                <div className="text-slate-500">=</div>
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-400">{fmt(500000 * form.outcome_fee_pct / 100)}/mo</div>
                  <div className="text-xs text-slate-500">Outcome fee</div>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Summary */}
          <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-white mb-3">Revenue Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Implementation (one-time)</span>
                <span className="font-bold text-amber-400">{fmt(form.implementation_fee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">AI Usage</span>
                <span className="font-medium text-slate-300">Paid by Client at actuals (${form.ai_consumption_rate}/unit)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Outcome Fee</span>
                <span className="font-medium text-emerald-400">{form.outcome_fee_pct}% of documented cost reduction</span>
              </div>
              <div className="border-t border-slate-600 pt-2 mt-2 flex justify-between">
                <span className="text-slate-300">At $500K/mo savings → Outcome Fee</span>
                <span className="font-bold text-emerald-400">{fmt(500000 * form.outcome_fee_pct / 100)}/mo ({fmt(500000 * form.outcome_fee_pct / 100 * 12)}/yr)</span>
              </div>
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
            <ContractPreview form={form} fmt={fmt} OUTCOME_OPTIONS={OUTCOME_OPTIONS} />
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

function ContractPreview({ form, fmt, OUTCOME_OPTIONS }) {
  const selectedOutcomes = OUTCOME_OPTIONS.filter(o => form.outcome_categories.includes(o.key))

  return (
    <>
      <h1 style={{ fontSize: '18pt', textAlign: 'center', marginBottom: '.5em', color: '#1B2A4A' }}>ENTERPRISE SERVICES AGREEMENT</h1>
      <p style={{ textAlign: 'center', color: '#475569', fontSize: '10pt', marginBottom: '2em' }}>
        This Enterprise Services Agreement ("Agreement") is entered into as of{' '}
        <strong>{form.effective_date || '___'}</strong> ("Effective Date") by and between:<br /><br />
        <strong>PINAXIS Analytics</strong> ("Provider")<br />
        and<br />
        <strong>{form.client_name || '_______________'}</strong> ("Client")<br />
        {form.client_address}
      </p>

      <H2>1. DEFINITIONS</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>"Services"</strong> means the AI-powered analytics, automation, and consulting services described in Exhibit A.</li>
        <li><strong>"Platform"</strong> means Provider's proprietary PINAXIS AI platform, including all AI agents, MCP tools, dashboards, and integrations.</li>
        <li><strong>"Consumption Units"</strong> means the aggregate usage of AI model tokens, API calls, workflow executions, and compute resources consumed through the Platform on Client's behalf, as metered by Provider's automated usage tracking system.</li>
        <li><strong>"Documented Savings"</strong> means the measurable, verifiable cost reduction and value improvement attributable to the Platform, calculated as the difference between the pre-implementation Baseline (Section 5) and actual post-implementation performance across the Outcome Categories defined in Exhibit B.</li>
        <li><strong>"Baseline"</strong> means the pre-implementation performance metrics measured during the first {form.baseline_period_days} days of the Agreement, establishing the reference point against which Documented Savings are calculated.</li>
        <li><strong>"Confidential Information"</strong> means all non-public information disclosed by either party.</li>
      </ol>

      <H2>2. SCOPE OF SERVICES</H2>
      <p>Provider shall deliver the Services described in Exhibit A, including:</p>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li>AI-powered data analysis, optimization, and intelligent recommendations via the Platform</li>
        <li>Real-time monitoring, anomaly detection, and predictive analytics</li>
        <li>AI agent orchestration across the operational lifecycle</li>
        <li>Automated usage metering and consumption reporting</li>
        <li>Dedicated hypercare: proactive monitoring, optimization, priority support, and regular account reviews</li>
        <li>Ongoing platform access, maintenance, and support</li>
      </ol>
      <p>Implementation: <strong>{form.impl_timeline_weeks} weeks</strong>. Onboarding: <strong>{form.onboarding_hours} hours</strong>.</p>

      <H2>3. FEES & PRICING STRUCTURE</H2>
      <p>This Agreement employs an outcome-aligned pricing model. Provider's compensation is tied directly to the measurable cost reduction and value delivered to Client, with AI usage costs borne by Client as a pass-through.</p>
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
            <td style={tdStyle}>Implementation Fee</td>
            <td style={tdStyle}><strong>{fmt(form.implementation_fee)}</strong></td>
            <td style={tdStyle}>One-time, due upon execution</td>
          </tr>
          <tr>
            <td style={tdStyle}>AI Consumption — Usage Rate (per unit)</td>
            <td style={tdStyle}><strong>${form.ai_consumption_rate.toFixed(4)}</strong></td>
            <td style={tdStyle}>Monthly, metered at actuals — paid by Client</td>
          </tr>
          <tr style={{ background: '#F0FDF4' }}>
            <td style={tdStyle}><strong>Outcome Fee — Cost Reduction Value Capture</strong></td>
            <td style={tdStyle}><strong>{form.outcome_fee_pct}%</strong> of Documented Savings</td>
            <td style={tdStyle}>Quarterly, reconciled against Baseline</td>
          </tr>
        </tbody>
      </table>

      <H2>4. AI USAGE — CLIENT-PAID CONSUMPTION</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Client-Paid Usage:</strong> All AI consumption (model tokens, API calls, workflow executions, and compute resources) is billed monthly to Client at the Consumption Rate based on actual metered usage. Client bears the full cost of AI usage as a pass-through — there are no included or bundled units.</li>
        <li><strong>Automated Usage Metering:</strong> Provider shall maintain automated metering of all Consumption Units. Client shall have access to a real-time consumption dashboard showing current usage, historical trends, and projected billing.</li>
        <li><strong>Usage Reports:</strong> Provider shall deliver a monthly consumption report detailing usage by category, AI model, workflow, and cost center.</li>
        <li><strong>Payment Terms:</strong> All invoices are due within thirty (30) days of issuance. Late payments accrue interest at 1.5% per month or the maximum rate permitted by law, whichever is less.</li>
      </ol>

      <H2>5. OUTCOME-BASED FEE — COST REDUCTION VALUE CAPTURE</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Baseline Establishment:</strong> During the first {form.baseline_period_days} days following the Effective Date, Provider and Client shall jointly measure and document pre-implementation performance metrics across all Outcome Categories (Exhibit B). This Baseline shall serve as the reference point for calculating Documented Savings.</li>
        <li><strong>Outcome Categories:</strong> The following categories shall be measured for cost reduction and value improvement:
          <ul style={{ paddingLeft: '1.2em', marginTop: '0.5em' }}>
            {selectedOutcomes.map(o => (
              <li key={o.key}>{o.label}</li>
            ))}
          </ul>
        </li>
        <li><strong>Quarterly Reconciliation:</strong> At the end of each calendar quarter, Provider and Client shall jointly review actual performance against the Baseline. The Outcome Fee of <strong>{form.outcome_fee_pct}%</strong> shall be applied to the net Documented Savings — the measurable, verified cost reduction and value improvement attributable to the Platform during that quarter.</li>
        <li><strong>Documentation & Verification:</strong> Provider shall deliver a quarterly Outcome Report showing Baseline metrics, current performance, calculated savings, and the resulting Outcome Fee. Both parties must approve the Outcome Report before the fee is invoiced.</li>
        <li><strong>Audit Rights:</strong> Either party may audit Outcome Metrics and the underlying data with fifteen (15) days' written notice. The auditing party bears the cost of the audit unless a discrepancy exceeding 5% is found, in which case the audited party bears the cost.</li>
        <li><strong>Dispute Resolution:</strong> If the parties cannot agree on the Documented Savings calculation, they shall engage a mutually agreed independent third party to make a binding determination within thirty (30) days.</li>
      </ol>

      <H2>6. TERM & RENEWAL</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Initial Term:</strong> {form.initial_term_months} months from the Effective Date.</li>
        <li><strong>Auto-Renewal:</strong> Renews for successive twelve (12) month periods unless sixty (60) days' written notice given. The Outcome Fee percentage remains fixed for the duration of the Agreement including renewals.</li>
        <li><strong>Termination for Cause:</strong> Either party may terminate upon thirty (30) days' written notice for uncured material breach.</li>
        <li><strong>Effect of Termination:</strong> Client pays all fees accrued through the termination date, including any pro-rated quarterly Outcome Fee. Provider delivers completed Deliverables and provides thirty (30) days' transition assistance.</li>
      </ol>

      <H2>7. INTELLECTUAL PROPERTY</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Provider IP:</strong> All rights in the Platform — software, algorithms, models, prompts, configurations, and methodologies — remain exclusive property of Provider.</li>
        <li><strong>Client Data:</strong> Client retains all rights to its proprietary data. Provider receives a limited license to perform the Services.</li>
        <li><strong>Deliverables:</strong> Client receives a non-exclusive, non-transferable license for internal use. Provider retains underlying IP.</li>
      </ol>

      <H2>8. NON-CIRCUMVENTION & ANTI-REVERSE ENGINEERING</H2>
      <ol style={{ paddingLeft: '1.2em' }}>
        <li><strong>Non-Circumvention:</strong> During the term and for twenty-four (24) months thereafter, Client shall not directly or indirectly replicate or substitute the Services using substantially similar AI tools, prompts, workflows, or methodologies.</li>
        <li><strong>Anti-Reverse Engineering:</strong> Client shall not reverse engineer, decompile, or attempt to derive Platform source code, algorithms, prompts, or architecture.</li>
        <li><strong>Remedies:</strong> Breach entitles Provider to injunctive relief in addition to all other remedies at law or equity.</li>
      </ol>

      <H2>9. CONFIDENTIALITY</H2>
      <p>Each party agrees to hold in strict confidence all Confidential Information. This obligation survives termination for three (3) years.</p>

      <H2>10. LIMITATION OF LIABILITY</H2>
      <p style={{ textTransform: 'uppercase', fontSize: '10pt' }}>
        Neither party's aggregate liability shall exceed the total fees paid in the twelve (12) months preceding the claim. Neither party shall be liable for indirect, incidental, special, consequential, or punitive damages.
      </p>

      <H2>11. GOVERNING LAW</H2>
      <p>State of {form.jurisdiction}. Disputes resolved in state or federal courts located in {form.jurisdiction}.</p>

      <H2>12. GENERAL PROVISIONS</H2>
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
          <div style={sigLine}><strong>PINAXIS Analytics</strong></div>
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
        <H2>EXHIBIT A — SCOPE OF SERVICES</H2>
        <p><strong>A1. Platform Services:</strong></p>
        <ol style={{ paddingLeft: '1.2em' }}>
          <li>Full access to the PINAXIS AI platform, including all AI agents, dashboards, analytics, and integrations.</li>
          <li>Data intake, analysis, and AI-powered optimization recommendations.</li>
          <li>Automated usage metering with real-time consumption dashboards.</li>
          <li>Real-time monitoring, anomaly detection, and automated alerting.</li>
          <li>AI agent orchestration — pipeline scoring, pricing governance, billing control, and renewal optimization.</li>
          <li>Document generation: proposals, reports, and contracts.</li>
          <li>{form.onboarding_hours} hours onboarding support including training, data import, and workflow configuration.</li>
          <li>Dedicated hypercare: proactive monitoring, optimization recommendations, priority issue resolution, and regular account reviews.</li>
          <li>Business-hours support via email and platform chat, 24-hour SLA for critical issues.</li>
        </ol>

        <p style={{ marginTop: '1.5em' }}><strong>A2. Pricing Model:</strong></p>
        <p style={{ fontSize: '10pt', color: '#475569' }}>Provider receives a one-time Implementation Fee of {fmt(form.implementation_fee)}. All AI usage is paid by Client monthly at the agreed Consumption Rate based on actual metered consumption. Provider's ongoing compensation is the Outcome Fee — {form.outcome_fee_pct}% of Documented Savings, reconciled quarterly against the pre-implementation Baseline.</p>
      </div>

      {/* Exhibit B */}
      <div style={{ pageBreakBefore: 'always', marginTop: '3em' }}>
        <H2>EXHIBIT B — OUTCOME CATEGORIES & MEASUREMENT FRAMEWORK</H2>
        <p>The following categories shall be measured for Documented Savings. The Baseline for each category will be established during the first {form.baseline_period_days} days of the Agreement.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '1em 0' }}>
          <thead>
            <tr style={{ background: '#F1F5F9' }}>
              <th style={thStyle}>Outcome Category</th>
              <th style={thStyle}>Measurement Method</th>
              <th style={thStyle}>Expected Impact Range</th>
            </tr>
          </thead>
          <tbody>
            {form.outcome_categories.includes('labor_cost_reduction') && (
              <tr>
                <td style={tdStyle}><strong>Labor Cost Reduction</strong></td>
                <td style={tdStyle}>Headcount hours saved × loaded labor rate, verified against payroll/scheduling data</td>
                <td style={tdStyle}>15-40% reduction in targeted labor categories</td>
              </tr>
            )}
            {form.outcome_categories.includes('throughput_improvement') && (
              <tr>
                <td style={tdStyle}><strong>Throughput Improvement</strong></td>
                <td style={tdStyle}>Units processed per hour/shift vs. Baseline, measured at system level</td>
                <td style={tdStyle}>10-30% increase in cases/lines per hour</td>
              </tr>
            )}
            {form.outcome_categories.includes('error_reduction') && (
              <tr>
                <td style={tdStyle}><strong>Error / Quality Improvement</strong></td>
                <td style={tdStyle}>Error rate reduction (mispicks, mislabels, shipping errors) vs. Baseline</td>
                <td style={tdStyle}>30-60% reduction in error rate</td>
              </tr>
            )}
            {form.outcome_categories.includes('leakage_reduction') && (
              <tr>
                <td style={tdStyle}><strong>Revenue Leakage Reduction</strong></td>
                <td style={tdStyle}>Under-billing detection, discount compliance, margin protection vs. Baseline</td>
                <td style={tdStyle}>2-4% reduction in revenue leakage</td>
              </tr>
            )}
            {form.outcome_categories.includes('space_optimization') && (
              <tr>
                <td style={tdStyle}><strong>Space / Capacity Optimization</strong></td>
                <td style={tdStyle}>Storage utilization improvement, reduced footprint requirements vs. Baseline</td>
                <td style={tdStyle}>15-25% improvement in space utilization</td>
              </tr>
            )}
            {form.outcome_categories.includes('inventory_accuracy') && (
              <tr>
                <td style={tdStyle}><strong>Inventory Accuracy Gains</strong></td>
                <td style={tdStyle}>Inventory accuracy rate improvement, shrinkage reduction vs. Baseline</td>
                <td style={tdStyle}>95%+ accuracy target, 20-40% shrinkage reduction</td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ fontSize: '10pt', color: '#475569', marginTop: '1em' }}><strong>Reconciliation Process:</strong> At the end of each calendar quarter, Provider delivers an Outcome Report. Client has fifteen (15) business days to review and approve. Upon approval, the Outcome Fee ({form.outcome_fee_pct}% of net Documented Savings for the quarter) is invoiced with standard payment terms.</p>
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
