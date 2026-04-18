import React, { useState, useEffect } from 'react';
import { mentors as mentorsApi } from '../../api';

export default function AdminMentors() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email:'', first_name:'', last_name:'', company:'', title:'', country:'', city:'', password:'Mentor2026!' });
  const [error, setError] = useState('');

  const load = () => mentorsApi.list().then(d => setList(d.mentors || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try { await mentorsApi.create(form); setShowForm(false); load(); } catch(e) { setError(e.message); }
  };

  const set = (k) => (e) => setForm(f => ({...f, [k]: e.target.value}));

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Mentors ({list.length})</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">+ Add Mentor</button>
      </div>
      {error && <div className="text-coral mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="glass-card mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="First Name" value={form.first_name} onChange={set('first_name')} className="input-field" required />
            <input placeholder="Last Name" value={form.last_name} onChange={set('last_name')} className="input-field" required />
          </div>
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className="input-field" required />
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Company" value={form.company} onChange={set('company')} className="input-field" />
            <input placeholder="Title" value={form.title} onChange={set('title')} className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Country" value={form.country} onChange={set('country')} className="input-field" />
            <input placeholder="City" value={form.city} onChange={set('city')} className="input-field" />
          </div>
          <button type="submit" className="btn-primary">Add Mentor</button>
        </form>
      )}

      <div className="space-y-3">
        {list.map(m => (
          <div key={m.id} className="glass-card flex justify-between items-center">
            <div>
              <div className="font-semibold text-white">{m.first_name} {m.last_name}</div>
              <div className="text-white/40 text-sm">{m.company} -- {m.title}</div>
              <div className="text-white/30 text-xs">{m.email} -- {m.country}</div>
            </div>
            <div className="text-right">
              <span className={`badge-pill ${m.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>{m.status}</span>
              <div className="text-white/30 text-xs mt-1">{m.total_fellows_mentored} fellows mentored</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
