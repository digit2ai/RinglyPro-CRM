import React, { useState, useEffect } from 'react';
import { fellows as fellowsApi } from '../../api';

export default function AdminFellows() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const load = () => fellowsApi.list({}).then(d => { setList(d.fellows || []); setTotal(d.total || 0); }).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const statusColor = (s) => {
    const map = { active:'bg-green-500/20 text-green-400', selected:'bg-teal/20 text-teal-neon', completed:'bg-gold/20 text-gold', withdrawn:'bg-coral/20 text-coral', on_leave:'bg-white/10 text-white/50' };
    return map[s] || 'bg-white/10 text-white/50';
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Fellows ({total})</h1>
      </div>
      {error && <div className="text-coral mb-4">{error}</div>}

      <div className="glass-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Cohort</th>
              <th className="table-header">Track</th>
              <th className="table-header">Status</th>
              <th className="table-header">Mentor</th>
              <th className="table-header">Completion</th>
            </tr>
          </thead>
          <tbody>
            {list.map(f => (
              <tr key={f.id} className="hover:bg-white/5">
                <td className="table-cell">
                  <div className="font-medium text-white">{f.member?.first_name} {f.member?.last_name}</div>
                  <div className="text-white/40 text-xs">{f.member?.email}</div>
                </td>
                <td className="table-cell">{f.cohort?.name || f.cohort_id}</td>
                <td className="table-cell text-xs font-mono">{f.track}</td>
                <td className="table-cell"><span className={`badge-pill ${statusColor(f.status)}`}>{f.status}</span></td>
                <td className="table-cell">{f.mentor ? `${f.mentor.first_name} ${f.mentor.last_name}` : <span className="text-white/30">Unassigned</span>}</td>
                <td className="table-cell font-mono text-teal-neon">{f.completion_rate}%</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="6" className="table-cell text-center text-white/30">No fellows yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
