import React, { useState, useEffect } from 'react';
import { sponsors as sponsorsApi } from '../../api';

export default function AdminSponsors() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email:'', company_name:'', contact_name:'', contact_title:'', tier:'supporter', contribution_amount:0, password:'Sponsor2026!' });
  const [error, setError] = useState('');

  const load = () => sponsorsApi.list().then(d => setList(d.sponsors || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try { await sponsorsApi.create(form); setShowForm(false); load(); } catch(e) { setError(e.message); }
  };

  const set = (k) => (e) => setForm(f => ({...f, [k]: e.target.value}));

  const tierColor = (t) => {
    const map = { founding:'bg-gold/20 text-gold', lead:'bg-teal/20 text-teal-neon', program:'bg-blue-500/20 text-blue-400', supporter:'bg-white/10 text-white/50', in_kind:'bg-coral/20 text-coral' };
    return map[t] || 'bg-white/10 text-white/50';
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Sponsors ({list.length})</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">+ Add Sponsor</button>
      </div>
      {error && <div className="text-coral mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="glass-card mb-8 space-y-4">
          <input placeholder="Company Name" value={form.company_name} onChange={set('company_name')} className="input-field" required />
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Contact Name" value={form.contact_name} onChange={set('contact_name')} className="input-field" />
            <input placeholder="Contact Title" value={form.contact_title} onChange={set('contact_title')} className="input-field" />
          </div>
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className="input-field" required />
          <div className="grid grid-cols-2 gap-4">
            <select value={form.tier} onChange={set('tier')} className="input-field">
              <option value="founding">Founding ($250K+)</option>
              <option value="lead">Lead ($100K+)</option>
              <option value="program">Program ($25K+)</option>
              <option value="supporter">Supporter ($10K+)</option>
              <option value="in_kind">In-Kind</option>
            </select>
            <input type="number" placeholder="Contribution $" value={form.contribution_amount} onChange={set('contribution_amount')} className="input-field" />
          </div>
          <button type="submit" className="btn-primary">Add Sponsor</button>
        </form>
      )}

      <div className="space-y-3">
        {list.map(s => (
          <div key={s.id} className="glass-card flex justify-between items-center">
            <div>
              <div className="font-semibold text-white">{s.company_name}</div>
              <div className="text-white/40 text-sm">{s.contact_name} -- {s.contact_title}</div>
              <div className="text-white/30 text-xs">{s.email}</div>
            </div>
            <div className="text-right">
              <span className={`badge-pill ${tierColor(s.tier)}`}>{s.tier}</span>
              <div className="text-teal-neon font-mono text-sm mt-1">${Number(s.contribution_amount || 0).toLocaleString()}</div>
              <span className={`badge-pill mt-1 ${s.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>{s.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
