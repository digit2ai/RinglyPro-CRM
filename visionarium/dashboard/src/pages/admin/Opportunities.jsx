import React, { useState, useEffect } from 'react';
import { opportunities as oppsApi } from '../../api';

export default function AdminOpportunities() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');

  const load = () => oppsApi.list({}).then(d => setList(d.opportunities || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const typeColor = (t) => {
    const map = { internship:'bg-teal/20 text-teal-neon', scholarship:'bg-gold/20 text-gold', incubation:'bg-coral/20 text-coral', mentorship:'bg-blue-500/20 text-blue-400', job:'bg-green-500/20 text-green-400' };
    return map[t] || 'bg-white/10 text-white/50';
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Opportunity Marketplace ({list.length})</h1>
      {error && <div className="text-coral mb-4">{error}</div>}

      <div className="space-y-3">
        {list.map(o => (
          <div key={o.id} className="glass-card flex justify-between items-center">
            <div>
              <div className="font-semibold text-white">{o.title}</div>
              <div className="text-white/40 text-sm">{o.sponsor?.company_name || 'Direct'} -- {o.location || 'Remote'}</div>
              {o.compensation && <div className="text-teal-neon text-sm mt-1">{o.compensation}</div>}
            </div>
            <div className="text-right">
              <span className={`badge-pill ${typeColor(o.type)}`}>{o.type}</span>
              <div className="text-white/30 text-xs mt-1">{o.deadline ? `Deadline: ${new Date(o.deadline).toLocaleDateString()}` : 'Open'}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-white/30 py-8">No opportunities posted yet</div>}
      </div>
    </div>
  );
}
