import React, { useState, useEffect } from 'react';
import api from '../services/api';

const DATA_TYPES = ['loads', 'carriers', 'customers', 'rates'];

export default function DataIngestion() {
  const [tab, setTab] = useState('upload');
  const [dataType, setDataType] = useState('loads');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewMapping, setPreviewMapping] = useState(null);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab]);

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/ingestion/history');
      setHistory(data.data.uploads || []);
    } catch (err) { console.error(err); }
  };

  const handleFileRead = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      setFileContent(content);
      // Auto-preview mapping
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
      const { data } = await api.post('/ingestion/preview-mapping', { headers, data_type: dataType });
      setPreviewMapping(data.data);
    } catch (err) { console.error(err); }
  };

  const processUpload = async () => {
    setLoading(true);
    try {
      const ft = fileName?.endsWith('.json') ? 'json' : 'csv';
      const { data } = await api.post('/ingestion/upload', { file_content: fileContent, file_name: fileName, file_type: ft, data_type: dataType });
      setResult(data.data);
    } catch (err) { setResult({ error: err.response?.data?.error || err.message }); }
    setLoading(false);
  };

  const statusColor = { completed: '#22C55E', partial: '#F59E0B', failed: '#EF4444', processing: '#0EA5E9', pending: '#8B949E' };

  return (
    <div>
      <h2 style={S.title}>DATA INGESTION</h2>
      <p style={S.subtitle}>Upload CSV, Excel, or JSON files from your TMS or operational systems</p>

      <div style={S.tabs}>
        {['upload','history'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{...S.tab, ...(tab === t ? S.tabActive : {})}}>{t === 'upload' ? 'Upload Data' : 'Upload History'}</button>
        ))}
      </div>

      {tab === 'upload' && (
        <div style={S.grid}>
          <div style={S.card}>
            <h3 style={S.cardTitle}>Upload File</h3>
            <div style={{marginBottom: 16}}>
              <label style={S.label}>Data Type</label>
              <div style={S.typeGrid}>
                {DATA_TYPES.map(t => (
                  <button key={t} onClick={() => { setDataType(t); if (fileContent) previewColumns(fileContent, fileName); }}
                    style={{...S.typeBtn, ...(dataType === t ? S.typeBtnActive : {})}}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom: 16}}>
              <label style={S.label}>Select File (CSV, JSON)</label>
              <input type="file" accept=".csv,.json,.txt,.tsv" onChange={handleFileRead} style={S.fileInput} />
            </div>
            {fileName && (
              <div style={S.fileInfo}>
                <span>{fileName}</span>
                <span style={{color: '#8B949E'}}>{fileContent ? `${fileContent.split('\n').length} lines` : ''}</span>
              </div>
            )}
            {previewMapping && (
              <div style={S.mappingPreview}>
                <div style={S.mappingTitle}>Column Mapping Preview</div>
                <div style={S.mappingGrid}>
                  {Object.entries(previewMapping.mapping).map(([src, tgt]) => (
                    <div key={src} style={S.mappingItem}>
                      <span style={{color: '#8B949E'}}>{src}</span>
                      <span style={{color: '#0EA5E9'}}>&#8594;</span>
                      <span style={{color: '#22C55E'}}>{tgt}</span>
                    </div>
                  ))}
                </div>
                {previewMapping.unmapped_fields.length > 0 && (
                  <div style={{marginTop: 8, fontSize: 12, color: '#F59E0B'}}>
                    Unmapped: {previewMapping.unmapped_fields.join(', ')}
                  </div>
                )}
                <div style={{marginTop: 8, fontSize: 12, color: '#8B949E'}}>
                  {previewMapping.mapped_count}/{previewMapping.total_columns} columns mapped
                </div>
              </div>
            )}
            <button onClick={processUpload} disabled={loading || !fileContent} style={S.btn}>
              {loading ? 'Processing...' : 'Upload & Import'}
            </button>
          </div>

          <div style={S.card}>
            {result && !result.error && (
              <>
                <h3 style={S.cardTitle}>Import Results</h3>
                <div style={{...S.statusBadge, background: (statusColor[result.status] || '#666') + '22', color: statusColor[result.status] || '#666'}}>
                  {result.status?.toUpperCase()}
                </div>
                <div style={S.resultGrid}>
                  <div style={S.resultItem}><div style={S.resultLabel}>Total Rows</div><div style={S.resultValue}>{result.total_rows}</div></div>
                  <div style={S.resultItem}><div style={S.resultLabel}>Imported</div><div style={{...S.resultValue, color: '#22C55E'}}>{result.imported}</div></div>
                  <div style={S.resultItem}><div style={S.resultLabel}>Errors</div><div style={{...S.resultValue, color: result.errors > 0 ? '#EF4444' : '#8B949E'}}>{result.errors}</div></div>
                  <div style={S.resultItem}><div style={S.resultLabel}>Upload ID</div><div style={S.resultValue}>{result.upload_id}</div></div>
                </div>
                {result.validation_errors?.length > 0 && (
                  <div style={{marginTop: 16}}>
                    <div style={S.label}>Validation Errors (first {result.validation_errors.length})</div>
                    <div style={{maxHeight: 200, overflowY: 'auto'}}>
                      {result.validation_errors.map((e, i) => (
                        <div key={i} style={S.errorRow}>Row {e.row}: {e.errors.join(', ')}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {result?.error && <div style={S.error}>{result.error}</div>}
            {!result && (
              <div style={S.emptyState}>
                <div style={{fontSize: 48, marginBottom: 12}}>&#128230;</div>
                <div style={{fontSize: 16, color: '#E6EDF3', marginBottom: 8}}>Upload Your Data</div>
                <div style={{fontSize: 13, color: '#8B949E'}}>
                  Supported formats: CSV, TSV, JSON<br/>
                  Auto-detects delimiters and column mappings<br/>
                  Validates data quality on import
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Upload History</h3>
          {history.length === 0 ? <div style={{color: '#8B949E', textAlign: 'center', padding: 40}}>No uploads yet</div> : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>ID</th><th style={S.th}>File</th><th style={S.th}>Type</th>
                <th style={S.th}>Rows</th><th style={S.th}>Imported</th><th style={S.th}>Errors</th>
                <th style={S.th}>Status</th><th style={S.th}>Date</th>
              </tr></thead>
              <tbody>
                {history.map(u => (
                  <tr key={u.id}>
                    <td style={S.td}>{u.id}</td>
                    <td style={S.td}>{u.original_name || u.filename}</td>
                    <td style={S.td}><span style={S.typeBadge2}>{u.data_type}</span></td>
                    <td style={S.td}>{u.total_rows}</td>
                    <td style={S.td}>{u.imported_rows}</td>
                    <td style={S.td}>{u.error_rows}</td>
                    <td style={S.td}><span style={{color: statusColor[u.status] || '#8B949E'}}>{u.status}</span></td>
                    <td style={S.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const S = {
  title: { fontSize: 28, color: '#E6EDF3', marginBottom: 4 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 24 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: { padding: '8px 20px', background: '#161B22', border: '1px solid #21262D', color: '#8B949E', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  tabActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 16 },
  label: { display: 'block', fontSize: 11, color: '#8B949E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  typeGrid: { display: 'flex', gap: 8 },
  typeBtn: { padding: '6px 16px', background: '#0D1117', border: '1px solid #30363D', color: '#8B949E', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  typeBtnActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  fileInput: { width: '100%', padding: 10, background: '#0D1117', border: '1px dashed #30363D', borderRadius: 8, color: '#E6EDF3', cursor: 'pointer' },
  fileInfo: { display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#0D1117', borderRadius: 6, fontSize: 13, color: '#E6EDF3', marginBottom: 12 },
  mappingPreview: { background: '#0D1117', borderRadius: 8, padding: 12, marginBottom: 16 },
  mappingTitle: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  mappingGrid: { display: 'flex', flexDirection: 'column', gap: 4 },
  mappingItem: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' },
  btn: { width: '100%', padding: '10px 20px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  statusBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 16 },
  resultGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  resultItem: { background: '#0D1117', borderRadius: 8, padding: 16, textAlign: 'center' },
  resultLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  resultValue: { fontSize: 24, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif", marginTop: 4 },
  errorRow: { fontSize: 12, color: '#EF4444', padding: '4px 0', borderBottom: '1px solid #21262D' },
  error: { background: '#EF444422', border: '1px solid #EF4444', borderRadius: 8, padding: 16, color: '#EF4444' },
  emptyState: { textAlign: 'center', padding: 40 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 10, color: '#8B949E', textTransform: 'uppercase' },
  td: { padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 13, color: '#E6EDF3' },
  typeBadge2: { padding: '2px 8px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' },
};
