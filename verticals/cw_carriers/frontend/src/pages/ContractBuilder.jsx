import React, { useState, useEffect } from 'react';

export default function ContractBuilder() {
  const [step, setStep] = useState(1);
  const [estimates, setEstimates] = useState([]);
  const [contractId, setContractId] = useState(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [docxReady, setDocxReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    client_name: 'CW Carriers USA Inc.',
    client_address: '3632 Queen Palm Dr, Suite 175, Tampa, FL 33619',
    effective_date: new Date().toISOString().split('T')[0],
    initial_term_months: 24,
    jurisdiction: 'Florida',
    implementation_fee: 35000,
    monthly_retainer: 12500,
    token_markup: 30,
    onboarding_hours: 20,
    impl_timeline_weeks: 6,
    linked_estimate_id: '',
    // FreightMind OBD Scanner fields
    tier: 'treatment',
    annual_savings_conservative: 1500000,
    annual_savings_moderate: 2400000,
    savings_share_pct: 3,
    scanner_modules: 7,
    year2_monthly: 15000,
    year3_monthly: 18000,
  });

  const token = sessionStorage.getItem('cw_token');
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const fmt = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  useEffect(() => {
    fetch('/cw_carriers/api/pinaxis/get-estimates?tenant_id=1', { headers })
      .then(r => r.json()).then(d => setEstimates(d.data || []))
      .catch(() => {});
  }, []);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const linkEstimate = (id) => {
    update('linked_estimate_id', id);
    const est = estimates.find(e => e.id == id);
    if (est) {
      update('token_markup', Math.round(est.markup * 100));
      if (est.client_name) update('client_name', est.client_name);
      showToast(`Estimate #${est.id} linked`);
    }
  };

  const generateContract = async () => {
    setGenerating(true);
    setStatusMsg({ type: 'info', text: 'Generating contract... This may take a moment.' });
    try {
      const resp = await fetch('/cw_carriers/api/pinaxis/generate-contract', {
        method: 'POST', headers,
        body: JSON.stringify({ ...form, tenant_id: 1 }),
      });
      const data = await resp.json();
      if (data.success) {
        setContractId(data.contract_id);
        setPdfReady(data.pdf_available);
        setDocxReady(data.docx_available);
        setStatusMsg({ type: 'success', text: `Contract #${data.contract_id} generated!${data.pdf_available ? ' PDF ready.' : ''}${data.docx_available ? ' DOCX ready.' : ''}` });
      } else throw new Error(data.error || 'Generation failed');
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Error: ' + e.message });
    }
    setGenerating(false);
  };

  const downloadFile = (type) => {
    if (!contractId) return;
    window.open(`/cw_carriers/api/pinaxis/download/${type}/${contractId}`, '_blank');
  };

  const goStep = (n) => setStep(n);

  return (
    <div>
      <h1 style={S.title}>Enterprise Services Agreement</h1>
      <p style={S.subtitle}>Generate a professional contract with auto-filled pricing and PDF/DOCX export</p>

      {/* Progress */}
      <div style={S.progress}>
        {['Parties & Dates', 'Pricing', 'Preview', 'Export'].map((label, i) => {
          const n = i + 1;
          const isDone = n < step;
          const isActive = n === step;
          return (
            <div key={n} style={S.stepIndicator} onClick={() => goStep(n)}>
              <div style={{ ...S.stepCircle, ...(isActive ? S.circleActive : isDone ? S.circleDone : {}) }}>
                {isDone ? '✓' : n}
              </div>
              <div style={{ ...S.stepLabel, ...(isActive ? { color: '#0EA5E9' } : isDone ? { color: '#34D399' } : {}) }}>{label}</div>
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Step 1 — Parties & Dates</h3>
          <div style={S.formGrid}>
            <Field label="Client Legal Name *" value={form.client_name} onChange={v => update('client_name', v)} placeholder="e.g. GEBHARDT Intralogistics Group" />
            <Field label="Effective Date *" type="date" value={form.effective_date} onChange={v => update('effective_date', v)} />
            <Field label="Client Address" type="textarea" value={form.client_address} onChange={v => update('client_address', v)} placeholder="Full legal address" full />
            <div style={S.formGroup}>
              <label style={S.flabel}>Initial Term</label>
              <select value={form.initial_term_months} onChange={e => update('initial_term_months', parseInt(e.target.value))} style={S.finput}>
                {[12, 18, 24, 36].map(m => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
            <Field label="Jurisdiction" value={form.jurisdiction} onChange={v => update('jurisdiction', v)} />
          </div>
          <div style={S.btnRow}><button style={S.btnPrimary} onClick={() => goStep(2)}>Next: Pricing →</button></div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Step 2 — Pricing & ROI Model</h3>

          {/* Tier Selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={S.flabel}>Service Tier</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {[
                { id: 'scanner', label: 'Scanner', price: 8500, desc: 'OBD Scanner + Diagnostics' },
                { id: 'treatment', label: 'Scanner + Treatment', price: 12500, desc: 'AI Auto-Execution' },
                { id: 'managed', label: 'Managed Service', price: 18000, desc: 'Full Digit2AI Operations' },
              ].map(t => (
                <div key={t.id} onClick={() => { update('tier', t.id); update('monthly_retainer', t.price); }}
                  style={{ flex: 1, padding: 16, borderRadius: 10, cursor: 'pointer', textAlign: 'center', transition: 'all .2s',
                    background: form.tier === t.id ? '#0EA5E915' : '#0D1117',
                    border: form.tier === t.id ? '2px solid #0EA5E9' : '1px solid #30363D',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.tier === t.id ? '#0EA5E9' : '#E6EDF3' }}>{t.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: form.tier === t.id ? '#0EA5E9' : '#E6EDF3', margin: '4px 0' }}>{fmt(t.price)}<span style={{ fontSize: 12, fontWeight: 400, color: '#8B949E' }}>/mo</span></div>
                  <div style={{ fontSize: 11, color: '#8B949E' }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.formGrid}>
            <div style={{ ...S.formGroup, gridColumn: '1 / -1' }}>
              <label style={S.flabel}>Link to Saved Estimate</label>
              <select value={form.linked_estimate_id} onChange={e => linkEstimate(e.target.value)} style={S.finput}>
                <option value="">— Enter manually —</option>
                {estimates.map(e => (
                  <option key={e.id} value={e.id}>#{e.id} — {e.client_name || 'Unnamed'} | {e.model} | {Math.round(e.markup * 100)}% | ${e.monthly_billed}/mo</option>
                ))}
              </select>
            </div>
            <Field label="Implementation Fee ($)" type="number" value={form.implementation_fee} onChange={v => update('implementation_fee', parseFloat(v) || 0)} />
            <Field label="Monthly Platform Fee ($)" type="number" value={form.monthly_retainer} onChange={v => update('monthly_retainer', parseFloat(v) || 0)} />
            <Field label="Savings Share (%)" type="number" value={form.savings_share_pct} onChange={v => update('savings_share_pct', parseFloat(v) || 0)} />
            <Field label="Token Markup (%)" type="number" value={form.token_markup} onChange={v => update('token_markup', parseInt(v) || 0)} />
            <Field label="Onboarding Hours" type="number" value={form.onboarding_hours} onChange={v => update('onboarding_hours', parseInt(v) || 0)} />
            <Field label="Implementation Timeline (weeks)" type="number" value={form.impl_timeline_weeks} onChange={v => update('impl_timeline_weeks', parseInt(v) || 0)} />
          </div>

          {/* ROI Projection */}
          <div style={{ marginTop: 24, padding: 20, background: '#0D1117', borderRadius: 10, border: '1px solid #30363D' }}>
            <h4 style={{ fontSize: 14, marginBottom: 16, color: '#0EA5E9' }}>ROI Projection (Conservative)</h4>
            <div style={S.formGrid}>
              <Field label="Year 1 Savings Estimate ($)" type="number" value={form.annual_savings_conservative} onChange={v => update('annual_savings_conservative', parseFloat(v) || 0)} />
              <Field label="Year 2 Savings Estimate ($)" type="number" value={form.annual_savings_moderate} onChange={v => update('annual_savings_moderate', parseFloat(v) || 0)} />
              <Field label="Year 2 Monthly Fee ($)" type="number" value={form.year2_monthly} onChange={v => update('year2_monthly', parseFloat(v) || 0)} />
              <Field label="Year 3 Monthly Fee ($)" type="number" value={form.year3_monthly} onChange={v => update('year3_monthly', parseFloat(v) || 0)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
              {(() => {
                const y1_cost = form.implementation_fee + (form.monthly_retainer * 12) + (form.annual_savings_conservative * form.savings_share_pct / 100);
                const y1_roi = form.annual_savings_conservative / y1_cost;
                const y2_cost = form.year2_monthly * 12;
                const y2_roi = form.annual_savings_moderate / y2_cost;
                const y3_cost = form.year3_monthly * 12;
                const y3_savings = form.annual_savings_moderate * 1.25;
                const y3_roi = y3_savings / y3_cost;
                const total_cost = y1_cost + y2_cost + y3_cost;
                const total_savings = form.annual_savings_conservative + form.annual_savings_moderate + y3_savings;
                return [
                  { label: 'Year 1 ROI', value: y1_roi.toFixed(1) + ':1', color: '#34D399' },
                  { label: 'Year 2 ROI', value: y2_roi.toFixed(1) + ':1', color: '#34D399' },
                  { label: '3-Year Net Benefit', value: fmt(total_savings - total_cost), color: '#0EA5E9' },
                  { label: 'Per Dollar Return', value: '$' + (total_savings / total_cost).toFixed(2), color: '#0EA5E9' },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: 'center', padding: 12, background: '#161B22', borderRadius: 8, border: '1px solid #30363D' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 10, color: '#8B949E', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</div>
                  </div>
                ));
              })()}
            </div>
          </div>

          <div style={S.btnRow}>
            <button style={S.btnSecondary} onClick={() => goStep(1)}>← Back</button>
            <button style={S.btnPrimary} onClick={() => goStep(3)}>Next: Preview →</button>
          </div>
        </div>
      )}

      {/* Step 3 — Preview */}
      {step === 3 && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Step 3 — Contract Preview</h3>

          {/* Executive Summary — Talk Track */}
          {(() => {
            const y1_total = form.implementation_fee + (form.monthly_retainer * 12) + (form.annual_savings_conservative * form.savings_share_pct / 100);
            const y1_net = form.annual_savings_conservative - y1_total;
            const y1_roi = (form.annual_savings_conservative / y1_total).toFixed(1);
            const tierLabel = form.tier === 'scanner' ? 'Scanner' : form.tier === 'treatment' ? 'Scanner + Treatment' : 'Managed Service';
            const y3_savings = form.annual_savings_conservative + form.annual_savings_moderate + (form.annual_savings_moderate * 1.25);
            const y3_cost = y1_total + (form.year2_monthly * 12) + (form.year3_monthly * 12);
            return (
              <div style={{ background: '#0D1117', border: '1px solid #1E3A5F', borderRadius: 12, padding: 28, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0EA5E920', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  </div>
                  <h4 style={{ fontSize: 16, color: '#0EA5E9' }}>Executive Summary — What You're Signing</h4>
                </div>

                <div style={{ fontSize: 14, color: '#C9D1D9', lineHeight: 1.8, marginBottom: 20 }}>
                  <p style={{ marginBottom: 12 }}>
                    <strong style={{ color: '#E6EDF3' }}>{form.client_name}</strong> is engaging <strong style={{ color: '#E6EDF3' }}>Digit2AI / RinglyPro</strong> to deploy the
                    <strong style={{ color: '#0EA5E9' }}> FreightMind AI OBD Scanner</strong> — an AI diagnostic platform that plugs into your existing McLeod TMS and scans 7 operational modules to find cost reduction opportunities.
                  </p>
                  <p style={{ marginBottom: 12 }}>
                    Think of it like a mechanic's OBD scanner, but for your freight brokerage. It reads your load data, carrier data, and financial data — then surfaces findings with severity levels (critical, warning, advisory) and AI-powered prescriptions to fix each issue.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
                  <div style={{ background: '#161B22', borderRadius: 10, padding: 16, border: '1px solid #30363D' }}>
                    <div style={{ fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>What You Pay</div>
                    <div style={{ fontSize: 13, color: '#C9D1D9', lineHeight: 1.8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Implementation (one-time)</span><strong style={{ color: '#E6EDF3' }}>{fmt(form.implementation_fee)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Monthly platform ({tierLabel})</span><strong style={{ color: '#E6EDF3' }}>{fmt(form.monthly_retainer)}/mo</strong></div>
                      {form.savings_share_pct > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Performance fee</span><strong style={{ color: '#E6EDF3' }}>{form.savings_share_pct}% of savings</strong></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #30363D', paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 600 }}>Year 1 Total</span><strong style={{ color: '#0EA5E9', fontSize: 16 }}>{fmt(y1_total)}</strong></div>
                    </div>
                  </div>
                  <div style={{ background: '#161B22', borderRadius: 10, padding: 16, border: '1px solid #30363D' }}>
                    <div style={{ fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>What You Get Back</div>
                    <div style={{ fontSize: 13, color: '#C9D1D9', lineHeight: 1.8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Year 1 savings (conservative)</span><strong style={{ color: '#34D399' }}>{fmt(form.annual_savings_conservative)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Year 1 net benefit</span><strong style={{ color: '#34D399' }}>{fmt(y1_net)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Return on investment</span><strong style={{ color: '#34D399' }}>{y1_roi}:1</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #30363D', paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 600 }}>3-Year Net Benefit</span><strong style={{ color: '#34D399', fontSize: 16 }}>{fmt(y3_savings - y3_cost)}</strong></div>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: '#C9D1D9', lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 700, color: '#E6EDF3', marginBottom: 8 }}>Key Terms in Plain Language:</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#0EA5E9', fontWeight: 700, minWidth: 18 }}>1.</span><span><strong style={{ color: '#E6EDF3' }}>We connect to your McLeod.</strong> Automated daily data ingestion. Your data stays yours — we read it, we don't modify it.</span></div>
                    <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#0EA5E9', fontWeight: 700, minWidth: 18 }}>2.</span><span><strong style={{ color: '#E6EDF3' }}>7 modules scan your operations weekly.</strong> Load ops, rates, fleet, financials, compliance, drivers, customer health. Each scan takes under 2 seconds.</span></div>
                    <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#0EA5E9', fontWeight: 700, minWidth: 18 }}>3.</span><span><strong style={{ color: '#E6EDF3' }}>Every finding has a prescription.</strong> Not just "here's the problem" — specific steps to fix it, which AI agent handles it, and estimated monthly savings.</span></div>
                    <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#0EA5E9', fontWeight: 700, minWidth: 18 }}>4.</span><span><strong style={{ color: '#E6EDF3' }}>Treatment = we fix it for you.</strong> The AI agent auto-executes the prescription. You pay {form.savings_share_pct}% of documented savings — if we save you nothing, the performance fee is zero.</span></div>
                    <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#0EA5E9', fontWeight: 700, minWidth: 18 }}>5.</span><span><strong style={{ color: '#E6EDF3' }}>24-month initial term.</strong> Auto-renews annually. 60-day cancellation notice. Year 2 pricing adjusts to {fmt(form.year2_monthly)}/mo as we shift from diagnostic to prevention.</span></div>
                    <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#0EA5E9', fontWeight: 700, minWidth: 18 }}>6.</span><span><strong style={{ color: '#E6EDF3' }}>Our IP stays ours, your data stays yours.</strong> We own the platform and algorithms. You own your operational data. Standard non-circumvention clause.</span></div>
                  </div>
                </div>

                <div style={{ marginTop: 20, padding: 14, background: '#34D39910', border: '1px solid #34D39930', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#34D399', fontWeight: 600 }}>
                    Bottom Line: For {fmt(form.monthly_retainer)}/month — less than one dispatcher's salary — you get an AI platform that's projected to save {fmt(form.annual_savings_conservative)} in Year 1. For every dollar you invest, you get {y1_roi} back.
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={S.previewFrame}>
            <h2 style={{ textAlign: 'center', fontSize: 20, color: '#1B2A4A', marginBottom: 8 }}>ENTERPRISE SERVICES AGREEMENT</h2>
            <p style={{ textAlign: 'center', color: '#64748B', fontSize: 13, marginBottom: 24 }}>
              Entered into as of <strong>{form.effective_date || '___'}</strong> by and between:<br />
              <strong>Digit2AI LLC d/b/a RinglyPro</strong> ("Provider")<br />and<br />
              <strong>{form.client_name || '___'}</strong> ("Client")<br />
              {form.client_address}
            </p>
            <h3 style={S.previewH}>1. Scope of Services</h3>
            <p style={S.previewP}>Provider shall deliver the <strong>FreightMind AI OBD Scanner</strong> platform, comprising {form.scanner_modules} diagnostic modules, AI-powered prescriptions, and {form.tier === 'treatment' ? 'Treatment (AI auto-execution)' : form.tier === 'managed' ? 'fully managed operations' : 'diagnostic scanning services'}. Implementation: <strong>{form.impl_timeline_weeks} weeks</strong>. Onboarding: <strong>{form.onboarding_hours} hours</strong>.</p>
            <p style={S.previewP}>Diagnostic Modules: Load Operations, Rate Intelligence, Fleet Utilization, Financial Health, Compliance Risk, Driver Retention, Customer Health.</p>
            <p style={S.previewP}>Data Integration: McLeod TMS data pipeline, Macropoint tracking feed, Carrier Assure scoring, Highway freight network.</p>

            <h3 style={S.previewH}>2. Fees</h3>
            <ul style={{ paddingLeft: 20, color: '#334155', fontSize: 13, lineHeight: 1.8 }}>
              <li>Implementation Fee: <strong>{fmt(form.implementation_fee)}</strong> (one-time)</li>
              <li>Monthly Platform Fee: <strong>{fmt(form.monthly_retainer)}/month</strong> ({form.tier === 'scanner' ? 'Scanner' : form.tier === 'treatment' ? 'Scanner + Treatment' : 'Managed Service'} tier)</li>
              {form.savings_share_pct > 0 && <li>Performance Fee: <strong>{form.savings_share_pct}%</strong> of documented cost savings (Treatment tier)</li>}
              <li>Token Markup: <strong>{form.token_markup}%</strong> over actual AI API cost</li>
              <li>Annual Total (Year 1): <strong>{fmt(form.implementation_fee + (form.monthly_retainer * 12) + (form.annual_savings_conservative * form.savings_share_pct / 100))}</strong></li>
            </ul>

            <h3 style={S.previewH}>3. Cost Reduction Projections</h3>
            <ul style={{ paddingLeft: 20, color: '#334155', fontSize: 13, lineHeight: 1.8 }}>
              <li>Year 1 Estimated Savings (Conservative): <strong>{fmt(form.annual_savings_conservative)}</strong></li>
              <li>Year 2 Estimated Savings: <strong>{fmt(form.annual_savings_moderate)}</strong></li>
              <li>3-Year Cumulative Savings: <strong>{fmt(form.annual_savings_conservative + form.annual_savings_moderate + (form.annual_savings_moderate * 1.25))}</strong></li>
              <li style={{ color: '#64748B', fontStyle: 'italic' }}>Savings estimates based on OBD Scanner diagnostic analysis and industry benchmarks. Actual results may vary.</li>
            </ul>

            <h3 style={S.previewH}>4. Multi-Year Pricing</h3>
            <ul style={{ paddingLeft: 20, color: '#334155', fontSize: 13, lineHeight: 1.8 }}>
              <li>Year 1: {fmt(form.monthly_retainer)}/month + implementation</li>
              <li>Year 2: {fmt(form.year2_monthly)}/month (monitoring + AI agents + predictive intelligence)</li>
              <li>Year 3+: {fmt(form.year3_monthly)}/month (enterprise expansion, multi-office, shipper portals)</li>
            </ul>

            <h3 style={S.previewH}>5. Term</h3>
            <p style={S.previewP}>Initial Term: <strong>{form.initial_term_months} months</strong>. Auto-renews for 12-month periods unless 60 days' written notice given prior to renewal date.</p>

            <h3 style={S.previewH}>6. Intellectual Property</h3>
            <p style={S.previewP}>All platform IP, AI models, diagnostic algorithms, and agent configurations remain exclusive property of Provider (Digit2AI LLC / RinglyPro). Client retains ownership of their operational data.</p>

            <h3 style={S.previewH}>7. Non-Circumvention</h3>
            <p style={S.previewP}>24-month post-term non-circumvention and anti-reverse engineering covenant. Client shall not replicate, reverse-engineer, or create derivative works from the FreightMind platform.</p>

            <h3 style={S.previewH}>8. Governing Law</h3>
            <p style={S.previewP}>State of {form.jurisdiction}. Disputes resolved by binding arbitration under AAA Commercial Rules.</p>

            <p style={{ marginTop: 24, color: '#94A3B8', fontSize: 11, textAlign: 'center', fontStyle: 'italic' }}>Full contract includes: Definitions, Representations & Warranties, Data Security & Privacy, Limitation of Liability, Indemnification, Exhibit A (OBD Scanner Module Specifications), Exhibit B (Implementation Timeline). Generated in PDF/DOCX.</p>
          </div>
          <div style={S.btnRow}>
            <button style={S.btnSecondary} onClick={() => goStep(2)}>← Back</button>
            <button style={S.btnPrimary} onClick={() => goStep(4)}>Next: Export →</button>
          </div>
        </div>
      )}

      {/* Step 4 — Export */}
      {step === 4 && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Step 4 — Export & Save</h3>
          <p style={{ color: '#8B949E', marginBottom: 16, fontSize: 14 }}>Generate your contract in multiple formats. Server-side generation ensures confidential templates remain secure.</p>

          {statusMsg && (
            <div style={{
              padding: 16, borderRadius: 8, marginBottom: 16, fontWeight: 500, fontSize: 14,
              background: statusMsg.type === 'success' ? '#0D2818' : statusMsg.type === 'error' ? '#2D1215' : '#0C1929',
              color: statusMsg.type === 'success' ? '#34D399' : statusMsg.type === 'error' ? '#F87171' : '#0EA5E9',
              border: `1px solid ${statusMsg.type === 'success' ? '#065F46' : statusMsg.type === 'error' ? '#7F1D1D' : '#1E3A5F'}`,
            }}>
              {statusMsg.text}
            </div>
          )}

          <div style={S.exportGrid}>
            <div style={{ ...S.exportCard, opacity: generating ? 0.5 : 1 }} onClick={!generating ? generateContract : undefined}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
              <h4 style={{ fontSize: 14, marginBottom: 4 }}>Generate Contract</h4>
              <p style={{ fontSize: 12, color: '#8B949E' }}>Create PDF + DOCX server-side and save to your account</p>
            </div>
            <div style={{ ...S.exportCard, opacity: pdfReady ? 1 : 0.3, pointerEvents: pdfReady ? 'auto' : 'none' }} onClick={() => downloadFile('pdf')}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
              <h4 style={{ fontSize: 14, marginBottom: 4 }}>Download PDF</h4>
              <p style={{ fontSize: 12, color: '#8B949E' }}>Professional PDF ready for signing</p>
            </div>
            <div style={{ ...S.exportCard, opacity: docxReady ? 1 : 0.3, pointerEvents: docxReady ? 'auto' : 'none' }} onClick={() => downloadFile('docx')}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
              <h4 style={{ fontSize: 14, marginBottom: 4 }}>Download DOCX</h4>
              <p style={{ fontSize: 12, color: '#8B949E' }}>Editable Word document</p>
            </div>
          </div>

          <div style={S.btnRow}>
            <button style={S.btnSecondary} onClick={() => goStep(3)}>← Back</button>
          </div>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', full }) {
  const style = full ? { ...S.formGroup, gridColumn: '1 / -1' } : S.formGroup;
  if (type === 'textarea') {
    return (
      <div style={style}>
        <label style={S.flabel}>{label}</label>
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...S.finput, minHeight: 80, resize: 'vertical' }} />
      </div>
    );
  }
  return (
    <div style={style}>
      <label style={S.flabel}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={S.finput} />
    </div>
  );
}

const S = {
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 4 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 28 },
  progress: { display: 'flex', marginBottom: 32, position: 'relative' },
  stepIndicator: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' },
  stepCircle: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, border: '2px solid #30363D', background: '#161B22', color: '#8B949E', transition: 'all .3s' },
  circleActive: { borderColor: '#0EA5E9', background: '#0EA5E9', color: '#fff' },
  circleDone: { borderColor: '#34D399', background: '#34D399', color: '#fff' },
  stepLabel: { fontSize: 11, color: '#8B949E', marginTop: 8, textAlign: 'center', fontWeight: 500 },
  card: { background: '#161B22', border: '1px solid #30363D', borderRadius: 12, padding: 32, marginBottom: 24 },
  cardTitle: { fontSize: 18, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #30363D' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  formGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  flabel: { fontSize: 12, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 },
  finput: { padding: '12px 14px', border: '1px solid #30363D', borderRadius: 8, fontSize: 14, color: '#E6EDF3', background: '#0D1117', outline: 'none', fontFamily: "'DM Sans',sans-serif" },
  btnRow: { display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' },
  btnPrimary: { padding: '12px 28px', borderRadius: 8, border: 'none', background: '#0EA5E9', color: '#0D1117', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '12px 28px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#E6EDF3', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  previewFrame: { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 32, maxHeight: 500, overflowY: 'auto', color: '#1E293B', fontFamily: "Georgia,'Times New Roman',serif", fontSize: '11pt', lineHeight: 1.6 },
  previewH: { fontSize: '13pt', color: '#1B2A4A', borderBottom: '1px solid #CBD5E1', paddingBottom: 4, marginTop: '1.5em', marginBottom: '0.5em' },
  previewP: { color: '#334155', fontSize: 13, lineHeight: 1.8, marginBottom: 8 },
  exportGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  exportCard: { background: '#0D1117', border: '1px solid #30363D', borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', transition: 'all .2s' },
  toast: { position: 'fixed', bottom: 24, right: 24, background: '#34D399', color: '#0D1117', padding: '14px 24px', borderRadius: 8, fontWeight: 600, zIndex: 100 },
};
