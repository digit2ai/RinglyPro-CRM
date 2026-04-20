import React, { useState, useEffect } from 'react';
import api from '../services/api';

const PROTOCOLS = [
  { value: 'dicomweb', label: 'DICOMweb (QIDO-RS/WADO-RS)' },
  { value: 'dimse', label: 'DIMSE (C-FIND/C-MOVE)' },
  { value: 'orthanc', label: 'Orthanc REST API' },
  { value: 'google_chc', label: 'Google Cloud Healthcare' }
];

const AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'certificate', label: 'Certificate' }
];

const MATCH_STRATEGIES = [
  { value: 'mrn_accession', label: 'MRN + Accession Number' },
  { value: 'mrn', label: 'MRN Only' },
  { value: 'accession', label: 'Accession Number Only' },
  { value: 'name_dob', label: 'Patient Name + DOB' }
];

export default function PACSSettings() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [polling, setPolling] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    name: '', ae_title: '', host: '', port: 4242,
    protocol: 'dicomweb', base_url: '', polling_interval_seconds: 300,
    auto_import: true, auto_analyze: true,
    match_strategy: 'mrn_accession', auth_type: 'none',
    auth_credentials: {}
  });

  useEffect(() => { loadConnections(); }, []);

  const loadConnections = async () => {
    try {
      const data = await api.get('/pacs/connections');
      setConnections(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked :
                e.target.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
    setForm({ ...form, [field]: val });
  };

  const resetForm = () => {
    setForm({
      name: '', ae_title: '', host: '', port: 4242,
      protocol: 'dicomweb', base_url: '', polling_interval_seconds: 300,
      auto_import: true, auto_analyze: true,
      match_strategy: 'mrn_accession', auth_type: 'none',
      auth_credentials: {}
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (conn) => {
    setForm({
      name: conn.name, ae_title: conn.ae_title || '', host: conn.host,
      port: conn.port || 4242, protocol: conn.protocol || 'dicomweb',
      base_url: conn.base_url || '', polling_interval_seconds: conn.polling_interval_seconds || 300,
      auto_import: conn.auto_import, auto_analyze: conn.auto_analyze,
      match_strategy: conn.match_strategy || 'mrn_accession',
      auth_type: conn.auth_type || 'none',
      auth_credentials: conn.auth_credentials || {}
    });
    setEditingId(conn.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      if (editingId) {
        await api.put(`/pacs/connections/${editingId}`, form);
        setSuccess('Connection updated successfully');
      } else {
        await api.post('/pacs/connections', form);
        setSuccess('Connection created successfully');
      }
      resetForm();
      loadConnections();
    } catch (err) { setError(err.message); }
  };

  const handleToggleStatus = async (conn) => {
    try {
      const newStatus = conn.status === 'active' ? 'inactive' : 'active';
      await api.put(`/pacs/connections/${conn.id}`, { status: newStatus });
      loadConnections();
    } catch (err) { setError(err.message); }
  };

  const handlePoll = async (conn) => {
    setPolling(conn.id);
    try {
      await api.post(`/pacs/connections/${conn.id}/poll`);
      setSuccess(`Poll triggered for ${conn.name}`);
      setTimeout(() => loadConnections(), 3000);
    } catch (err) { setError(err.message); }
    finally { setPolling(null); }
  };

  const handleDelete = async (conn) => {
    if (!confirm(`Delete connection "${conn.name}"?`)) return;
    try {
      await api.del(`/pacs/connections/${conn.id}`);
      loadConnections();
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="text-dark-400 text-center py-12">Loading PACS settings...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">PACS Connections</h1>
          <p className="text-dark-400 mt-1">Manage DICOMweb/DIMSE connections for automated study import</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary">
          + Add Connection
        </button>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4">{error}</div>}
      {success && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm mb-4">{success}</div>}

      {/* Connection Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit' : 'New'} PACS Connection</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Connection Name *</label>
                <input type="text" value={form.name} onChange={handleChange('name')} className="input-field" required placeholder="e.g., Main Hospital PACS" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">AE Title</label>
                <input type="text" value={form.ae_title} onChange={handleChange('ae_title')} className="input-field" placeholder="e.g., IMAGING_MIND" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Host *</label>
                <input type="text" value={form.host} onChange={handleChange('host')} className="input-field" required placeholder="pacs.hospital.org" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Port</label>
                <input type="number" value={form.port} onChange={handleChange('port')} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Protocol</label>
                <select value={form.protocol} onChange={handleChange('protocol')} className="input-field">
                  {PROTOCOLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Base URL</label>
              <input type="text" value={form.base_url} onChange={handleChange('base_url')} className="input-field" placeholder="https://pacs.hospital.org/dicom-web" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Poll Interval (seconds)</label>
                <input type="number" value={form.polling_interval_seconds} onChange={handleChange('polling_interval_seconds')} className="input-field" min={60} />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Match Strategy</label>
                <select value={form.match_strategy} onChange={handleChange('match_strategy')} className="input-field">
                  {MATCH_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Auth Type</label>
                <select value={form.auth_type} onChange={handleChange('auth_type')} className="input-field">
                  {AUTH_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.auto_import} onChange={handleChange('auto_import')} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-msk-500" />
                <span className="text-sm text-dark-300">Auto-import studies</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.auto_analyze} onChange={handleChange('auto_analyze')} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-msk-500" />
                <span className="text-sm text-dark-300">Auto-trigger AI analysis</span>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Update' : 'Create'} Connection</button>
            </div>
          </form>
        </div>
      )}

      {/* Connection List */}
      {connections.length === 0 && !showForm ? (
        <div className="card text-center py-12">
          <p className="text-dark-400 text-lg">No PACS connections configured</p>
          <p className="text-dark-500 text-sm mt-2">Add a connection to start importing DICOM studies automatically</p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map(conn => (
            <div key={conn.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${conn.status === 'active' ? 'bg-green-500' : conn.status === 'error' ? 'bg-red-500' : 'bg-dark-500'}`} />
                  <div>
                    <h4 className="text-white font-medium">{conn.name}</h4>
                    <p className="text-dark-400 text-sm">{conn.host}:{conn.port} - {conn.protocol} - AE: {conn.ae_title || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded font-medium ${
                    conn.status === 'active' ? 'bg-green-500/20 text-green-400' :
                    conn.status === 'error' ? 'bg-red-500/20 text-red-400' :
                    'bg-dark-700 text-dark-400'
                  }`}>{conn.status}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-dark-500">Studies Imported</span>
                  <p className="text-white font-medium">{conn.studies_imported || 0}</p>
                </div>
                <div>
                  <span className="text-dark-500">Poll Interval</span>
                  <p className="text-white font-medium">{conn.polling_interval_seconds}s</p>
                </div>
                <div>
                  <span className="text-dark-500">Last Poll</span>
                  <p className="text-white font-medium">{conn.last_poll_at ? new Date(conn.last_poll_at).toLocaleString() : 'Never'}</p>
                </div>
                <div>
                  <span className="text-dark-500">Match Strategy</span>
                  <p className="text-white font-medium">{conn.match_strategy}</p>
                </div>
              </div>

              <div className="mt-4 flex gap-2 border-t border-dark-700 pt-3">
                <button onClick={() => handleToggleStatus(conn)} className="text-sm px-3 py-1 rounded bg-dark-700 text-dark-300 hover:text-white transition-colors">
                  {conn.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handlePoll(conn)}
                  disabled={polling === conn.id}
                  className="text-sm px-3 py-1 rounded bg-msk-600/20 text-msk-400 hover:bg-msk-600/30 transition-colors disabled:opacity-50"
                >
                  {polling === conn.id ? 'Polling...' : 'Poll Now'}
                </button>
                <button onClick={() => handleEdit(conn)} className="text-sm px-3 py-1 rounded bg-dark-700 text-dark-300 hover:text-white transition-colors">
                  Edit
                </button>
                <button onClick={() => handleDelete(conn)} className="text-sm px-3 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
