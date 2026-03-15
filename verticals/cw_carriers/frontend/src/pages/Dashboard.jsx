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

      <div style={s.neuralSection}>
        <div style={s.neuralHeader}>
          <h3 style={s.sectionTitle}>NEURAL INTELLIGENCE</h3>
          <a href="/cw_carriers/neural.html" style={s.neuralLink}>Open Full Dashboard →</a>
        </div>
        <iframe
          src="/cw_carriers/neural.html"
          style={s.neuralFrame}
          title="Neural Intelligence Dashboard"
          frameBorder="0"
        />
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
  neuralSection: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 12, overflow: 'hidden' },
  neuralHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #21262D' },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 0 },
  neuralLink: { fontSize: 13, color: '#8b5cf6', fontWeight: 600, textDecoration: 'none' },
  neuralFrame: { width: '100%', height: 'calc(100vh - 200px)', minHeight: 700, border: 'none', display: 'block' }
};
