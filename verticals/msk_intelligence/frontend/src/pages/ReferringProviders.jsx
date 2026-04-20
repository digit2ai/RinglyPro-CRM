import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function ReferringProviders() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    provider_name: '', npi: '', specialty: '', facility_name: '',
    facility_address: '', phone: '', fax: '', email: '',
    preferred_report_format: 'pdf', preferred_delivery_method: 'fax', notes: ''
  });

  useEffect(() => { loadProviders(); }, []);

  const loadProviders = async (q) => {
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : '';
      const data = await api.get(`/referring/providers${params}`);
      setProviders(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const resetForm = () => {
    setForm({
      provider_name: '', npi: '', specialty: '', facility_name: '',
      facility_address: '', phone: '', fax: '', email: '',
      preferred_report_format: 'pdf', preferred_delivery_method: 'fax', notes: ''
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (p) => {
    setForm({
      provider_name: p.provider_name || '', npi: p.npi || '',
      specialty: p.specialty || '', facility_name: p.facility_name || '',
      facility_address: p.facility_address || '', phone: p.phone || '',
      fax: p.fax || '', email: p.email || '',
      preferred_report_format: p.preferred_report_format || 'pdf',
      preferred_delivery_method: p.preferred_delivery_method || 'fax',
      notes: p.notes || ''
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      if (editingId) {
        await api.put(`/referring/providers/${editingId}`, form);
        setSuccess('Provider updated');
      } else {
        await api.post('/referring/providers', form);
        setSuccess('Provider added');
      }
      resetForm();
      loadProviders();
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (p) => {
    if (!confirm(`Deactivate "${p.provider_name}"?`)) return;
    try {
      await api.del(`/referring/providers/${p.id}`);
      loadProviders();
    } catch (err) { setError(err.message); }
  };

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    if (q.length >= 2) loadProviders(q);
    else if (q.length === 0) loadProviders();
  };

  if (loading) return <div className="text-dark-400 text-center py-12">Loading providers...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Referring Providers</h1>
          <p className="text-dark-400 mt-1">Manage referring physicians and their delivery preferences</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary">
          + Add Provider
        </button>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4">{error}</div>}
      {success && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm mb-4">{success}</div>}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text" value={search} onChange={handleSearch}
          className="input-field max-w-md"
          placeholder="Search by name, NPI, or facility..."
        />
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit' : 'New'} Referring Provider</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Provider Name *</label>
                <input type="text" value={form.provider_name} onChange={handleChange('provider_name')} className="input-field" required placeholder="Dr. John Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">NPI</label>
                <input type="text" value={form.npi} onChange={handleChange('npi')} className="input-field" placeholder="1234567890" maxLength={10} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Specialty</label>
                <input type="text" value={form.specialty} onChange={handleChange('specialty')} className="input-field" placeholder="Orthopedic Surgery" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Facility Name</label>
                <input type="text" value={form.facility_name} onChange={handleChange('facility_name')} className="input-field" placeholder="City Hospital" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Facility Address</label>
              <input type="text" value={form.facility_address} onChange={handleChange('facility_address')} className="input-field" placeholder="123 Medical Dr, City, ST 12345" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={handleChange('phone')} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Fax</label>
                <input type="tel" value={form.fax} onChange={handleChange('fax')} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Email</label>
                <input type="email" value={form.email} onChange={handleChange('email')} className="input-field" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Preferred Report Format</label>
                <select value={form.preferred_report_format} onChange={handleChange('preferred_report_format')} className="input-field">
                  <option value="pdf">PDF</option>
                  <option value="hl7_oru">HL7 ORU</option>
                  <option value="fhir_diagnostic_report">FHIR DiagnosticReport</option>
                  <option value="plain_text">Plain Text</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Preferred Delivery Method</label>
                <select value={form.preferred_delivery_method} onChange={handleChange('preferred_delivery_method')} className="input-field">
                  <option value="fax">Fax</option>
                  <option value="email">Email</option>
                  <option value="hl7">HL7 Interface</option>
                  <option value="fhir">FHIR API</option>
                  <option value="portal">Portal</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Notes</label>
              <textarea value={form.notes} onChange={handleChange('notes')} className="input-field h-20" placeholder="Any special instructions..." />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Update' : 'Add'} Provider</button>
            </div>
          </form>
        </div>
      )}

      {/* Provider List */}
      {providers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-dark-400 text-lg">No referring providers found</p>
          <p className="text-dark-500 text-sm mt-2">Add providers to track referral sources and report delivery preferences</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700 text-dark-400 text-left">
                <th className="py-3 px-3">Provider</th>
                <th className="py-3 px-3">NPI</th>
                <th className="py-3 px-3">Specialty</th>
                <th className="py-3 px-3">Facility</th>
                <th className="py-3 px-3">Contact</th>
                <th className="py-3 px-3">Delivery</th>
                <th className="py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(p => (
                <tr key={p.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                  <td className="py-3 px-3">
                    <span className="text-white font-medium">{p.provider_name}</span>
                    {!p.is_active && <span className="ml-2 text-xs text-red-400">(inactive)</span>}
                  </td>
                  <td className="py-3 px-3 text-dark-300">{p.npi || '-'}</td>
                  <td className="py-3 px-3 text-dark-300">{p.specialty || '-'}</td>
                  <td className="py-3 px-3 text-dark-300">{p.facility_name || '-'}</td>
                  <td className="py-3 px-3 text-dark-400 text-xs">
                    {p.phone && <div>{p.phone}</div>}
                    {p.fax && <div>Fax: {p.fax}</div>}
                    {p.email && <div>{p.email}</div>}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 text-xs rounded bg-dark-700 text-dark-300">
                      {p.preferred_delivery_method} / {p.preferred_report_format}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(p)} className="text-xs text-msk-400 hover:text-msk-300">Edit</button>
                      <button onClick={() => handleDelete(p)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
