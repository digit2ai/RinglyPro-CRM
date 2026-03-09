import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function TMS() {
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [simForm, setSimForm] = useState({ event_type: 'load_status_change', load_ref: '', status: 'picked_up' });
  const [showSim, setShowSim] = useState(false);

  const fetchData = () => {
    Promise.all([
      api.get('/tms/events?limit=30').catch(() => ({ data: { data: [] } })),
      api.get('/tms/config').catch(() => ({ data: { data: {} } }))
    ]).then(([evRes, cfgRes]) => {
      setEvents(evRes.data.data || []);
      setConfig(cfgRes.data.data || {});
      setLoading(false);
    });
  };

  useEffect(fetchData, []);

  const pullLoads = async () => {
    setPulling(true);
    try {
      const res = await api.post('/tms/pull');
      alert(res.data.message || 'Pull complete');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Pull failed');
    }
    setPulling(false);
  };

  const simulate = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/tms/simulate', simForm);
      alert(res.data.message || 'Simulated');
      setShowSim(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Simulation error');
    }
  };

  const statusColors = { processed: '#238636', error: '#F85149', pending: '#C8962A' };
  const eventIcons = { load_status_change: '', new_load: '', load_update: '', carrier_assignment: '', eta_update: '' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8B949E' }}>Loading TMS...</div>;

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>McLEOD TMS BRIDGE</h2>
        <div style={s.btnRow}>
          <button onClick={pullLoads} disabled={pulling} style={s.btn}>{pulling ? 'Pulling...' : 'Pull Loads from TMS'}</button>
          <button onClick={() => setShowSim(!showSim)} style={s.btnOutline}>{showSim ? 'Cancel' : 'Simulate Event'}</button>
        </div>
      </div>

      <div style={s.statusRow}>
        <div style={s.statusCard}>
          <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase' }}>Connection</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: config.apiUrl ? '#238636' : '#C8962A' }}>
            {config.apiUrl ? 'CONFIGURED' : 'WEBHOOK ONLY'}
          </div>
        </div>
        <div style={s.statusCard}>
          <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase' }}>Auto-Call</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: config.autoCallOnMilestone ? '#238636' : '#F85149' }}>
            {config.autoCallOnMilestone !== false ? 'ENABLED' : 'DISABLED'}
          </div>
        </div>
        <div style={s.statusCard}>
          <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase' }}>HubSpot Sync</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: config.autoSyncToHubspot ? '#238636' : '#F85149' }}>
            {config.autoSyncToHubspot !== false ? 'ENABLED' : 'DISABLED'}
          </div>
        </div>
        <div style={s.statusCard}>
          <div style={{ fontSize: 12, color: '#8B949E', textTransform: 'uppercase' }}>Events Logged</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A4FA8' }}>{events.length}</div>
        </div>
      </div>

      {showSim && (
        <div style={s.simBox}>
          <h3 style={{ fontSize: 16, color: '#C8962A', marginBottom: 12 }}>SIMULATE TMS EVENT</h3>
          <form onSubmit={simulate} style={s.simForm}>
            <select value={simForm.event_type} onChange={e => setSimForm({ ...simForm, event_type: e.target.value })} style={s.input}>
              <option value="load_status_change">Load Status Change</option>
              <option value="new_load">New Load</option>
              <option value="carrier_assignment">Carrier Assignment</option>
              <option value="eta_update">ETA Update</option>
            </select>
            <input placeholder="Load Ref (e.g. CW-1001)" value={simForm.load_ref} onChange={e => setSimForm({ ...simForm, load_ref: e.target.value })} style={s.input} />
            {simForm.event_type === 'load_status_change' && (
              <select value={simForm.status} onChange={e => setSimForm({ ...simForm, status: e.target.value })} style={s.input}>
                <option value="picked_up">Picked Up</option>
                <option value="in_transit">In Transit</option>
                <option value="at_delivery">At Delivery</option>
                <option value="delivered">Delivered</option>
              </select>
            )}
            {simForm.event_type === 'new_load' && (
              <>
                <input placeholder="Origin" onChange={e => setSimForm({ ...simForm, origin: e.target.value })} style={s.input} />
                <input placeholder="Destination" onChange={e => setSimForm({ ...simForm, destination: e.target.value })} style={s.input} />
              </>
            )}
            <button type="submit" style={s.btn}>Send Event</button>
          </form>
        </div>
      )}

      <div style={s.section}>
        <h3 style={s.sectionTitle}>WEBHOOK URL</h3>
        <div style={s.webhookUrl}>
          <code style={{ color: '#58A6FF', fontSize: 13 }}>POST https://aiagent.ringlypro.com/cw_carriers/api/tms/webhook</code>
        </div>
        <div style={{ fontSize: 12, color: '#8B949E', marginTop: 8 }}>
          Set <code>X-Webhook-Secret</code> header for authentication. Configure in Settings &gt; TMS tab.
        </div>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>EVENT LOG</h3>
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Type</th>
                <th style={s.th}>Event</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Payload</th>
                <th style={s.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={5} style={s.empty}>No TMS events yet</td></tr>
              ) : events.map(ev => (
                <tr key={ev.id}>
                  <td style={s.td}>{ev.event_type}</td>
                  <td style={s.td}><span style={s.badge}>{ev.event_type}</span></td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: statusColors[ev.status] || '#21262D', color: '#fff' }}>{ev.status}</span>
                  </td>
                  <td style={s.td}>
                    <span style={{ fontSize: 11, color: '#8B949E', maxWidth: 200, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof ev.payload === 'string' ? ev.payload.substring(0, 60) : JSON.stringify(ev.payload).substring(0, 60)}...
                    </span>
                  </td>
                  <td style={s.td}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 28, color: '#C8962A' },
  btnRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnOutline: { padding: '8px 16px', background: 'none', color: '#8B949E', border: '1px solid #30363D', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  statusRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 },
  statusCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: '14px 16px', textAlign: 'center' },
  simBox: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 20, marginBottom: 20 },
  simForm: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, minWidth: 140 },
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 12 },
  webhookUrl: { background: '#0D1117', padding: '12px 16px', borderRadius: 6, border: '1px solid #30363D' },
  tableWrap: { overflow: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#21262D', color: '#8B949E', textTransform: 'uppercase' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' }
};
