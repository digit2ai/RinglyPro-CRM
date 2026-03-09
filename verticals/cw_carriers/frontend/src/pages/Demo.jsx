import React, { useState } from 'react';
import api from '../services/api';

const SAMPLE_JSON = {
  contacts: [
    { contact_type: "carrier", company_name: "FastFreight LLC", full_name: "John Smith", email: "john@fastfreight.com", phone: "+14155551234", freight_types: "dry_van,reefer", lanes: "Tampa-Chicago,Dallas-Atlanta", volume_estimate: "high" },
    { contact_type: "shipper", company_name: "Green Valley Produce", full_name: "Maria Garcia", email: "maria@greenvalley.com", phone: "+13055559876", freight_types: "reefer", lanes: "Miami-New York", volume_estimate: "medium" }
  ],
  loads: [
    { load_ref: "DEMO-5001", origin: "Tampa, FL", destination: "Chicago, IL", freight_type: "dry_van", weight_lbs: 38000, pickup_date: "2026-03-15", delivery_date: "2026-03-18", rate_usd: 3200, status: "open" },
    { load_ref: "DEMO-5002", origin: "Dallas, TX", destination: "Atlanta, GA", freight_type: "reefer", weight_lbs: 25000, pickup_date: "2026-03-16", delivery_date: "2026-03-17", rate_usd: 2100, status: "open" }
  ],
  calls: [
    { direction: "outbound", call_type: "carrier_coverage", from_number: "+18005551234", to_number: "+14155554567", duration_sec: 120, ai_summary: "Carrier interested in Tampa-Chicago lane, will confirm availability by EOD", outcome: "qualified" },
    { direction: "inbound", call_type: "inbound_shipper", from_number: "+13055559876", to_number: "+18005551234", duration_sec: 180, ai_summary: "New shipper requesting quote for reefer loads Miami to New York, weekly volume", outcome: "qualified" }
  ]
};

const SAMPLE_CSV = {
  contacts: `contact_type,company_name,full_name,email,phone,volume_estimate
carrier,QuickHaul Inc,Bob Jones,bob@quickhaul.com,+16175551111,high
shipper,Farm Fresh Foods,Alice Lee,alice@farmfresh.com,+12125552222,medium
prospect,Big Box Retail,Tom Brown,tom@bigbox.com,+17135553333,low`,
  loads: `load_ref,origin,destination,freight_type,weight_lbs,pickup_date,delivery_date,rate_usd,status
CSV-6001,"Houston, TX","Phoenix, AZ",flatbed,42000,2026-03-20,2026-03-23,3800,open
CSV-6002,"Seattle, WA","Denver, CO",dry_van,30000,2026-03-21,2026-03-24,2900,open`,
  calls: `direction,call_type,from_number,to_number,duration_sec,ai_summary,outcome
outbound,carrier_coverage,+18005551234,+16175551111,95,Carrier has truck available for Houston-Phoenix,qualified
inbound,inbound_shipper,+12125552222,+18005551234,210,Shipper needs weekly reefer service to Boston,qualified`
};

export default function Demo() {
  const [dataType, setDataType] = useState('contacts');
  const [format, setFormat] = useState('json');
  const [textInput, setTextInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [genResult, setGenResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [genCount, setGenCount] = useState(10);

  const loadSample = () => {
    if (format === 'json') {
      setTextInput(JSON.stringify(SAMPLE_JSON[dataType] || [], null, 2));
    } else {
      setTextInput(SAMPLE_CSV[dataType] || '');
    }
    setPreview(null);
    setResult(null);
  };

  const handlePreview = async () => {
    setLoading(true);
    try {
      let payload;
      if (format === 'csv') {
        payload = { data: textInput, format: 'csv' };
      } else {
        payload = { data: JSON.parse(textInput), format: 'json' };
      }
      const res = await api.post('/demo/preview', payload);
      setPreview(res.data.preview);
    } catch (err) {
      setPreview({ error: err.response?.data?.error || err.message || 'Invalid data format' });
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    setLoading(true);
    setResult(null);
    try {
      let payload;
      if (format === 'csv') {
        payload = { data_type: dataType, data: textInput, format: 'csv' };
      } else {
        payload = { data_type: dataType, data: JSON.parse(textInput), format: 'json' };
      }
      const res = await api.post('/demo/upload', payload);
      setResult(res.data.results);
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message });
    }
    setLoading(false);
  };

  const handleGenerate = async (type) => {
    setGenResult(null);
    const res = await api.post('/demo/generate', { type, count: genCount });
    setGenResult(res.data);
  };

  const handleClear = async (type) => {
    const res = await api.delete(`/demo/clear?type=${type}`);
    setGenResult({ message: `Cleared demo data: ${JSON.stringify(res.data.deleted)}` });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      if (file.name.endsWith('.csv')) {
        setFormat('csv');
        setTextInput(content);
      } else {
        setFormat('json');
        setTextInput(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <h2 style={s.title}>DEMO DATA MODULE</h2>
      <p style={s.subtitle}>Upload sample data via JSON or CSV, or auto-generate demo records to explore the CRM.</p>

      {/* Quick Generate */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>QUICK GENERATE</h3>
        <p style={s.desc}>Auto-generate realistic demo data with one click.</p>
        <div style={s.genRow}>
          <label style={s.genLabel}>Records per type:</label>
          <input type="number" min="1" max="100" value={genCount} onChange={e => setGenCount(e.target.value)} style={{ ...s.input, width: 80 }} />
          <button onClick={() => handleGenerate('contacts')} style={s.genBtn}>Generate Contacts</button>
          <button onClick={() => handleGenerate('loads')} style={s.genBtn}>Generate Loads</button>
          <button onClick={() => handleGenerate('calls')} style={s.genBtn}>Generate Calls</button>
          <button onClick={() => handleGenerate('all')} style={{ ...s.genBtn, background: '#1A4FA8' }}>Generate All</button>
        </div>
        <div style={s.genRow}>
          <button onClick={() => handleClear('contacts')} style={s.clearBtn}>Clear Demo Contacts</button>
          <button onClick={() => handleClear('loads')} style={s.clearBtn}>Clear Demo Loads</button>
          <button onClick={() => handleClear('calls')} style={s.clearBtn}>Clear Demo Calls</button>
          <button onClick={() => handleClear('all')} style={{ ...s.clearBtn, borderColor: '#F85149', color: '#F85149' }}>Clear All Demo Data</button>
        </div>
        {genResult && <div style={s.resultBox}>{genResult.message}</div>}
      </div>

      {/* Upload Section */}
      <div style={{ ...s.section, marginTop: 20 }}>
        <h3 style={s.sectionTitle}>UPLOAD DATA</h3>

        <div style={s.controlRow}>
          <div style={s.controlGroup}>
            <label style={s.controlLabel}>Data Type</label>
            <select value={dataType} onChange={e => setDataType(e.target.value)} style={s.select}>
              <option value="contacts">Contacts</option>
              <option value="loads">Loads</option>
              <option value="calls">Calls</option>
            </select>
          </div>
          <div style={s.controlGroup}>
            <label style={s.controlLabel}>Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)} style={s.select}>
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <button onClick={loadSample} style={s.sampleBtn}>Load Sample Data</button>
          <label style={s.fileLabel}>
            Upload File (.json / .csv)
            <input type="file" accept=".json,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>

        <textarea
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          style={s.textarea}
          placeholder={format === 'json' ? '[\n  { "company_name": "...", "contact_type": "carrier", ... }\n]' : 'contact_type,company_name,full_name,email,phone\ncarrier,FastFreight LLC,John Smith,john@ff.com,+14155551234'}
          rows={12}
        />

        <div style={s.btnRow}>
          <button onClick={handlePreview} disabled={loading || !textInput.trim()} style={s.previewBtn}>Preview Data</button>
          <button onClick={handleUpload} disabled={loading || !textInput.trim()} style={s.uploadBtn}>{loading ? 'Uploading...' : `Upload ${dataType}`}</button>
        </div>

        {/* Preview */}
        {preview && !preview.error && (
          <div style={s.previewBox}>
            <div style={s.previewHeader}>Preview: {preview.total} records | Columns: {preview.columns.join(', ')}</div>
            <table style={s.table}>
              <thead>
                <tr>{preview.columns.map(c => <th key={c} style={s.th}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {preview.sample.map((row, i) => (
                  <tr key={i}>{preview.columns.map(c => <td key={c} style={s.td}>{String(row[c] || '').substring(0, 40)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && preview.error && (
          <div style={s.errorBox}>{preview.error}</div>
        )}

        {/* Upload Result */}
        {result && !result.error && (
          <div style={s.resultBox}>
            Uploaded {result.inserted} of {result.total} records
            {result.errors.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong>Errors ({result.errors.length}):</strong>
                {result.errors.slice(0, 5).map((e, i) => <div key={i} style={s.errorLine}>Row {e.row}: {e.error}</div>)}
              </div>
            )}
          </div>
        )}
        {result && result.error && <div style={s.errorBox}>{result.error}</div>}
      </div>
    </div>
  );
}

const s = {
  title: { fontSize: 28, color: '#C8962A' },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 20 },
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 24 },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 6 },
  desc: { color: '#8B949E', fontSize: 13, marginBottom: 14 },
  genRow: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' },
  genLabel: { fontSize: 13, color: '#8B949E' },
  genBtn: { padding: '8px 14px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  clearBtn: { padding: '6px 12px', background: 'none', color: '#8B949E', border: '1px solid #30363D', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  controlRow: { display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' },
  controlGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  controlLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase' },
  select: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  input: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  sampleBtn: { padding: '8px 14px', background: '#21262D', color: '#E6EDF3', border: '1px solid #30363D', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  fileLabel: { padding: '8px 14px', background: '#21262D', color: '#C8962A', border: '1px solid #30363D', borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'inline-block' },
  textarea: { width: '100%', padding: 14, background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, color: '#E6EDF3', fontSize: 13, fontFamily: 'monospace', resize: 'vertical', outline: 'none', lineHeight: 1.5 },
  btnRow: { display: 'flex', gap: 12, marginTop: 14 },
  previewBtn: { padding: '10px 20px', background: '#21262D', color: '#E6EDF3', border: '1px solid #30363D', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  uploadBtn: { padding: '10px 20px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  previewBox: { marginTop: 16, border: '1px solid #30363D', borderRadius: 8, overflow: 'hidden' },
  previewHeader: { padding: '8px 12px', background: '#0D1117', fontSize: 12, color: '#8B949E', borderBottom: '1px solid #30363D' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#161B22' },
  td: { padding: '6px 10px', fontSize: 12, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  resultBox: { marginTop: 16, padding: '12px 16px', background: '#23863622', border: '1px solid #238636', borderRadius: 6, color: '#238636', fontSize: 13 },
  errorBox: { marginTop: 16, padding: '12px 16px', background: '#F8514922', border: '1px solid #F85149', borderRadius: 6, color: '#F85149', fontSize: 13 },
  errorLine: { fontSize: 12, color: '#F85149', marginTop: 4 }
};
