import React, { useState } from 'react';
import api from '../services/api';

const EQUIPMENT = ['dry_van','reefer','flatbed','step_deck','ltl','power_only'];

export default function RateIntelligence() {
  const [form, setForm] = useState({ origin: '', destination: '', equipment_type: 'dry_van', pickup_date: '', miles: '', hazmat: false });
  const [result, setResult] = useState(null);
  const [laneForm, setLaneForm] = useState({ origin_state: '', destination_state: '', equipment_type: 'all', days: '90' });
  const [laneResult, setLaneResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('quote');
  const [datStatus, setDatStatus] = useState(null);

  useState(() => {
    api.get('/pricing/dat/status').then(r => setDatStatus(r.data.dat)).catch(() => {});
  }, []);

  const getQuote = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/pricing/quote', form);
      setResult(data.data);
    } catch (err) { setResult({ error: err.response?.data?.error || err.message }); }
    setLoading(false);
  };

  const getLaneAnalysis = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/pricing/lane-analysis', { params: laneForm });
      setLaneResult(data.data);
    } catch (err) { setLaneResult({ error: err.response?.data?.error || err.message }); }
    setLoading(false);
  };

  const confColor = { high: '#22C55E', very_high: '#22C55E', medium: '#F59E0B', low: '#EF4444' };

  return (
    <div>
      <h2 style={S.title}>RATE INTELLIGENCE</h2>
      <p style={S.subtitle}>AI-powered pricing with historical data, market benchmarks, and margin optimization</p>

      {/* Data source badges */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ ...S.srcBadge, borderColor: '#23863644' }}><span style={{ ...S.srcDot, background: '#238636' }} /> Internal Data</span>
        <span style={{ ...S.srcBadge, borderColor: '#0EA5E944' }}><span style={{ ...S.srcDot, background: '#0EA5E9' }} /> Rate Benchmarks</span>
        <span style={{
          ...S.srcBadge,
          borderColor: datStatus?.configured ? '#23863644' : '#484F5844',
          opacity: datStatus?.configured ? 1 : 0.5,
        }}>
          <span style={{ ...S.srcDot, background: datStatus?.configured ? '#238636' : '#484F58' }} />
          DAT RateView {datStatus?.configured ? '' : '(not connected)'}
        </span>
        <span style={{ ...S.srcBadge, borderColor: '#C8962A44' }}><span style={{ ...S.srcDot, background: '#C8962A' }} /> Market Estimate</span>
      </div>

      <div style={S.tabs}>
        {['quote','lane'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{...S.tab, ...(tab === t ? S.tabActive : {})}}>{t === 'quote' ? 'Get Rate Quote' : 'Lane Analysis'}</button>
        ))}
      </div>

      {tab === 'quote' && (
        <div style={S.grid}>
          <div style={S.card}>
            <h3 style={S.cardTitle}>Rate Quote Request</h3>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Origin</label>
                <input style={S.input} placeholder="Dallas, TX" value={form.origin} onChange={e => setForm({...form, origin: e.target.value})} />
              </div>
              <div>
                <label style={S.label}>Destination</label>
                <input style={S.input} placeholder="Chicago, IL" value={form.destination} onChange={e => setForm({...form, destination: e.target.value})} />
              </div>
              <div>
                <label style={S.label}>Equipment</label>
                <select style={S.input} value={form.equipment_type} onChange={e => setForm({...form, equipment_type: e.target.value})}>
                  {EQUIPMENT.map(e => <option key={e} value={e}>{e.replace(/_/g,' ').toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Pickup Date</label>
                <input type="date" style={S.input} value={form.pickup_date} onChange={e => setForm({...form, pickup_date: e.target.value})} />
              </div>
              <div>
                <label style={S.label}>Miles (optional)</label>
                <input type="number" style={S.input} placeholder="Auto-estimate" value={form.miles} onChange={e => setForm({...form, miles: e.target.value})} />
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:20}}>
                <input type="checkbox" checked={form.hazmat} onChange={e => setForm({...form, hazmat: e.target.checked})} />
                <label style={S.label}>Hazmat</label>
              </div>
            </div>
            <button onClick={getQuote} disabled={loading || !form.origin || !form.destination} style={S.btn}>{loading ? 'Calculating...' : 'Get Rate Recommendation'}</button>
          </div>

          {result && !result.error && (
            <div style={S.card}>
              <h3 style={S.cardTitle}>Rate Recommendation</h3>
              <div style={{...S.confBadge, background: (confColor[result.confidence_band.confidence] || '#666') + '22', color: confColor[result.confidence_band.confidence] || '#666'}}>
                {result.confidence_band.confidence?.toUpperCase()} CONFIDENCE
              </div>
              <div style={S.rateGrid}>
                <div style={S.rateBox}>
                  <div style={S.rateLabel}>Suggested Buy</div>
                  <div style={S.rateValue}>${result.recommendation.suggested_buy_rate?.toLocaleString()}</div>
                  <div style={S.rateRange}>${result.confidence_band.buy_rate_low?.toLocaleString()} - ${result.confidence_band.buy_rate_high?.toLocaleString()}</div>
                </div>
                <div style={{...S.rateBox, borderColor: '#22C55E'}}>
                  <div style={S.rateLabel}>Suggested Sell</div>
                  <div style={{...S.rateValue, color: '#22C55E'}}>${result.recommendation.suggested_sell_rate?.toLocaleString()}</div>
                  <div style={S.rateRange}>${result.confidence_band.sell_rate_low?.toLocaleString()} - ${result.confidence_band.sell_rate_high?.toLocaleString()}</div>
                </div>
                <div style={S.rateBox}>
                  <div style={S.rateLabel}>Margin</div>
                  <div style={S.rateValue}>${result.recommendation.estimated_margin?.toLocaleString()}</div>
                  <div style={S.rateRange}>{result.recommendation.margin_pct}%</div>
                </div>
                <div style={S.rateBox}>
                  <div style={S.rateLabel}>Rate/Mile</div>
                  <div style={S.rateValue}>${result.recommendation.rate_per_mile}</div>
                  <div style={S.rateRange}>{result.lane.estimated_miles} mi</div>
                </div>
              </div>
              <div style={S.section}>
                <div style={S.sectionTitle}>Pricing Method: <span style={{color:'#0EA5E9'}}>{result.pricing_method?.replace(/_/g,' ').toUpperCase()}</span></div>
                {result.rationale?.map((r, i) => <div key={i} style={S.rationale}>{r}</div>)}
              </div>
              {result.adjustments?.length > 0 && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Adjustments</div>
                  {result.adjustments.map((a, i) => <div key={i} style={S.adjustment}>+{a.pct}% — {a.reason}</div>)}
                </div>
              )}
              <div style={S.section}>
                <div style={S.sectionTitle}>Data Sources</div>
                <div style={S.dataQuality}>
                  {result.data_quality.dat_available && <span style={{ color: '#238636', fontWeight: 600 }}>DAT: {result.dat?.sample_size} reports</span>}
                  {!result.data_quality.dat_available && <span style={{ color: '#484F58' }}>DAT: {result.data_quality.dat_configured ? 'No data for lane' : 'Not connected'}</span>}
                  <span>Internal: {result.data_quality.internal_lane_samples} loads</span>
                  <span>Corridor: {result.data_quality.state_corridor_samples}</span>
                  <span>Benchmark: {result.data_quality.benchmark_available ? 'Yes' : 'No'}</span>
                </div>
              </div>
              {result.dat && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>DAT Market Rate</div>
                  <div style={S.rateGrid}>
                    <div style={S.rateBox}><div style={S.rateLabel}>DAT Avg</div><div style={{ ...S.rateValue, color: '#238636' }}>${result.dat.avg_rate?.toLocaleString()}</div></div>
                    <div style={S.rateBox}><div style={S.rateLabel}>DAT Low</div><div style={S.rateValue}>${result.dat.min_rate?.toLocaleString()}</div></div>
                    <div style={S.rateBox}><div style={S.rateLabel}>DAT High</div><div style={S.rateValue}>${result.dat.max_rate?.toLocaleString()}</div></div>
                    <div style={S.rateBox}><div style={S.rateLabel}>DAT RPM</div><div style={S.rateValue}>${result.dat.rate_per_mile?.toFixed(2)}</div></div>
                  </div>
                </div>
              )}
            </div>
          )}
          {result?.error && <div style={S.error}>{result.error}</div>}
        </div>
      )}

      {tab === 'lane' && (
        <div style={S.grid}>
          <div style={S.card}>
            <h3 style={S.cardTitle}>Lane Analysis</h3>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Origin State</label>
                <input style={S.input} placeholder="TX" maxLength={2} value={laneForm.origin_state} onChange={e => setLaneForm({...laneForm, origin_state: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <label style={S.label}>Destination State</label>
                <input style={S.input} placeholder="IL" maxLength={2} value={laneForm.destination_state} onChange={e => setLaneForm({...laneForm, destination_state: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <label style={S.label}>Equipment</label>
                <select style={S.input} value={laneForm.equipment_type} onChange={e => setLaneForm({...laneForm, equipment_type: e.target.value})}>
                  <option value="all">All Equipment</option>
                  {EQUIPMENT.map(e => <option key={e} value={e}>{e.replace(/_/g,' ').toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Lookback Days</label>
                <input type="number" style={S.input} value={laneForm.days} onChange={e => setLaneForm({...laneForm, days: e.target.value})} />
              </div>
            </div>
            <button onClick={getLaneAnalysis} disabled={loading || !laneForm.origin_state || !laneForm.destination_state} style={S.btn}>{loading ? 'Analyzing...' : 'Analyze Lane'}</button>
          </div>

          {laneResult && !laneResult.error && (
            <div style={S.card}>
              <h3 style={S.cardTitle}>Lane: {laneResult.lane}</h3>
              <div style={S.rateGrid}>
                <div style={S.rateBox}><div style={S.rateLabel}>Total Loads</div><div style={S.rateValue}>{laneResult.volume?.total_loads}</div></div>
                <div style={S.rateBox}><div style={S.rateLabel}>Avg Buy Rate</div><div style={S.rateValue}>${laneResult.rates?.avg_buy_rate || 'N/A'}</div></div>
                <div style={S.rateBox}><div style={S.rateLabel}>Avg Sell Rate</div><div style={S.rateValue}>${laneResult.rates?.avg_sell_rate || 'N/A'}</div></div>
                <div style={S.rateBox}><div style={S.rateLabel}>Avg Margin</div><div style={S.rateValue}>{laneResult.rates?.avg_margin_pct || 'N/A'}%</div></div>
              </div>
              {laneResult.top_carriers?.length > 0 && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Top Carriers on Lane</div>
                  <table style={S.table}><thead><tr><th style={S.th}>Carrier</th><th style={S.th}>MC#</th><th style={S.th}>Loads</th><th style={S.th}>Avg Rate</th></tr></thead>
                    <tbody>{laneResult.top_carriers.map((c, i) => (
                      <tr key={i}><td style={S.td}>{c.carrier_name}</td><td style={S.td}>{c.mc_number}</td><td style={S.td}>{c.loads_on_lane}</td><td style={S.td}>${parseFloat(c.avg_rate).toFixed(0)}</td></tr>
                    ))}</tbody></table>
                </div>
              )}
            </div>
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
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24 },
  cardTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 16 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 },
  label: { display: 'block', fontSize: 11, color: '#8B949E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 14 },
  btn: { width: '100%', padding: '10px 20px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  confBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 16 },
  rateGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 },
  rateBox: { background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, padding: 16, textAlign: 'center' },
  rateLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  rateValue: { fontSize: 24, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 },
  rateRange: { fontSize: 11, color: '#8B949E', marginTop: 2 },
  section: { marginTop: 16, padding: '12px 0', borderTop: '1px solid #21262D' },
  sectionTitle: { fontSize: 12, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 },
  rationale: { fontSize: 13, color: '#E6EDF3', padding: '4px 0', paddingLeft: 12, borderLeft: '2px solid #0EA5E9' },
  adjustment: { fontSize: 13, color: '#F59E0B', padding: '4px 0' },
  dataQuality: { display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: '#8B949E' },
  error: { background: '#EF444422', border: '1px solid #EF4444', borderRadius: 8, padding: 16, color: '#EF4444', marginTop: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #21262D', fontSize: 11, color: '#8B949E', textTransform: 'uppercase' },
  td: { padding: '8px 12px', borderBottom: '1px solid #21262D', fontSize: 13, color: '#E6EDF3' },
  srcBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', border: '1px solid', borderRadius: 20, fontSize: 11, color: '#8B949E' },
  srcDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
};
