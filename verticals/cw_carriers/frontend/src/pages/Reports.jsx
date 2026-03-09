import React, { useState } from 'react';
import { getToken } from '../services/auth';

const BASE_API = '/cw_carriers/api/reports';

export default function Reports() {
  const [generating, setGenerating] = useState('');

  const downloadReport = async (type, params = '') => {
    setGenerating(type);
    try {
      const token = getToken();
      const response = await fetch(`${BASE_API}/${type}${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to generate report');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CW-Carriers-${type.toUpperCase()}-Report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Report generation failed');
    }
    setGenerating('');
  };

  const reports = [
    {
      id: 'qbr',
      title: 'Quarterly Business Review',
      desc: 'Full QBR with KPIs, lane profitability, carrier performance, and recent loads. Perfect for enterprise client meetings.',
      color: '#1A4FA8'
    },
    {
      id: 'lanes',
      title: 'Lane Profitability Report',
      desc: 'Revenue and rate analysis by lane — total loads, delivered, average rate, min/max, and total revenue.',
      color: '#C8962A'
    },
    {
      id: 'carriers',
      title: 'Carrier Performance Report',
      desc: 'Carrier scoring by delivery rate, load volume, average rate, and total revenue. Identify your best carriers.',
      color: '#238636'
    }
  ];

  return (
    <div>
      <h2 style={s.title}>PDF REPORTS</h2>
      <p style={s.subtitle}>Auto-generated PDF reports powered by Rachel AI analytics engine</p>

      <div style={s.grid}>
        {reports.map(r => (
          <div key={r.id} style={s.card}>
            <div style={{ ...s.cardHeader, borderBottomColor: r.color }}>
              <h3 style={{ ...s.cardTitle, color: r.color }}>{r.title}</h3>
            </div>
            <p style={s.cardDesc}>{r.desc}</p>
            <button
              onClick={() => downloadReport(r.id)}
              disabled={!!generating}
              style={{ ...s.downloadBtn, background: r.color }}
            >
              {generating === r.id ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>CUSTOM QBR</h3>
        <p style={{ fontSize: 13, color: '#8B949E', marginBottom: 12 }}>
          Generate a client-specific QBR report with shipper name on the cover.
        </p>
        <CustomQBR onGenerate={downloadReport} generating={generating} />
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>NLP SHORTCUT</h3>
        <p style={{ fontSize: 13, color: '#8B949E' }}>
          You can also generate reports from the NLP Assistant:
        </p>
        <div style={s.exampleBox}>
          <code style={{ color: '#58A6FF' }}>"Generate a QBR report for PepsiCo"</code><br />
          <code style={{ color: '#58A6FF' }}>"Generate lane profitability report"</code><br />
          <code style={{ color: '#58A6FF' }}>"Generate carrier performance report"</code>
        </div>
      </div>
    </div>
  );
}

function CustomQBR({ onGenerate, generating }) {
  const [shipperName, setShipperName] = useState('');
  const [quarter, setQuarter] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());

  const generate = () => {
    const params = [];
    if (shipperName) params.push(`shipper_name=${encodeURIComponent(shipperName)}`);
    if (quarter) params.push(`quarter=${quarter}`);
    if (year) params.push(`year=${year}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    onGenerate('qbr', qs);
  };

  return (
    <div style={s.customForm}>
      <input placeholder="Shipper Name (e.g. PepsiCo)" value={shipperName} onChange={e => setShipperName(e.target.value)} style={s.input} />
      <select value={quarter} onChange={e => setQuarter(e.target.value)} style={s.input}>
        <option value="">Quarter (optional)</option>
        <option value="1">Q1</option>
        <option value="2">Q2</option>
        <option value="3">Q3</option>
        <option value="4">Q4</option>
      </select>
      <input placeholder="Year" value={year} onChange={e => setYear(e.target.value)} style={{ ...s.input, width: 80 }} />
      <button onClick={generate} disabled={!!generating} style={s.btn}>
        {generating === 'qbr' ? 'Generating...' : 'Generate QBR'}
      </button>
    </div>
  );
}

const s = {
  title: { fontSize: 28, color: '#C8962A', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#8B949E', marginBottom: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '2px solid' },
  cardTitle: { fontSize: 16, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" },
  cardDesc: { fontSize: 13, color: '#8B949E', lineHeight: 1.5, flex: 1, marginBottom: 16 },
  downloadBtn: { padding: '10px 20px', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' },
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 8 },
  exampleBox: { background: '#0D1117', padding: 16, borderRadius: 6, border: '1px solid #30363D', marginTop: 8, lineHeight: 2 },
  customForm: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, minWidth: 140 },
  btn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
};
