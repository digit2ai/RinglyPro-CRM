import React, { useState, useEffect } from 'react';
import api from '../services/api';

const DATA_TYPES = [
  { id: 'loads', label: 'Loads', icon: '\uD83D\uDCE6', desc: '50 shipments with routes, rates, status' },
  { id: 'carriers', label: 'Carriers', icon: '\uD83D\uDE9B', desc: '25 fleets with MC/DOT, equipment' },
  { id: 'customers', label: 'Customers', icon: '\uD83C\uDFED', desc: '15 shippers with billing, terms' },
  { id: 'rates', label: 'Rates', icon: '\uD83D\uDCB2', desc: '30 lane benchmarks with RPM' },
];

const STEPS = ['Select & Upload', 'Preview & Map', 'Import'];

export default function DataIngestion() {
  const [step, setStep] = useState(0);
  const [dataType, setDataType] = useState('loads');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('upload');

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
    setResult(null);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target.result;
      setFileContent(content);
      // Auto-advance to preview
      setLoading(true);
      try {
        const ft = file.name?.endsWith('.json') ? 'json' : 'csv';
        const { data } = await api.post('/ingestion/preview', {
          file_content: content, file_name: file.name, file_type: ft, data_type: dataType
        });
        setPreview(data.data);
        setStep(1);
      } catch (err) {
        setPreview({ error: err.response?.data?.error || err.message });
      }
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const processUpload = async () => {
    setLoading(true);
    setStep(2);
    try {
      const ft = fileName?.endsWith('.json') ? 'json' : 'csv';
      const { data } = await api.post('/ingestion/upload', {
        file_content: fileContent, file_name: fileName, file_type: ft, data_type: dataType
      });
      setResult(data.data);
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message });
    }
    setLoading(false);
  };

  const resetPipeline = () => {
    setStep(0);
    setFileContent('');
    setFileName('');
    setPreview(null);
    setResult(null);
  };

  const statusColor = { completed: '#22C55E', partial: '#F59E0B', failed: '#EF4444', processing: '#0EA5E9', pending: '#8B949E' };

  return (
    <div>
      <h2 style={S.title}>DATA INGESTION</h2>
      <p style={S.subtitle}>Upload CSV or JSON files from your TMS or operational systems</p>

      <div style={S.tabs}>
        {['upload', 'history'].map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'upload') resetPipeline(); }}
            style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}>
            {t === 'upload' ? 'Upload Data' : 'Upload History'}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <>
          {/* Progress stepper */}
          <div style={S.stepper}>
            {STEPS.map((label, i) => (
              <div key={i} style={S.stepItem}>
                <div style={{
                  ...S.stepCircle,
                  ...(i < step ? S.stepDone : i === step ? S.stepActive : {})
                }}>
                  {i < step ? '\u2713' : i + 1}
                </div>
                <div style={{ ...S.stepLabel, color: i <= step ? '#E6EDF3' : '#484F58' }}>{label}</div>
                {i < STEPS.length - 1 && <div style={{ ...S.stepLine, background: i < step ? '#238636' : '#21262D' }} />}
              </div>
            ))}
          </div>

          {/* ── Step 0: Select & Upload ── */}
          {step === 0 && (
            <div style={S.grid}>
              <div style={S.card}>
                <h3 style={S.cardTitle}>1. Select Data Type</h3>
                <div style={S.typeCards}>
                  {DATA_TYPES.map(t => (
                    <button key={t.id} onClick={() => { setDataType(t.id); setPreview(null); setResult(null); }}
                      style={{ ...S.typeCard, ...(dataType === t.id ? S.typeCardActive : {}) }}>
                      <div style={S.typeIcon}>{t.icon}</div>
                      <div style={S.typeLabel}>{t.label}</div>
                      <div style={S.typeDesc}>{t.desc}</div>
                    </button>
                  ))}
                </div>

                <h3 style={{ ...S.cardTitle, marginTop: 24 }}>2. Choose File</h3>
                <label style={S.dropzone}>
                  <input type="file" accept=".csv,.json,.txt,.tsv" onChange={handleFileRead} style={{ display: 'none' }} />
                  <div style={S.dropIcon}>{loading ? '\u23F3' : '\u2B07'}</div>
                  <div style={S.dropText}>{loading ? 'Parsing file...' : 'Click to select CSV or JSON file'}</div>
                  <div style={S.dropHint}>Auto-detects delimiters, maps columns, validates data</div>
                </label>
                {fileName && (
                  <div style={S.fileInfo}>
                    <span>{fileName}</span>
                    <span style={{ color: '#8B949E' }}>{fileContent ? `${fileContent.split('\n').length} lines` : ''}</span>
                  </div>
                )}
              </div>

              <div style={S.card}>
                <h3 style={S.cardTitle}>Demo Data Files</h3>
                <p style={{ color: '#8B949E', fontSize: 13, marginBottom: 16 }}>
                  Download realistic presentation-ready data, then upload it here.
                </p>
                <div style={S.demoGrid}>
                  {DATA_TYPES.map(t => (
                    <a key={t.id} href={`/cw_carriers/samples/demo-${t.id}.csv`} download
                      style={S.demoCard}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3' }}>demo-{t.id}.csv</div>
                      <div style={{ fontSize: 11, color: '#8B949E', marginTop: 2 }}>{t.desc}</div>
                    </a>
                  ))}
                </div>

                <div style={{ marginTop: 20, padding: 16, background: '#0D1117', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Recommended upload order</div>
                  <div style={S.orderList}>
                    <div style={S.orderItem}><span style={S.orderNum}>1</span> Customers (shippers)</div>
                    <div style={S.orderItem}><span style={S.orderNum}>2</span> Carriers (fleets)</div>
                    <div style={S.orderItem}><span style={S.orderNum}>3</span> Rates (lane benchmarks)</div>
                    <div style={S.orderItem}><span style={S.orderNum}>4</span> Loads (shipments)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Preview & Map ── */}
          {step === 1 && preview && !preview.error && (
            <div style={S.grid}>
              <div style={S.card}>
                <h3 style={S.cardTitle}>Column Mapping</h3>
                <div style={S.mappingStats}>
                  <div style={S.mapStat}>
                    <div style={{ ...S.mapStatValue, color: '#238636' }}>{preview.mapped_count}</div>
                    <div style={S.mapStatLabel}>Mapped</div>
                  </div>
                  <div style={S.mapStat}>
                    <div style={{ ...S.mapStatValue, color: '#F59E0B' }}>{preview.unmapped_fields.length}</div>
                    <div style={S.mapStatLabel}>Unmapped</div>
                  </div>
                  <div style={S.mapStat}>
                    <div style={{ ...S.mapStatValue, color: '#8B949E' }}>{preview.total_columns}</div>
                    <div style={S.mapStatLabel}>Columns</div>
                  </div>
                </div>

                <div style={S.mappingList}>
                  {Object.entries(preview.mapping).map(([src, tgt]) => (
                    <div key={src} style={S.mapRow}>
                      <span style={S.mapSrc}>{src}</span>
                      <span style={S.mapArrow}>{'\u2192'}</span>
                      <span style={S.mapTgt}>{tgt}</span>
                    </div>
                  ))}
                </div>

                {preview.unmapped_fields.length > 0 && (
                  <div style={S.unmappedBox}>
                    <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600, marginBottom: 4 }}>UNMAPPED FIELDS (optional)</div>
                    <div style={{ fontSize: 12, color: '#8B949E' }}>{preview.unmapped_fields.join(', ')}</div>
                  </div>
                )}
              </div>

              <div style={S.card}>
                <h3 style={S.cardTitle}>Data Preview</h3>

                {/* Validation gauge */}
                <div style={S.gaugeWrap}>
                  <div style={S.gaugeBar}>
                    <div style={{ ...S.gaugeFill, width: `${preview.validation.pct}%`, background: preview.validation.pct >= 90 ? '#238636' : preview.validation.pct >= 60 ? '#F59E0B' : '#EF4444' }} />
                  </div>
                  <div style={S.gaugeLabel}>
                    <span style={{ color: '#238636' }}>{preview.validation.valid} valid</span>
                    {preview.validation.errors > 0 && <span style={{ color: '#EF4444' }}>{preview.validation.errors} errors</span>}
                    <span style={{ color: '#8B949E' }}>{preview.total_rows} total rows</span>
                  </div>
                </div>

                {/* Preview table */}
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>#</th>
                        {Object.values(preview.mapping).map(col => (
                          <th key={col} style={S.th}>{col}</th>
                        ))}
                        <th style={S.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview_rows.map((row, i) => (
                        <tr key={i}>
                          <td style={S.td}>{row.row_num}</td>
                          {Object.values(preview.mapping).map(col => (
                            <td key={col} style={{ ...S.td, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.mapped[col] || '\u2014'}
                            </td>
                          ))}
                          <td style={S.td}>
                            {row.valid
                              ? <span style={S.validBadge}>{'\u2713'} Valid</span>
                              : <span style={S.errorBadge}>{row.errors.join(', ')}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={S.actionRow}>
                  <button onClick={resetPipeline} style={S.btnSecondary}>{'\u2190'} Back</button>
                  <button onClick={processUpload} disabled={loading || preview.validation.valid === 0}
                    style={{ ...S.btn, opacity: preview.validation.valid === 0 ? 0.4 : 1 }}>
                    {loading ? 'Importing...' : `Import ${preview.validation.valid} Rows \u2192`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && preview?.error && (
            <div style={S.card}>
              <div style={S.error}>{preview.error}</div>
              <button onClick={resetPipeline} style={{ ...S.btnSecondary, marginTop: 12 }}>{'\u2190'} Back</button>
            </div>
          )}

          {/* ── Step 2: Import Results ── */}
          {step === 2 && (
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              <div style={S.card}>
                {loading && (
                  <div style={S.importingState}>
                    <div style={S.spinner} />
                    <div style={{ fontSize: 18, color: '#E6EDF3', marginTop: 16 }}>Importing data...</div>
                    <div style={{ fontSize: 13, color: '#8B949E', marginTop: 4 }}>Processing {preview?.total_rows || 0} rows into {dataType}</div>
                  </div>
                )}

                {result && !result.error && (
                  <>
                    <div style={S.successHeader}>
                      <div style={{ fontSize: 48 }}>{result.status === 'completed' ? '\u2705' : result.status === 'partial' ? '\u26A0' : '\u274C'}</div>
                      <h3 style={{ fontSize: 22, color: statusColor[result.status] || '#E6EDF3', margin: '8px 0 4px' }}>
                        {result.status === 'completed' ? 'Import Complete' : result.status === 'partial' ? 'Partial Import' : 'Import Failed'}
                      </h3>
                      <div style={{ fontSize: 13, color: '#8B949E' }}>{result.message}</div>
                    </div>

                    <div style={S.resultGrid}>
                      <div style={S.resultItem}>
                        <div style={S.resultLabel}>Total Rows</div>
                        <div style={S.resultValue}>{result.total_rows}</div>
                      </div>
                      <div style={S.resultItem}>
                        <div style={S.resultLabel}>Imported</div>
                        <div style={{ ...S.resultValue, color: '#22C55E' }}>{result.imported}</div>
                      </div>
                      <div style={S.resultItem}>
                        <div style={S.resultLabel}>Errors</div>
                        <div style={{ ...S.resultValue, color: result.errors > 0 ? '#EF4444' : '#8B949E' }}>{result.errors}</div>
                      </div>
                      <div style={S.resultItem}>
                        <div style={S.resultLabel}>Upload ID</div>
                        <div style={S.resultValue}>#{result.upload_id}</div>
                      </div>
                    </div>

                    {result.validation_errors?.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={S.label}>Errors (first {result.validation_errors.length})</div>
                        <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                          {result.validation_errors.map((e, i) => (
                            <div key={i} style={S.errorRow}>Row {e.row}: {e.errors.join(', ')}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ ...S.actionRow, marginTop: 20 }}>
                      <button onClick={resetPipeline} style={S.btn}>Upload Another File</button>
                    </div>
                  </>
                )}

                {result?.error && (
                  <>
                    <div style={S.error}>{result.error}</div>
                    <button onClick={resetPipeline} style={{ ...S.btnSecondary, marginTop: 12 }}>{'\u2190'} Start Over</button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Upload History</h3>
          {history.length === 0 ? (
            <div style={{ color: '#8B949E', textAlign: 'center', padding: 40 }}>No uploads yet</div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>ID</th><th style={S.th}>File</th><th style={S.th}>Type</th>
                  <th style={S.th}>Rows</th><th style={S.th}>Imported</th><th style={S.th}>Errors</th>
                  <th style={S.th}>Status</th><th style={S.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map(u => (
                  <tr key={u.id}>
                    <td style={S.td}>{u.id}</td>
                    <td style={S.td}>{u.original_name || u.filename}</td>
                    <td style={S.td}><span style={S.typeBadge2}>{u.data_type}</span></td>
                    <td style={S.td}>{u.total_rows}</td>
                    <td style={S.td}>{u.imported_rows}</td>
                    <td style={S.td}>{u.error_rows}</td>
                    <td style={S.td}><span style={{ color: statusColor[u.status] || '#8B949E' }}>{u.status}</span></td>
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
  tab: { padding: '8px 20px', background: '#161B22', border: '1px solid #21262D', color: '#8B949E', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  tabActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  // Stepper
  stepper: { display: 'flex', alignItems: 'center', marginBottom: 28 },
  stepItem: { display: 'flex', alignItems: 'center', flex: 1 },
  stepCircle: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, border: '2px solid #30363D', background: '#161B22', color: '#8B949E', flexShrink: 0, transition: 'all 0.3s' },
  stepActive: { borderColor: '#0EA5E9', background: '#0EA5E9', color: '#fff' },
  stepDone: { borderColor: '#238636', background: '#238636', color: '#fff' },
  stepLabel: { fontSize: 12, fontWeight: 500, marginLeft: 8, whiteSpace: 'nowrap' },
  stepLine: { flex: 1, height: 2, marginLeft: 12, marginRight: 12, borderRadius: 1, transition: 'background 0.3s' },
  // Layout
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 16 },
  label: { display: 'block', fontSize: 11, color: '#8B949E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  // Type cards
  typeCards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  typeCard: { padding: 14, background: '#0D1117', border: '2px solid #21262D', borderRadius: 10, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', fontFamily: 'inherit' },
  typeCardActive: { borderColor: '#0EA5E9', background: '#0EA5E911' },
  typeIcon: { fontSize: 24, marginBottom: 4 },
  typeLabel: { fontSize: 14, fontWeight: 700, color: '#E6EDF3' },
  typeDesc: { fontSize: 10, color: '#484F58', marginTop: 2 },
  // Dropzone
  dropzone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', background: '#0D1117', border: '2px dashed #30363D', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s' },
  dropIcon: { fontSize: 32, marginBottom: 8 },
  dropText: { fontSize: 14, color: '#E6EDF3', fontWeight: 500 },
  dropHint: { fontSize: 11, color: '#484F58', marginTop: 4 },
  fileInfo: { display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#0D1117', borderRadius: 6, fontSize: 13, color: '#E6EDF3', marginTop: 12 },
  // Demo
  demoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  demoCard: { display: 'block', padding: 14, background: '#0D1117', border: '1px solid #23863644', borderRadius: 8, textDecoration: 'none', textAlign: 'center', transition: 'all 0.2s' },
  orderList: { display: 'flex', flexDirection: 'column', gap: 6 },
  orderItem: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#E6EDF3' },
  orderNum: { width: 22, height: 22, borderRadius: '50%', background: '#0EA5E922', color: '#0EA5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  // Mapping
  mappingStats: { display: 'flex', gap: 12, marginBottom: 16 },
  mapStat: { flex: 1, background: '#0D1117', borderRadius: 8, padding: 12, textAlign: 'center' },
  mapStatValue: { fontSize: 24, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif" },
  mapStatLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  mappingList: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  mapRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#0D1117', borderRadius: 6, fontSize: 12 },
  mapSrc: { color: '#8B949E', flex: 1 },
  mapArrow: { color: '#0EA5E9', fontSize: 14 },
  mapTgt: { color: '#22C55E', flex: 1, fontWeight: 600 },
  unmappedBox: { padding: 10, background: '#F59E0B11', border: '1px solid #F59E0B33', borderRadius: 6 },
  // Gauge
  gaugeWrap: { marginBottom: 16 },
  gaugeBar: { height: 8, background: '#21262D', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  gaugeFill: { height: '100%', borderRadius: 4, transition: 'width 0.8s ease' },
  gaugeLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 },
  // Preview table
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 10, color: '#8B949E', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 12, color: '#E6EDF3' },
  validBadge: { color: '#238636', fontSize: 11, fontWeight: 600 },
  errorBadge: { color: '#EF4444', fontSize: 11 },
  // Actions
  actionRow: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
  btn: { padding: '10px 24px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '10px 20px', background: '#21262D', border: 'none', borderRadius: 8, color: '#8B949E', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  // Results
  resultGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 },
  resultItem: { background: '#0D1117', borderRadius: 8, padding: 14, textAlign: 'center' },
  resultLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  resultValue: { fontSize: 22, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif", marginTop: 4 },
  successHeader: { textAlign: 'center', marginBottom: 8 },
  importingState: { textAlign: 'center', padding: '40px 0' },
  spinner: { width: 40, height: 40, border: '4px solid #21262D', borderTop: '4px solid #0EA5E9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' },
  error: { background: '#EF444422', border: '1px solid #EF4444', borderRadius: 8, padding: 16, color: '#EF4444' },
  errorRow: { fontSize: 12, color: '#EF4444', padding: '4px 0', borderBottom: '1px solid #21262D' },
  typeBadge2: { padding: '2px 8px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' },
};
