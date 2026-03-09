import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ contact_type: 'shipper', company_name: '', full_name: '', email: '', phone: '', mc_number: '', dot_number: '', title: '' });
  const [loading, setLoading] = useState(true);

  const fetchContacts = () => {
    const params = {};
    if (tab) params.type = tab;
    if (search) params.search = search;
    api.get('/contacts', { params }).then(r => { setContacts(r.data.data || []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(fetchContacts, [tab, search]);

  const createContact = async (e) => {
    e.preventDefault();
    try {
      await api.post('/contacts', form);
      setShowCreate(false);
      setForm({ contact_type: 'shipper', company_name: '', full_name: '', email: '', phone: '', mc_number: '', dot_number: '', title: '' });
      fetchContacts();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    }
  };

  const syncToHubSpot = async (id) => {
    try {
      const res = await api.post('/hubspot/sync/contact', { contact_id: id });
      alert(res.data.success ? 'Synced to HubSpot!' : `Error: ${res.data.error}`);
      fetchContacts();
    } catch (err) {
      alert('Sync error');
    }
  };

  const callContact = async (id) => {
    try {
      await api.post('/calls/outbound', { contact_id: id, call_type: 'lead_qualification' });
      alert('Call initiated!');
    } catch (err) {
      alert(err.response?.data?.error || 'Call error');
    }
  };

  const tabs = [
    { value: '', label: 'All' },
    { value: 'shipper', label: 'Shippers' },
    { value: 'carrier', label: 'Carriers' },
    { value: 'prospect', label: 'Prospects' },
    { value: 'driver', label: 'Drivers' }
  ];

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>CONTACTS</h2>
        <button onClick={() => setShowCreate(true)} style={s.createBtn}>+ New Contact</button>
      </div>

      <div style={s.tabBar}>
        {tabs.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)} style={{ ...s.tab, ...(tab === t.value ? s.tabActive : {}) }}>{t.label}</button>
        ))}
        <input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} style={s.searchInput} />
      </div>

      {showCreate && (
        <div style={s.modal}>
          <div style={s.modalContent}>
            <h3 style={s.modalTitle}>CREATE CONTACT</h3>
            <form onSubmit={createContact} style={s.form}>
              <select value={form.contact_type} onChange={e => setForm({ ...form, contact_type: e.target.value })} style={s.select}>
                <option value="shipper">Shipper</option>
                <option value="carrier">Carrier</option>
                <option value="prospect">Prospect</option>
                <option value="driver">Driver</option>
              </select>
              <input placeholder="Company Name" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} style={s.input} />
              <input placeholder="Full Name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} style={s.input} />
              <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={s.input} />
              <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={s.input} />
              <input placeholder="Title / Role" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={s.input} />
              <div style={s.row}>
                <input placeholder="MC Number" value={form.mc_number} onChange={e => setForm({ ...form, mc_number: e.target.value })} style={s.input} />
                <input placeholder="DOT Number" value={form.dot_number} onChange={e => setForm({ ...form, dot_number: e.target.value })} style={s.input} />
              </div>
              <div style={s.row}>
                <button type="submit" style={s.createBtn}>Create</button>
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
              <th style={s.th}>Company</th>
              <th style={s.th}>Name</th>
              <th style={s.th}>Type</th>
              <th style={s.th}>MC#</th>
              <th style={s.th}>Phone</th>
              <th style={s.th}>HubSpot</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={s.empty}>Loading...</td></tr> :
             contacts.length === 0 ? <tr><td colSpan={7} style={s.empty}>No contacts</td></tr> :
             contacts.map(c => (
              <tr key={c.id}>
                <td style={s.td}>{c.company_name || '—'}</td>
                <td style={s.td}>{c.full_name || '—'}</td>
                <td style={s.td}><span style={s.typeBadge}>{c.contact_type}</span></td>
                <td style={s.td}>{c.mc_number || '—'}</td>
                <td style={s.td}>{c.phone || '—'}</td>
                <td style={s.td}>{c.hubspot_id ? <span style={s.syncedBadge}>Synced</span> : <span style={s.unsyncedBadge}>Not synced</span>}</td>
                <td style={s.td}>
                  <div style={s.actions}>
                    {c.phone && <button onClick={() => callContact(c.id)} style={s.actionBtn} title="Call Now">📞</button>}
                    {!c.hubspot_id && <button onClick={() => syncToHubSpot(c.id)} style={s.actionBtn} title="Sync to HubSpot">🔄</button>}
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
  tabBar: { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  tab: { padding: '6px 14px', background: '#21262D', border: 'none', borderRadius: 6, color: '#8B949E', fontSize: 13, cursor: 'pointer' },
  tabActive: { background: '#1A4FA8', color: '#fff' },
  searchInput: { marginLeft: 'auto', padding: '6px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, width: '100%', maxWidth: 220, minWidth: 140 },
  createBtn: { padding: '8px 16px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '8px 16px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  tableWrap: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, overflow: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#0D1117' },
  td: { padding: '10px 12px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  typeBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#21262D', color: '#8B949E', textTransform: 'uppercase' },
  syncedBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#238636', color: '#fff' },
  unsyncedBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#484F58', color: '#8B949E' },
  empty: { padding: 40, textAlign: 'center', color: '#484F58' },
  actions: { display: 'flex', gap: 4 },
  actionBtn: { background: 'none', border: '1px solid #30363D', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 14 },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalContent: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 28, width: 450, maxWidth: '90vw' },
  modalTitle: { fontSize: 20, color: '#C8962A', marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  select: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  input: { padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' }
};
