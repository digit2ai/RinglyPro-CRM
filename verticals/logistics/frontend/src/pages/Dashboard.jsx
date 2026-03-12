import React, { useState, useRef } from 'react';
import api from '../services/api';
import { getUser } from '../services/auth';

const DATA_TYPES = [
  { id: 'warehouse_inventory', label: 'Warehouse Inventory', desc: 'SKU data, stock levels, locations, bin assignments' },
  { id: 'inbound_shipments', label: 'Inbound Shipments', desc: 'POs, ASNs, receiving schedules, vendor shipments' },
  { id: 'outbound_orders', label: 'Outbound Orders', desc: 'Pick lists, packing slips, shipping manifests' },
  { id: 'loads', label: 'Load History', desc: 'Historical loads for rate intelligence and matching' },
  { id: 'carriers', label: 'Carrier Data', desc: 'Carrier profiles, rates, performance records' },
  { id: 'customers', label: 'Customer Data', desc: 'Customer profiles, shipping preferences, contracts' },
];

export default function Dashboard() {
  const user = getUser();
  const fileRef = useRef(null);
  const [dataType, setDataType] = useState('warehouse_inventory');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [previewMapping, setPreviewMapping] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult] = useState(null);

  const handleFileRead = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setUploadResult(null);
    setPreviewMapping(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      setFileContent(content);
      previewColumns(content, file.name);
    };
    reader.readAsText(file);
  };

  const previewColumns = async (content, name) => {
    try {
      const lines = content.split('\n');
      if (lines.length === 0) return;
      const ft = name?.endsWith('.json') ? 'json' : 'csv';
      let headers;
      if (ft === 'json') {
        const data = JSON.parse(content);
        const rows = Array.isArray(data) ? data : data.data || data.records || data.loads || [data];
        headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      } else {
        const delimiters = [',', '\t', '|', ';'];
        let delimiter = ',', maxCount = 0;
        for (const d of delimiters) { const c = (lines[0].match(new RegExp(`\\${d}`, 'g')) || []).length; if (c > maxCount) { maxCount = c; delimiter = d; } }
        headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
      }
      const mappedType = ['warehouse_inventory', 'inbound_shipments', 'outbound_orders'].includes(dataType) ? 'loads' : dataType;
      const { data } = await api.post('/ingestion/preview-mapping', { headers, data_type: mappedType });
      setPreviewMapping(data.data);
    } catch (err) { console.error(err); }
  };

  const processUpload = async () => {
    setUploading(true);
    try {
      const ft = fileName?.endsWith('.json') ? 'json' : 'csv';
      const mappedType = ['warehouse_inventory', 'inbound_shipments', 'outbound_orders'].includes(dataType) ? 'loads' : dataType;
      const { data } = await api.post('/ingestion/upload', { file_content: fileContent, file_name: fileName, file_type: ft, data_type: mappedType });
      setUploadResult(data.data);
    } catch (err) { setUploadResult({ error: err.response?.data?.error || err.message }); }
    setUploading(false);
  };

  const generateDemo = async () => {
    setDemoLoading(true);
    setDemoResult(null);
    try {
      const { data } = await api.post('/demo/workspace', {
        company_name: 'Demo Warehouse Co',
        contact_email: user?.email || '',
        contact_name: user?.full_name || 'Demo User',
        lead_source: 'quick-demo',
        notes: 'Auto-generated demo workspace'
      });
      const workspace = data.data;
      await api.post('/demo/generate', { access_code: workspace.access_code, sample_size: 50 });
      setDemoResult(workspace);
    } catch (err) { setDemoResult({ error: err.response?.data?.error || err.message }); }
    setDemoLoading(false);
  };

  const statusColor = { completed: '#22C55E', partial: '#F59E0B', failed: '#EF4444', processing: '#0EA5E9' };

  return (
    <div>
      <h1 style={S.title}>COMMAND CENTER</h1>
      <p style={S.sub}>Welcome, {user?.full_name || user?.email}</p>

      <div style={S.grid}>
        {/* Warehouse Data Upload */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h2 style={S.cardTitle}>Warehouse Data Upload</h2>
            <div style={S.cardBadge}>UPLOAD</div>
          </div>
          <p style={S.cardDesc}>Upload your warehouse data files for comprehensive logistics analysis and RinglyPro Logistics product matching.</p>

          <div style={S.typeGrid}>
            {DATA_TYPES.map(t => (
              <button key={t.id} onClick={() => { setDataType(t.id); if (fileContent) previewColumns(fileContent, fileName); }}
                style={{...S.typeBtn, ...(dataType === t.id ? S.typeBtnActive : {})}}>
                <div style={S.typeBtnLabel}>{t.label}</div>
                <div style={S.typeBtnDesc}>{t.desc}</div>
              </button>
            ))}
          </div>

          <div style={S.dropZone} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".csv,.json,.txt,.tsv,.xlsx" onChange={handleFileRead} style={{display:'none'}} />
            {fileName ? (
              <div>
                <div style={S.fileIcon}>&#128196;</div>
                <div style={{fontSize:14,fontWeight:600,color:'#E6EDF3'}}>{fileName}</div>
                <div style={{fontSize:12,color:'#8B949E',marginTop:4}}>{fileContent ? `${fileContent.split('\n').length} lines` : ''} — Click to replace</div>
              </div>
            ) : (
              <div>
                <div style={S.fileIcon}>&#128230;</div>
                <div style={{fontSize:14,color:'#E6EDF3',marginBottom:4}}>Click to upload or drag & drop</div>
                <div style={{fontSize:12,color:'#8B949E'}}>CSV, TSV, JSON, Excel supported</div>
              </div>
            )}
          </div>

          {previewMapping && (
            <div style={S.mappingBox}>
              <div style={S.mappingTitle}>Column Mapping Preview</div>
              <div style={S.mappingGrid}>
                {Object.entries(previewMapping.mapping).map(([src, tgt]) => (
                  <div key={src} style={S.mappingItem}>
                    <span style={{color:'#8B949E',fontSize:12}}>{src}</span>
                    <span style={{color:'#0EA5E9',fontSize:12}}>&#8594;</span>
                    <span style={{color:'#22C55E',fontSize:12}}>{tgt}</span>
                  </div>
                ))}
              </div>
              {previewMapping.unmapped_fields?.length > 0 && (
                <div style={{marginTop:8,fontSize:11,color:'#F59E0B'}}>Unmapped: {previewMapping.unmapped_fields.join(', ')}</div>
              )}
              <div style={{marginTop:8,fontSize:11,color:'#8B949E'}}>{previewMapping.mapped_count}/{previewMapping.total_columns} columns mapped</div>
            </div>
          )}

          <button onClick={processUpload} disabled={uploading || !fileContent} style={{...S.btn, opacity: (!fileContent || uploading) ? 0.5 : 1}}>
            {uploading ? 'Processing...' : 'Upload & Analyze'}
          </button>

          {uploadResult && !uploadResult.error && (
            <div style={S.resultBox}>
              <div style={{...S.resultBadge, background: (statusColor[uploadResult.status] || '#666') + '22', color: statusColor[uploadResult.status] || '#666'}}>
                {uploadResult.status?.toUpperCase()}
              </div>
              <div style={S.resultGrid}>
                <div style={S.resultItem}><div style={S.resultLabel}>Total Rows</div><div style={S.resultValue}>{uploadResult.total_rows}</div></div>
                <div style={S.resultItem}><div style={S.resultLabel}>Imported</div><div style={{...S.resultValue,color:'#22C55E'}}>{uploadResult.imported}</div></div>
                <div style={S.resultItem}><div style={S.resultLabel}>Errors</div><div style={{...S.resultValue,color:uploadResult.errors>0?'#EF4444':'#8B949E'}}>{uploadResult.errors}</div></div>
                <div style={S.resultItem}><div style={S.resultLabel}>Upload ID</div><div style={S.resultValue}>{uploadResult.upload_id}</div></div>
              </div>
            </div>
          )}
          {uploadResult?.error && <div style={S.error}>{uploadResult.error}</div>}
        </div>

        {/* Right column */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {/* Quick Demo */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <h2 style={S.cardTitle}>Quick Demo</h2>
              <div style={{...S.cardBadge,background:'#22C55E22',color:'#22C55E'}}>DEMO</div>
            </div>
            <p style={S.cardDesc}>Generate a demo project with synthetic warehouse data to explore the full analysis pipeline.</p>

            <button onClick={generateDemo} disabled={demoLoading} style={{...S.btn,background:'#22C55E',opacity:demoLoading?0.5:1}}>
              {demoLoading ? 'Generating...' : 'Generate Demo'}
            </button>

            {demoResult && !demoResult.error && (
              <div style={S.demoSuccess}>
                <div style={{fontSize:14,fontWeight:600,color:'#22C55E',marginBottom:12}}>Demo Workspace Created!</div>
                <div style={S.demoRow}><span style={S.demoLabel}>Company</span><span>{demoResult.company}</span></div>
                <div style={S.demoRow}><span style={S.demoLabel}>Access Code</span><span style={{color:'#0EA5E9',fontWeight:700,fontSize:16,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2}}>{demoResult.access_code}</span></div>
                <div style={S.demoRow}><span style={S.demoLabel}>Expires</span><span>{new Date(demoResult.expires_at).toLocaleDateString()}</span></div>
                {demoResult.modules && (
                  <div style={{marginTop:8}}>
                    <span style={S.demoLabel}>Modules: </span>
                    {demoResult.modules.map(m => <span key={m} style={S.modBadge}>{m}</span>)}
                  </div>
                )}
                <a href="/logistics/demos" style={S.demoLink}>View All Demo Workspaces &#8594;</a>
              </div>
            )}
            {demoResult?.error && <div style={S.error}>{demoResult.error}</div>}
          </div>

          {/* Quick Navigation */}
          <div style={S.card}>
            <h2 style={S.cardTitle}>Quick Actions</h2>
            <div style={S.actionGrid}>
              {[
                { label: 'Demo Workspaces', href: '/logistics/demos', color: '#22C55E' },
                { label: 'Data Ingestion', href: '/logistics/ingestion', color: '#0EA5E9' },
                { label: 'Analytics & KPIs', href: '/logistics/analytics', color: '#A855F7' },
                { label: 'Rate Intelligence', href: '/logistics/pricing', color: '#F59E0B' },
                { label: 'Carrier Matching', href: '/logistics/matching', color: '#0EA5E9' },
                { label: 'Load Matching', href: '/logistics/load-matching', color: '#10B981' },
                { label: 'Document Vault', href: '/logistics/documents', color: '#EC4899' },
                { label: 'FMCSA Compliance', href: '/logistics/compliance', color: '#EF4444' },
              ].map((a, i) => (
                <a key={i} href={a.href} style={S.actionCard}>
                  <div style={{...S.actionDot,background:a.color}} />
                  <span>{a.label}</span>
                </a>
              ))}
            </div>
          </div>

          {/* External Links */}
          <div style={S.card}>
            <h2 style={S.cardTitle}>Connected Platforms</h2>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <a href="/cw_carriers/dashboard" style={S.extLink}>
                <span>Carriers CRM</span>
                <span style={S.extBadge}>15 modules</span>
              </a>
              <a href="/pinaxis/" style={S.extLink}>
                <span>Warehouse OPS</span>
                <span style={S.extBadge}>Inventory + OEE</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#0EA5E9', letterSpacing: 2, marginBottom: 4 },
  sub: { color: '#8B949E', fontSize: 14, marginBottom: 24 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#E6EDF3', letterSpacing: 1 },
  cardBadge: { padding: '3px 10px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  cardDesc: { color: '#8B949E', fontSize: 13, marginBottom: 20, lineHeight: 1.6 },
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 },
  typeBtn: { padding: '10px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' },
  typeBtnActive: { borderColor: '#0EA5E9', background: '#0EA5E911' },
  typeBtnLabel: { fontSize: 12, fontWeight: 600, color: '#E6EDF3', marginBottom: 2 },
  typeBtnDesc: { fontSize: 10, color: '#8B949E', lineHeight: 1.4 },
  dropZone: { border: '2px dashed #30363D', borderRadius: 10, padding: 32, textAlign: 'center', cursor: 'pointer', marginBottom: 16, transition: 'border-color 0.2s', background: '#0D1117' },
  fileIcon: { fontSize: 36, marginBottom: 8 },
  mappingBox: { background: '#0D1117', borderRadius: 8, padding: 12, marginBottom: 16 },
  mappingTitle: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  mappingGrid: { display: 'flex', flexDirection: 'column', gap: 4 },
  mappingItem: { display: 'flex', gap: 8, alignItems: 'center' },
  btn: { width: '100%', padding: '12px 20px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  resultBox: { marginTop: 16, background: '#0D1117', borderRadius: 8, padding: 16 },
  resultBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12 },
  resultGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  resultItem: { background: '#161B22', borderRadius: 8, padding: 12, textAlign: 'center' },
  resultLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  resultValue: { fontSize: 20, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif", marginTop: 4 },
  error: { background: '#EF444422', border: '1px solid #EF4444', borderRadius: 8, padding: 12, color: '#EF4444', marginTop: 12, fontSize: 13 },
  demoSuccess: { marginTop: 16, background: '#0D1117', border: '1px solid #22C55E33', borderRadius: 8, padding: 16, fontSize: 13, color: '#E6EDF3' },
  demoRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #21262D' },
  demoLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  modBadge: { display: 'inline-block', padding: '2px 8px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 4, fontSize: 10, fontWeight: 600, margin: '0 4px', textTransform: 'uppercase' },
  demoLink: { display: 'block', marginTop: 12, padding: '8px 0', color: '#0EA5E9', fontSize: 13, fontWeight: 600, textAlign: 'center' },
  actionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  actionCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, color: '#E6EDF3', fontSize: 13, textDecoration: 'none', transition: 'border-color 0.2s' },
  actionDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  extLink: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, color: '#E6EDF3', fontSize: 14, textDecoration: 'none' },
  extBadge: { padding: '2px 8px', background: '#30363D', color: '#8B949E', borderRadius: 4, fontSize: 10, fontWeight: 600 },
};
