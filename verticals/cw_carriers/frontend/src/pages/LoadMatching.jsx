import React, { useState } from 'react';
import api from '../services/api';

export default function LoadMatching() {
  const [loadId, setLoadId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const findPairs = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/load-matching/pairs/${loadId}`, { max_results: 20 });
      setResult(data.data);
    } catch (err) { setResult({ error: err.response?.data?.error || err.message }); }
    setLoading(false);
  };

  const handlePairAction = async (pairId, action) => {
    try {
      await api.post(`/load-matching/pair/${pairId}/${action}`, { reason: action === 'reject' ? 'Operator decision' : undefined });
      // Refresh
      findPairs();
    } catch (err) { console.error(err); }
  };

  const typeColors = { backhaul: '#22C55E', chain: '#0EA5E9', round_trip: '#A855F7', relay: '#F59E0B' };
  const scoreColor = s => s >= 75 ? '#22C55E' : s >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <div>
      <h2 style={S.title}>LOAD-TO-LOAD MATCHING</h2>
      <p style={S.subtitle}>Identify combinable or sequence-compatible loads to improve truck utilization and reduce deadhead</p>

      <div style={S.card}>
        <h3 style={S.cardTitle}>Find Load Pairs</h3>
        <div style={S.row}>
          <input style={{...S.input, flex: 1}} type="number" placeholder="Enter Load ID" value={loadId} onChange={e => setLoadId(e.target.value)} />
          <button onClick={findPairs} disabled={loading || !loadId} style={S.btn}>{loading ? 'Matching...' : 'Find Pairs'}</button>
        </div>
      </div>

      {result?.error && <div style={S.error}>{result.error}</div>}

      {result && !result.error && (
        <>
          <div style={S.card}>
            <h3 style={S.cardTitle}>Anchor Load</h3>
            <div style={S.infoGrid}>
              <div style={S.infoItem}><span style={S.infoLabel}>Ref</span><span style={S.infoValue}>{result.anchor_load.ref}</span></div>
              <div style={S.infoItem}><span style={S.infoLabel}>Lane</span><span style={S.infoValue}>{result.anchor_load.lane}</span></div>
              <div style={S.infoItem}><span style={S.infoLabel}>Equipment</span><span style={S.infoValue}>{result.anchor_load.equipment}</span></div>
              <div style={S.infoItem}><span style={S.infoLabel}>Pickup</span><span style={S.infoValue}>{result.anchor_load.pickup || 'N/A'}</span></div>
            </div>
            <div style={S.evalNote}>{result.candidates_evaluated} candidates evaluated — {result.pairs_found} viable pairs found</div>
          </div>

          {result.pairs.length > 0 && (
            <div style={S.card}>
              <h3 style={S.cardTitle}>Recommended Pairs</h3>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Score</th>
                    <th style={S.th}>Load B</th>
                    <th style={S.th}>Lane</th>
                    <th style={S.th}>Deadhead</th>
                    <th style={S.th}>Combined Rev</th>
                    <th style={S.th}>Combined RPM</th>
                    <th style={S.th}>Util +%</th>
                    <th style={S.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.pairs.map((p, i) => (
                    <tr key={i}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.td}><span style={{...S.typeBadge, background: (typeColors[p.pair_type] || '#666') + '22', color: typeColors[p.pair_type] || '#666'}}>{p.pair_type.replace(/_/g,' ').toUpperCase()}</span></td>
                      <td style={S.td}><span style={{...S.scoreBadge, color: scoreColor(p.match_score)}}>{p.match_score}</span></td>
                      <td style={S.td}>{p.load_b_ref}</td>
                      <td style={S.td} title={p.load_b_lane}>{p.load_b_lane?.length > 35 ? p.load_b_lane.substring(0, 35) + '...' : p.load_b_lane}</td>
                      <td style={S.td}>{p.deadhead_miles} mi</td>
                      <td style={S.td}>${p.combined_revenue?.toLocaleString()}</td>
                      <td style={S.td}>${p.combined_rpm}</td>
                      <td style={S.td}><span style={{color: p.utilization_improvement_pct > 0 ? '#22C55E' : '#EF4444'}}>+{p.utilization_improvement_pct}%</span></td>
                      <td style={S.td}>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={() => handlePairAction(p.load_b_id, 'accept')} style={S.actBtn} title="Accept">&#10003;</button>
                          <button onClick={() => handlePairAction(p.load_b_id, 'reject')} style={{...S.actBtn, background: '#EF444422', color: '#EF4444'}} title="Reject">&#10007;</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.pairs.length === 0 && <div style={S.empty}>No viable pairs found for this load. Try different dates or check if there are open loads with matching equipment.</div>}
        </>
      )}
    </div>
  );
}

const S = {
  title: { fontSize: 28, color: '#E6EDF3', marginBottom: 4 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 24 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 16 },
  row: { display: 'flex', gap: 12, alignItems: 'center' },
  input: { padding: '10px 14px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, color: '#E6EDF3', fontSize: 14 },
  btn: { padding: '10px 24px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  infoItem: { background: '#0D1117', borderRadius: 8, padding: 12 },
  infoLabel: { display: 'block', fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  infoValue: { display: 'block', fontSize: 14, color: '#E6EDF3', fontWeight: 600, marginTop: 4 },
  evalNote: { marginTop: 12, fontSize: 13, color: '#8B949E' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  td: { padding: '10px', borderBottom: '1px solid #21262D', fontSize: 13, color: '#E6EDF3' },
  typeBadge: { padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  scoreBadge: { fontWeight: 700, fontSize: 16, fontFamily: "'Bebas Neue',sans-serif" },
  actBtn: { padding: '4px 8px', background: '#22C55E22', color: '#22C55E', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 },
  error: { background: '#EF444422', border: '1px solid #EF4444', borderRadius: 8, padding: 16, color: '#EF4444', marginBottom: 16 },
  empty: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 40, textAlign: 'center', color: '#8B949E' },
};
