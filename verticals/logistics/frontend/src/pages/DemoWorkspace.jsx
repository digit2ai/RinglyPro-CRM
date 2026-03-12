import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function DemoWorkspace() {
  const [tab, setTab] = useState('manage');
  const [workspaces, setWorkspaces] = useState([]);
  const [form, setForm] = useState({ company_name: '', contact_email: '', contact_name: '', lead_source: '', notes: '' });
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadWorkspaces(); }, []);

  const loadWorkspaces = async () => {
    try {
      const { data } = await api.get('/demo/workspaces');
      setWorkspaces(data.data.workspaces || []);
    } catch (err) { console.error(err); }
  };

  const createWorkspace = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/demo/workspace', form);
      setCreated(data.data);
      loadWorkspaces();
      setForm({ company_name: '', contact_email: '', contact_name: '', lead_source: '', notes: '' });
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const generateData = async (code) => {
    try {
      await api.post('/demo/generate', { access_code: code, sample_size: 50 });
      loadWorkspaces();
    } catch (err) { console.error(err); }
  };

  const statusColor = { active: '#22C55E', expired: '#EF4444', converted: '#A855F7', archived: '#8B949E' };

  return (
    <div>
      <h2 style={S.title}>DEMO WORKSPACES</h2>
      <p style={S.subtitle}>Create prospect-facing demo environments with uploaded or sample data</p>

      <div style={S.tabs}>
        {['manage','create'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{...S.tab, ...(tab === t ? S.tabActive : {})}}>{t === 'manage' ? 'Manage Demos' : 'Create New'}</button>
        ))}
      </div>

      {tab === 'create' && (
        <div style={S.grid}>
          <div style={S.card}>
            <h3 style={S.cardTitle}>New Demo Workspace</h3>
            <div style={S.formGrid}>
              <div><label style={S.label}>Company Name *</label><input style={S.input} placeholder="Acme Logistics" value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} /></div>
              <div><label style={S.label}>Contact Name</label><input style={S.input} placeholder="John Smith" value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
              <div><label style={S.label}>Contact Email</label><input style={S.input} placeholder="john@acme.com" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})} /></div>
              <div><label style={S.label}>Lead Source</label><input style={S.input} placeholder="Website, Referral, etc." value={form.lead_source} onChange={e => setForm({...form, lead_source: e.target.value})} /></div>
            </div>
            <div style={{marginBottom: 16}}>
              <label style={S.label}>Notes</label>
              <textarea style={{...S.input, height: 60, resize: 'vertical'}} placeholder="Any notes about the prospect..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
            <button onClick={createWorkspace} disabled={loading || !form.company_name} style={S.btn}>{loading ? 'Creating...' : 'Create Workspace'}</button>
          </div>

          {created && (
            <div style={S.card}>
              <h3 style={S.cardTitle}>Workspace Created!</h3>
              <div style={S.successBox}>
                <div style={S.successRow}><span style={S.label2}>Company</span><span style={S.val}>{created.company}</span></div>
                <div style={S.successRow}><span style={S.label2}>Access Code</span><span style={{...S.val, color: '#0EA5E9', fontWeight: 700, fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2}}>{created.access_code}</span></div>
                <div style={S.successRow}><span style={S.label2}>URL</span><span style={S.val}>{created.access_url}</span></div>
                <div style={S.successRow}><span style={S.label2}>Expires</span><span style={S.val}>{new Date(created.expires_at).toLocaleDateString()}</span></div>
              </div>
              <div style={S.instructions}>{created.instructions}</div>
              <div style={{marginTop: 12}}>
                <span style={S.label2}>Enabled Modules: </span>
                {created.modules?.map(m => <span key={m} style={S.modBadge}>{m}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'manage' && (
        <div style={S.card}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
            <h3 style={S.cardTitle}>All Demo Workspaces ({workspaces.length})</h3>
            <button onClick={loadWorkspaces} style={S.refreshBtn}>Refresh</button>
          </div>
          {workspaces.length === 0 ? (
            <div style={{textAlign: 'center', padding: 40, color: '#8B949E'}}>No demo workspaces yet. Create one to get started.</div>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Company</th><th style={S.th}>Code</th><th style={S.th}>Contact</th>
                <th style={S.th}>Status</th><th style={S.th}>Data</th><th style={S.th}>Uploads</th>
                <th style={S.th}>Last Active</th><th style={S.th}>Expires</th><th style={S.th}>Actions</th>
              </tr></thead>
              <tbody>
                {workspaces.map(ws => (
                  <tr key={ws.id}>
                    <td style={S.td}>{ws.company}</td>
                    <td style={S.td}><span style={S.codeBadge}>{ws.code}</span></td>
                    <td style={S.td}>{ws.contact || '-'}</td>
                    <td style={S.td}><span style={{color: statusColor[ws.status] || '#8B949E'}}>{ws.status}</span></td>
                    <td style={S.td}>{ws.has_data ? <span style={{color:'#22C55E'}}>Yes</span> : <span style={{color:'#8B949E'}}>No</span>}</td>
                    <td style={S.td}>{ws.uploads}</td>
                    <td style={S.td}>{ws.last_active ? new Date(ws.last_active).toLocaleDateString() : '-'}</td>
                    <td style={S.td}>{new Date(ws.expires).toLocaleDateString()}</td>
                    <td style={S.td}>
                      <button onClick={() => generateData(ws.code)} style={S.actBtn} title="Generate sample data">Generate Data</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const S = {
  title: { fontSize: 28, color: '#E6EDF3', marginBottom: 4 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 24 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: { padding: '8px 20px', background: '#161B22', border: '1px solid #21262D', color: '#8B949E', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  tabActive: { background: '#0EA5E922', borderColor: '#0EA5E9', color: '#0EA5E9' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: { background: '#161B22', border: '1px solid #21262D', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 16 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 },
  label: { display: 'block', fontSize: 11, color: '#8B949E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  label2: { fontSize: 11, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 14 },
  btn: { width: '100%', padding: '10px 20px', background: '#0EA5E9', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  refreshBtn: { padding: '6px 14px', background: '#30363D', border: 'none', borderRadius: 6, color: '#E6EDF3', fontSize: 12, cursor: 'pointer' },
  successBox: { background: '#0D1117', borderRadius: 8, padding: 16, marginBottom: 16 },
  successRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #21262D' },
  val: { fontSize: 14, color: '#E6EDF3' },
  instructions: { background: '#22C55E11', border: '1px solid #22C55E33', borderRadius: 8, padding: 12, fontSize: 13, color: '#22C55E' },
  modBadge: { display: 'inline-block', padding: '2px 8px', background: '#0EA5E922', color: '#0EA5E9', borderRadius: 4, fontSize: 10, fontWeight: 600, margin: '0 4px', textTransform: 'uppercase' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 10, color: '#8B949E', textTransform: 'uppercase' },
  td: { padding: '8px 10px', borderBottom: '1px solid #21262D', fontSize: 13, color: '#E6EDF3' },
  codeBadge: { padding: '2px 8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', color: '#0EA5E9' },
  actBtn: { padding: '4px 10px', background: '#0EA5E922', color: '#0EA5E9', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 },
};
