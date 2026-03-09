import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function CheckCalls() {
  const [checkCalls, setCheckCalls] = useState([]);
  const [dueCalls, setDueCalls] = useState([]);
  const [activeTab, setActiveTab] = useState('due');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ load_id: '', driver_phone: '', current_location: '', eta: '', status_update: '', notes: '' });
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get('/checkcalls').then(r => setCheckCalls(r.data.data || [])),
      api.get('/checkcalls/due').then(r => setDueCalls(r.data.data || []))
    ]).then(() => setLoading(false)).catch(() => setLoading(false));
  };

  useEffect(fetchData, []);

  const createCheckCall = async (e) => {
    e.preventDefault();
    try {
      await api.post('/checkcalls', {
        ...form,
        load_id: parseInt(form.load_id)
      });
      setShowCreate(false);
      setForm({ load_id: '', driver_phone: '', current_location: '', eta: '', status_update: '', notes: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error logging check call');
    }
  };

  const autoCall = async (loadId, driverPhone) => {
    try {
      const res = await api.post('/checkcalls/auto-call', { load_id: loadId, driver_phone: driverPhone });
      alert(res.data.message || 'Rachel is calling the driver');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error initiating call');
    }
  };

  const notifyShipper = async (loadId) => {
    try {
      const res = await api.post('/checkcalls/notify-shipper', { load_id: loadId });
      alert(res.data.message || 'Shipper notified');
    } catch (err) {
      alert(err.response?.data?.error || 'Error notifying shipper');
    }
  };

  const statusIcons = { on_time: '\u2705', delayed: '\u26A0\uFE0F', issue: '\u274C', at_pickup: '\uD83D\uDCCD', at_delivery: '\uD83C\uDFC1', unknown: '\u2753' };

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>CHECK CALLS & TRACKING</h2>
        <button onClick={() => setShowCreate(true)} style={s.createBtn}>+ Log Check Call</button>
      </div>

      <div style={s.tabBar}>
        <button onClick={() => setActiveTab('due')} style={{ ...s.tab, ...(activeTab === 'due' ? s.tabActive : {}) }}>
          Due Now ({dueCalls.length})
        </button>
        <button onClick={() => setActiveTab('history')} style={{ ...s.tab, ...(activeTab === 'history' ? s.tabActive : {}) }}>
          History ({checkCalls.length})
        </button>
      </div>

      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalContent}>
            <h3 style={s.modalTitle}>LOG CHECK CALL</h3>
            <form onSubmit={createCheckCall} style={s.form}>
              <input placeholder="Load ID" type="number" value={form.load_id} onChange={e => setForm({ ...form, load_id: e.target.value })} style={s.input} required />
              <input placeholder="Driver Phone" value={form.driver_phone} onChange={e => setForm({ ...form, driver_phone: e.target.value })} style={s.input} />
              <input placeholder="Current Location (e.g. Dallas, TX)" value={form.current_location} onChange={e => setForm({ ...form, current_location: e.target.value })} style={s.input} />
              <input placeholder="ETA" type="datetime-local" value={form.eta} onChange={e => setForm({ ...form, eta: e.target.value })} style={s.input} />
              <select value={form.status_update} onChange={e => setForm({ ...form, status_update: e.target.value })} style={s.select}>
                <option value="">Status...</option>
                <option value="on_time">On Time</option>
                <option value="delayed">Delayed</option>
                <option value="at_pickup">At Pickup</option>
                <option value="at_delivery">At Delivery</option>
                <option value="issue">Issue</option>
              </select>
              <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...s.input, minHeight: 60 }} />
              <div style={s.row}>
                <button type="submit" style={s.createBtn}>Log Check Call</button>
                <button type="button" onClick={() => setShowCreate(false)} style={s.cancelBtn}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'due' && (
        <div>
          {loading ? <div style={s.empty}>Loading...</div> :
           dueCalls.length === 0 ? <div style={s.emptyCard}>No loads due for check calls right now.</div> :
           dueCalls.map(load => (
            <div key={load.id} style={s.dueCard}>
              <div style={s.dueHeader}>
                <span style={s.dueRef}>Load #{load.load_ref || load.id}</span>
                <span style={s.dueLane}>{load.origin} \u2192 {load.destination}</span>
              </div>
              <div style={s.dueDetails}>
                <span>Carrier: {load.carrier_name || 'Unassigned'}</span>
                <span>Pickup: {load.pickup_date || '—'}</span>
                <span>Delivery: {load.delivery_date || '—'}</span>
                <span>Last check: {load.last_check_call ? new Date(load.last_check_call).toLocaleString() : 'Never'}</span>
              </div>
              <div style={s.dueActions}>
                <button onClick={() => autoCall(load.id, load.driver_phone)} style={s.callBtn}>
                  Rachel Auto-Call Driver
                </button>
                <button onClick={() => { setForm({ ...form, load_id: String(load.id) }); setShowCreate(true); }} style={s.logBtn}>
                  Manual Log
                </button>
                <button onClick={() => notifyShipper(load.id)} style={s.notifyBtn}>
                  Notify Shipper
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'history' && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Load</th>
                <th style={s.th}>Location</th>
                <th style={s.th}>ETA</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Called By</th>
                <th style={s.th}>Notes</th>
                <th style={s.th}>Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={s.empty}>Loading...</td></tr> :
               checkCalls.length === 0 ? <tr><td colSpan={7} style={s.empty}>No check calls logged yet</td></tr> :
               checkCalls.map(cc => (
                <tr key={cc.id}>
                  <td style={s.td}>#{cc.load_id}</td>
                  <td style={s.td}>{cc.current_location || '—'}</td>
                  <td style={s.td}>{cc.eta ? new Date(cc.eta).toLocaleString() : '—'}</td>
                  <td style={s.td}>{statusIcons[cc.status_update] || ''} {cc.status_update || '—'}</td>
                  <td style={s.td}>{cc.called_by || '—'}</td>
                  <td style={s.td}>{cc.notes || '—'}</td>
                  <td style={s.td}>{new Date(cc.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 28, color: '#C8962A' },
  tabBar: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: { padding: '8px 16px', background: '#21262D', border: 'none', borderRadius: 6, color: '#8B949E', fontSize: 13, cursor: 'pointer' },
  tabActive: { background: '#1A4FA8', color: '#fff' },
  createBtn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  dueCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 16, marginBottom: 12 },
  dueHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 },
  dueRef: { fontSize: 16, fontWeight: 700, color: '#E6EDF3' },
  dueLane: { fontSize: 14, color: '#C8962A', fontWeight: 600 },
  dueDetails: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#8B949E', marginBottom: 12 },
  dueActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  callBtn: { padding: '6px 14px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  logBtn: { padding: '6px 14px', background: '#21262D', color: '#E6EDF3', border: '1px solid #30363D', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  notifyBtn: { padding: '6px 14px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  emptyCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 40, textAlign: 'center', color: '#484F58' },
  tableWrap: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, overflow: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#0D1117' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' },
  select: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  input: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, width: '100%' },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalContent: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 28, width: 480, maxWidth: '92vw' },
  modalTitle: { fontSize: 20, color: '#C8962A', marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' }
};
