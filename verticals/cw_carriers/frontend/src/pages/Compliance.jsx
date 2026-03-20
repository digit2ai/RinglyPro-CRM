import React, { useState } from 'react';
import api from '../services/api';

const TABS = ['search', 'lookup', 'audit'];

export default function Compliance() {
  const [tab, setTab] = useState('search');
  // Search state
  const [searchState, setSearchState] = useState('TX');
  const [searchName, setSearchName] = useState('');
  const [minFleet, setMinFleet] = useState('5');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  // Lookup state
  const [dotNum, setDotNum] = useState('');
  const [mcNum, setMcNum] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  // Audit state
  const [auditResult, setAuditResult] = useState(null);
  const [auditing, setAuditing] = useState(false);

  // Layer 1: Search FMCSA
  const doSearch = async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchState) params.set('state', searchState);
      if (searchName) params.set('name', searchName);
      if (minFleet) params.set('min_fleet_size', minFleet);
      params.set('limit', '50');
      const { data } = await api.get(`/fmcsa/search?${params}`);
      setSearchResults(data.data);
    } catch (err) { setSearchResults({ error: err.response?.data?.error || err.message }); }
    setSearching(false);
  };

  // Layer 2: Lookup by DOT or MC
  const doLookup = async () => {
    setLookingUp(true);
    setLookupResult(null);
    try {
      const params = new URLSearchParams();
      if (dotNum) params.set('dot_number', dotNum);
      else if (mcNum) params.set('mc_number', mcNum);
      const { data } = await api.get(`/fmcsa/lookup?${params}`);
      setLookupResult(data.data);
    } catch (err) { setLookupResult({ found: false, error: err.response?.data?.error || err.message }); }
    setLookingUp(false);
  };

  // Save carrier from lookup
  const saveCarrier = async () => {
    setSaving(true);
    try {
      const body = {};
      if (lookupResult.dot_number) body.dot_number = lookupResult.dot_number;
      if (lookupResult.mc_number) body.mc_number = lookupResult.mc_number;
      await api.post('/fmcsa/lookup-and-save', body);
      setLookupResult(prev => ({ ...prev, saved: true }));
    } catch (err) { alert(err.response?.data?.error || 'Save failed'); }
    setSaving(false);
  };

  // Layer 3: Compliance audit
  const doAudit = async () => {
    setAuditing(true);
    try {
      const { data } = await api.get('/fmcsa/compliance-audit');
      setAuditResult(data.data);
    } catch (err) { setAuditResult({ error: err.response?.data?.error || err.message }); }
    setAuditing(false);
  };

  const statusColor = (s) => s === 'active' || s === 'PASS' ? '#22c55e' : s === 'WARNING' ? '#f59e0b' : s === 'FAIL' || s === 'NOT_FOUND' ? '#ef4444' : '#8B949E';

  return (
    <div>
      <h2 style={S.title}>FMCSA COMPLIANCE & CARRIER INTELLIGENCE</h2>
      <p style={S.subtitle}>Live carrier data from U.S. Department of Transportation — search, verify, and audit</p>

      <div style={S.tabs}>
        {[
          { id: 'search', label: 'Search Carriers', icon: '\u{1F50D}' },
          { id: 'lookup', label: 'DOT/MC Lookup', icon: '\u{1F4CB}' },
          { id: 'audit', label: 'Compliance Audit', icon: '\u{2705}' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.tab, ...(tab === t.id ? S.tabActive : {}) }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Layer 1: Search ── */}
      {tab === 'search' && (
        <div>
          <div style={S.card}>
            <h3 style={S.cardTitle}>Search FMCSA Carrier Database</h3>
            <p style={{ color: '#8B949E', fontSize: 13, marginBottom: 16 }}>
              Live query to data.transportation.gov — results cached 1 hour, zero database storage
            </p>
            <div style={S.formRow}>
              <div style={S.field}>
                <label style={S.label}>State</label>
                <input style={S.input} value={searchState} onChange={e => setSearchState(e.target.value.toUpperCase())} placeholder="TX" maxLength={2} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Company Name</label>
                <input style={S.input} value={searchName} onChange={e => setSearchName(e.target.value)} placeholder="Optional" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Min Fleet Size</label>
                <input style={S.input} type="number" value={minFleet} onChange={e => setMinFleet(e.target.value)} placeholder="5" />
              </div>
              <div style={{ ...S.field, justifyContent: 'flex-end' }}>
                <button style={S.btn} onClick={doSearch} disabled={searching}>
                  {searching ? 'Searching FMCSA...' : 'Search Carriers'}
                </button>
              </div>
            </div>
          </div>

          {searchResults && !searchResults.error && (
            <div style={S.card}>
              <div style={S.resultHeader}>
                <span style={S.resultCount}>{searchResults.total} carriers found</span>
                {searchResults.cached && <span style={S.cacheBadge}>Cached</span>}
                <span style={{ fontSize: 11, color: '#484F58' }}>Source: FMCSA Company Census File</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>DOT#</th><th style={S.th}>MC#</th><th style={S.th}>Company</th>
                    <th style={S.th}>City, State</th><th style={S.th}>Trucks</th><th style={S.th}>Drivers</th>
                    <th style={S.th}>Status</th><th style={S.th}>HazMat</th>
                  </tr></thead>
                  <tbody>
                    {searchResults.carriers.map((c, i) => (
                      <tr key={i} style={S.tr}>
                        <td style={S.td}><span style={S.dotLink}>{c.dot_number}</span></td>
                        <td style={S.td}>{c.mc_number || '\u2014'}</td>
                        <td style={S.td}><strong>{c.legal_name}</strong></td>
                        <td style={S.td}>{c.city}, {c.state}</td>
                        <td style={S.td}>{c.power_units}</td>
                        <td style={S.td}>{c.total_drivers}</td>
                        <td style={S.td}><span style={{ color: statusColor(c.status), fontWeight: 600 }}>{c.status.toUpperCase()}</span></td>
                        <td style={S.td}>{c.hazmat ? '\u2622 Yes' : '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {searchResults?.error && <div style={S.error}>{searchResults.error}</div>}
        </div>
      )}

      {/* ── Layer 2: Lookup ── */}
      {tab === 'lookup' && (
        <div>
          <div style={S.card}>
            <h3 style={S.cardTitle}>Carrier Lookup by DOT or MC Number</h3>
            <p style={{ color: '#8B949E', fontSize: 13, marginBottom: 16 }}>
              Verify carrier authority and auto-fill details — save to your carrier database with one click
            </p>
            <div style={S.formRow}>
              <div style={S.field}>
                <label style={S.label}>DOT Number</label>
                <input style={S.input} value={dotNum} onChange={e => { setDotNum(e.target.value); setMcNum(''); }} placeholder="e.g. 525285" />
              </div>
              <div style={{ color: '#484F58', alignSelf: 'flex-end', padding: '10px 0', fontSize: 13 }}>OR</div>
              <div style={S.field}>
                <label style={S.label}>MC Number</label>
                <input style={S.input} value={mcNum} onChange={e => { setMcNum(e.target.value); setDotNum(''); }} placeholder="e.g. 177078" />
              </div>
              <div style={{ ...S.field, justifyContent: 'flex-end' }}>
                <button style={S.btn} onClick={doLookup} disabled={lookingUp || (!dotNum && !mcNum)}>
                  {lookingUp ? 'Looking up...' : 'Verify Carrier'}
                </button>
              </div>
            </div>
          </div>

          {lookupResult && lookupResult.found && (
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 20, color: '#E6EDF3', margin: 0 }}>{lookupResult.legal_name}</h3>
                  {lookupResult.dba_name && <div style={{ fontSize: 13, color: '#8B949E' }}>DBA: {lookupResult.dba_name}</div>}
                </div>
                <span style={{ ...S.statusBadge, background: statusColor(lookupResult.status) + '22', color: statusColor(lookupResult.status) }}>
                  {lookupResult.status?.toUpperCase()}
                </span>
              </div>
              <div style={S.detailGrid}>
                <div style={S.detailCard}><div style={S.detailLabel}>DOT Number</div><div style={S.detailValue}>{lookupResult.dot_number}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>MC Number</div><div style={S.detailValue}>{lookupResult.mc_number || '\u2014'}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>Phone</div><div style={S.detailValue}>{lookupResult.phone || '\u2014'}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>Location</div><div style={S.detailValue}>{lookupResult.city}, {lookupResult.state} {lookupResult.zip}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>Power Units</div><div style={S.detailValue}>{lookupResult.power_units}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>Total Drivers</div><div style={S.detailValue}>{lookupResult.total_drivers}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>Fleet Size</div><div style={S.detailValue}>{lookupResult.fleet_size || lookupResult.power_units}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>HazMat</div><div style={S.detailValue}>{lookupResult.hazmat ? '\u2622 Yes' : 'No'}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>Business Type</div><div style={S.detailValue}>{lookupResult.business_type || lookupResult.carrier_operation || '\u2014'}</div></div>
                <div style={S.detailCard}><div style={S.detailLabel}>MCS-150 Mileage</div><div style={S.detailValue}>{lookupResult.mcs150_mileage?.toLocaleString() || lookupResult.recent_mileage?.toLocaleString() || '\u2014'}</div></div>
              </div>
              {lookupResult.cached && <div style={{ fontSize: 11, color: '#484F58', marginTop: 8 }}>Cached result (24hr TTL)</div>}
              <div style={{ marginTop: 16 }}>
                <button onClick={saveCarrier} disabled={saving || lookupResult.saved}
                  style={{ ...S.btn, background: lookupResult.saved ? '#238636' : '#8b5cf6', width: '100%' }}>
                  {saving ? 'Saving...' : lookupResult.saved ? '\u2713 Saved to Carrier Database' : '\u{1F4BE} Save to Carrier Database'}
                </button>
              </div>
            </div>
          )}
          {lookupResult && !lookupResult.found && (
            <div style={S.error}>{lookupResult.error || 'Carrier not found in FMCSA database'}</div>
          )}
        </div>
      )}

      {/* ── Layer 3: Compliance Audit ── */}
      {tab === 'audit' && (
        <div>
          <div style={S.card}>
            <h3 style={S.cardTitle}>Compliance Audit</h3>
            <p style={{ color: '#8B949E', fontSize: 13, marginBottom: 16 }}>
              Verify all carriers in your database against FMCSA — checks operating authority, fleet registration, and hazmat status
            </p>
            <button style={S.btn} onClick={doAudit} disabled={auditing}>
              {auditing ? 'Running Audit...' : '\u{1F50D} Run Compliance Audit'}
            </button>
          </div>

          {auditResult && !auditResult.error && (
            <>
              <div style={S.summaryRow}>
                <div style={{ ...S.summaryCard, borderColor: '#22c55e' }}><div style={{ ...S.summaryNum, color: '#22c55e' }}>{auditResult.summary.pass}</div><div style={S.summaryLabel}>PASS</div></div>
                <div style={{ ...S.summaryCard, borderColor: '#f59e0b' }}><div style={{ ...S.summaryNum, color: '#f59e0b' }}>{auditResult.summary.warning}</div><div style={S.summaryLabel}>WARNING</div></div>
                <div style={{ ...S.summaryCard, borderColor: '#ef4444' }}><div style={{ ...S.summaryNum, color: '#ef4444' }}>{auditResult.summary.fail}</div><div style={S.summaryLabel}>FAIL</div></div>
                <div style={{ ...S.summaryCard, borderColor: '#8B949E' }}><div style={{ ...S.summaryNum, color: '#8B949E' }}>{auditResult.summary.not_found}</div><div style={S.summaryLabel}>NOT FOUND</div></div>
                <div style={{ ...S.summaryCard, borderColor: '#484F58' }}><div style={{ ...S.summaryNum, color: '#484F58' }}>{auditResult.summary.error}</div><div style={S.summaryLabel}>ERROR</div></div>
              </div>

              <div style={S.card}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Status</th><th style={S.th}>DOT#</th><th style={S.th}>Carrier</th>
                    <th style={S.th}>FMCSA Status</th><th style={S.th}>Trucks</th><th style={S.th}>Drivers</th>
                    <th style={S.th}>Location</th><th style={S.th}>Issues</th>
                  </tr></thead>
                  <tbody>
                    {auditResult.results.map((r, i) => (
                      <tr key={i} style={S.tr}>
                        <td style={S.td}>
                          <span style={{ ...S.statusBadge, background: statusColor(r.status) + '22', color: statusColor(r.status) }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={S.td}>{r.dot_number || '\u2014'}</td>
                        <td style={S.td}><strong>{r.carrier_name}</strong></td>
                        <td style={S.td}><span style={{ color: statusColor(r.fmcsa_status), fontWeight: 600 }}>{r.fmcsa_status?.toUpperCase() || r.status}</span></td>
                        <td style={S.td}>{r.power_units ?? '\u2014'}</td>
                        <td style={S.td}>{r.total_drivers ?? '\u2014'}</td>
                        <td style={S.td}>{r.city && r.state ? `${r.city}, ${r.state}` : '\u2014'}</td>
                        <td style={S.td}>
                          {r.issues?.length > 0
                            ? r.issues.map((iss, j) => <div key={j} style={{ fontSize: 11, color: iss.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>{iss.message}</div>)
                            : r.message || (r.status === 'PASS' ? '\u2713 Clear' : '\u2014')
                          }
                        </td>
                      </tr>
                    ))}
                    {auditResult.results.length === 0 && (
                      <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: '#8B949E' }}>No carriers with DOT/MC numbers to audit</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {auditResult?.error && <div style={S.error}>{auditResult.error}</div>}
        </div>
      )}
    </div>
  );
}

const S = {
  title: { fontSize: 28, color: '#E6EDF3', marginBottom: 4 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 24 },
  tabs: { display: 'flex', gap: 8, marginBottom: 24 },
  tab: { padding: '10px 20px', background: '#161B22', border: '1px solid #21262D', borderRadius: 8, color: '#8B949E', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tabActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, marginBottom: 20 },
  cardTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 8 },
  formRow: { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 150px' },
  label: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  input: { padding: '10px 14px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  btn: { padding: '10px 24px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  resultCount: { fontSize: 14, fontWeight: 700, color: '#E6EDF3' },
  cacheBadge: { padding: '2px 8px', background: '#23863622', color: '#238636', borderRadius: 4, fontSize: 10, fontWeight: 700 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #21262D', fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  tr: { borderBottom: '1px solid #21262D' },
  td: { padding: '8px 12px', fontSize: 12, color: '#E6EDF3' },
  dotLink: { color: '#0EA5E9', fontWeight: 600 },
  statusBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  error: { background: '#EF444422', border: '1px solid #EF4444', borderRadius: 8, padding: 16, color: '#EF4444', marginTop: 12 },
  // Lookup detail
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 },
  detailCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, padding: 12 },
  detailLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: 600, color: '#E6EDF3' },
  // Audit summary
  summaryRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  summaryCard: { flex: '1 1 100px', background: '#161B22', border: '2px solid', borderRadius: 10, padding: 16, textAlign: 'center' },
  summaryNum: { fontSize: 28, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif" },
  summaryLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
};
