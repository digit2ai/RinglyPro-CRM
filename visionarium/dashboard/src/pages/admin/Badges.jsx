import React, { useState, useEffect } from 'react';
import { admin as adminApi } from '../../api';

export default function AdminBadges() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name_en:'', name_es:'', description_en:'', description_es:'', category:'technology', points:10 });
  const [error, setError] = useState('');

  const load = () => adminApi.badges().then(d => setList(d.badges || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try { await adminApi.createBadge(form); setShowForm(false); load(); } catch(e) { setError(e.message); }
  };

  const set = (k) => (e) => setForm(f => ({...f, [k]: e.target.value}));

  const catColor = (c) => {
    const map = { technology:'bg-teal/20 text-teal-neon', leadership:'bg-gold/20 text-gold', community:'bg-blue-500/20 text-blue-400', execution:'bg-coral/20 text-coral' };
    return map[c] || 'bg-white/10 text-white/50';
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Badges ({list.length})</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">+ New Badge</button>
      </div>
      {error && <div className="text-coral mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="glass-card mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Name (EN)" value={form.name_en} onChange={set('name_en')} className="input-field" required />
            <input placeholder="Nombre (ES)" value={form.name_es} onChange={set('name_es')} className="input-field" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Description (EN)" value={form.description_en} onChange={set('description_en')} className="input-field" />
            <input placeholder="Descripcion (ES)" value={form.description_es} onChange={set('description_es')} className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <select value={form.category} onChange={set('category')} className="input-field">
              <option value="technology">Technology</option><option value="leadership">Leadership</option>
              <option value="community">Community</option><option value="execution">Execution</option>
            </select>
            <input type="number" placeholder="Points" value={form.points} onChange={set('points')} className="input-field" />
          </div>
          <button type="submit" className="btn-primary">Create Badge</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(b => (
          <div key={b.id} className="glass-card">
            <div className="flex justify-between items-start mb-2">
              <div className="font-semibold text-white">{b.name_en}</div>
              <span className={`badge-pill ${catColor(b.category)}`}>{b.category}</span>
            </div>
            <div className="text-white/40 text-sm">{b.name_es}</div>
            <div className="text-white/30 text-xs mt-2">{b.description_en}</div>
            <div className="text-teal-neon font-mono text-sm mt-2">{b.points} pts</div>
          </div>
        ))}
      </div>
    </div>
  );
}
