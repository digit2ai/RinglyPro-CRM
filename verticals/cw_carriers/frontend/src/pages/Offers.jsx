import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loadFilter, setLoadFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ load_id: '', carrier_name: '', mc_number: '', phone: '', rate_offered: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [counterModal, setCounterModal] = useState(null);
  const [counterRate, setCounterRate] = useState('');

  const fetchOffers = () => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    api.get('/offers', { params }).then(r => { setOffers(r.data.data || []); setLoading(false); }).catch(() => setLoading(false));
    api.get('/offers/stats').then(r => setStats(r.data.data)).catch(() => {});
  };

  useEffect(fetchOffers, [statusFilter]);

  const createOffer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/offers', {
        ...form,
        load_id: parseInt(form.load_id),
        rate_offered: parseFloat(form.rate_offered)
      });
      setShowCreate(false);
      setForm({ load_id: '', carrier_name: '', mc_number: '', phone: '', rate_offered: '', notes: '' });
      fetchOffers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating offer');
    }
  };

  const acceptOffer = async (id) => {
    try {
      await api.put(`/offers/${id}/accept`);
      fetchOffers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error accepting offer');
    }
  };

  const declineOffer = async (id) => {
    try {
      await api.put(`/offers/${id}/decline`);
      fetchOffers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    }
  };

  const submitCounter = async () => {
    if (!counterModal || !counterRate) return;
    try {
      await api.put(`/offers/${counterModal}/counter`, { counter_rate: parseFloat(counterRate) });
      setCounterModal(null);
      setCounterRate('');
      fetchOffers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    }
  };

  const statusColors = { pending: '#C8962A', accepted: '#238636', declined: '#F85149', countered: '#1A4FA8', expired: '#484F58' };

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>CARRIER OFFERS</h2>
        <button onClick={() => setShowCreate(true)} style={s.createBtn}>+ Log Offer</button>
      </div>

      {stats && (
        <div style={s.statsRow}>
          <div style={s.statCard}><div style={s.statNum}>{stats.total_offers || 0}</div><div style={s.statLabel}>Total Offers</div></div>
          <div style={s.statCard}><div style={{ ...s.statNum, color: '#C8962A' }}>{stats.pending_offers || 0}</div><div style={s.statLabel}>Pending</div></div>
          <div style={s.statCard}><div style={{ ...s.statNum, color: '#238636' }}>{stats.accepted_offers || 0}</div><div style={s.statLabel}>Accepted</div></div>
          <div style={s.statCard}><div style={{ ...s.statNum, color: '#1A4FA8' }}>${stats.avg_rate ? parseFloat(stats.avg_rate).toLocaleString() : '0'}</div><div style={s.statLabel}>Avg Rate</div></div>
        </div>
      )}

      <div style={s.filters}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.select}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="countered">Countered</option>
        </select>
      </div>

      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalContent}>
            <h3 style={s.modalTitle}>LOG CARRIER OFFER</h3>
            <form onSubmit={createOffer} style={s.form}>
              <input placeholder="Load ID" type="number" value={form.load_id} onChange={e => setForm({ ...form, load_id: e.target.value })} style={s.input} required />
              <input placeholder="Carrier Name" value={form.carrier_name} onChange={e => setForm({ ...form, carrier_name: e.target.value })} style={s.input} required />
              <div style={s.row}>
                <input placeholder="MC Number" value={form.mc_number} onChange={e => setForm({ ...form, mc_number: e.target.value })} style={s.input} />
                <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={s.input} />
              </div>
              <input placeholder="Rate Offered ($)" type="number" step="0.01" value={form.rate_offered} onChange={e => setForm({ ...form, rate_offered: e.target.value })} style={s.input} required />
              <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...s.input, minHeight: 60 }} />
              <div style={s.row}>
                <button type="submit" style={s.createBtn}>Log Offer</button>
                <button type="button" onClick={() => setShowCreate(false)} style={s.cancelBtn}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {counterModal && (
        <div style={s.modal}>
          <div style={s.modalContent}>
            <h3 style={s.modalTitle}>COUNTER OFFER</h3>
            <div style={s.form}>
              <input placeholder="Your Counter Rate ($)" type="number" step="0.01" value={counterRate} onChange={e => setCounterRate(e.target.value)} style={s.input} />
              <div style={s.row}>
                <button onClick={submitCounter} style={s.createBtn}>Send Counter</button>
                <button onClick={() => { setCounterModal(null); setCounterRate(''); }} style={s.cancelBtn}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Load</th>
              <th style={s.th}>Carrier</th>
              <th style={s.th}>MC#</th>
              <th style={s.th}>Phone</th>
              <th style={s.th}>Rate Offered</th>
              <th style={s.th}>Counter</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Date</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9} style={s.empty}>Loading...</td></tr> :
             offers.length === 0 ? <tr><td colSpan={9} style={s.empty}>No offers found</td></tr> :
             offers.map(o => (
              <tr key={o.id}>
                <td style={s.td}>#{o.load_id}{o.load_ref ? ` (${o.load_ref})` : ''}</td>
                <td style={s.td}>{o.carrier_name || '—'}</td>
                <td style={s.td}>{o.mc_number || '—'}</td>
                <td style={s.td}>{o.phone || '—'}</td>
                <td style={s.td}>${parseFloat(o.rate_offered).toLocaleString()}</td>
                <td style={s.td}>{o.counter_rate ? `$${parseFloat(o.counter_rate).toLocaleString()}` : '—'}</td>
                <td style={s.td}><span style={{ ...s.badge, background: statusColors[o.status] || '#21262D' }}>{o.status}</span></td>
                <td style={s.td}>{new Date(o.created_at).toLocaleDateString()}</td>
                <td style={s.td}>
                  <div style={s.actions}>
                    {o.status === 'pending' && <>
                      <button onClick={() => acceptOffer(o.id)} style={{ ...s.actionBtn, borderColor: '#238636' }} title="Accept">Accept</button>
                      <button onClick={() => { setCounterModal(o.id); setCounterRate(''); }} style={{ ...s.actionBtn, borderColor: '#1A4FA8' }} title="Counter">Counter</button>
                      <button onClick={() => declineOffer(o.id)} style={{ ...s.actionBtn, borderColor: '#F85149' }} title="Decline">Decline</button>
                    </>}
                    {o.status === 'countered' && <>
                      <button onClick={() => acceptOffer(o.id)} style={{ ...s.actionBtn, borderColor: '#238636' }} title="Accept">Accept</button>
                      <button onClick={() => declineOffer(o.id)} style={{ ...s.actionBtn, borderColor: '#F85149' }} title="Decline">Decline</button>
                    </>}
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 28, color: '#C8962A' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 },
  statCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 16, textAlign: 'center' },
  statNum: { fontSize: 24, fontWeight: 700, color: '#E6EDF3' },
  statLabel: { fontSize: 11, color: '#8B949E', marginTop: 4, textTransform: 'uppercase' },
  filters: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  select: { padding: '8px 12px', background: '#161B22', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  input: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, width: '100%' },
  createBtn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  tableWrap: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, overflow: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#0D1117' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#fff', textTransform: 'uppercase' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' },
  actions: { display: 'flex', gap: 4 },
  actionBtn: { background: 'none', border: '1px solid #30363D', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', fontSize: 11, color: '#E6EDF3' },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalContent: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 28, width: 480, maxWidth: '92vw' },
  modalTitle: { fontSize: 20, color: '#C8962A', marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' }
};
