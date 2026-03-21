import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const BASE = '/cw_carriers';

export default function Dashboard() {
  const [kpis, setKpis] = useState({});
  const [neural, setNeural] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [openLoads, setOpenLoads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/dashboard').catch(() => ({ data: { data: {} } })),
      api.get('/neural/dashboard').catch(() => ({ data: null })),
      api.get('/calls?limit=5').catch(() => ({ data: { data: [] } })),
      api.get('/loads?status=open&limit=5').catch(() => ({ data: { data: [] } }))
    ]).then(([kpiRes, neuralRes, callsRes, loadsRes]) => {
      setKpis(kpiRes.data.data || {});
      setNeural(neuralRes.data?.success ? neuralRes.data : null);
      setRecentCalls(callsRes.data.data || []);
      setOpenLoads(loadsRes.data.data || []);
      setLoading(false);
    });
  }, []);

  // Commercially relevant KPIs — business outcomes, not system counts
  const loadTotal = kpis.total_loads || 0;
  const loadOpen = kpis.open_loads || 0;
  const covRate = loadTotal > 0 ? Math.round(((loadTotal - loadOpen) / loadTotal) * 100) : 0;
  const kpiCards = [
    { label: 'Total Loads', value: (loadTotal).toLocaleString(), color: '#0EA5E9' },
    { label: 'Open / Uncovered', value: loadOpen.toLocaleString(), color: loadOpen > 50 ? '#EF4444' : '#F59E0B' },
    { label: 'Coverage Rate', value: `${covRate}%`, color: covRate >= 80 ? '#238636' : covRate >= 50 ? '#C8962A' : '#EF4444' },
    { label: 'Active Carriers', value: (kpis.active_carriers || 0).toLocaleString(), color: '#8957E5' },
    { label: 'Covered Today', value: kpis.covered_today || 0, color: '#238636' },
    { label: 'HubSpot Pipeline', value: neural?.hubspot?.pipeline_value ? `$${Number(neural.hubspot.pipeline_value).toLocaleString()}` : '$0', color: '#ff7a59' },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>Loading dashboard...</div>;

  const scoreColor = neural ? (neural.healthScore >= 80 ? '#238636' : neural.healthScore >= 65 ? '#06b6d4' : neural.healthScore >= 45 ? '#C8962A' : '#F85149') : '#484F58';

  return (
    <div>
      <h2 style={s.title}>UNIFIED COMMAND DASHBOARD</h2>

      {/* KPI Row */}
      <div style={s.kpiGrid}>
        {kpiCards.map(k => (
          <div key={k.label} style={s.kpiCard}>
            <div style={{ ...s.kpiValue, color: k.color }}>{k.value}</div>
            <div style={s.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Neural Intelligence — Live Data (no iframe) */}
      <div style={s.neuralSection}>
        <div style={s.neuralHeader}>
          <h3 style={s.sectionTitle}>NEURAL INTELLIGENCE — OBD</h3>
          <Link to={`${BASE}/neural`} style={s.neuralLink}>Open Full Dashboard &rarr;</Link>
        </div>

        {neural ? (
          <div style={s.neuralBody}>
            {/* Score + Revenue row */}
            <div style={s.scoreRow}>
              <div style={s.scoreCard}>
                <div style={s.scoreRing}>
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#21262D" strokeWidth="8" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke={scoreColor} strokeWidth="8"
                      strokeDasharray={`${(neural.healthScore / 100) * 314} 314`}
                      strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray 1s ease' }} />
                  </svg>
                  <div style={s.scoreValue}>{neural.healthScore}</div>
                </div>
                <div style={{ ...s.scoreLabel, color: scoreColor }}>{neural.scoreLabel}</div>
                <div style={s.scoreTrend}>
                  {neural.trend.direction === 'up' ? '\u2191' : '\u2193'} {neural.trend.points} pts
                </div>
              </div>
              <div style={s.revGrid}>
                <div style={s.revCard}>
                  <div style={s.revLabel}>Revenue at Risk</div>
                  <div style={{ ...s.revValue, color: '#F85149' }}>${neural.revenueAtRisk.toLocaleString()}</div>
                </div>
                <div style={s.revCard}>
                  <div style={s.revLabel}>Recovery Potential</div>
                  <div style={{ ...s.revValue, color: '#238636' }}>${neural.recoveryPotential.toLocaleString()}</div>
                </div>
                {neural.hubspot && (
                  <>
                    <div style={s.revCard}>
                      <div style={s.revLabel}>HubSpot Pipeline</div>
                      <div style={{ ...s.revValue, color: '#ff7a59' }}>${Number(neural.hubspot.pipeline_value).toLocaleString()}</div>
                    </div>
                    <div style={s.revCard}>
                      <div style={s.revLabel}>Won Revenue</div>
                      <div style={{ ...s.revValue, color: '#238636' }}>${Number(neural.hubspot.won_revenue).toLocaleString()}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Connections */}
            <div style={s.connRow}>
              {neural.connections.map((c, i) => (
                <div key={i} style={{ ...s.connBadge, borderColor: c.status === 'connected' ? '#238636' : '#484F58' }}>
                  <span style={{ ...s.connDot, background: c.status === 'connected' ? '#238636' : '#484F58' }} />
                  {c.name}
                </div>
              ))}
            </div>

            {/* Panels */}
            <div style={s.panelGrid}>
              {neural.panels.map((panel, i) => {
                const pc = panel.score >= 70 ? '#238636' : panel.score >= 45 ? '#C8962A' : '#F85149';
                return (
                  <div key={i} style={s.panelCard}>
                    <div style={s.panelHeader}>
                      <span style={s.panelName}>{panel.name}</span>
                      <span style={{ ...s.panelScore, color: pc }}>{panel.score}</span>
                    </div>
                    <div style={s.panelBar}>
                      <div style={{ ...s.panelBarFill, width: `${panel.score}%`, background: pc }} />
                    </div>
                    <div style={s.panelFinding}>{panel.topFinding}</div>
                  </div>
                );
              })}
            </div>

            {/* OBD Diagnostics summary */}
            {neural.obd && (
              <div style={s.obdRow}>
                <div style={s.obdBanner}>
                  <span style={s.obdIcon}>{'\u2699'}</span>
                  <span style={s.obdLabel}>OBD STATUS</span>
                  <span style={{
                    ...s.obdStatus,
                    background: neural.obd.overall_status === 'ALL SYSTEMS GO' ? '#23863622' : '#C8962A22',
                    color: neural.obd.overall_status === 'ALL SYSTEMS GO' ? '#238636' : '#C8962A',
                  }}>{neural.obd.overall_status}</span>
                  <span style={s.obdCounts}>
                    <span style={{ color: '#238636' }}>{neural.obd.summary.ok} OK</span>
                    {neural.obd.summary.warning > 0 && <span style={{ color: '#C8962A' }}>{neural.obd.summary.warning} WARN</span>}
                    {neural.obd.summary.critical > 0 && <span style={{ color: '#F85149' }}>{neural.obd.summary.critical} FAULT</span>}
                  </span>
                </div>
                <div style={s.obdCodesRow}>
                  {neural.obd.diagnostics.map((d, i) => {
                    const dc = d.severity === 'ok' ? '#238636' : d.severity === 'warning' ? '#C8962A' : d.severity === 'critical' ? '#F85149' : '#484F58';
                    return (
                      <div key={i} style={{ ...s.obdCode, borderLeftColor: dc }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: dc, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5 }}>{d.code}</div>
                        <div style={{ fontSize: 10, color: '#8B949E' }}>{d.system}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top findings preview */}
            {neural.findings.length > 0 && neural.findings[0].id !== 'f0' && (
              <div style={s.findingsPreview}>
                <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>Top Findings</div>
                {neural.findings.slice(0, 3).map((f, i) => {
                  const fc = f.severity === 'CRITICAL' ? '#F85149' : f.severity === 'WARNING' ? '#C8962A' : '#238636';
                  return (
                    <div key={i} style={{ ...s.findingRow, borderLeftColor: fc }}>
                      <span style={{ ...s.findingSev, background: `${fc}22`, color: fc }}>{f.severity}</span>
                      <span style={s.findingTitle}>{f.title}</span>
                      {f.dollarImpact && <span style={s.findingImpact}>{f.dollarImpact}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>Unable to load Neural data</div>
        )}
      </div>

      {/* Recent Calls + Open Loads */}
      <div style={s.twoCol}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>RECENT CALLS</h3>
          {recentCalls.length === 0 ? (
            <div style={s.empty}>No calls yet</div>
          ) : (
            recentCalls.map((c, i) => (
              <div key={i} style={s.listRow}>
                <span style={{ ...s.dirBadge, background: c.direction === 'inbound' ? '#1A4FA822' : '#23863622', color: c.direction === 'inbound' ? '#1A4FA8' : '#238636' }}>{c.direction}</span>
                <span style={s.listText}>{c.from_number || c.to_number || 'Unknown'}</span>
                <span style={s.listMeta}>{c.duration_sec ? `${c.duration_sec}s` : ''}</span>
                <span style={{ ...s.outcomeBadge, ...outcomeStyle(c.outcome) }}>{c.outcome || 'n/a'}</span>
              </div>
            ))
          )}
        </div>
        <div style={s.card}>
          <h3 style={s.cardTitle}>OPEN LOADS</h3>
          {openLoads.length === 0 ? (
            <div style={s.empty}>No open loads</div>
          ) : (
            openLoads.map((l, i) => (
              <div key={i} style={s.listRow}>
                <span style={s.loadRef}>{l.load_ref || `#${l.id}`}</span>
                <span style={s.listText}>{l.origin} {'\u2192'} {l.destination}</span>
                <span style={s.listMeta}>{l.rate_usd ? `$${parseFloat(l.rate_usd).toLocaleString()}` : ''}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function outcomeStyle(outcome) {
  const map = { qualified: { background: '#23863622', color: '#238636' }, booked: { background: '#1A4FA822', color: '#1A4FA8' }, declined: { background: '#6E768122', color: '#6E7681' }, escalated: { background: '#C8962A22', color: '#C8962A' }, voicemail: { background: '#484F5822', color: '#484F58' }, answered: { background: '#23863622', color: '#238636' }, no_answer: { background: '#F8514922', color: '#F85149' } };
  return map[outcome] || { background: '#21262D', color: '#8B949E' };
}

const s = {
  title: { fontSize: 28, color: '#C8962A', marginBottom: 20 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 },
  kpiCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: '16px 12px', textAlign: 'center' },
  kpiValue: { fontSize: 28, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif" },
  kpiLabel: { fontSize: 11, color: '#8B949E', marginTop: 4, textTransform: 'uppercase' },
  // Neural section
  neuralSection: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, overflow: 'hidden', marginBottom: 24 },
  neuralHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #21262D' },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 0 },
  neuralLink: { fontSize: 13, color: '#8b5cf6', fontWeight: 600, textDecoration: 'none' },
  neuralBody: { padding: 20 },
  // Score
  scoreRow: { display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  scoreCard: { textAlign: 'center', minWidth: 140 },
  scoreRing: { position: 'relative', width: 120, height: 120, margin: '0 auto 8px' },
  scoreValue: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 32, fontWeight: 800, color: '#E6EDF3' },
  scoreLabel: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  scoreTrend: { fontSize: 11, color: '#8B949E' },
  revGrid: { flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  revCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, padding: '12px 14px' },
  revLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', marginBottom: 4 },
  revValue: { fontSize: 20, fontWeight: 700 },
  // Connections
  connRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  connBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid', borderRadius: 16, fontSize: 11, color: '#8B949E' },
  connDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  // Panels
  panelGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 },
  panelCard: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, padding: 14 },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  panelName: { fontSize: 10, fontWeight: 700, color: '#8B949E', textTransform: 'uppercase' },
  panelScore: { fontSize: 18, fontWeight: 800 },
  panelBar: { height: 3, background: '#21262D', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  panelBarFill: { height: '100%', borderRadius: 2, transition: 'width 1s ease' },
  panelFinding: { fontSize: 11, color: '#8B949E', lineHeight: 1.4 },
  // OBD
  obdRow: { marginBottom: 16 },
  obdBanner: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#0D1117', borderRadius: '8px 8px 0 0', border: '1px solid #21262D' },
  obdIcon: { fontSize: 16, color: '#0EA5E9' },
  obdLabel: { fontSize: 10, fontWeight: 700, color: '#8B949E', letterSpacing: 1.5 },
  obdStatus: { padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  obdCounts: { display: 'flex', gap: 10, marginLeft: 'auto', fontSize: 11, fontWeight: 600 },
  obdCodesRow: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, padding: '8px', background: '#0D1117', borderRadius: '0 0 8px 8px', border: '1px solid #21262D', borderTop: 'none' },
  obdCode: { borderLeft: '2px solid', borderRadius: 4, padding: '6px 8px', background: '#161B22' },
  // Findings preview
  findingsPreview: { background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, padding: 14 },
  findingRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderLeft: '3px solid', borderRadius: 6, marginBottom: 6, background: '#161B22' },
  findingSev: { padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, flexShrink: 0 },
  findingTitle: { fontSize: 12, color: '#E6EDF3', flex: 1 },
  findingImpact: { fontSize: 11, fontWeight: 600, color: '#C8962A', flexShrink: 0 },
  // Two column
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 20 },
  cardTitle: { fontSize: 16, color: '#E6EDF3', marginBottom: 14, letterSpacing: 1 },
  empty: { color: '#484F58', textAlign: 'center', padding: 24, fontSize: 13 },
  listRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #21262D', fontSize: 12 },
  dirBadge: { padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 },
  outcomeBadge: { padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, flexShrink: 0 },
  listText: { flex: 1, color: '#E6EDF3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listMeta: { color: '#484F58', fontSize: 11, flexShrink: 0 },
  loadRef: { color: '#0EA5E9', fontWeight: 600, fontSize: 11, flexShrink: 0, width: 70 },
};
