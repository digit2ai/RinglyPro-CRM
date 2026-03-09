import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Settings() {
  const [tab, setTab] = useState('hubspot');
  const [settings, setSettings] = useState({});
  const [webhooks, setWebhooks] = useState([]);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ name: '', url: '', method: 'POST', auth_type: 'none', auth_value: '', event_types: [] });

  // HubSpot settings form
  const [hsForm, setHsForm] = useState({
    hubspot_access_token: '',
    hubspot_portal_id: '',
    hubspot_pipeline_id: '',
    hubspot_deal_stage_open: 'appointmentscheduled',
    hubspot_deal_stage_covered: 'qualifiedtobuy',
    hubspot_deal_stage_delivered: 'closedwon',
    hubspot_auto_sync_contacts: 'true',
    hubspot_auto_sync_deals: 'true',
    hubspot_auto_log_calls: 'true'
  });

  useEffect(() => {
    Promise.all([
      api.get('/settings').catch(() => ({ data: { all: [] } })),
      api.get('/settings/webhooks').catch(() => ({ data: { data: [] } })),
      api.get('/settings/webhooks/logs').catch(() => ({ data: { data: [] } }))
    ]).then(([settingsRes, webhooksRes, logsRes]) => {
      const all = settingsRes.data.all || [];
      const mapped = {};
      all.forEach(s => { mapped[s.setting_key] = s.setting_value; });
      setSettings(mapped);
      setHsForm(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(k => { if (mapped[k]) updated[k] = mapped[k]; });
        return updated;
      });
      setWebhooks(webhooksRes.data.data || []);
      setWebhookLogs(logsRes.data.data || []);
      setLoading(false);
    });
  }, []);

  const saveHubSpot = async () => {
    setSaving(true);
    const settingsArr = Object.entries(hsForm).map(([key, value]) => ({
      key, value, type: key.includes('auto_') ? 'boolean' : 'string', category: 'hubspot'
    }));
    await api.put('/settings', { settings: settingsArr });
    setSaving(false);
    setTestResult({ success: true, message: 'Settings saved!' });
    setTimeout(() => setTestResult(null), 3000);
  };

  const testHubSpot = async () => {
    setTestResult(null);
    const res = await api.post('/settings/hubspot/test', { access_token: hsForm.hubspot_access_token });
    setTestResult(res.data);
  };

  const createWebhook = async (e) => {
    e.preventDefault();
    await api.post('/settings/webhooks', webhookForm);
    setShowAddWebhook(false);
    setWebhookForm({ name: '', url: '', method: 'POST', auth_type: 'none', auth_value: '', event_types: [] });
    const res = await api.get('/settings/webhooks');
    setWebhooks(res.data.data || []);
  };

  const testWebhook = async (id) => {
    const res = await api.post(`/settings/webhooks/${id}/test`);
    alert(res.data.success ? `Test sent! Status: ${res.data.status}` : `Failed: ${res.data.message}`);
    const wRes = await api.get('/settings/webhooks');
    setWebhooks(wRes.data.data || []);
  };

  const deleteWebhook = async (id) => {
    await api.delete(`/settings/webhooks/${id}`);
    setWebhooks(webhooks.filter(w => w.id !== id));
  };

  const toggleWebhook = async (id, active) => {
    await api.put(`/settings/webhooks/${id}`, { is_active: !active });
    const res = await api.get('/settings/webhooks');
    setWebhooks(res.data.data || []);
  };

  if (loading) return <div style={{ padding: 40, color: '#8B949E' }}>Loading settings...</div>;

  const inboundUrl = `${window.location.origin}/cw_carriers/api/settings/webhooks/inbound/{event}`;

  return (
    <div>
      <h2 style={s.title}>SETTINGS</h2>

      <div style={s.tabBar}>
        {[['hubspot', 'HubSpot API'], ['webhooks', 'Webhooks'], ['inbound', 'Inbound Webhook']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ ...s.tab, ...(tab === key ? s.tabActive : {}) }}>{label}</button>
        ))}
      </div>

      {/* ===== HUBSPOT TAB ===== */}
      {tab === 'hubspot' && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>HUBSPOT API CONFIGURATION</h3>
          <p style={s.desc}>Connect your HubSpot account to auto-sync contacts, deals, and call activities.</p>

          <div style={s.formGrid}>
            <div style={s.field}>
              <label style={s.label}>Access Token (Private App)</label>
              <input type="password" value={hsForm.hubspot_access_token} onChange={e => setHsForm({ ...hsForm, hubspot_access_token: e.target.value })} style={s.input} placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div style={s.field}>
              <label style={s.label}>Portal ID</label>
              <input value={hsForm.hubspot_portal_id} onChange={e => setHsForm({ ...hsForm, hubspot_portal_id: e.target.value })} style={s.input} placeholder="12345678" />
            </div>
            <div style={s.field}>
              <label style={s.label}>Deal Pipeline ID</label>
              <input value={hsForm.hubspot_pipeline_id} onChange={e => setHsForm({ ...hsForm, hubspot_pipeline_id: e.target.value })} style={s.input} placeholder="default" />
            </div>
          </div>

          <h4 style={{ ...s.sectionTitle, fontSize: 15, marginTop: 20 }}>DEAL STAGE MAPPING</h4>
          <div style={s.formGrid}>
            {[['hubspot_deal_stage_open', 'Open Load Stage'], ['hubspot_deal_stage_covered', 'Covered Stage'], ['hubspot_deal_stage_delivered', 'Delivered Stage']].map(([key, label]) => (
              <div key={key} style={s.field}>
                <label style={s.label}>{label}</label>
                <input value={hsForm[key]} onChange={e => setHsForm({ ...hsForm, [key]: e.target.value })} style={s.input} />
              </div>
            ))}
          </div>

          <h4 style={{ ...s.sectionTitle, fontSize: 15, marginTop: 20 }}>AUTO-SYNC OPTIONS</h4>
          <div style={s.toggleRow}>
            {[['hubspot_auto_sync_contacts', 'Auto-sync contacts'], ['hubspot_auto_sync_deals', 'Auto-sync deals/loads'], ['hubspot_auto_log_calls', 'Auto-log call activities']].map(([key, label]) => (
              <label key={key} style={s.toggleLabel}>
                <input type="checkbox" checked={hsForm[key] === 'true'} onChange={e => setHsForm({ ...hsForm, [key]: e.target.checked ? 'true' : 'false' })} />
                <span style={s.toggleText}>{label}</span>
              </label>
            ))}
          </div>

          <div style={s.btnRow}>
            <button onClick={testHubSpot} style={s.testBtn}>Test Connection</button>
            <button onClick={saveHubSpot} disabled={saving} style={s.saveBtn}>{saving ? 'Saving...' : 'Save Settings'}</button>
          </div>

          {testResult && (
            <div style={{ ...s.testResult, borderColor: testResult.success ? '#238636' : '#F85149' }}>
              <strong>{testResult.success ? 'Connected' : 'Failed'}:</strong> {testResult.message}
              {testResult.account && <span> | Contacts: {testResult.account.total_contacts}</span>}
            </div>
          )}
        </div>
      )}

      {/* ===== WEBHOOKS TAB ===== */}
      {tab === 'webhooks' && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h3 style={s.sectionTitle}>OUTBOUND WEBHOOKS</h3>
            <button onClick={() => setShowAddWebhook(true)} style={s.addBtn}>+ Add Webhook</button>
          </div>
          <p style={s.desc}>Send events from CW Carriers to your warehouse/WMS system when loads, contacts, or calls change.</p>

          {showAddWebhook && (
            <form onSubmit={createWebhook} style={s.webhookForm}>
              <input placeholder="Webhook Name (e.g. Warehouse WMS)" value={webhookForm.name} onChange={e => setWebhookForm({ ...webhookForm, name: e.target.value })} style={s.input} required />
              <input placeholder="URL (https://your-warehouse.com/api/webhook)" value={webhookForm.url} onChange={e => setWebhookForm({ ...webhookForm, url: e.target.value })} style={s.input} required />
              <div style={s.row}>
                <select value={webhookForm.method} onChange={e => setWebhookForm({ ...webhookForm, method: e.target.value })} style={s.select}>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
                <select value={webhookForm.auth_type} onChange={e => setWebhookForm({ ...webhookForm, auth_type: e.target.value })} style={s.select}>
                  <option value="none">No Auth</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key">API Key</option>
                </select>
                {webhookForm.auth_type !== 'none' && (
                  <input placeholder={webhookForm.auth_type === 'bearer' ? 'Bearer token...' : 'API key...'} type="password" value={webhookForm.auth_value} onChange={e => setWebhookForm({ ...webhookForm, auth_value: e.target.value })} style={s.input} />
                )}
              </div>
              <div style={s.row}>
                <button type="submit" style={s.saveBtn}>Create Webhook</button>
                <button type="button" onClick={() => setShowAddWebhook(false)} style={s.cancelBtn}>Cancel</button>
              </div>
            </form>
          )}

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>URL</th>
                <th style={s.th}>Method</th>
                <th style={s.th}>Auth</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Last Fired</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 ? <tr><td colSpan={7} style={s.empty}>No webhooks configured</td></tr> :
               webhooks.map(w => (
                <tr key={w.id}>
                  <td style={s.td}>{w.name}</td>
                  <td style={s.td}><span style={s.urlTrunc}>{w.url}</span></td>
                  <td style={s.td}>{w.method}</td>
                  <td style={s.td}><span style={s.badge}>{w.auth_type}</span></td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: w.is_active ? '#238636' : '#484F58', color: '#fff' }}>{w.is_active ? 'Active' : 'Off'}</span>
                    {w.last_status && <span style={{ ...s.badge, marginLeft: 4, background: w.last_status < 300 ? '#238636' : '#F85149', color: '#fff' }}>{w.last_status}</span>}
                  </td>
                  <td style={s.td}>{w.last_triggered_at ? new Date(w.last_triggered_at).toLocaleString() : '—'}</td>
                  <td style={s.td}>
                    <div style={s.actions}>
                      <button onClick={() => testWebhook(w.id)} style={s.actionBtn} title="Send test">Test</button>
                      <button onClick={() => toggleWebhook(w.id, w.is_active)} style={s.actionBtn}>{w.is_active ? 'Off' : 'On'}</button>
                      <button onClick={() => deleteWebhook(w.id)} style={{ ...s.actionBtn, color: '#F85149' }}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== INBOUND WEBHOOK TAB ===== */}
      {tab === 'inbound' && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>INBOUND WEBHOOK (WAREHOUSE → CW CARRIERS)</h3>
          <p style={s.desc}>Use this endpoint to push data from your warehouse/WMS system into CW Carriers CRM.</p>

          <div style={s.codeBlock}>
            <div style={s.codeLabel}>Webhook URL (use in your warehouse system):</div>
            <code style={s.code}>{inboundUrl}</code>
          </div>

          <div style={s.codeBlock}>
            <div style={s.codeLabel}>Event: <strong>new_load</strong> — Create a new load</div>
            <pre style={s.pre}>{`POST ${inboundUrl.replace('{event}', 'new_load')}
Content-Type: application/json

{
  "load_ref": "WH-12345",
  "origin": "Tampa, FL",
  "destination": "Chicago, IL",
  "freight_type": "dry_van",
  "weight_lbs": 35000,
  "rate_usd": 2800,
  "notes": "Priority shipment"
}`}</pre>
          </div>

          <div style={s.codeBlock}>
            <div style={s.codeLabel}>Event: <strong>load_update</strong> — Update existing load status</div>
            <pre style={s.pre}>{`POST ${inboundUrl.replace('{event}', 'load_update')}
Content-Type: application/json

{
  "load_ref": "WH-12345",
  "status": "in_transit",
  "notes": "Picked up at warehouse"
}`}</pre>
          </div>

          <h4 style={{ ...s.sectionTitle, fontSize: 15, marginTop: 24 }}>RECENT INBOUND WEBHOOK LOGS</h4>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Event</th>
                <th style={s.th}>Source IP</th>
                <th style={s.th}>Payload</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Time</th>
              </tr>
            </thead>
            <tbody>
              {webhookLogs.length === 0 ? <tr><td colSpan={5} style={s.empty}>No inbound webhooks received yet</td></tr> :
               webhookLogs.map(log => (
                <tr key={log.id}>
                  <td style={s.td}>{log.event_type}</td>
                  <td style={s.td}>{log.source_ip}</td>
                  <td style={s.td}><span style={s.urlTrunc}>{JSON.stringify(log.payload).substring(0, 60)}...</span></td>
                  <td style={s.td}><span style={{ ...s.badge, background: '#238636', color: '#fff' }}>{log.status}</span></td>
                  <td style={s.td}>{new Date(log.created_at).toLocaleString()}</td>
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
  title: { fontSize: 28, color: '#C8962A', marginBottom: 16 },
  tabBar: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  tab: { padding: '8px 18px', background: '#21262D', border: 'none', borderRadius: 6, color: '#8B949E', fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  tabActive: { background: '#1A4FA8', color: '#fff' },
  section: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: '20px 16px', overflow: 'hidden' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 18, color: '#E6EDF3', marginBottom: 8 },
  desc: { color: '#8B949E', fontSize: 13, marginBottom: 16 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, color: '#8B949E', fontWeight: 500, textTransform: 'uppercase' },
  input: { padding: '9px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13, outline: 'none', flex: 1 },
  select: { padding: '9px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: 6, color: '#E6EDF3', fontSize: 13 },
  toggleRow: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
  toggleText: { fontSize: 13, color: '#E6EDF3' },
  btnRow: { display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  testBtn: { padding: '10px 20px', background: '#21262D', color: '#E6EDF3', border: '1px solid #30363D', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  saveBtn: { padding: '10px 20px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: '10px 20px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  addBtn: { padding: '8px 14px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  testResult: { marginTop: 16, padding: '10px 14px', border: '1px solid', borderRadius: 6, fontSize: 13, color: '#E6EDF3' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 16 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#8B949E', borderBottom: '1px solid #21262D', textTransform: 'uppercase', background: '#0D1117' },
  td: { padding: '8px 10px', fontSize: 13, color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#21262D', color: '#8B949E', textTransform: 'uppercase' },
  urlTrunc: { display: 'inline-block', maxWidth: '30vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#8B949E' },
  empty: { padding: 30, textAlign: 'center', color: '#484F58' },
  actions: { display: 'flex', gap: 6 },
  actionBtn: { background: 'none', border: '1px solid #30363D', borderRadius: 4, padding: '3px 8px', fontSize: 11, color: '#8B949E', cursor: 'pointer' },
  webhookForm: { background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  codeBlock: { background: '#0D1117', border: '1px solid #30363D', borderRadius: 8, padding: 14, marginBottom: 12 },
  codeLabel: { fontSize: 12, color: '#8B949E', marginBottom: 6 },
  code: { display: 'block', fontSize: 13, color: '#C8962A', wordBreak: 'break-all', padding: '6px 0' },
  pre: { fontSize: 12, color: '#8B949E', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }
};
