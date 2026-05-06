import React, { useState } from 'react'

export default function ContractBuilderPage() {
  const [step, setStep] = useState(1)
  const [toast, setToast] = useState(null)

  const [form, setForm] = useState({
    client_name: '',
    client_address: '',
    effective_date: '2026-05-11',
    initial_term_months: 12,
    jurisdiction: 'Florida',
    // Outcome-based pricing: license fee + usage (client pays) + % of cost reduction
    license_fee: 140000,
    initial_deposit_pct: 10,
    ai_consumption_rate: 0.012,
    outcome_fee_pct: 0,
    outcome_categories: ['labor_cost_reduction', 'throughput_improvement', 'error_reduction', 'leakage_reduction'],
    baseline_period_days: 90,
    onboarding_hours: 10,
    impl_timeline_weeks: 8,
    // Executive summary inputs — configurable, default reflects build to date (start 2026-03-02)
    lines_of_code: 21051,
    build_start_date: '2026-03-02',
    // Deployment model — affects on-prem responsibility language in contract
    deployment_model: 'on_premises', // 'cloud' | 'on_premises' | 'hybrid'
  })

  const fmt = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // Derived pricing — initial deposit on signing, remainder amortized across term
  const initialDeposit = form.license_fee * (form.initial_deposit_pct / 100)
  const remainingLicense = form.license_fee - initialDeposit
  const monthlyLicensePayment = form.initial_term_months > 0 ? remainingLicense / form.initial_term_months : 0
  // P2P-standard PO number: PNX-YYMM-NNNN (13 chars, fits SAP/Coupa/Ariba/Oracle/NetSuite PO fields)
  const yymm = (form.effective_date || '').slice(2, 7).replace('-', '') || '0000'
  const hash4 = (s) => {
    let h = 0
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
    return String(Math.abs(h) % 10000).padStart(4, '0')
  }
  const invoiceNumber = `PNX-${yymm}-${hash4(form.client_name || 'DRAFT')}`
  const pricing = { initialDeposit, remainingLicense, monthlyLicensePayment, invoiceNumber }

  const goStep = (n) => setStep(n)

  const PRINT_STYLES = `
    @page{margin:1in}
    body{font-family:'Barlow','Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-size:11pt;line-height:1.6;color:#32373C;max-width:8.5in;margin:0 auto;padding:1in;-webkit-font-smoothing:antialiased;background:#fff}
    h1{font-family:'Lexend Deca','Barlow',sans-serif;font-size:18pt;text-align:center;margin-bottom:.5em;color:#262745;font-weight:700;letter-spacing:.5px}
    h2{font-family:'Lexend Deca','Barlow',sans-serif;font-size:13pt;color:#262745;border-bottom:1px solid #CBD5E1;padding-bottom:4px;margin-top:1.5em;font-weight:600;letter-spacing:.3px}
    ul,ol{padding-left:1.2em}li{margin-bottom:.5em}
    table{width:100%;border-collapse:collapse;margin:1em 0}
    th,td{border:1px solid #CBD5E1;padding:8px 12px;text-align:left;font-size:10pt}
    th{background:#F1F5F9;font-weight:600;font-family:'Barlow',sans-serif}
    strong,b{font-weight:600}
    .sig-line{border-top:1px solid #262745;margin-top:3em;padding-top:4px;font-size:10pt}
  `

  const printContract = () => {
    const el = document.getElementById('contractPreview')
    if (!el) { showToast('Open the Preview step first'); return }
    const title = `Service Contract Invoice — ${form.client_name || 'Draft'}`
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700;800&family=Lexend+Deca:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>${PRINT_STYLES}</style></head><body>${el.innerHTML}
      <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},400);});<\/script>
      </body></html>`

    // Use a hidden iframe — survives popup blockers and avoids about:blank issues
    const existing = document.getElementById('pinaxisPrintFrame')
    if (existing) existing.remove()
    const iframe = document.createElement('iframe')
    iframe.id = 'pinaxisPrintFrame'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()
    showToast('Opening print dialog…')
  }

  const downloadPdf = () => {
    const el = document.getElementById('contractPreview')
    if (!el) { showToast('Open the Preview step first'); return }
    if (typeof window === 'undefined' || !window.html2pdf) {
      showToast('PDF library still loading — try again in a moment'); return
    }
    showToast('Generating PDF…')
    const filename = `PINAXIS-Service-Contract-${(form.client_name || 'Draft').replace(/[^A-Za-z0-9]/g, '_')}-${form.effective_date || 'undated'}.pdf`

    // Walk up the ancestor chain — any with display:none must be force-shown so html2canvas
    // can compute layout (otherwise the rendered canvas is blank).
    const restoreList = []
    let node = el
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node)
      if (cs.display === 'none') {
        restoreList.push({ el: node, prop: 'display', orig: node.style.display })
        node.style.display = 'block'
      }
      if (cs.visibility === 'hidden') {
        restoreList.push({ el: node, prop: 'visibility', orig: node.style.visibility })
        node.style.visibility = 'visible'
      }
      node = node.parentElement
    }

    // Lift the on-screen height clamp on the preview itself
    const origMaxHeight = el.style.maxHeight
    const origOverflow = el.style.overflow
    el.style.maxHeight = 'none'
    el.style.overflow = 'visible'

    const restore = () => {
      el.style.maxHeight = origMaxHeight
      el.style.overflow = origOverflow
      restoreList.forEach(r => { r.el.style[r.prop] = r.orig })
    }

    window.html2pdf()
      .set({
        margin: [0.5, 0.5, 0.5, 0.5],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, letterRendering: true, backgroundColor: '#ffffff', windowWidth: 900 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      })
      .from(el)
      .save()
      .then(() => { restore(); showToast('PDF downloaded') })
      .catch(err => { restore(); console.error('[PDF]', err); showToast('PDF generation failed — see browser console') })
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
      <h1 className="text-2xl font-bold text-white mb-1">Service Contract Invoice / Purchase Order</h1>
      <p className="text-slate-400 text-sm mb-8">License fee with 10% initial deposit + AI usage (paid by client) + outcome fee on documented cost reduction</p>

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
            <Field label="License Fee ($)" type="number" value={form.license_fee} onChange={v => update('license_fee', parseFloat(v) || 0)} />
            <Field label="Initial Deposit (% of License Fee)" type="number" value={form.initial_deposit_pct} onChange={v => update('initial_deposit_pct', parseFloat(v) || 0)} step="0.5" />
            <Field label="AI Consumption Rate ($/unit) — paid by Client" type="number" value={form.ai_consumption_rate} onChange={v => update('ai_consumption_rate', parseFloat(v) || 0)} step="0.001" />
            <Field label="Onboarding Hours" type="number" value={form.onboarding_hours} onChange={v => update('onboarding_hours', parseInt(v) || 0)} />
            <Field label="Implementation Timeline (weeks)" type="number" value={form.impl_timeline_weeks} onChange={v => update('impl_timeline_weeks', parseInt(v) || 0)} />
            <Field label="Lines of Code Delivered" type="number" value={form.lines_of_code} onChange={v => update('lines_of_code', parseInt(v) || 0)} />
            <Field label="Build Start Date" type="date" value={form.build_start_date} onChange={v => update('build_start_date', v)} />
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Deployment Model</label>
              <select value={form.deployment_model} onChange={e => update('deployment_model', e.target.value)} className="input-field w-full">
                <option value="cloud">Cloud (PINAXIS-hosted)</option>
                <option value="on_premises">On-Premises (Client environment)</option>
                <option value="hybrid">Hybrid (data local, analytics cloud)</option>
              </select>
            </div>
          </div>

          {/* License Fee Breakdown */}
          <div className="bg-slate-700/30 border border-amber-500/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <h4 className="text-sm font-semibold text-white">License Fee Breakdown</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-600">
                <div className="text-xs text-slate-500 uppercase tracking-wide">Initial Deposit ({form.initial_deposit_pct}%)</div>
                <div className="text-lg font-bold text-amber-400 mt-1">{fmt(initialDeposit)}</div>
                <div className="text-[10px] text-slate-500 mt-1">Due upon signing</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-600">
                <div className="text-xs text-slate-500 uppercase tracking-wide">Remaining License</div>
                <div className="text-lg font-bold text-slate-300 mt-1">{fmt(remainingLicense)}</div>
                <div className="text-[10px] text-slate-500 mt-1">Amortized across {form.initial_term_months} months</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-600">
                <div className="text-xs text-slate-500 uppercase tracking-wide">Monthly License Payment</div>
                <div className="text-lg font-bold text-emerald-400 mt-1">{fmt(monthlyLicensePayment)}/mo</div>
                <div className="text-[10px] text-slate-500 mt-1">Deducted from remaining {form.initial_term_months}-month term</div>
              </div>
            </div>
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
                <span className="text-slate-400">License Fee (total)</span>
                <span className="font-bold text-amber-400">{fmt(form.license_fee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">— Initial Deposit ({form.initial_deposit_pct}%) due on signing</span>
                <span className="font-medium text-amber-400">{fmt(initialDeposit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">— Monthly License Payment ({form.initial_term_months} mo)</span>
                <span className="font-medium text-emerald-400">{fmt(monthlyLicensePayment)}/mo</span>
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

      {/* Step 3: Preview — kept mounted on Step 4 too so Print/Download can read #contractPreview */}
      <div className="card space-y-4" style={{ display: step === 3 ? 'block' : 'none' }}>
        <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">Step 3 — Contract Preview</h3>
        <div id="contractPreview" className="bg-white rounded-lg p-8 max-h-[600px] overflow-y-auto" style={{ fontFamily: "'Barlow', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: '11pt', lineHeight: 1.6, color: '#32373C' }}>
          <ContractPreview form={form} fmt={fmt} OUTCOME_OPTIONS={OUTCOME_OPTIONS} pricing={pricing} />
        </div>
        <div className="flex justify-between pt-2">
          <button className="btn-secondary" onClick={() => goStep(2)}>← Back</button>
          <button className="btn-primary" onClick={() => goStep(4)}>Next: Export →</button>
        </div>
      </div>

      {/* Step 4: Export */}
      {step === 4 && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-3">Step 4 — Export & Save</h3>
          <p className="text-slate-400 text-sm">Download the signed-ready PDF, or open the print dialog.</p>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={downloadPdf}
              className="p-6 bg-slate-700/30 border border-slate-600 rounded-lg text-center hover:border-emerald-500 transition-all">
              <div className="text-3xl mb-3">⬇</div>
              <h4 className="text-sm font-semibold text-white mb-1">Download as PDF</h4>
              <p className="text-xs text-slate-400">Saves a Pinaxis-branded PDF copy of the Service Contract Invoice to your device</p>
            </button>
            <button onClick={printContract}
              className="p-6 bg-slate-700/30 border border-slate-600 rounded-lg text-center hover:border-blue-500 transition-all">
              <div className="text-3xl mb-3">🖨</div>
              <h4 className="text-sm font-semibold text-white mb-1">Print</h4>
              <p className="text-xs text-slate-400">Opens print dialog (also offers Save-as-PDF as a destination)</p>
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

function ContractPreview({ form, fmt, OUTCOME_OPTIONS, pricing }) {
  const selectedOutcomes = OUTCOME_OPTIONS.filter(o => form.outcome_categories.includes(o.key))
  const { initialDeposit, remainingLicense, monthlyLicensePayment, invoiceNumber } = pricing

  return (
    <>
      {/* INVOICE / PURCHASE ORDER HEADER */}
      <div style={{ borderTop: '4px solid #00968A', paddingTop: '1em', marginBottom: '1.5em' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '1em', borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <h1 style={{ fontFamily: "'Lexend Deca', 'Barlow', sans-serif", fontSize: '20pt', margin: 0, color: '#262745', letterSpacing: '0.5px', fontWeight: 700, textAlign: 'left' }}>Service Contract Invoice</h1>
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '10pt', color: '#00968A', margin: '4px 0 0 0', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: 600 }}>Purchase Order &amp; Payment Schedule</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10pt' }}>
            <div style={{ fontFamily: "'Lexend Deca', 'Barlow', sans-serif", fontSize: '16pt', fontWeight: 700, color: '#262745', letterSpacing: '0.5px' }}>PINAXIS</div>
            <div style={{ fontFamily: "'Barlow', sans-serif", color: '#00968A', fontWeight: 600, fontSize: '9pt', letterSpacing: '1px', textTransform: 'uppercase' }}>Warehouse Intelligence</div>
          </div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5em', fontSize: '10pt' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: '1em' }}>
              <div style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748B', marginBottom: '4px' }}>Bill To / Purchaser</div>
              <div style={{ fontWeight: 700, fontSize: '11pt' }}>{form.client_name || '_______________'}</div>
              <div style={{ whiteSpace: 'pre-wrap', color: '#475569' }}>{form.client_address || ''}</div>
            </td>
            <td style={{ width: '50%', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={metaLabel}>Invoice / PO No.</td><td style={metaValue}>{invoiceNumber}</td></tr>
                  <tr><td style={metaLabel}>Issue Date</td><td style={metaValue}>{form.effective_date || '___'}</td></tr>
                  <tr><td style={metaLabel}>Effective Date</td><td style={metaValue}>{form.effective_date || '___'}</td></tr>
                  <tr><td style={metaLabel}>Term</td><td style={metaValue}>{form.initial_term_months} months</td></tr>
                  <tr><td style={metaLabel}>Payment Terms</td><td style={metaValue}>Deposit on signing; Net 30 thereafter</td></tr>
                  <tr><td style={metaLabel}>Currency</td><td style={metaValue}>USD</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* EXECUTIVE SUMMARY — what's been built, hours invested, ecosystem footprint */}
      <H2>Executive Summary</H2>
      <p style={{ marginTop: '0.5em' }}>
        As of <strong>{form.effective_date || '___'}</strong>, PINAXIS Analytics has shipped <strong>{Number(form.lines_of_code).toLocaleString()} lines of production code</strong> for
        the design, development, and deployment of the PINAXIS Warehouse Intelligence Platform — a production-grade,
        multi-tenant analytics ecosystem custom-built for {form.client_name || 'the Client'}. Build commenced on{' '}
        <strong>{form.build_start_date || '___'}</strong>, and the platform is presently live, monitored, and accepting
        production traffic at <strong>aiagent.ringlypro.com/pinaxis</strong>.
      </p>
      <p>
        The delivered ecosystem comprises <strong>13 integrated user-facing modules</strong> spanning the full
        warehouse-intelligence lifecycle (data intake → analysis → product matching → simulation → commercial
        modeling → proposal generation), <strong>17 backend service domains</strong> exposed as REST + MCP-tool
        APIs, <strong>9 dedicated analytics services</strong> (parser, metrics extractor, Monte-Carlo simulator,
        benefit projector, product matcher, report generator, video/audio narration, synthetic data, bulk
        ingestion), <strong>16 production database tables</strong>, and live integrations with Anthropic Claude
        (LLM), ElevenLabs (Rachel voice agent), PostgreSQL, and Render auto-deployment. The platform is fronted
        by an authenticated React SPA and an automated narrated proposal generator with Chart.js
        visualizations.
      </p>
      {form.deployment_model === 'on_premises' && (
        <p style={{ background: '#FEF3C7', border: '1px solid #FCD34D', padding: '12px 14px', borderRadius: '6px', fontSize: '10pt' }}>
          <strong>On-Premises Deployment Notice.</strong> This Agreement contemplates an <strong>on-premises
          installation</strong>. Client (Pinaxis) is responsible for provisioning and maintaining the runtime
          environment and underlying infrastructure — server capacity, network, storage, OS patching, identity
          provider, certificate management, monitoring, backup, and disaster recovery — in accordance with the
          Strategic Integration Plan summarized in <strong>Exhibit D</strong>. Provider supplies the Platform
          software, deployment artifacts, configuration templates, and onboarding support, but is not
          responsible for Client-side hardware procurement, data-center operations, or third-party service
          contracts.
        </p>
      )}
      <p>
        This Service Contract Invoice / Purchase Order memorializes the License terms under which {form.client_name || 'the Client'} obtains
        operational access to the platform, the AI consumption pass-through, and the outcome-based fee
        structure described below. A complete inventory of delivered modules, services, and integrations is
        attached as <strong>Exhibit C — Platform Deliverables</strong>{form.deployment_model === 'on_premises' ? <>, with on-premises infrastructure scope detailed in <strong>Exhibit D — Strategic Integration Plan Summary</strong></> : null}.
      </p>

      {/* INVOICE LINE ITEMS */}
      <H2>LINE ITEMS</H2>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5em 0 1em 0' }}>
        <thead>
          <tr style={{ background: '#00968A', color: '#fff' }}>
            <th style={{ ...thStyle, background: '#00968A', color: '#fff', borderColor: '#00968A' }}>Description</th>
            <th style={{ ...thStyle, background: '#00968A', color: '#fff', borderColor: '#00968A', textAlign: 'right' }}>Qty</th>
            <th style={{ ...thStyle, background: '#00968A', color: '#fff', borderColor: '#00968A', textAlign: 'right' }}>Rate</th>
            <th style={{ ...thStyle, background: '#00968A', color: '#fff', borderColor: '#00968A', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}><strong>License Fee</strong> — Total contract value</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>1</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(form.license_fee)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(form.license_fee)}</td>
          </tr>
          <tr style={{ background: '#FEF3C7' }}>
            <td style={tdStyle}><strong>Initial Deposit ({form.initial_deposit_pct}%)</strong> — Due upon signing<br /><span style={{ fontSize: '9pt', color: '#475569' }}>Credited against License Fee; deducted from remaining monthly payments</span></td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>1</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>—</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#92400E' }}>{fmt(initialDeposit)}</td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>Monthly License Payment</strong> — Remaining {fmt(remainingLicense)} amortized over {form.initial_term_months} months</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{form.initial_term_months}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(monthlyLicensePayment)}/mo</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(remainingLicense)}</td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>AI Consumption</strong> — Pass-through usage, metered monthly</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>actuals</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>${form.ai_consumption_rate.toFixed(4)}/unit</td>
            <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>at actuals</td>
          </tr>
          <tr style={{ background: '#F0FDF4' }}>
            <td style={tdStyle}><strong>Outcome Fee</strong> — % of Documented Savings, reconciled quarterly</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>quarterly</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{form.outcome_fee_pct}%</td>
            <td style={{ ...tdStyle, textAlign: 'right', color: '#065F46' }}>per Section 5</td>
          </tr>
        </tbody>
        <tfoot>
          <tr style={{ background: '#F1F5F9' }}>
            <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>Total License Value (fixed)</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(form.license_fee)}</td>
          </tr>
        </tfoot>
      </table>

      <H2>PAYMENT SCHEDULE</H2>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5em 0 1.5em 0' }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            <th style={thStyle}>When</th>
            <th style={thStyle}>What</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}><strong>Upon Signing ({form.effective_date || '___'})</strong></td>
            <td style={tdStyle}>Initial Deposit — {form.initial_deposit_pct}% of License Fee</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#92400E' }}>{fmt(initialDeposit)}</td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>Monthly (Months 1–{form.initial_term_months})</strong></td>
            <td style={tdStyle}>Monthly License Payment + AI Usage actuals</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(monthlyLicensePayment)}/mo + usage</td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>AI Usage (per month)</strong></td>
            <td style={tdStyle}>Client is responsible for API Usage Cost (pass-through, metered)</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>at actuals</td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '10pt', color: '#475569', fontStyle: 'italic', marginBottom: '2em' }}>
        This Service Contract Invoice / Purchase Order is binding upon signature below and is governed by the Service Contract Terms &amp; Conditions that follow.
      </p>

      <h1 style={{ fontFamily: "'Lexend Deca', 'Barlow', sans-serif", fontSize: '14pt', textAlign: 'center', margin: '1.5em 0 .5em 0', color: '#262745', borderTop: '1px solid #CBD5E1', paddingTop: '1em', fontWeight: 700, letterSpacing: '0.5px' }}>Service Contract — Terms &amp; Conditions</h1>
      <p style={{ textAlign: 'center', color: '#475569', fontSize: '10pt', marginBottom: '2em' }}>
        These terms form an integral part of the Service Contract Invoice / Purchase Order above, entered into as of{' '}
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
      <p>This Agreement employs an outcome-aligned pricing model. Provider's compensation comprises a License Fee (paid as an Initial Deposit on signing plus monthly amortization across the Initial Term), AI usage costs borne by Client as a pass-through, and an Outcome Fee tied to documented cost reduction.</p>
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
            <td style={tdStyle}>License Fee — Total</td>
            <td style={tdStyle}><strong>{fmt(form.license_fee)}</strong></td>
            <td style={tdStyle}>Fixed, payable per schedule below</td>
          </tr>
          <tr style={{ background: '#FEF3C7' }}>
            <td style={tdStyle}>License Fee — Initial Deposit ({form.initial_deposit_pct}%)</td>
            <td style={tdStyle}><strong>{fmt(initialDeposit)}</strong></td>
            <td style={tdStyle}>Due upon execution — credited against License Fee and deducted from remaining monthly payments</td>
          </tr>
          <tr>
            <td style={tdStyle}>License Fee — Monthly Amortization</td>
            <td style={tdStyle}><strong>{fmt(monthlyLicensePayment)}</strong>/mo × {form.initial_term_months}</td>
            <td style={tdStyle}>Monthly, Net 30, for the Initial Term ({fmt(remainingLicense)} total)</td>
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
        <p style={{ fontSize: '10pt', color: '#475569' }}>Provider receives a License Fee of {fmt(form.license_fee)}, payable as a {form.initial_deposit_pct}% Initial Deposit ({fmt(initialDeposit)}) due upon signing — which is credited against the License Fee and deducted from the remaining monthly payments — followed by {form.initial_term_months} monthly payments of {fmt(monthlyLicensePayment)} amortizing the {fmt(remainingLicense)} balance. All AI usage is paid by Client monthly at the agreed Consumption Rate based on actual metered consumption. Provider's ongoing compensation also includes the Outcome Fee — {form.outcome_fee_pct}% of Documented Savings, reconciled quarterly against the pre-implementation Baseline.</p>
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

      {/* Exhibit C — Platform Deliverables */}
      <div style={{ pageBreakBefore: 'always', marginTop: '3em' }}>
        <H2>EXHIBIT C — PLATFORM DELIVERABLES &amp; ECOSYSTEM</H2>
        <p>The following modules, services, integrations, and data assets constitute the PINAXIS Warehouse Intelligence Platform delivered to Client under this Agreement. All items are presently live in production at <strong>aiagent.ringlypro.com/pinaxis</strong> and are covered by the License Fee, AI Consumption pass-through, and Outcome Fee defined in Section 3.</p>

        <p style={{ marginTop: '1em' }}><strong>C1. User-Facing Modules</strong> — 13 production React pages, single sign-on protected:</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5em 0 1em 0' }}>
          <thead>
            <tr style={{ background: '#F1F5F9' }}>
              <th style={thStyle}>Module</th>
              <th style={thStyle}>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}><strong>Data Intake</strong></td><td style={tdStyle}>Multi-file warehouse data upload (item master, inventory, goods-in, goods-out) with auto-detection and validation</td></tr>
            <tr><td style={tdStyle}><strong>Analysis</strong></td><td style={tdStyle}>Overview KPIs, ABC classification, XYZ classification, fit analysis, hourly throughput, weekday/monthly trends, percentiles, growth extrapolation, system architecture readiness</td></tr>
            <tr><td style={tdStyle}><strong>Concepts</strong></td><td style={tdStyle}>Automated product matching against the RinglyPro Logistics catalog with ranked recommendations</td></tr>
            <tr><td style={tdStyle}><strong>Simulation</strong></td><td style={tdStyle}>Monte-Carlo scenario engine producing low / baseline / high outcomes with sensitivity analysis and bottleneck identification</td></tr>
            <tr><td style={tdStyle}><strong>Commercial / Benefits</strong></td><td style={tdStyle}>Quantified benefit projections (labor, throughput, errors, leakage) with monthly and annual rollups</td></tr>
            <tr><td style={tdStyle}><strong>Proposal</strong></td><td style={tdStyle}>One-click PDF report generation tailored to project analysis</td></tr>
            <tr><td style={tdStyle}><strong>Presentation</strong></td><td style={tdStyle}>Auto-narrated 11-slide playbook with Chart.js visualizations and Rachel AI voice (TTS via ElevenLabs)</td></tr>
            <tr><td style={tdStyle}><strong>API Integration</strong></td><td style={tdStyle}>Production API key management — generate / view / revoke per-project keys for ingest endpoints</td></tr>
            <tr><td style={tdStyle}><strong>NDA</strong></td><td style={tdStyle}>Multi-party e-signature flow with database-persisted signatures</td></tr>
            <tr><td style={tdStyle}><strong>Contract Builder</strong></td><td style={tdStyle}>This module — Service Contract Invoice / PO generator (PINAXIS-branded, P2P-ready)</td></tr>
            <tr><td style={tdStyle}><strong>On-Premises Plan</strong></td><td style={tdStyle}>Self-hosted deployment guide (LLM proxy, SSO, CORS, environment configuration)</td></tr>
            <tr><td style={tdStyle}><strong>User Guide</strong></td><td style={tdStyle}>Embedded documentation: warehouse fundamentals, label-management, CPH benchmarks, three-tier DC stack, API reference</td></tr>
            <tr><td style={tdStyle}><strong>Login</strong></td><td style={tdStyle}>Multi-user authentication with persistent session</td></tr>
          </tbody>
        </table>

        <p style={{ marginTop: '1em' }}><strong>C2. Backend Service Domains</strong> — 17 REST + MCP-tool API modules:</p>
        <p style={{ fontSize: '10pt', color: '#475569', margin: '0.25em 0 0.75em 0' }}>
          <code>projects</code> · <code>upload</code> · <code>analysis</code> · <code>products</code> · <code>simulation</code> · <code>benefits</code> · <code>reports</code> ·{' '}
          <code>proposal</code> (with audio TTS) · <code>video</code> · <code>demo</code> (synthetic data + instant clone) · <code>ingest</code> (API-key-authenticated production ingestion) ·{' '}
          <code>voice</code> (ElevenLabs full briefing / overview / ROI / system-architecture / operational-health) · <code>telemetry</code> (live observability + demo seed) ·{' '}
          <code>nda</code> · <code>approvals</code> (concept / simulation / pricing / final gates) · <code>pricing-snapshot</code> · <code>health</code>.
        </p>

        <p style={{ marginTop: '1em' }}><strong>C3. Analytics &amp; Generation Services</strong> — 9 dedicated services:</p>
        <p style={{ fontSize: '10pt', color: '#475569', margin: '0.25em 0 0.75em 0' }}>
          File parser (CSV/XLSX) · Metrics extractor · Analytics engine (ABC / XYZ / fit / percentiles) · Monte-Carlo simulator · Benefit projector ·{' '}
          Product matcher · PDF report generator · Video / audio narration generator · Synthetic data generator · Bulk-insert pipeline.
        </p>

        <p style={{ marginTop: '1em' }}><strong>C4. Live Integrations:</strong></p>
        <ul style={{ paddingLeft: '1.2em' }}>
          <li><strong>Anthropic Claude</strong> — primary LLM for analysis, narration scripts, and document generation</li>
          <li><strong>ElevenLabs</strong> — Rachel AI voice agent for narrated proposals and live conversational briefings</li>
          <li><strong>PostgreSQL (Render-managed)</strong> — production datastore with SSL, automated migrations, and unique-index enforcement for upsert-safe ingestion</li>
          <li><strong>n8n / PLC webhook ingestion</strong> — real-time machine-event pipeline (POST /api/oee/webhooks/machine-event)</li>
          <li><strong>Render auto-deploy</strong> — continuous delivery on push-to-main with ~90-second deploy SLO</li>
          <li><strong>MCP (Model Context Protocol)</strong> — every backend domain exposed as both REST and MCP tools for AI-agent orchestration</li>
        </ul>

        <p style={{ marginTop: '1em' }}><strong>C5. Production Database Schema</strong> — 16 multi-tenant tables:</p>
        <p style={{ fontSize: '10pt', color: '#475569', margin: '0.25em 0 0.75em 0' }}>
          <code>logistics_projects</code> · <code>uploaded_files</code> · <code>item_master</code> · <code>inventory_data</code> · <code>goods_in_data</code> · <code>goods_out_data</code> ·{' '}
          <code>product_recommendations</code> · <code>analysis_results</code> · <code>api_keys</code> · <code>telemetry_events</code> · <code>oee_machines</code> ·{' '}
          <code>oee_machine_events</code> · <code>oee_production_runs</code> · <code>ndas</code> · <code>nda_signatures</code> · <code>project_approvals</code>.
        </p>

        <p style={{ marginTop: '1em' }}><strong>C6. Engineering Investment To Date:</strong></p>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5em 0 1em 0' }}>
          <tbody>
            <tr><td style={tdStyle}><strong>Build Start</strong></td><td style={tdStyle}>{form.build_start_date || '___'}</td></tr>
            <tr><td style={tdStyle}><strong>As-Of Date</strong></td><td style={tdStyle}>{form.effective_date || '___'}</td></tr>
            <tr><td style={tdStyle}><strong>Lines of Code Delivered</strong></td><td style={tdStyle}><strong>{Number(form.lines_of_code).toLocaleString()} LOC</strong> (production JavaScript / JSX, excluding dependencies and tooling)</td></tr>
            <tr><td style={tdStyle}><strong>Production Status</strong></td><td style={tdStyle}>Live at aiagent.ringlypro.com/pinaxis — multi-tenant, monitored, deployed via continuous delivery</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: '10pt', color: '#475569', marginTop: '0.75em' }}>
          Line count reflects actual production code shipped across the React dashboard and backend service domains through the Effective Date, excluding third-party libraries, generated files, and tooling. Future enhancements requested by Client are outside the scope of this Agreement and will be quoted separately under a Statement of Work.
        </p>
      </div>

      {/* Exhibit D — Strategic Integration Plan Summary (on-premises only) */}
      {form.deployment_model === 'on_premises' && (
        <div style={{ pageBreakBefore: 'always', marginTop: '3em' }}>
          <H2>EXHIBIT D — STRATEGIC INTEGRATION PLAN SUMMARY</H2>
          <p>This Exhibit summarizes the on-premises deployment architecture and the division of responsibility between Provider (PINAXIS Analytics) and Client ({form.client_name || 'Pinaxis'}). The full Strategic Integration Plan is published at <strong>aiagent.ringlypro.com/pinaxis/on-premises</strong> and is incorporated by reference.</p>

          <p style={{ marginTop: '1em' }}><strong>D1. Deployment Profile — Full On-Premises (100% Data Sovereignty):</strong></p>
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5em 0 1em 0' }}>
            <tbody>
              <tr><td style={tdStyle}><strong>Data Residency</strong></td><td style={tdStyle}>100% on-premises, zero external data transfer</td></tr>
              <tr><td style={tdStyle}><strong>External Data Transfer</strong></td><td style={tdStyle}>Zero (air-gap or filtered egress at Client option)</td></tr>
              <tr><td style={tdStyle}><strong>Deployment Timeline</strong></td><td style={tdStyle}>6–8 weeks from infrastructure readiness</td></tr>
              <tr><td style={tdStyle}><strong>Infrastructure Footprint</strong></td><td style={tdStyle}>Full-stack (Presentation + Application + Data + AI layer)</td></tr>
              <tr><td style={tdStyle}><strong>Updates &amp; Patching</strong></td><td style={tdStyle}>Managed releases via Provider; deployed by Client per change-window policy</td></tr>
            </tbody>
          </table>

          <p style={{ marginTop: '1em' }}><strong>D2. Reference Architecture — 4 Layers:</strong></p>
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5em 0 1em 0' }}>
            <thead>
              <tr style={{ background: '#F1F5F9' }}>
                <th style={thStyle}>Layer</th>
                <th style={thStyle}>Components</th>
                <th style={thStyle}>Network</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><strong>Presentation</strong></td><td style={tdStyle}>React Dashboard (Nginx); optional local Voice AI / TTS</td><td style={tdStyle}>:443 HTTPS, :8443 (optional)</td></tr>
              <tr><td style={tdStyle}><strong>Application</strong></td><td style={tdStyle}>Node.js API Server; Analysis Engine; Proposal Generator; MCP Gateway; OEE Real-Time Processor</td><td style={tdStyle}>:3000 / :3100 / :3200 (internal)</td></tr>
              <tr><td style={tdStyle}><strong>Data</strong></td><td style={tdStyle}>PostgreSQL 15+; File storage (NFS / S3-compatible); optional Redis cache</td><td style={tdStyle}>:5432 / :6379 (internal)</td></tr>
              <tr><td style={tdStyle}><strong>AI (optional)</strong></td><td style={tdStyle}>Option A: Local LLM (Ollama / vLLM) on GPU node — Option B: filtered egress proxy — Option C: no AI (manual mode)</td><td style={tdStyle}>GPU node or egress-only proxy</td></tr>
            </tbody>
          </table>

          <p style={{ marginTop: '1em' }}><strong>D3. Integration Surface — Inbound &amp; Outbound:</strong></p>
          <ul style={{ paddingLeft: '1.2em' }}>
            <li><strong>WMS / ERP (SAP, Oracle, JDA, Manhattan)</strong> — Item Master, Inventory, Inbound, Outbound feeds via REST ingest endpoints (<code>/api/v1/ingest/*</code>)</li>
            <li><strong>PLC / MES / SCADA (Siemens, Rockwell, Beckhoff)</strong> — Real-time machine status and OEE telemetry via webhook (<code>/api/oee/webhooks/machine-event</code>)</li>
            <li><strong>BI Tools (Power BI, Tableau, Grafana)</strong> — Read-only access to Analysis Results, KPIs, and OEE metrics</li>
          </ul>

          <p style={{ marginTop: '1em' }}><strong>D4. Responsibility Matrix:</strong></p>
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5em 0 1em 0' }}>
            <thead>
              <tr style={{ background: '#F1F5F9' }}>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Provider (PINAXIS Analytics)</th>
                <th style={thStyle}>Client ({form.client_name || 'Pinaxis'})</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>Platform software, deployment artifacts, container images</td><td style={tdStyle}>✓ Owns</td><td style={tdStyle}>—</td></tr>
              <tr><td style={tdStyle}>Configuration templates, runbooks, deployment guide</td><td style={tdStyle}>✓ Provides</td><td style={tdStyle}>—</td></tr>
              <tr><td style={tdStyle}>Onboarding (10 hours) &amp; deployment support</td><td style={tdStyle}>✓ Provides</td><td style={tdStyle}>—</td></tr>
              <tr><td style={tdStyle}>Server capacity, network, storage hardware</td><td style={tdStyle}>—</td><td style={tdStyle}>✓ Owns</td></tr>
              <tr><td style={tdStyle}>OS patching, container runtime, OS-level security</td><td style={tdStyle}>—</td><td style={tdStyle}>✓ Owns</td></tr>
              <tr><td style={tdStyle}>Identity provider (SSO / SAML / OIDC)</td><td style={tdStyle}>Integration support</td><td style={tdStyle}>✓ Owns</td></tr>
              <tr><td style={tdStyle}>TLS certificates, internal CA, firewall rules</td><td style={tdStyle}>—</td><td style={tdStyle}>✓ Owns</td></tr>
              <tr><td style={tdStyle}>Database backups, disaster recovery, retention policy</td><td style={tdStyle}>Recommended config</td><td style={tdStyle}>✓ Operates</td></tr>
              <tr><td style={tdStyle}>Monitoring, alerting, uptime SLA</td><td style={tdStyle}>Recommended config</td><td style={tdStyle}>✓ Operates</td></tr>
              <tr><td style={tdStyle}>Local LLM (if Option A) — GPU host, model weights, inference runtime</td><td style={tdStyle}>Compatibility list</td><td style={tdStyle}>✓ Owns</td></tr>
              <tr><td style={tdStyle}>WMS / ERP / PLC system contracts and connectivity</td><td style={tdStyle}>—</td><td style={tdStyle}>✓ Owns</td></tr>
              <tr><td style={tdStyle}>Platform updates &amp; managed releases (release notes, signed artifacts)</td><td style={tdStyle}>✓ Provides</td><td style={tdStyle}>Deploys per change window</td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: '10pt', color: '#475569', marginTop: '0.75em' }}>
            Provider's onboarding allocation ({form.onboarding_hours} hours) covers initial deployment guidance,
            data-source mapping, and configuration handoff. Hours beyond the allocation, environment
            remediation work, or extensions to the Reference Architecture are outside the License Fee and will
            be quoted separately under a Statement of Work.
          </p>
        </div>
      )}
    </>
  )
}

function H2({ children }) {
  return <h2 style={{ fontFamily: "'Lexend Deca', 'Barlow', sans-serif", fontSize: '13pt', color: '#262745', borderBottom: '1px solid #CBD5E1', paddingBottom: 4, marginTop: '1.5em', marginBottom: '.5em', fontWeight: 600, letterSpacing: '0.3px' }}>{children}</h2>
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
const sigLine = { borderTop: '1px solid #262745', marginTop: '3em', paddingTop: 4, fontSize: '10pt' }
const metaLabel = { padding: '3px 8px 3px 0', fontSize: '9pt', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', verticalAlign: 'top' }
const metaValue = { padding: '3px 0', fontSize: '10pt', fontWeight: 600, color: '#262745', verticalAlign: 'top' }
