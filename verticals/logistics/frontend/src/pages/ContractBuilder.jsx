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
    client_name: '',
    client_address: '',
    effective_date: new Date().toISOString().split('T')[0],
    initial_term_months: 24,
    jurisdiction: 'Florida',
    implementation_fee: 15000,
    monthly_retainer: 9500,
    token_markup: 30,
    onboarding_hours: 10,
    impl_timeline_weeks: 8,
    linked_estimate_id: '',
  });

  const token = sessionStorage.getItem('lg_token');
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const fmt = (n) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  useEffect(() => {
    fetch('/logistics/api/pinaxis/get-estimates?tenant_id=1', { headers })
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
      const resp = await fetch('/logistics/api/pinaxis/generate-contract', {
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
    window.open(`/logistics/api/pinaxis/download/${type}/${contractId}`, '_blank');
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
          <h3 style={S.cardTitle}>Step 2 — Pricing</h3>
          <div style={S.formGrid}>
            <div style={{ ...S.formGroup, gridColumn: '1 / -1' }}>
              <label style={S.flabel}>Link to Saved Estimate</label>
              <select value={form.linked_estimate_id} onChange={e => linkEstimate(e.target.value)} style={S.finput}>
                <option value="">— Enter manually —</option>
                {estimates.map(e => (
                  <option key={e.id} value={e.id}>#{e.id} — {e.client_name || 'Unnamed'} | {e.model} | {Math.round(e.markup * 100)}% | ${e.monthly_billed}/mo</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#8B949E', marginTop: 4 }}>Auto-fills token markup from a saved Token Estimator result</div>
            </div>
            <Field label="Implementation Fee ($)" type="number" value={form.implementation_fee} onChange={v => update('implementation_fee', parseFloat(v) || 0)} />
            <Field label="Monthly Retainer ($)" type="number" value={form.monthly_retainer} onChange={v => update('monthly_retainer', parseFloat(v) || 0)} />
            <Field label="Token Markup (%)" type="number" value={form.token_markup} onChange={v => update('token_markup', parseInt(v) || 0)} />
            <Field label="Onboarding Hours" type="number" value={form.onboarding_hours} onChange={v => update('onboarding_hours', parseInt(v) || 0)} />
            <Field label="Implementation Timeline (weeks)" type="number" value={form.impl_timeline_weeks} onChange={v => update('impl_timeline_weeks', parseInt(v) || 0)} />
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
          <div style={S.previewFrame}>
            <h2 style={{ textAlign: 'center', fontSize: 20, color: '#1B2A4A', marginBottom: 8 }}>ENTERPRISE SERVICES AGREEMENT</h2>
            <p style={{ textAlign: 'center', color: '#64748B', fontSize: 13, marginBottom: 24 }}>
              Entered into as of <strong>{form.effective_date || '___'}</strong> by and between:<br />
              <strong>Digit2AI LLC d/b/a RinglyPro</strong> ("Provider")<br />and<br />
              <strong>{form.client_name || '___'}</strong> ("Client")<br />
              {form.client_address}
            </p>
            <h3 style={S.previewH}>1. Scope of Services</h3>
            <p style={S.previewP}>Provider shall deliver AI-powered analytics and automation via the RinglyPro AI platform. Implementation: <strong>{form.impl_timeline_weeks} weeks</strong>. Onboarding: <strong>{form.onboarding_hours} hours</strong>.</p>
            <h3 style={S.previewH}>2. Fees & Token Consumption</h3>
            <ul style={{ paddingLeft: 20, color: '#334155', fontSize: 13, lineHeight: 1.8 }}>
              <li>Implementation Fee: <strong>{fmt(form.implementation_fee)}</strong></li>
              <li>Monthly Retainer: <strong>{fmt(form.monthly_retainer)}</strong></li>
              <li>Token Markup: <strong>{form.token_markup}%</strong> over actual API cost</li>
              <li>Overage beyond 150% billed at same rate with 5-day notice</li>
            </ul>
            <h3 style={S.previewH}>3. Term</h3>
            <p style={S.previewP}>Initial Term: <strong>{form.initial_term_months} months</strong>. Auto-renews for 12-month periods unless 60 days' notice given.</p>
            <h3 style={S.previewH}>4. Intellectual Property</h3>
            <p style={S.previewP}>All platform IP remains exclusive property of Provider (Digit2AI LLC / RinglyPro).</p>
            <h3 style={S.previewH}>5. Non-Circumvention</h3>
            <p style={S.previewP}>24-month post-term non-circumvention and anti-reverse engineering covenant.</p>
            <h3 style={S.previewH}>6. Governing Law</h3>
            <p style={S.previewP}>State of {form.jurisdiction}.</p>
            <p style={{ marginTop: 24, color: '#94A3B8', fontSize: 11, textAlign: 'center', fontStyle: 'italic' }}>Full contract sections (Definitions, Reps & Warranties, Limitation of Liability, Exhibit A) included in generated PDF/DOCX.</p>
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
