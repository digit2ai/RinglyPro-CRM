import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getUser } from '../services/auth';

const CITIES = ['Dallas, TX','Houston, TX','Chicago, IL','Atlanta, GA','Los Angeles, CA','Miami, FL','Memphis, TN','Indianapolis, IN','Charlotte, NC','Nashville, TN','Phoenix, AZ','Denver, CO','New York, NY','Seattle, WA','Detroit, MI','Kansas City, MO','Columbus, OH','Jacksonville, FL','San Antonio, TX','Minneapolis, MN'];
const EQUIP = [{ id: 'dry_van', label: 'Dry Van' },{ id: 'reefer', label: 'Reefer' },{ id: 'flatbed', label: 'Flatbed' },{ id: 'step_deck', label: 'Step Deck' }];

export default function Dashboard() {
  const user = getUser();
  // Lane Rate
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [equipment, setEquipment] = useState('dry_van');
  const [rateLoading, setRateLoading] = useState(false);
  const [rateResult, setRateResult] = useState(null);
  // FMCSA
  const [mcNumber, setMcNumber] = useState('');
  const [dotNumber, setDotNumber] = useState('');
  const [fmcsaLoading, setFmcsaLoading] = useState(false);
  const [fmcsaResult, setFmcsaResult] = useState(null);
  // Inventory Health
  const fileRef = useRef(null);
  const [invFile, setInvFile] = useState('');
  const [invFileName, setInvFileName] = useState('');
  const [invResult, setInvResult] = useState(null);
  // Efficiency Score
  const [effAnswers, setEffAnswers] = useState({ skus: '', picks_day: '', error_rate: '', dock_doors: '', avg_dwell: '', utilization: '' });
  const [effScore, setEffScore] = useState(null);
  // Platform status
  const [whStatus, setWhStatus] = useState(null);
  const [cwStatus, setCwStatus] = useState(null);

  useEffect(() => {
    fetch('/pinaxis/api/health').then(r => r.json()).then(d => setWhStatus(d)).catch(() => setWhStatus({ status: 'offline' }));
    fetch('/cw_carriers/api/health').then(r => r.json()).then(d => setCwStatus(d)).catch(() => setCwStatus({ status: 'offline' }));
  }, []);

  // --- Lane Rate Lookup ---
  const lookupRate = async () => {
    if (!origin || !destination) return;
    setRateLoading(true);
    setRateResult(null);
    try {
      const { data } = await api.get('/pricing/quote', { params: { origin, destination, equipment_type: equipment, tenant_id: 'logistics' } });
      setRateResult(data.data);
    } catch (err) { setRateResult({ error: err.response?.data?.error || err.message }); }
    setRateLoading(false);
  };

  // --- FMCSA Quick Check ---
  const checkCarrier = async () => {
    if (!mcNumber && !dotNumber) return;
    setFmcsaLoading(true);
    setFmcsaResult(null);
    try {
      const { data } = await api.post('/fmcsa/verify', { mc_number: mcNumber || undefined, dot_number: dotNumber || undefined });
      setFmcsaResult(data.data);
    } catch (err) { setFmcsaResult({ error: err.response?.data?.error || err.message }); }
    setFmcsaLoading(false);
  };

  // --- Inventory Health (client-side) ---
  const handleInvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setInvFileName(file.name);
    setInvResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      setInvFile(content);
      analyzeInventory(content, file.name);
    };
    reader.readAsText(file);
  };

  const analyzeInventory = (content, name) => {
    try {
      let rows;
      if (name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        rows = Array.isArray(parsed) ? parsed : parsed.data || parsed.records || parsed.inventory || [parsed];
      } else {
        const lines = content.trim().split('\n');
        const delimiters = [',', '\t', '|', ';'];
        let delimiter = ',', maxCount = 0;
        for (const d of delimiters) { const c = (lines[0].match(new RegExp(`\\${d}`, 'g')) || []).length; if (c > maxCount) { maxCount = c; delimiter = d; } }
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());
        rows = lines.slice(1).filter(l => l.trim()).map(line => {
          const vals = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i]; });
          return obj;
        });
      }

      const total = rows.length;
      if (total === 0) { setInvResult({ error: 'No data rows found' }); return; }

      // Find quantity and date columns
      const qtyKeys = ['quantity', 'qty', 'stock', 'on_hand', 'count', 'units', 'available'];
      const dateKeys = ['last_movement', 'last_moved', 'last_activity', 'updated', 'last_update', 'date', 'movement_date'];
      const qtyCol = Object.keys(rows[0]).find(k => qtyKeys.some(q => k.toLowerCase().includes(q)));
      const dateCol = Object.keys(rows[0]).find(k => dateKeys.some(d => k.toLowerCase().includes(d)));

      let deadStock = 0, totalQty = 0, aClass = 0, bClass = 0, cClass = 0;
      const now = Date.now();
      const sorted = [...rows].sort((a, b) => (parseFloat(b[qtyCol]) || 0) - (parseFloat(a[qtyCol]) || 0));

      rows.forEach((r, i) => {
        const qty = parseFloat(r[qtyCol]) || 0;
        totalQty += qty;
        if (dateCol) {
          const d = new Date(r[dateCol]);
          if (!isNaN(d) && (now - d.getTime()) > 90 * 86400000) deadStock++;
        }
      });

      // ABC classification by cumulative qty
      let cumQty = 0;
      sorted.forEach(r => {
        cumQty += parseFloat(r[qtyCol]) || 0;
        const pct = cumQty / totalQty;
        if (pct <= 0.80) aClass++;
        else if (pct <= 0.95) bClass++;
        else cClass++;
      });

      const turnover = dateCol ? Math.round((total - deadStock) / total * 365 / 90 * 10) / 10 : null;

      setInvResult({
        total_skus: total,
        total_units: totalQty,
        dead_stock_pct: dateCol ? Math.round(deadStock / total * 100) : null,
        dead_stock_count: dateCol ? deadStock : null,
        turnover_estimate: turnover,
        abc: { a: aClass, b: bClass, c: cClass },
        columns_detected: { quantity: qtyCol || 'not found', date: dateCol || 'not found' },
      });
    } catch (err) { setInvResult({ error: 'Failed to parse file: ' + err.message }); }
  };

  // --- Warehouse Efficiency Score ---
  const calcEfficiency = () => {
    const { skus, picks_day, error_rate, dock_doors, avg_dwell, utilization } = effAnswers;
    if (!skus && !picks_day) return;
    let score = 50;
    const notes = [];

    const s = parseInt(skus) || 0;
    const p = parseInt(picks_day) || 0;
    const e = parseFloat(error_rate) || 0;
    const d = parseInt(dock_doors) || 0;
    const dw = parseFloat(avg_dwell) || 0;
    const u = parseFloat(utilization) || 0;

    // Picks per SKU ratio
    if (s > 0 && p > 0) {
      const ratio = p / s;
      if (ratio >= 5) { score += 15; notes.push('Excellent pick velocity'); }
      else if (ratio >= 2) { score += 8; notes.push('Good pick velocity'); }
      else { score -= 5; notes.push('Low pick velocity - consider slotting optimization'); }
    }

    // Error rate
    if (e <= 0.5) { score += 15; notes.push('Outstanding accuracy (<0.5%)'); }
    else if (e <= 1) { score += 8; notes.push('Good accuracy (<1%)'); }
    else if (e <= 2) { score += 0; notes.push('Average accuracy - target <1%'); }
    else { score -= 10; notes.push('High error rate - quality checks needed'); }

    // Dock utilization
    if (d > 0 && p > 0) {
      const picksPerDock = p / d;
      if (picksPerDock > 200) { score += 10; notes.push('High dock throughput'); }
      else if (picksPerDock > 100) { score += 5; notes.push('Average dock throughput'); }
      else { notes.push('Low dock throughput - review scheduling'); }
    }

    // Dwell time
    if (dw > 0) {
      if (dw <= 24) { score += 10; notes.push('Excellent dwell time (<24h)'); }
      else if (dw <= 48) { score += 5; notes.push('Good dwell time (<48h)'); }
      else { score -= 5; notes.push('High dwell time - review receiving processes'); }
    }

    // Space utilization
    if (u > 0) {
      if (u >= 85 && u <= 92) { score += 10; notes.push('Optimal space utilization (85-92%)'); }
      else if (u >= 75) { score += 5; notes.push('Good space utilization'); }
      else if (u > 92) { score -= 5; notes.push('Over-utilized - congestion risk'); }
      else { notes.push('Under-utilized - consolidation opportunity'); }
    }

    score = Math.max(0, Math.min(100, score));
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    const benchmarks = { industry_avg: 62, top_quartile: 78, best_in_class: 90 };

    setEffScore({ score, grade, notes, benchmarks });
  };

  const onlineColor = (s) => s && s.status !== 'offline' ? '#22C55E' : '#EF4444';
  const riskColor = { LOW: '#22C55E', HIGH: '#EF4444', MEDIUM: '#F59E0B' };

  return (
    <div>
      <h1 style={S.title}>COMMAND CENTER</h1>
      <p style={S.sub}>Instant tools for your warehouse and carrier clients</p>

      {/* CARRIERS SECTION */}
      <div style={S.sectionHeader}>
        <span style={{...S.sectionIcon,background:'#F59E0B22',color:'#F59E0B'}}>T</span>
        <h2 style={S.sectionTitle}>TRANSPORTATION</h2>
        <div style={{...S.cardBadge,background:'#F59E0B22',color:'#F59E0B'}}>CARRIERS</div>
      </div>
      <div style={S.grid}>
        {/* Lane Rate Lookup */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Lane Rate Lookup</h3>
            <div style={S.cardBadge}>INSTANT</div>
          </div>
          <p style={S.cardDesc}>Get market rate estimates for any lane. Powered by historical load data and AI rate intelligence.</p>

          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <div style={{flex:1}}>
              <label style={S.label}>Origin</label>
              <select value={origin} onChange={e => setOrigin(e.target.value)} style={S.select}>
                <option value="">Select city...</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{flex:1}}>
              <label style={S.label}>Destination</label>
              <select value={destination} onChange={e => setDestination(e.target.value)} style={S.select}>
                <option value="">Select city...</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={S.label}>Equipment</label>
            <div style={{display:'flex',gap:6}}>
              {EQUIP.map(eq => (
                <button key={eq.id} onClick={() => setEquipment(eq.id)}
                  style={{...S.eqBtn, ...(equipment === eq.id ? S.eqBtnActive : {})}}>
                  {eq.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={lookupRate} disabled={rateLoading || !origin || !destination}
            style={{...S.btn,background:'#F59E0B',opacity:(!origin||!destination||rateLoading)?0.5:1}}>
            {rateLoading ? 'Looking up...' : 'Get Rate Estimate'}
          </button>

          {rateResult && !rateResult.error && (
            <div style={S.resultBox}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontSize:11,color:'#8B949E',textTransform:'uppercase',letterSpacing:1}}>{rateResult.lane?.origin} &#8594; {rateResult.lane?.destination}</span>
                <span style={{...S.methodBadge}}>{rateResult.pricing_method?.replace(/_/g,' ')}</span>
              </div>
              <div style={S.rateGrid}>
                <div style={S.rateCard}>
                  <div style={S.rateLabel}>Buy Rate</div>
                  <div style={{...S.rateVal,color:'#F59E0B'}}>${rateResult.recommendation?.suggested_buy_rate?.toLocaleString()}</div>
                  <div style={S.rateRange}>${rateResult.confidence_band?.buy_rate_low} - ${rateResult.confidence_band?.buy_rate_high}</div>
                </div>
                <div style={S.rateCard}>
                  <div style={S.rateLabel}>Sell Rate</div>
                  <div style={{...S.rateVal,color:'#22C55E'}}>${rateResult.recommendation?.suggested_sell_rate?.toLocaleString()}</div>
                  <div style={S.rateRange}>${rateResult.confidence_band?.sell_rate_low} - ${rateResult.confidence_band?.sell_rate_high}</div>
                </div>
                <div style={S.rateCard}>
                  <div style={S.rateLabel}>Rate/Mile</div>
                  <div style={S.rateVal}>${rateResult.recommendation?.rate_per_mile}</div>
                  <div style={S.rateRange}>{rateResult.lane?.estimated_miles} mi</div>
                </div>
                <div style={S.rateCard}>
                  <div style={S.rateLabel}>Margin</div>
                  <div style={{...S.rateVal,color:'#0EA5E9'}}>{rateResult.recommendation?.margin_pct}%</div>
                  <div style={S.rateRange}>${rateResult.recommendation?.estimated_margin}</div>
                </div>
              </div>
              {rateResult.rationale?.length > 0 && (
                <div style={{marginTop:10,padding:'8px 10px',background:'#0D1117',borderRadius:6}}>
                  {rateResult.rationale.map((r, i) => <div key={i} style={{fontSize:11,color:'#8B949E',padding:'2px 0'}}>&#8226; {r}</div>)}
                </div>
              )}
            </div>
          )}
          {rateResult?.error && <div style={S.error}>{rateResult.error}</div>}
        </div>

        {/* FMCSA Quick Check */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>FMCSA Quick Check</h3>
            <div style={{...S.cardBadge,background:'#EF444422',color:'#EF4444'}}>COMPLIANCE</div>
          </div>
          <p style={S.cardDesc}>Instant carrier authority verification. Check operating status, insurance, and safety rating by MC or DOT number.</p>

          <div style={{display:'flex',gap:8,marginBottom:14}}>
            <div style={{flex:1}}>
              <label style={S.label}>MC Number</label>
              <input value={mcNumber} onChange={e => setMcNumber(e.target.value)} placeholder="e.g. MC123456" style={S.input} />
            </div>
            <div style={{flex:1}}>
              <label style={S.label}>DOT Number</label>
              <input value={dotNumber} onChange={e => setDotNumber(e.target.value)} placeholder="e.g. 1234567" style={S.input} />
            </div>
          </div>
          <button onClick={checkCarrier} disabled={fmcsaLoading || (!mcNumber && !dotNumber)}
            style={{...S.btn,background:'#EF4444',opacity:(!mcNumber&&!dotNumber||fmcsaLoading)?0.5:1}}>
            {fmcsaLoading ? 'Checking...' : 'Verify Carrier'}
          </button>

          {fmcsaResult && !fmcsaResult.error && (
            <div style={S.resultBox}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:'#E6EDF3'}}>{fmcsaResult.legal_name}</div>
                  {fmcsaResult.dba_name && <div style={{fontSize:11,color:'#8B949E'}}>DBA: {fmcsaResult.dba_name}</div>}
                </div>
                <div style={{...S.statusBadge, background: fmcsaResult.authorized ? '#22C55E22' : '#EF444422', color: fmcsaResult.authorized ? '#22C55E' : '#EF4444'}}>
                  {fmcsaResult.operating_status}
                </div>
              </div>
              <div style={S.fmcsaGrid}>
                <div style={S.fmcsaItem}><span style={S.fmcsaLabel}>DOT</span><span style={S.fmcsaVal}>{fmcsaResult.dot_number}</span></div>
                <div style={S.fmcsaItem}><span style={S.fmcsaLabel}>Entity</span><span style={S.fmcsaVal}>{fmcsaResult.entity_type}</span></div>
                <div style={S.fmcsaItem}><span style={S.fmcsaLabel}>Power Units</span><span style={S.fmcsaVal}>{fmcsaResult.power_units}</span></div>
                <div style={S.fmcsaItem}><span style={S.fmcsaLabel}>Drivers</span><span style={S.fmcsaVal}>{fmcsaResult.drivers}</span></div>
                <div style={S.fmcsaItem}><span style={S.fmcsaLabel}>Safety Rating</span><span style={S.fmcsaVal}>{fmcsaResult.safety_rating || 'N/A'}</span></div>
                <div style={S.fmcsaItem}>
                  <span style={S.fmcsaLabel}>Risk Level</span>
                  <span style={{...S.fmcsaVal, color: riskColor[fmcsaResult.risk_level] || '#8B949E'}}>{fmcsaResult.risk_level}</span>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <div style={{...S.insuranceBadge, borderColor: fmcsaResult.bipd_insurance_on_file ? '#22C55E' : '#EF4444'}}>
                  <span style={{color: fmcsaResult.bipd_insurance_on_file ? '#22C55E' : '#EF4444'}}>{fmcsaResult.bipd_insurance_on_file ? '&#10003;' : '&#10007;'}</span> BIPD Insurance
                </div>
                <div style={{...S.insuranceBadge, borderColor: fmcsaResult.cargo_insurance_on_file ? '#22C55E' : '#EF4444'}}>
                  <span style={{color: fmcsaResult.cargo_insurance_on_file ? '#22C55E' : '#EF4444'}}>{fmcsaResult.cargo_insurance_on_file ? '&#10003;' : '&#10007;'}</span> Cargo Insurance
                </div>
              </div>
              {fmcsaResult.recommendation && (
                <div style={{marginTop:10,padding:'8px 10px',background:'#0D1117',borderRadius:6,fontSize:12,color:'#8B949E'}}>{fmcsaResult.recommendation}</div>
              )}
            </div>
          )}
          {fmcsaResult?.error && <div style={S.error}>{fmcsaResult.error}</div>}
        </div>
      </div>

      {/* WAREHOUSE SECTION */}
      <div style={{...S.sectionHeader,marginTop:32}}>
        <span style={{...S.sectionIcon,background:'#0EA5E922',color:'#0EA5E9'}}>W</span>
        <h2 style={S.sectionTitle}>INTRALOGISTICS</h2>
        <div style={S.cardBadge}>WAREHOUSE</div>
      </div>
      <div style={S.grid}>
        {/* Inventory Health Calculator */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Inventory Health Calculator</h3>
            <div style={{...S.cardBadge,background:'#22C55E22',color:'#22C55E'}}>ANALYSIS</div>
          </div>
          <p style={S.cardDesc}>Upload a CSV with SKU data. Get instant dead stock %, turnover rate, and ABC classification. No account needed.</p>

          <div style={S.dropZone} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".csv,.json,.tsv,.txt" onChange={handleInvFile} style={{display:'none'}} />
            {invFileName ? (
              <div>
                <div style={{fontSize:14,fontWeight:600,color:'#E6EDF3'}}>{invFileName}</div>
                <div style={{fontSize:12,color:'#8B949E',marginTop:4}}>Click to replace</div>
              </div>
            ) : (
              <div>
                <div style={{fontSize:28,marginBottom:6}}>&#128230;</div>
                <div style={{fontSize:13,color:'#E6EDF3'}}>Upload inventory CSV/JSON</div>
                <div style={{fontSize:11,color:'#8B949E',marginTop:4}}>Columns: SKU, Quantity, Last Movement Date</div>
              </div>
            )}
          </div>

          {invResult && !invResult.error && (
            <div style={S.resultBox}>
              <div style={S.rateGrid}>
                <div style={S.rateCard}>
                  <div style={S.rateLabel}>Total SKUs</div>
                  <div style={S.rateVal}>{invResult.total_skus?.toLocaleString()}</div>
                </div>
                <div style={S.rateCard}>
                  <div style={S.rateLabel}>Total Units</div>
                  <div style={S.rateVal}>{invResult.total_units?.toLocaleString()}</div>
                </div>
                {invResult.dead_stock_pct !== null && (
                  <div style={S.rateCard}>
                    <div style={S.rateLabel}>Dead Stock</div>
                    <div style={{...S.rateVal,color: invResult.dead_stock_pct > 20 ? '#EF4444' : invResult.dead_stock_pct > 10 ? '#F59E0B' : '#22C55E'}}>{invResult.dead_stock_pct}%</div>
                    <div style={S.rateRange}>{invResult.dead_stock_count} SKUs (90+ days)</div>
                  </div>
                )}
                {invResult.turnover_estimate && (
                  <div style={S.rateCard}>
                    <div style={S.rateLabel}>Turnover</div>
                    <div style={S.rateVal}>{invResult.turnover_estimate}x/yr</div>
                  </div>
                )}
              </div>
              <div style={{marginTop:10}}>
                <div style={{fontSize:11,color:'#8B949E',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>ABC Classification</div>
                <div style={{display:'flex',gap:6}}>
                  <div style={{...S.abcBar,flex:invResult.abc.a,background:'#22C55E'}}><span style={S.abcLabel}>A: {invResult.abc.a}</span></div>
                  <div style={{...S.abcBar,flex:invResult.abc.b,background:'#F59E0B'}}><span style={S.abcLabel}>B: {invResult.abc.b}</span></div>
                  <div style={{...S.abcBar,flex:invResult.abc.c,background:'#EF4444'}}><span style={S.abcLabel}>C: {invResult.abc.c}</span></div>
                </div>
              </div>
              <div style={{marginTop:8,fontSize:10,color:'#8B949E'}}>Detected: qty="{invResult.columns_detected.quantity}", date="{invResult.columns_detected.date}"</div>
            </div>
          )}
          {invResult?.error && <div style={S.error}>{invResult.error}</div>}
        </div>

        {/* Warehouse Efficiency Score */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <h3 style={S.cardTitle}>Warehouse Efficiency Score</h3>
            <div style={{...S.cardBadge,background:'#A855F722',color:'#A855F7'}}>BENCHMARK</div>
          </div>
          <p style={S.cardDesc}>Answer a few questions about your operation and get an instant efficiency score with industry benchmarks.</p>

          <div style={S.formGrid}>
            <div><label style={S.label}>Active SKUs</label><input value={effAnswers.skus} onChange={e => setEffAnswers({...effAnswers, skus: e.target.value})} placeholder="e.g. 5000" style={S.input} /></div>
            <div><label style={S.label}>Picks / Day</label><input value={effAnswers.picks_day} onChange={e => setEffAnswers({...effAnswers, picks_day: e.target.value})} placeholder="e.g. 2000" style={S.input} /></div>
            <div><label style={S.label}>Error Rate %</label><input value={effAnswers.error_rate} onChange={e => setEffAnswers({...effAnswers, error_rate: e.target.value})} placeholder="e.g. 0.5" style={S.input} /></div>
            <div><label style={S.label}>Dock Doors</label><input value={effAnswers.dock_doors} onChange={e => setEffAnswers({...effAnswers, dock_doors: e.target.value})} placeholder="e.g. 12" style={S.input} /></div>
            <div><label style={S.label}>Avg Dwell (hrs)</label><input value={effAnswers.avg_dwell} onChange={e => setEffAnswers({...effAnswers, avg_dwell: e.target.value})} placeholder="e.g. 24" style={S.input} /></div>
            <div><label style={S.label}>Space Used %</label><input value={effAnswers.utilization} onChange={e => setEffAnswers({...effAnswers, utilization: e.target.value})} placeholder="e.g. 85" style={S.input} /></div>
          </div>
          <button onClick={calcEfficiency} style={{...S.btn,background:'#A855F7',opacity:(!effAnswers.skus&&!effAnswers.picks_day)?0.5:1}}
            disabled={!effAnswers.skus && !effAnswers.picks_day}>
            Calculate Score
          </button>

          {effScore && (
            <div style={S.resultBox}>
              <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:14}}>
                <div style={{...S.scoreCircle, borderColor: effScore.score >= 70 ? '#22C55E' : effScore.score >= 50 ? '#F59E0B' : '#EF4444'}}>
                  <div style={{fontSize:28,fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",color:'#E6EDF3'}}>{effScore.score}</div>
                  <div style={{fontSize:10,color:'#8B949E'}}>/ 100</div>
                </div>
                <div>
                  <div style={{fontSize:22,fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",color: effScore.score >= 70 ? '#22C55E' : effScore.score >= 50 ? '#F59E0B' : '#EF4444'}}>Grade {effScore.grade}</div>
                  <div style={{fontSize:11,color:'#8B949E'}}>
                    Industry avg: {effScore.benchmarks.industry_avg} | Top 25%: {effScore.benchmarks.top_quartile} | Best: {effScore.benchmarks.best_in_class}
                  </div>
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:3}}>
                {effScore.notes.map((n, i) => (
                  <div key={i} style={{fontSize:12,color:'#8B949E',padding:'3px 0'}}>&#8226; {n}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PLATFORM STATUS */}
      <div style={{...S.sectionHeader,marginTop:32}}>
        <h2 style={S.sectionTitle}>PLATFORMS</h2>
      </div>
      <div style={S.grid}>
        <a href="/cw_carriers/dashboard" style={S.platformCard}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontSize:15,fontWeight:600,color:'#E6EDF3'}}>Carriers CRM</span>
            <span style={{...S.statusDot,background:onlineColor(cwStatus)}} />
          </div>
          <div style={{fontSize:10,color:'#F59E0B',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Transportation</div>
          <div style={{fontSize:12,color:'#8B949E'}}>Loads, AI Matching, Rate Intelligence, FMCSA Compliance, Brokerage Analytics</div>
        </a>
        <a href="/pinaxis/" style={S.platformCard}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontSize:15,fontWeight:600,color:'#E6EDF3'}}>Warehouse OPS</span>
            <span style={{...S.statusDot,background:onlineColor(whStatus)}} />
          </div>
          <div style={{fontSize:10,color:'#0EA5E9',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Intralogistics</div>
          <div style={{fontSize:12,color:'#8B949E'}}>Inventory Management, Pick/Pack, OEE Tracking, Storage Zone Optimization</div>
        </a>
      </div>
    </div>
  );
}

const S = {
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#0EA5E9', letterSpacing: 2, marginBottom: 4 },
  sub: { color: '#8B949E', fontSize: 14, marginBottom: 28 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIcon: { width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 },
  sectionTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#E6EDF3', letterSpacing: 2 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#E6EDF3', letterSpacing: 1 },
  cardBadge: { padding: '3px 10px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  cardDesc: { color: '#8B949E', fontSize: 12, marginBottom: 16, lineHeight: 1.5 },
  label: { display: 'block', fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  input: { width: '100%', padding: '9px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, outline: 'none' },
  select: { width: '100%', padding: '9px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, outline: 'none' },
  eqBtn: { padding: '6px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#8B949E', fontSize: 12, cursor: 'pointer' },
  eqBtnActive: { borderColor: '#F59E0B', color: '#F59E0B', background: '#F59E0B11' },
  btn: { width: '100%', padding: '11px 20px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  dropZone: { border: '2px dashed #30363D', borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: '#0D1117' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 },
  resultBox: { marginTop: 14, background: '#0D1117', borderRadius: 8, padding: 14 },
  rateGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  rateCard: { background: '#161B22', borderRadius: 8, padding: 10, textAlign: 'center' },
  rateLabel: { fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  rateVal: { fontSize: 20, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif", marginTop: 2 },
  rateRange: { fontSize: 10, color: '#8B949E', marginTop: 2 },
  methodBadge: { padding: '2px 8px', background: '#30363D', color: '#8B949E', borderRadius: 4, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' },
  error: { background: '#EF444422', border: '1px solid #EF4444', borderRadius: 8, padding: 10, color: '#EF4444', marginTop: 10, fontSize: 12 },
  statusBadge: { padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 1 },
  fmcsaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 },
  fmcsaItem: { display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', background: '#161B22', borderRadius: 6 },
  fmcsaLabel: { fontSize: 9, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  fmcsaVal: { fontSize: 13, fontWeight: 600, color: '#E6EDF3' },
  insuranceBadge: { flex: 1, padding: '8px 10px', border: '1px solid', borderRadius: 6, fontSize: 12, color: '#E6EDF3', textAlign: 'center', background: '#161B22' },
  scoreCircle: { width: 80, height: 80, borderRadius: '50%', border: '3px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  abcBar: { borderRadius: 4, padding: '6px 4px', textAlign: 'center', minWidth: 30 },
  abcLabel: { fontSize: 10, fontWeight: 700, color: '#fff' },
  statusDot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  platformCard: { padding: '18px 20px', background: '#161B22', border: '1px solid #21262D', borderRadius: 12, textDecoration: 'none', color: 'inherit', transition: 'border-color 0.2s' },
};
