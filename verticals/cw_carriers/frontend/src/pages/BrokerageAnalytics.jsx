import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function BrokerageAnalytics() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [tab, setTab] = useState('overview');
  const [customers, setCustomers] = useState(null);
  const [exceptions, setExceptions] = useState(null);
  const [dailyReport, setDailyReport] = useState(null);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/brokerage-analytics/dashboard', { params: { date_from: dateFrom, date_to: dateTo } });
      setDashboard(data.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadCustomers = async () => {
    try {
      const { data } = await api.get('/brokerage-analytics/customers', { params: { days: 90 } });
      setCustomers(data.data);
    } catch (err) { console.error(err); }
  };

  const loadExceptions = async () => {
    try {
      const { data } = await api.get('/brokerage-analytics/exceptions', { params: { days: 30 } });
      setExceptions(data.data);
    } catch (err) { console.error(err); }
  };

  const loadDailyReport = async () => {
    try {
      const { data } = await api.get('/brokerage-analytics/daily-report');
      setDailyReport(data.data);
    } catch (err) { console.error(err); }
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'customers' && !customers) loadCustomers();
    if (t === 'exceptions' && !exceptions) loadExceptions();
    if (t === 'daily' && !dailyReport) loadDailyReport();
  };

  const fmt = (n) => n != null ? n.toLocaleString() : '0';
  const fmtMoney = (n) => n != null ? '$' + Math.round(n).toLocaleString() : '$0';

  return (
    <div>
      <h2 style={S.title}>ANALYTICS & KPI REPORTING</h2>
      <p style={S.subtitle}>Operational intelligence, management visibility, and performance scorecards</p>

      <div style={S.controls}>
        <div style={S.tabs}>
          {[{k:'overview',l:'Overview'},{k:'customers',l:'Customer P&L'},{k:'exceptions',l:'Exceptions'},{k:'daily',l:'Daily Report'}].map(t => (
            <button key={t.k} onClick={() => handleTabChange(t.k)} style={{...S.tab, ...(tab === t.k ? S.tabActive : {})}}>{t.l}</button>
          ))}
        </div>
        <div style={S.dateRange}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={S.dateInput} />
          <span style={{color: '#8B949E'}}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={S.dateInput} />
          <button onClick={loadDashboard} style={S.refreshBtn}>Refresh</button>
        </div>
      </div>

      {tab === 'overview' && dashboard && (
        <>
          <div style={S.kpiRow}>
            {[
              { label: 'Total Loads', value: fmt(dashboard.kpis.total_loads), color: '#0EA5E9' },
              { label: 'Revenue', value: fmtMoney(dashboard.kpis.total_revenue), color: '#22C55E' },
              { label: 'Total Margin', value: fmtMoney(dashboard.kpis.total_margin), color: '#A855F7' },
              { label: 'Margin %', value: dashboard.kpis.avg_margin_pct + '%', color: '#F59E0B' },
              { label: 'Total Miles', value: fmt(dashboard.kpis.total_miles), color: '#8B949E' },
              { label: 'Avg Rev/Load', value: fmtMoney(dashboard.kpis.avg_revenue_per_load), color: '#0EA5E9' },
            ].map((kpi, i) => (
              <div key={i} style={S.kpiCard}>
                <div style={S.kpiLabel}>{kpi.label}</div>
                <div style={{...S.kpiValue, color: kpi.color}}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div style={S.grid2}>
            <div style={S.card}>
              <h3 style={S.cardTitle}>Load Status Breakdown</h3>
              {Object.entries(dashboard.load_status || {}).map(([status, count]) => (
                <div key={status} style={S.barRow}>
                  <span style={S.barLabel}>{status}</span>
                  <div style={S.barTrack}><div style={{...S.barFill, width: `${Math.min(100, (count / Math.max(1, dashboard.kpis.total_loads)) * 100)}%`}} /></div>
                  <span style={S.barValue}>{count}</span>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <h3 style={S.cardTitle}>Carriers & Customers</h3>
              <div style={S.statGrid}>
                <div style={S.statItem}><div style={S.statLabel}>Total Carriers</div><div style={S.statValue}>{dashboard.carriers.total}</div></div>
                <div style={S.statItem}><div style={S.statLabel}>Active Carriers</div><div style={{...S.statValue, color: '#22C55E'}}>{dashboard.carriers.active}</div></div>
                <div style={S.statItem}><div style={S.statLabel}>Total Customers</div><div style={S.statValue}>{dashboard.customers.total}</div></div>
                <div style={S.statItem}><div style={S.statLabel}>Active Customers</div><div style={{...S.statValue, color: '#22C55E'}}>{dashboard.customers.active}</div></div>
              </div>
            </div>
          </div>

          <div style={S.grid2}>
            <div style={S.card}>
              <h3 style={S.cardTitle}>Top Lanes</h3>
              {dashboard.top_lanes?.length > 0 ? (
                <table style={S.table}><thead><tr><th style={S.th}>Lane</th><th style={S.th}>Loads</th><th style={S.th}>Margin</th><th style={S.th}>Revenue</th></tr></thead>
                  <tbody>{dashboard.top_lanes.map((l, i) => (
                    <tr key={i}><td style={S.td}>{l.lane}</td><td style={S.td}>{l.loads}</td><td style={S.td}>{l.avg_margin}</td><td style={S.td}>{fmtMoney(l.revenue)}</td></tr>
                  ))}</tbody></table>
              ) : <div style={{color: '#8B949E', textAlign: 'center', padding: 20}}>No lane data yet. Upload load history to see top lanes.</div>}
            </div>

            <div style={S.card}>
              <h3 style={S.cardTitle}>Call Activity</h3>
              {dashboard.calls?.length > 0 ? dashboard.calls.map((c, i) => (
                <div key={i} style={S.callRow}>
                  <span style={{...S.callDir, color: c.direction === 'outbound' ? '#0EA5E9' : '#22C55E'}}>{c.direction.toUpperCase()}</span>
                  <span>{c.total} calls</span>
                  <span>{c.accepted} accepted</span>
                  <span>{c.booked} booked</span>
                  <span>{c.avg_duration_sec}s avg</span>
                </div>
              )) : <div style={{color: '#8B949E', textAlign: 'center', padding: 20}}>No call data yet</div>}

              <div style={{marginTop: 16, borderTop: '1px solid #21262D', paddingTop: 12}}>
                <h4 style={{fontSize: 14, color: '#8B949E', marginBottom: 8}}>Data Ingestion</h4>
                <div style={S.statGrid}>
                  <div style={S.statItem}><div style={S.statLabel}>Uploads</div><div style={S.statValue}>{dashboard.data_ingestion.uploads}</div></div>
                  <div style={S.statItem}><div style={S.statLabel}>Rows</div><div style={S.statValue}>{fmt(dashboard.data_ingestion.rows_imported)}</div></div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'customers' && customers && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Customer Profitability (Last 90 Days)</h3>
          <table style={S.table}><thead><tr>
            <th style={S.th}>Customer</th><th style={S.th}>Loads</th><th style={S.th}>Revenue</th>
            <th style={S.th}>Margin</th><th style={S.th}>Margin %</th><th style={S.th}>Miles</th>
          </tr></thead>
            <tbody>{customers.customers.map((c, i) => (
              <tr key={i}><td style={S.td}>{c.name}</td><td style={S.td}>{c.loads}</td><td style={S.td}>{fmtMoney(c.revenue)}</td>
                <td style={S.td}>{fmtMoney(c.margin)}</td><td style={S.td}>{c.avg_margin_pct}%</td><td style={S.td}>{fmt(c.total_miles)}</td></tr>
            ))}</tbody></table>
        </div>
      )}

      {tab === 'exceptions' && exceptions && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Exceptions & Issues (Last {exceptions.period_days} Days)</h3>
          <div style={S.statGrid}>
            <div style={S.statItem}><div style={S.statLabel}>Delays</div><div style={{...S.statValue, color: '#F59E0B'}}>{exceptions.delays?.count || 0}</div></div>
            <div style={S.statItem}><div style={S.statLabel}>Exceptions</div><div style={{...S.statValue, color: '#EF4444'}}>{exceptions.exceptions?.count || 0}</div></div>
            <div style={S.statItem}><div style={S.statLabel}>Cancelled</div><div style={{...S.statValue, color: '#8B949E'}}>{exceptions.cancelled_loads}</div></div>
          </div>
        </div>
      )}

      {tab === 'daily' && dailyReport && (
        <div style={S.card}>
          <h3 style={S.cardTitle}>Daily Report: {dailyReport.date}</h3>
          <div style={S.kpiRow}>
            {Object.entries(dailyReport.summary).map(([k, v]) => (
              <div key={k} style={S.kpiCard}>
                <div style={S.kpiLabel}>{k.replace(/_/g, ' ')}</div>
                <div style={S.kpiValue}>{typeof v === 'number' && k.includes('revenue') || k.includes('margin') ? fmtMoney(v) : fmt(v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div style={{textAlign: 'center', padding: 40, color: '#8B949E'}}>Loading analytics...</div>}
    </div>
  );
}

const S = {
  title: { fontSize: 28, color: '#E6EDF3', marginBottom: 4 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 24 },
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  tabs: { display: 'flex', gap: 8 },
  tab: { padding: '8px 16px', background: '#161B22', border: '1px solid #21262D', color: '#8B949E', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  tabActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  dateRange: { display: 'flex', gap: 8, alignItems: 'center' },
  dateInput: { padding: '6px 10px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  refreshBtn: { padding: '6px 14px', background: '#0EA5E9', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, cursor: 'pointer' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 },
  kpiCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 16, textAlign: 'center' },
  kpiLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  kpiValue: { fontSize: 26, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 16 },
  barRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  barLabel: { width: 80, fontSize: 12, color: '#8B949E', textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 8, background: '#0D1117', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: '#0EA5E9', borderRadius: 4, transition: 'width 0.5s' },
  barValue: { width: 40, fontSize: 13, color: '#E6EDF3', textAlign: 'right', fontWeight: 600 },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  statItem: { background: '#0D1117', borderRadius: 8, padding: 14, textAlign: 'center' },
  statLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 22, fontWeight: 700, color: '#E6EDF3', fontFamily: "'Bebas Neue',sans-serif", marginTop: 4 },
  callRow: { display: 'flex', gap: 16, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #21262D', fontSize: 13, color: '#E6EDF3' },
  callDir: { fontWeight: 700, fontSize: 11, letterSpacing: 1 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 10, color: '#8B949E', textTransform: 'uppercase' },
  td: { padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 13, color: '#E6EDF3' },
};
