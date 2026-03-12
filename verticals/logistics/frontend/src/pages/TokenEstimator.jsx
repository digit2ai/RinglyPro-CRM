import React, { useState, useCallback } from 'react';

const SCENARIOS_DEFAULT = [
  { id: 'product_match', name: 'Product-to-Service Matching', desc: 'AI matching for warehouse automation products', calls: 1200, input_tokens: 800, output_tokens: 300, enabled: true },
  { id: 'oee_analytics', name: 'OEE Analytics & Reporting', desc: 'Equipment effectiveness and anomaly reports', calls: 450, input_tokens: 1200, output_tokens: 600, enabled: true },
  { id: 'anomaly_detection', name: 'Anomaly Detection Alerts', desc: 'Real-time anomaly detection from sensor data', calls: 3200, input_tokens: 400, output_tokens: 150, enabled: true },
  { id: 'proposal_gen', name: 'Proposal & Document Generation', desc: 'Automated proposal and contract creation', calls: 180, input_tokens: 2000, output_tokens: 1500, enabled: true },
  { id: 'galileo_iot', name: 'Galileo IoT Data Interpretation', desc: 'IoT sensor data analysis and visualization', calls: 2400, input_tokens: 600, output_tokens: 250, enabled: true },
];

const MODELS = {
  sonnet: { label: 'Claude Sonnet 4.5 — $3 / $15', input: 3.00, output: 15.00 },
  haiku:  { label: 'Claude Haiku 3.5 — $0.80 / $4', input: 0.80, output: 4.00 },
  opus:   { label: 'Claude Opus 4 — $15 / $75', input: 15.00, output: 75.00 },
};

const MARKUPS = [0.20, 0.30, 0.50, 0.75, 1.00];

export default function TokenEstimator() {
  const [model, setModel] = useState('sonnet');
  const [markup, setMarkup] = useState(0.30);
  const [laborSavings, setLaborSavings] = useState(390000);
  const [clientName, setClientName] = useState('');
  const [scenarios, setScenarios] = useState(SCENARIOS_DEFAULT.map(s => ({ ...s })));
  const [toast, setToast] = useState(null);

  const pricing = MODELS[model];

  const calc = useCallback(() => {
    let totalCost = 0;
    const costs = scenarios.map(s => {
      if (!s.enabled) return 0;
      const c = (s.calls * s.input_tokens / 1e6) * pricing.input + (s.calls * s.output_tokens / 1e6) * pricing.output;
      totalCost += c;
      return c;
    });
    const billed = totalCost * (1 + markup);
    const margin = billed - totalCost;
    const roi = billed > 0 ? laborSavings / billed : 0;
    const totalTokens = scenarios.filter(s => s.enabled).reduce((sum, s) => sum + s.calls * (s.input_tokens + s.output_tokens), 0);
    return { totalCost, billed, margin, roi, costs, totalTokens };
  }, [scenarios, model, markup, laborSavings, pricing]);

  const { totalCost, billed, margin, roi, costs, totalTokens } = calc();

  const clause = `Token consumption is billed monthly at actual API cost + ${Math.round(markup * 100)}%.\nEstimated monthly consumption: ${totalTokens.toLocaleString()} tokens (~$${billed.toFixed(2)}/month).\nOverage beyond 150% of baseline billed at same rate with 5-day notice.`;

  const updateScenario = (i, key, val) => {
    const next = [...scenarios];
    next[i] = { ...next[i], [key]: key === 'enabled' ? val : parseInt(val) };
    setScenarios(next);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const saveEstimate = async () => {
    const token = sessionStorage.getItem('lg_token');
    try {
      const resp = await fetch('/logistics/api/pinaxis/save-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          tenant_id: 1, client_name: clientName || null, model, markup, scenarios,
          monthly_cost: Math.round(totalCost * 100) / 100,
          monthly_billed: Math.round(billed * 100) / 100,
          monthly_margin: Math.round(margin * 100) / 100,
          labor_savings: laborSavings,
          roi_ratio: billed > 0 ? Math.round(laborSavings / billed * 100) / 100 : 0,
        }),
      });
      const data = await resp.json();
      if (data.saved) showToast(`Estimate saved (ID: ${data.id})`);
      else showToast('Error saving estimate');
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const copyClause = () => {
    navigator.clipboard.writeText(clause).then(() => showToast('Clause copied to clipboard'));
  };

  return (
    <div>
      <h1 style={S.title}>Token Cost Estimator</h1>
      <p style={S.subtitle}>Model costs, margins, and ROI projections for PINAXIS enterprise deployments</p>

      {/* Controls */}
      <div style={S.controls}>
        <div style={S.controlGroup}>
          <label style={S.label}>AI Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} style={S.select}>
            {Object.entries(MODELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div style={S.controlGroup}>
          <label style={S.label}>Markup %</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {MARKUPS.map(m => (
              <button key={m} onClick={() => setMarkup(m)} style={{ ...S.pill, ...(markup === m ? S.pillActive : {}) }}>
                {Math.round(m * 100)}%
              </button>
            ))}
          </div>
        </div>
        <div style={S.controlGroup}>
          <label style={S.label}>Client Name</label>
          <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. GEBHARDT Group" style={S.input} />
        </div>
        <div style={S.controlGroup}>
          <label style={S.label}>Monthly Labor Savings ($)</label>
          <input type="number" value={laborSavings} onChange={e => setLaborSavings(parseFloat(e.target.value) || 0)} step="10000" style={S.input} />
        </div>
      </div>

      {/* KPI Grid */}
      <div style={S.kpiGrid}>
        <KPI label="Your Monthly API Cost" value={`$${totalCost.toFixed(2)}`} color="#0EA5E9" />
        <KPI label="You Charge Client" value={`$${billed.toFixed(2)}`} color="#FBBF24" />
        <KPI label="Your Monthly Margin" value={`$${margin.toFixed(2)}`} color="#34D399" />
        <KPI label="ROI Ratio (Client)" value={`${Math.round(roi).toLocaleString()}x`} color="#0EA5E9" />
        <KPI label="Annual Billed Total" value={`$${(billed * 12).toFixed(2)}`} color="#FBBF24" />
        <KPI label="Annual Margin" value={`$${(margin * 12).toFixed(2)}`} color="#34D399" />
      </div>

      {/* Scenarios */}
      <h3 style={{ color: '#0EA5E9', marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Usage Scenarios</h3>
      {scenarios.map((s, i) => (
        <div key={s.id} style={S.scenarioRow}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
            <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>{s.desc}</div>
          </div>
          <SliderGroup label="Calls/mo" value={s.calls} max={s.calls * 5} step={Math.max(10, Math.round(SCENARIOS_DEFAULT[i].calls / 20))} onChange={v => updateScenario(i, 'calls', v)} />
          <SliderGroup label="Input Tok" value={s.input_tokens} max={SCENARIOS_DEFAULT[i].input_tokens * 5} step={50} onChange={v => updateScenario(i, 'input_tokens', v)} />
          <SliderGroup label="Output Tok" value={s.output_tokens} max={SCENARIOS_DEFAULT[i].output_tokens * 5} step={50} onChange={v => updateScenario(i, 'output_tokens', v)} />
          <div style={{ fontFamily: "'DM Sans',monospace", fontSize: 16, fontWeight: 600, color: '#34D399', textAlign: 'right', width: 80 }}>
            {s.enabled ? `$${costs[i].toFixed(2)}` : '—'}
          </div>
          <input type="checkbox" checked={s.enabled} onChange={e => updateScenario(i, 'enabled', e.target.checked)} style={{ width: 20, height: 20, accentColor: '#0EA5E9' }} />
        </div>
      ))}

      {/* Contract Clause */}
      <div style={S.clauseBox}>
        <h3 style={{ fontSize: 14, color: '#FBBF24', marginBottom: 12 }}>Auto-Generated Contract Clause</h3>
        <pre style={{ fontSize: 12, color: '#8B949E', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'monospace' }}>{clause}</pre>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={saveEstimate} style={S.btnPrimary}>Save Estimate</button>
        <button onClick={copyClause} style={S.btnSecondary}>Copy Clause</button>
      </div>

      {/* Toast */}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function KPI({ label, value, color }) {
  return (
    <div style={S.kpi}>
      <div style={{ fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function SliderGroup({ label, value, max, step, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 130 }}>
      <label style={{ fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <input type="range" min="0" max={max} step={step} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', accentColor: '#0EA5E9' }} />
      <div style={{ fontSize: 12, color: '#0EA5E9', textAlign: 'right', fontFamily: 'monospace' }}>{value.toLocaleString()}</div>
    </div>
  );
}

const S = {
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 4 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 28 },
  controls: { display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap', alignItems: 'flex-end' },
  controlGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  select: { background: '#161B22', border: '1px solid #30363D', color: '#E6EDF3', padding: '10px 14px', borderRadius: 8, fontSize: 13, minWidth: 200, outline: 'none' },
  input: { background: '#161B22', border: '1px solid #30363D', color: '#E6EDF3', padding: '10px 14px', borderRadius: 8, fontSize: 13, minWidth: 160, outline: 'none' },
  pill: { padding: '8px 14px', borderRadius: 6, border: '1px solid #30363D', background: 'transparent', color: '#8B949E', cursor: 'pointer', fontSize: 13, transition: 'all .2s' },
  pillActive: { borderColor: '#0EA5E9', color: '#0EA5E9', background: 'rgba(14,165,233,0.08)' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 },
  kpi: { background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 20 },
  scenarioRow: { background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 20, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  clauseBox: { background: '#161B22', border: '1px solid #30363D', borderRadius: 10, padding: 24, marginTop: 24, marginBottom: 24 },
  btnPrimary: { padding: '12px 24px', borderRadius: 8, border: 'none', background: '#0EA5E9', color: '#0D1117', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '12px 24px', borderRadius: 8, border: '1px solid #30363D', background: 'transparent', color: '#E6EDF3', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  toast: { position: 'fixed', bottom: 24, right: 24, background: '#34D399', color: '#0D1117', padding: '14px 24px', borderRadius: 8, fontWeight: 600, zIndex: 100 },
};
