import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Dashboard() {
  const [kpis, setKpis] = useState({});
  const [recentCalls, setRecentCalls] = useState([]);
  const [openLoads, setOpenLoads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/dashboard').catch(() => ({ data: { data: {} } })),
      api.get('/calls?limit=10').catch(() => ({ data: { data: [] } })),
      api.get('/loads?status=open&limit=10').catch(() => ({ data: { data: [] } }))
    ]).then(([kpiRes, callsRes, loadsRes]) => {
      setKpis(kpiRes.data.data || {});
      setRecentCalls(callsRes.data.data || []);
      setOpenLoads(loadsRes.data.data || []);
      setLoading(false);
    });
  }, []);

  const kpiCards = [
    { label: 'Open Loads', value: kpis.open_loads || 0, color: '#1A4FA8' },
    { label: 'Covered Today', value: kpis.covered_today || 0, color: '#238636' },
    { label: 'Active Carriers', value: kpis.active_carriers || 0, color: '#C8962A' },
    { label: 'Calls Today', value: kpis.calls_today || 0, color: '#8957E5' },
    { label: 'HubSpot Contacts', value: kpis.hubspot_contacts || 0, color: '#F97316' },
    { label: 'Pending Sync', value: kpis.pending_sync || 0, color: '#EF4444' },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>Loading dashboard...</div>;

  return (
    <div>
      <h2 style={s.title}>DASHBOARD</h2>

      <div style={s.kpiGrid}>
        {kpiCards.map(k => (
          <div key={k.label} style={s.kpiCard}>
            <div style={{ ...s.kpiValue, color: k.color }}>{k.value}</div>
            <div style={s.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={s.grid2}>
        <div style={s.section}>
          <h3 style={s.sectionTitle}>RECENT CALLS</h3>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Contact</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Outcome</th>
                <th style={s.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.length === 0 ? (
                <tr><td colSpan={4} style={s.empty}>No calls yet</td></tr>
              ) : recentCalls.map(c => (
                <tr key={c.id}>
                  <td style={s.td}>{c.company_name || c.contact_name || c.from_number || '—'}</td>
                  <td style={s.td}><span style={s.badge}>{c.call_type || '—'}</span></td>
                  <td style={s.td}><span style={{ ...s.badge, ...outcomeColor(c.outcome) }}>{c.outcome || '—'}</span></td>
                  <td style={s.td}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={s.section}>
          <h3 style={s.sectionTitle}>OPEN LOADS</h3>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Ref</th>
                <th style={s.th}>Lane</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {openLoads.length === 0 ? (
                <tr><td colSpan={4} style={s.empty}>No open loads</td></tr>
              ) : openLoads.map(l => (
                <tr key={l.id}>
                  <td style={s.td}>{l.load_ref || `#${l.id}`}</td>
                  <td style={s.td}>{l.origin} → {l.destination}</td>
                  <td style={s.td}>{l.freight_type || '—'}</td>
                  <td style={s.td}>{l.rate_usd ? `$${parseFloat(l.rate_usd).toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function outcomeColor(outcome) {
  const map = { qualified: { background: '#238636', color: '#fff' }, booked: { background: '#1A4FA8', color: '#fff' }, declined: { background: '#6E7681' }, escalated: { background: '#C8962A', color: '#000' }, voicemail: { background: '#484F58' } };
  return map[outcome] || {};
}

const s = {
  title: { fontSize: 28, color: '#C8962A', marginBottom: 20 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 },
  kpiCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: '16px 12px', textAlign: 'center' },
  kpiValue: { fontSize: 28, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif" },
  kpiLabel: { fontSize: 11, color: '#8B949E', marginTop: 4, textTransform: 'uppercase' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 16, overflow: 'auto' },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase' },
  td: { padding: '8px 10px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#21262D', color: '#8B949E' },
  empty: { padding: 20, textAlign: 'center', color: '#484F58' }
};
