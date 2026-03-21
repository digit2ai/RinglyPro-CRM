import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { authHeader } from '../services/auth';

const API = '/imprint_iq/api/ingestion';

const GOLD = '#C8962A';
const BG = '#0D1117';
const CARD = '#161B22';
const BORDER = '#21262D';
const TEXT = '#E6EDF3';
const MUTED = '#8B949E';
const GREEN = '#238636';
const YELLOW = '#D29922';
const RED = '#DA3633';

const DATA_TYPES = [
  { key: 'customers', label: 'Customers', icon: '\uD83D\uDC65', desc: 'B2B client accounts' },
  { key: 'quotes', label: 'Quotes', icon: '\uD83D\uDCCB', desc: 'Proposals & estimates' },
  { key: 'orders', label: 'Orders', icon: '\uD83D\uDCE6', desc: 'Purchase orders' },
  { key: 'calls', label: 'Calls', icon: '\uD83D\uDCDE', desc: 'Voice AI call logs' },
  { key: 'invoices', label: 'Invoices', icon: '\uD83E\uDDFE', desc: 'Billing records' },
  { key: 'products', label: 'Products', icon: '\uD83C\uDFF7\uFE0F', desc: 'Catalog items' },
];

const SYSTEMS = [
  { name: 'Antera / Advance', status: 'coming_soon', color: '#4A90D9' },
  { name: 'commonsku', status: 'coming_soon', color: '#3ECF8E' },
  { name: 'Facilisgroup', status: 'coming_soon', color: '#6C5CE7' },
  { name: 'QuickBooks Online', status: 'coming_soon', color: '#2CA01C' },
  { name: 'SAGE', status: 'coming_soon', color: '#E74C3C' },
  { name: 'HubSpot', status: 'coming_soon', color: '#FF7A59' },
  { name: 'Salesforce', status: 'coming_soon', color: '#00A1E0' },
  { name: 'Other / CSV Upload', status: 'active', color: GOLD },
];

const EXPECTED_COLUMNS = {
  customers: ['company_name', 'contact_name', 'contact_email', 'contact_phone', 'industry', 'lifetime_value', 'last_order_date', 'address', 'city', 'state', 'zip', 'status', 'notes'],
  quotes: ['quote_number', 'title', 'total_amount', 'margin_pct', 'stage', 'source', 'created_at'],
  orders: ['order_number', 'title', 'total_amount', 'cost_total', 'margin_pct', 'stage', 'payment_status', 'created_at'],
  calls: ['direction', 'phone_from', 'phone_to', 'duration_sec', 'outcome', 'agent_name', 'created_at'],
  invoices: ['invoice_number', 'amount', 'tax_amount', 'total_amount', 'paid_amount', 'status', 'due_date', 'created_at'],
  products: ['sku', 'name', 'category', 'base_price', 'cost', 'brand', 'min_qty', 'status'],
};

export default function Ingestion() {
  const [activeType, setActiveType] = useState('customers');
  const [uploadMode, setUploadMode] = useState(null); // null, 'file', 'paste'
  const [csvText, setCsvText] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [systemSelected, setSystemSelected] = useState(null);
  const fileRef = useRef(null);

  // Load status on mount
  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    try {
      const { data } = await axios.get(`${API}/status`, { headers: authHeader() });
      if (data.success) setStatus(data.counts);
    } catch { /* ignore */ }
  };

  // Reset state when type changes
  useEffect(() => {
    setCsvText('');
    setPasteText('');
    setFileName('');
    setPreview(null);
    setResult(null);
    setUploadMode(null);
  }, [activeType]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setUploadMode('file');
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setCsvText(text);
      previewData(text);
    };
    reader.readAsText(file);
  }, [activeType]);

  const previewData = async (text) => {
    try {
      const { data } = await axios.post(`${API}/preview`, {
        type: activeType,
        csv_text: text
      }, { headers: authHeader() });
      if (data.success) setPreview(data);
    } catch (err) {
      setPreview({ error: err.response?.data?.error || 'Preview failed' });
    }
  };

  const handlePastePreview = async () => {
    if (!pasteText.trim()) return;
    setUploadMode('paste');
    setResult(null);
    try {
      const { data } = await axios.post(`${API}/preview`, {
        type: activeType,
        data: pasteText
      }, { headers: authHeader() });
      if (data.success) setPreview(data);
      else setPreview({ error: data.error });
    } catch (err) {
      setPreview({ error: err.response?.data?.error || 'Preview failed' });
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const endpoint = uploadMode === 'paste' ? `${API}/paste` : `${API}/upload`;
      const body = uploadMode === 'paste'
        ? { type: activeType, data: pasteText }
        : { type: activeType, csv_text: csvText, filename: fileName };

      // Apply manual mapping overrides if any
      if (preview?.mapping && manualOverrides && Object.keys(manualOverrides).length > 0) {
        // Re-send with overridden mapping
        body.mapping_override = manualOverrides;
      }

      const { data } = await axios.post(endpoint, body, { headers: authHeader() });
      setResult(data);
      loadStatus();
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = async () => {
    try {
      await axios.delete(`${API}/reset`, { headers: authHeader() });
      loadStatus();
      setShowReset(false);
      setResult(null);
      setPreview(null);
    } catch { /* ignore */ }
  };

  const downloadTemplate = () => {
    window.open(`${API}/templates/${activeType}`, '_blank');
  };

  // Manual mapping overrides
  const [manualOverrides, setManualOverrides] = useState({});

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const totalRecords = status ? Object.values(status).reduce((s, v) => s + v.count, 0) : 0;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: TEXT, letterSpacing: 2, margin: 0 }}>
          DATA <span style={{ color: GOLD }}>INGESTION</span>
        </h1>
        <p style={{ color: MUTED, fontSize: 14, marginTop: 4 }}>
          Connect your data. See your truth in 15 minutes.
        </p>
      </div>

      {/* System Selector Grid */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontFamily: 'Bebas Neue', color: TEXT, fontSize: 16, letterSpacing: 1, marginBottom: 12 }}>
          SELECT YOUR SYSTEM
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {SYSTEMS.map((sys, i) => {
            const isActive = sys.status === 'active';
            const isSelected = systemSelected === i;
            return (
              <div
                key={i}
                onClick={() => {
                  setSystemSelected(i);
                  if (!isActive) {
                    setTimeout(() => setSystemSelected(null), 2000);
                  }
                }}
                style={{
                  background: isSelected && isActive ? `${GOLD}15` : CARD,
                  border: `1px solid ${isSelected && isActive ? GOLD : BORDER}`,
                  borderRadius: 10,
                  padding: '16px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: `${sys.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 8, fontSize: 18, fontWeight: 700, color: sys.color
                }}>
                  {sys.name.charAt(0)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
                  {sys.name}
                </div>
                {isActive ? (
                  <div style={{ fontSize: 10, color: GREEN, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Ready
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 500 }}>
                    {isSelected ? 'Coming Soon' : 'API Integration'}
                  </div>
                )}
                {isSelected && !isActive && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(13,17,23,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10
                  }}>
                    <span style={{ color: YELLOW, fontWeight: 600, fontSize: 12 }}>
                      API Connector Coming Soon
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Main Content */}
        <div style={{ flex: 1 }}>
          {/* Data Type Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {DATA_TYPES.map(dt => (
              <button
                key={dt.key}
                onClick={() => setActiveType(dt.key)}
                style={{
                  background: activeType === dt.key ? `${GOLD}22` : CARD,
                  border: `1px solid ${activeType === dt.key ? GOLD : BORDER}`,
                  color: activeType === dt.key ? GOLD : MUTED,
                  borderRadius: 8,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: activeType === dt.key ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.2s'
                }}
              >
                <span>{dt.icon}</span> {dt.label}
              </button>
            ))}
          </div>

          {/* Expected Columns */}
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: 16, marginBottom: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Expected Columns for {activeType}
              </span>
              <button
                onClick={downloadTemplate}
                style={{
                  background: `${GOLD}15`, border: `1px solid ${GOLD}40`, color: GOLD,
                  borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', letterSpacing: 0.5
                }}
              >
                Download Template
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EXPECTED_COLUMNS[activeType]?.map(col => (
                <span key={col} style={{
                  background: '#21262D', padding: '4px 10px', borderRadius: 4,
                  fontSize: 11, color: '#7EE787', fontFamily: 'monospace'
                }}>
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              background: dragOver ? `${GOLD}10` : CARD,
              border: `2px dashed ${dragOver ? GOLD : BORDER}`,
              borderRadius: 12,
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 16,
              transition: 'all 0.2s'
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div style={{ fontSize: 40, marginBottom: 8 }}>{'\uD83D\uDCC1'}</div>
            {fileName ? (
              <div>
                <div style={{ color: GREEN, fontSize: 14, fontWeight: 600 }}>{fileName}</div>
                <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                  {preview?.total_rows || 0} rows detected
                </div>
              </div>
            ) : (
              <div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 500 }}>
                  Drag & drop a CSV file here, or click to browse
                </div>
                <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                  Accepts .csv, .tsv, .txt
                </div>
              </div>
            )}
          </div>

          {/* OR Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
            <span style={{ color: MUTED, fontSize: 12, fontWeight: 600 }}>OR PASTE FROM SPREADSHEET</span>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>

          {/* Paste Area */}
          <div style={{ marginBottom: 16 }}>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Paste tab-separated data here...\n\nExample:\ncompany_name\\tcontact_email\\tphone\nAcme Corp\\tjohn@acme.com\\t555-0100`}
              style={{
                width: '100%', minHeight: 140, background: '#0D1117',
                border: `1px solid ${BORDER}`, borderRadius: 8,
                color: TEXT, padding: 14, fontSize: 13,
                fontFamily: 'monospace', resize: 'vertical',
                outline: 'none'
              }}
            />
            <button
              onClick={handlePastePreview}
              disabled={!pasteText.trim()}
              style={{
                marginTop: 8, background: pasteText.trim() ? `${GOLD}20` : '#21262D',
                border: `1px solid ${pasteText.trim() ? GOLD : BORDER}`,
                color: pasteText.trim() ? GOLD : MUTED,
                borderRadius: 6, padding: '8px 20px', fontSize: 12, fontWeight: 600,
                cursor: pasteText.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              Preview Pasted Data
            </button>
          </div>

          {/* Column Mapping Preview */}
          {preview && !preview.error && (
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: 20, marginBottom: 20
            }}>
              <h3 style={{ fontFamily: 'Bebas Neue', color: TEXT, fontSize: 16, letterSpacing: 1, marginBottom: 14 }}>
                COLUMN MAPPING
              </h3>

              {/* Mapping Table */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 40px 1fr 80px',
                gap: '8px 12px', alignItems: 'center', marginBottom: 16
              }}>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, textTransform: 'uppercase' }}>Your Column</div>
                <div />
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, textTransform: 'uppercase' }}>ImprintIQ Field</div>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, textTransform: 'uppercase' }}>Confidence</div>

                {Object.entries(preview.mapping).map(([csvCol, m]) => (
                  <React.Fragment key={csvCol}>
                    <div style={{
                      background: '#21262D', padding: '6px 10px', borderRadius: 4,
                      fontSize: 12, color: TEXT, fontFamily: 'monospace'
                    }}>
                      {csvCol}
                    </div>
                    <div style={{ textAlign: 'center', color: MUTED, fontSize: 16 }}>{'\u2192'}</div>
                    <select
                      value={manualOverrides[csvCol] || m.field}
                      onChange={(e) => setManualOverrides(prev => ({ ...prev, [csvCol]: e.target.value }))}
                      style={{
                        background: '#21262D', border: `1px solid ${BORDER}`,
                        color: '#7EE787', padding: '6px 8px', borderRadius: 4,
                        fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      {EXPECTED_COLUMNS[activeType]?.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                      <option value="_skip">-- Skip Column --</option>
                    </select>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: m.confidence === 'high' ? GREEN : m.confidence === 'medium' ? YELLOW : RED
                      }} />
                      <span style={{
                        fontSize: 11,
                        color: m.confidence === 'high' ? GREEN : m.confidence === 'medium' ? YELLOW : RED,
                        fontWeight: 500
                      }}>
                        {m.score}%
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Unmapped */}
              {preview.unmapped_columns?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <span style={{ fontSize: 11, color: YELLOW }}>
                    Unmapped columns: {preview.unmapped_columns.join(', ')}
                  </span>
                </div>
              )}

              {/* Data Preview Table */}
              {preview.preview_rows?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
                    Data Preview (first {preview.preview_rows.length} rows)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          {Object.keys(preview.preview_rows[0]).map(k => (
                            <th key={k} style={{
                              padding: '6px 10px', textAlign: 'left',
                              background: '#21262D', color: GOLD,
                              fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${BORDER}`,
                              whiteSpace: 'nowrap'
                            }}>
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview_rows.map((row, ri) => (
                          <tr key={ri}>
                            {Object.values(row).map((v, ci) => (
                              <td key={ci} style={{
                                padding: '5px 10px', color: TEXT,
                                borderBottom: `1px solid ${BORDER}`,
                                whiteSpace: 'nowrap', maxWidth: 200,
                                overflow: 'hidden', textOverflow: 'ellipsis'
                              }}>
                                {v || <span style={{ color: '#484F58' }}>null</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import Button */}
              <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  style={{
                    background: importing ? '#21262D' : GOLD,
                    color: importing ? MUTED : '#000',
                    border: 'none', borderRadius: 8,
                    padding: '12px 32px', fontSize: 14,
                    fontWeight: 700, cursor: importing ? 'wait' : 'pointer',
                    fontFamily: 'Bebas Neue', letterSpacing: 1.5,
                    transition: 'all 0.2s'
                  }}
                >
                  {importing ? 'IMPORTING...' : `IMPORT ${preview.total_rows} ROWS`}
                </button>
                {importing && (
                  <div style={{ color: GOLD, fontSize: 12 }}>
                    Processing...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview Error */}
          {preview?.error && (
            <div style={{
              background: `${RED}15`, border: `1px solid ${RED}40`, borderRadius: 8,
              padding: 14, marginBottom: 16, color: RED, fontSize: 13
            }}>
              {preview.error}
            </div>
          )}

          {/* Import Results */}
          {result && (
            <div style={{
              background: CARD, border: `1px solid ${result.success ? GREEN : RED}40`,
              borderRadius: 10, padding: 20, marginBottom: 20
            }}>
              <h3 style={{
                fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, marginBottom: 12,
                color: result.success ? GREEN : RED
              }}>
                {result.success ? 'IMPORT COMPLETE' : 'IMPORT FAILED'}
              </h3>

              {result.success ? (
                <div>
                  <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: GREEN, fontFamily: 'Bebas Neue' }}>
                        {result.rows_imported}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED }}>Rows Imported</div>
                    </div>
                    {result.rows_skipped > 0 && (
                      <div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: YELLOW, fontFamily: 'Bebas Neue' }}>
                          {result.rows_skipped}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED }}>Skipped</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: TEXT, fontFamily: 'Bebas Neue' }}>
                        {result.total_rows}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED }}>Total Rows</div>
                    </div>
                  </div>

                  {result.errors?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: YELLOW, fontWeight: 600, marginBottom: 4 }}>ERRORS:</div>
                      {result.errors.map((e, i) => (
                        <div key={i} style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>
                          Row {e.row}: {e.message}
                        </div>
                      ))}
                    </div>
                  )}

                  <a
                    href="/imprint_iq/neural"
                    style={{
                      display: 'inline-block', marginTop: 8,
                      color: GOLD, fontSize: 13, fontWeight: 600,
                      textDecoration: 'none'
                    }}
                  >
                    View in Neural Dashboard {'\u2192'}
                  </a>
                </div>
              ) : (
                <div style={{ color: RED, fontSize: 13 }}>{result.error}</div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar — Data Status */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: 16, position: 'sticky', top: 20
          }}>
            <h3 style={{
              fontFamily: 'Bebas Neue', color: TEXT, fontSize: 15, letterSpacing: 1,
              marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              DATA STATUS
              <span style={{
                fontSize: 11, color: GOLD, fontWeight: 400, fontFamily: 'DM Sans'
              }}>
                {totalRecords.toLocaleString()} total
              </span>
            </h3>

            {status ? Object.entries(status).map(([key, val]) => (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: `1px solid ${BORDER}`
              }}>
                <span style={{ fontSize: 12, color: val.count > 0 ? TEXT : MUTED }}>
                  {val.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
                    color: val.count > 0 ? GREEN : MUTED
                  }}>
                    {val.count.toLocaleString()}
                  </span>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: val.count > 0 ? GREEN : '#30363D'
                  }} />
                </div>
              </div>
            )) : (
              <div style={{ color: MUTED, fontSize: 12, textAlign: 'center', padding: 20 }}>
                Loading...
              </div>
            )}

            {/* Reset Button */}
            <div style={{ marginTop: 16 }}>
              {!showReset ? (
                <button
                  onClick={() => setShowReset(true)}
                  style={{
                    width: '100%', padding: '8px', background: '#21262D',
                    color: MUTED, border: `1px solid ${BORDER}`,
                    borderRadius: 6, fontSize: 11, cursor: 'pointer'
                  }}
                >
                  Reset All Data
                </button>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: RED, fontSize: 11, marginBottom: 8, fontWeight: 600 }}>
                    This will delete ALL imported data. Are you sure?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleReset}
                      style={{
                        flex: 1, padding: '8px', background: RED, color: '#fff',
                        border: 'none', borderRadius: 6, fontSize: 11,
                        fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      Yes, Delete All
                    </button>
                    <button
                      onClick={() => setShowReset(false)}
                      style={{
                        flex: 1, padding: '8px', background: '#21262D', color: MUTED,
                        border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
