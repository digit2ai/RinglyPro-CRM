import React, { useState, useEffect } from 'react';
import { events as eventsApi } from '../../api';

export default function AdminEvents() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title_en:'', title_es:'', type:'webinar', format:'virtual', city:'', status:'planned' });
  const [error, setError] = useState('');

  const load = () => eventsApi.list({}).then(d => setList(d.events || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try { await eventsApi.create(form); setShowForm(false); load(); } catch(e) { setError(e.message); }
  };

  const set = (k) => (e) => setForm(f => ({...f, [k]: e.target.value}));

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Events ({list.length})</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">+ New Event</button>
      </div>
      {error && <div className="text-coral mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="glass-card mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Title (EN)" value={form.title_en} onChange={set('title_en')} className="input-field" required />
            <input placeholder="Titulo (ES)" value={form.title_es} onChange={set('title_es')} className="input-field" required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <select value={form.type} onChange={set('type')} className="input-field">
              <option value="immersion">Immersion</option><option value="demo_day">Demo Day</option><option value="webinar">Webinar</option>
              <option value="workshop">Workshop</option><option value="hackathon">Hackathon</option><option value="showcase">Showcase</option>
            </select>
            <select value={form.format} onChange={set('format')} className="input-field">
              <option value="virtual">Virtual</option><option value="in_person">In Person</option><option value="hybrid">Hybrid</option>
            </select>
            <input placeholder="City" value={form.city} onChange={set('city')} className="input-field" />
          </div>
          <button type="submit" className="btn-primary">Create Event</button>
        </form>
      )}

      <div className="space-y-3">
        {list.map(e => (
          <div key={e.id} className="glass-card flex justify-between items-center">
            <div>
              <div className="font-semibold text-white">{e.title_en}</div>
              <div className="text-white/40 text-sm">{e.type} -- {e.format} {e.city ? `-- ${e.city}` : ''}</div>
            </div>
            <div className="text-right">
              <span className={`badge-pill ${e.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-teal/20 text-teal-neon'}`}>{e.status}</span>
              <div className="text-white/30 text-xs mt-1">{e.current_rsvps} RSVPs</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
