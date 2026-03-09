import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function HubSpot() {
  const [syncQueue, setSyncQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');

  const fetchQueue = () => {
    api.get('/hubspot/sync-queue').then(r => { setSyncQueue(r.data.data || []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(fetchQueue, []);

  const syncAllContacts = async () => {
    setSyncing('contacts');
    try {
      const res = await api.post('/hubspot/sync-all/contacts');
      alert(res.data.message);
      fetchQueue();
    } catch (err) {
      alert('Error syncing contacts');
    }
    setSyncing('');
  };

  const syncAllDeals = async () => {
    setSyncing('deals');
    try {
      const res = await api.post('/hubspot/sync-all/deals');
      alert(res.data.message);
      fetchQueue();
    } catch (err) {
      alert('Error syncing deals');
    }
    setSyncing('');
  };

  const retryItem = async (id) => {
    try {
      const res = await api.post(`/hubspot/retry/${id}`);
      alert(res.data.success ? 'Retry successful!' : `Error: ${res.data.error}`);
      fetchQueue();
    } catch (err) {
      alert('Retry failed');
    }
  };

  const pending = syncQueue.filter(i => i.status === 'pending');
  const success = syncQueue.filter(i => i.status === 'success');
  const errors = syncQueue.filter(i => i.status === 'error');

  const statusColors = { pending: '#C8962A', success: '#238636', error: '#F85149' };

  return (
    <div>
      <h2 style={s.title}>HUBSPOT SYNC</h2>

      <div style={s.statusRow}>
        <div style={s.statusCard}>
          <div style={{ color: '#238636', fontSize: 12 }}>CONNECTION</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: process.env.HUBSPOT_ACCESS_TOKEN ? '#238636' : '#F85149' }}>
            {process.env.HUBSPOT_ACCESS_TOKEN ? 'CONNECTED' : 'CONFIGURED'}
          </div>
        </div>
        <div style={s.statusCard}>
          <div style={{ color: '#C8962A', fontSize: 12 }}>PENDING</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#C8962A' }}>{pending.length}</div>
        </div>
        <div style={s.statusCard}>
          <div style={{ color: '#238636', fontSize: 12 }}>SUCCESS</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#238636' }}>{success.length}</div>
        </div>
        <div style={s.statusCard}>
          <div style={{ color: '#F85149', fontSize: 12 }}>ERRORS</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#F85149' }}>{errors.length}</div>
        </div>
      </div>

      <div style={s.actionRow}>
        <button onClick={syncAllContacts} disabled={!!syncing} style={s.syncBtn}>
          {syncing === 'contacts' ? 'Syncing...' : 'Sync All Contacts'}
        </button>
        <button onClick={syncAllDeals} disabled={!!syncing} style={s.syncBtn}>
          {syncing === 'deals' ? 'Syncing...' : 'Sync All Deals'}
        </button>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>SYNC LOG</h3>
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Type</th>
                <th style={s.th}>Action</th>
                <th style={s.th}>Object ID</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Error</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Retry</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={s.empty}>Loading...</td></tr> :
               syncQueue.length === 0 ? <tr><td colSpan={7} style={s.empty}>No sync records</td></tr> :
               syncQueue.map(item => (
                <tr key={item.id}>
                  <td style={s.td}>{item.object_type}</td>
                  <td style={s.td}>{item.action}</td>
                  <td style={s.td}>{item.object_id || '—'}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: statusColors[item.status] || '#21262D', color: '#fff' }}>{item.status}</span>
                  </td>
                  <td style={s.td}>{item.error_msg ? <span style={{ color: '#F85149', fontSize: 12 }}>{item.error_msg.substring(0, 50)}</span> : '—'}</td>
                  <td style={s.td}>{item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</td>
                  <td style={s.td}>
                    {item.status === 'error' && <button onClick={() => retryItem(item.id)} style={s.retryBtn}>Retry</button>}
                  </td>
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
  title: { fontSize: 28, color: '#C8962A', marginBottom: 16 },
  statusRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 },
  statusCard: { background: '#161B22', border: '1px solid #21262D', borderRadius: 8, padding: '14px 16px', textAlign: 'center' },
  actionRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  syncBtn: { padding: '10px 20px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 20 },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 12 },
  tableWrap: { maxHeight: 500, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', position: 'sticky', top: 0, background: '#161B22' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, textTransform: 'uppercase' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' },
  retryBtn: { padding: '4px 10px', background: '#C8962A', color: '#000', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }
};
