import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Analytics() {
  const [lanes, setLanes] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [coverage, setCoverage] = useState({});
  const [callStats, setCallStats] = useState({ daily: [], outcomes: [], byType: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/lanes').catch(() => ({ data: { data: [] } })),
      api.get('/analytics/carriers').catch(() => ({ data: { data: [] } })),
      api.get('/analytics/coverage').catch(() => ({ data: { data: {} } })),
      api.get('/analytics/calls').catch(() => ({ data: { data: { daily: [], outcomes: [], byType: [] } } }))
    ]).then(([lanesRes, carriersRes, coverageRes, callsRes]) => {
      setLanes(lanesRes.data.data || []);
      setCarriers(carriersRes.data.data || []);
      setCoverage(coverageRes.data.data || {});
      setCallStats(callsRes.data.data || { daily: [], outcomes: [], byType: [] });
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>Loading analytics...</div>;

  return (
    <div>
      <h2 style={s.title}>ANALYTICS</h2>

      {/* Coverage Funnel */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>LOAD COVERAGE FUNNEL</h3>
        <div style={s.funnelRow}>
          <div style={s.funnelStep}><div style={s.funnelVal}>{coverage.total_loads || 0}</div><div style={s.funnelLabel}>Total Loads</div></div>
          <div style={s.funnelArrow}>→</div>
          <div style={s.funnelStep}><div style={s.funnelVal}>{coverage.calls_made || 0}</div><div style={s.funnelLabel}>Calls Made</div></div>
          <div style={s.funnelArrow}>→</div>
          <div style={s.funnelStep}><div style={s.funnelVal}>{coverage.interested || 0}</div><div style={s.funnelLabel}>Interested</div></div>
          <div style={s.funnelArrow}>→</div>
          <div style={s.funnelStep}><div style={{ ...s.funnelVal, color: '#238636' }}>{coverage.booked || 0}</div><div style={s.funnelLabel}>Booked</div></div>
          <div style={s.funnelStep}><div style={{ ...s.funnelVal, color: '#1A4FA8' }}>{coverage.coverage_rate || 0}%</div><div style={s.funnelLabel}>Coverage Rate</div></div>
        </div>
      </div>

      <div style={s.grid2}>
        {/* Lane Profitability */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>LANE PROFITABILITY</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Lane</th>
                  <th style={s.th}>Loads</th>
                  <th style={s.th}>Avg Rate</th>
                  <th style={s.th}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {lanes.length === 0 ? <tr><td colSpan={4} style={s.empty}>No data</td></tr> :
                 lanes.map((l, i) => (
                  <tr key={i}>
                    <td style={s.td}>{l.origin} → {l.destination}</td>
                    <td style={s.td}>{l.total_loads}</td>
                    <td style={s.td}>{l.avg_rate ? `$${parseFloat(l.avg_rate).toLocaleString()}` : '—'}</td>
                    <td style={s.td}>{l.total_revenue ? `$${parseFloat(l.total_revenue).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Carrier Performance */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>CARRIER PERFORMANCE</h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Carrier</th>
                  <th style={s.th}>Loads</th>
                  <th style={s.th}>Delivered</th>
                  <th style={s.th}>Rate</th>
                  <th style={s.th}>Score</th>
                </tr>
              </thead>
              <tbody>
                {carriers.length === 0 ? <tr><td colSpan={5} style={s.empty}>No data</td></tr> :
                 carriers.map((c, i) => (
                  <tr key={i}>
                    <td style={s.td}>{c.company_name || c.full_name || '—'}</td>
                    <td style={s.td}>{c.total_loads}</td>
                    <td style={s.td}>{c.delivered}</td>
                    <td style={s.td}>{c.avg_rate ? `$${parseFloat(c.avg_rate).toLocaleString()}` : '—'}</td>
                    <td style={s.td}><span style={{ ...s.scoreBadge, background: parseFloat(c.delivery_rate) >= 90 ? '#238636' : parseFloat(c.delivery_rate) >= 70 ? '#C8962A' : '#F85149' }}>{c.delivery_rate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Call Stats */}
      <div style={{ ...s.section, marginTop: 20 }}>
        <h3 style={s.sectionTitle}>CALL BREAKDOWN</h3>
        <div style={s.callBreakdown}>
          <div>
            <h4 style={s.subTitle}>By Outcome</h4>
            {(callStats.outcomes || []).map((o, i) => (
              <div key={i} style={s.breakdownRow}>
                <span style={s.breakdownLabel}>{o.outcome || 'unknown'}</span>
                <span style={s.breakdownVal}>{o.count}</span>
              </div>
            ))}
          </div>
          <div>
            <h4 style={s.subTitle}>By Type</h4>
            {(callStats.byType || []).map((t, i) => (
              <div key={i} style={s.breakdownRow}>
                <span style={s.breakdownLabel}>{t.call_type || 'unknown'}</span>
                <span style={s.breakdownVal}>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  title: { fontSize: 28, color: '#C8962A', marginBottom: 20 },
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 20, marginBottom: 0 },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 12 },
  subTitle: { fontSize: 14, color: '#8B949E', marginBottom: 8 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 20 },
  funnelRow: { display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  funnelStep: { textAlign: 'center', padding: 12, background: '#0D1117', borderRadius: 8, minWidth: 80, flex: '1 1 80px' },
  funnelVal: { fontSize: 28, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", color: '#C8962A' },
  funnelLabel: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', marginTop: 2 },
  funnelArrow: { fontSize: 24, color: '#30363D' },
  tableWrap: { maxHeight: 300, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', position: 'sticky', top: 0, background: '#161B22' },
  td: { padding: '8px 10px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  scoreBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#fff' },
  empty: { padding: 20, textAlign: 'center', color: '#484F58' },
  callBreakdown: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 },
  breakdownRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #21262D' },
  breakdownLabel: { fontSize: 13, color: '#8B949E', textTransform: 'capitalize' },
  breakdownVal: { fontSize: 13, color: '#E6EDF3', fontWeight: 600 }
};
