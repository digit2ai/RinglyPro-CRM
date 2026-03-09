import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Loads() {
  const [loads, setLoads] = useState([]);
  const [filter, setFilter] = useState({ status: '', freight_type: '', origin: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ load_ref: '', origin: '', destination: '', freight_type: 'dry_van', weight_lbs: '', pickup_date: '', delivery_date: '', rate_usd: '', broker_notes: '' });
  const [loading, setLoading] = useState(true);

  const fetchLoads = () => {
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.freight_type) params.freight_type = filter.freight_type;
    if (filter.origin) params.origin = filter.origin;
    api.get('/loads', { params }).then(r => { setLoads(r.data.data || []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(fetchLoads, [filter]);

  const createLoad = async (e) => {
    e.preventDefault();
    try {
      await api.post('/loads', { ...form, weight_lbs: form.weight_lbs ? parseInt(form.weight_lbs) : null, rate_usd: form.rate_usd ? parseFloat(form.rate_usd) : null });
      setShowCreate(false);
      setForm({ load_ref: '', origin: '', destination: '', freight_type: 'dry_van', weight_lbs: '', pickup_date: '', delivery_date: '', rate_usd: '', broker_notes: '' });
      fetchLoads();
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating load');
    }
  };

  const updateStatus = async (id, status) => {
    await api.put(`/loads/${id}/status`, { status });
    fetchLoads();
  };

  const launchCoverage = async (loadId) => {
    try {
      const res = await api.post('/calls/carrier-coverage', { load_id: loadId });
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.error || 'Error launching coverage');
    }
  };

  const statusColors = { open: '#1A4FA8', covered: '#238636', in_transit: '#C8962A', delivered: '#39D353', cancelled: '#F85149' };

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>LOADS</h2>
        <button onClick={() => setShowCreate(true)} style={s.createBtn}>+ New Load</button>
      </div>

      <div style={s.filters}>
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} style={s.select}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="covered">Covered</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filter.freight_type} onChange={e => setFilter({ ...filter, freight_type: e.target.value })} style={s.select}>
          <option value="">All Freight Types</option>
          <option value="dry_van">Dry Van</option>
          <option value="reefer">Reefer</option>
          <option value="flatbed">Flatbed</option>
          <option value="ltl">LTL</option>
        </select>
        <input placeholder="Search origin..." value={filter.origin} onChange={e => setFilter({ ...filter, origin: e.target.value })} style={s.input} />
      </div>

      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalContent}>
            <h3 style={s.modalTitle}>CREATE NEW LOAD</h3>
            <form onSubmit={createLoad} style={s.form}>
              <input placeholder="Load Reference" value={form.load_ref} onChange={e => setForm({ ...form, load_ref: e.target.value })} style={s.input} />
              <div style={s.row}>
                <input placeholder="Origin" value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} style={s.input} required />
                <input placeholder="Destination" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} style={s.input} required />
              </div>
              <div style={s.row}>
                <select value={form.freight_type} onChange={e => setForm({ ...form, freight_type: e.target.value })} style={s.select}>
                  <option value="dry_van">Dry Van</option>
                  <option value="reefer">Reefer</option>
                  <option value="flatbed">Flatbed</option>
                  <option value="ltl">LTL</option>
                </select>
                <input placeholder="Weight (lbs)" type="number" value={form.weight_lbs} onChange={e => setForm({ ...form, weight_lbs: e.target.value })} style={s.input} />
              </div>
              <div style={s.row}>
                <input type="date" placeholder="Pickup" value={form.pickup_date} onChange={e => setForm({ ...form, pickup_date: e.target.value })} style={s.input} />
                <input type="date" placeholder="Delivery" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} style={s.input} />
              </div>
              <input placeholder="Rate (USD)" type="number" step="0.01" value={form.rate_usd} onChange={e => setForm({ ...form, rate_usd: e.target.value })} style={s.input} />
              <textarea placeholder="Broker Notes" value={form.broker_notes} onChange={e => setForm({ ...form, broker_notes: e.target.value })} style={{ ...s.input, minHeight: 60 }} />
              <div style={s.row}>
                <button type="submit" style={s.createBtn}>Create Load</button>
                <button type="button" onClick={() => setShowCreate(false)} style={s.cancelBtn}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Ref</th>
              <th style={s.th}>Origin → Destination</th>
              <th style={s.th}>Freight</th>
              <th style={s.th}>Rate</th>
              <th style={s.th}>Pickup</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Shipper</th>
              <th style={s.th}>Carrier</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9} style={s.empty}>Loading...</td></tr> :
             loads.length === 0 ? <tr><td colSpan={9} style={s.empty}>No loads found</td></tr> :
             loads.map(l => (
              <tr key={l.id}>
                <td style={s.td}>{l.load_ref || `#${l.id}`}</td>
                <td style={s.td}>{l.origin} → {l.destination}</td>
                <td style={s.td}>{l.freight_type}</td>
                <td style={s.td}>{l.rate_usd ? `$${parseFloat(l.rate_usd).toLocaleString()}` : '—'}</td>
                <td style={s.td}>{l.pickup_date || '—'}</td>
                <td style={s.td}><span style={{ ...s.badge, background: statusColors[l.status] || '#21262D', color: '#fff' }}>{l.status}</span></td>
                <td style={s.td}>{l.shipper_name || '—'}</td>
                <td style={s.td}>{l.carrier_name || '—'}</td>
                <td style={s.td}>
                  <div style={s.actions}>
                    {l.status === 'open' && <button onClick={() => launchCoverage(l.id)} style={s.actionBtn} title="Find Carriers">🔍</button>}
                    {l.status === 'open' && <button onClick={() => updateStatus(l.id, 'covered')} style={s.actionBtn} title="Mark Covered">✅</button>}
                    {l.status === 'covered' && <button onClick={() => updateStatus(l.id, 'in_transit')} style={s.actionBtn} title="In Transit">🚚</button>}
                    {l.status === 'in_transit' && <button onClick={() => updateStatus(l.id, 'delivered')} style={s.actionBtn} title="Delivered">📦</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, color: '#C8962A' },
  filters: { display: 'flex', gap: 12, marginBottom: 16 },
  select: { padding: '8px 12px', background: '#161B22', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  input: { padding: '8px 12px', background: '#161B22', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, flex: 1 },
  createBtn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  tableWrap: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#0D1117' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, textTransform: 'uppercase' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' },
  actions: { display: 'flex', gap: 4 },
  actionBtn: { background: 'none', border: '1px solid #30363D', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 14 },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalContent: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 28, width: 500, maxWidth: '90vw' },
  modalTitle: { fontSize: 20, color: '#C8962A', marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { display: 'flex', gap: 12 }
};
