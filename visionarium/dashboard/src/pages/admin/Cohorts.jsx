import React, { useState, useEffect } from 'react';
import { cohorts as cohortsApi } from '../../api';

export default function AdminCohorts() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', year: 2026, season:'fall', max_fellows: 40, city:'Miami' });
  const [error, setError] = useState('');

  const load = () => cohortsApi.list().then(d => setList(d.cohorts || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await cohortsApi.create(form);
      setShowForm(false);
      setForm({ name:'', year: 2026, season:'fall', max_fellows: 40, city:'Miami' });
      load();
    } catch(e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    await cohortsApi.del(id);
    load();
  };

  const set = (k) => (e) => setForm(f => ({...f, [k]: e.target.value}));

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Cohorts</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">+ New Cohort</button>
      </div>
      {error && <div className="text-coral mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="glass-card mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Name (e.g. Cohort 2)" value={form.name} onChange={set('name')} className="input-field" required />
            <input type="number" placeholder="Year" value={form.year} onChange={set('year')} className="input-field" required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <select value={form.season} onChange={set('season')} className="input-field"><option value="fall">Fall</option><option value="spring">Spring</option></select>
            <input type="number" placeholder="Max Fellows" value={form.max_fellows} onChange={set('max_fellows')} className="input-field" />
            <input placeholder="City" value={form.city} onChange={set('city')} className="input-field" />
          </div>
          <button type="submit" className="btn-primary">Create Cohort</button>
        </form>
      )}

      <div className="space-y-3">
        {list.map(c => (
          <div key={c.id} className="glass-card flex justify-between items-center">
            <div>
              <div className="font-semibold text-white">{c.name}</div>
              <div className="text-white/40 text-sm">{c.year} -- {c.season} -- {c.city} -- Status: {c.status}</div>
              <div className="text-white/30 text-xs mt-1">{c.total_applicants} applicants -- {c.current_fellows_count}/{c.max_fellows} fellows</div>
            </div>
            <button onClick={() => handleDelete(c.id)} className="text-coral text-sm hover:underline">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
