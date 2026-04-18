import React, { useState, useEffect } from 'react';
import { community } from '../../api';

export default function AdminCommunity() {
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ tier: '', country: '', status: '' });
  const [error, setError] = useState('');

  const load = () => {
    const params = { limit: 100 };
    if (filter.tier) params.tier = filter.tier;
    if (filter.country) params.country = filter.country;
    if (filter.status) params.status = filter.status;
    community.members(params).then(d => { setMembers(d.members || []); setTotal(d.total || 0); }).catch(e => setError(e.message));
  };

  useEffect(() => { load(); }, [filter]);

  const tierColor = (t) => {
    const map = { community:'bg-white/10 text-white/50', active_member:'bg-teal/20 text-teal-neon', applicant:'bg-gold/20 text-gold', fellow:'bg-green-500/20 text-green-400', alumni:'bg-blue-500/20 text-blue-400' };
    return map[t] || 'bg-white/10 text-white/50';
  };

  const set = (k) => (e) => setFilter(f => ({...f, [k]: e.target.value}));

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Community Members ({total})</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <select value={filter.tier} onChange={set('tier')} className="input-field w-44">
          <option value="">All Tiers</option>
          <option value="community">Community</option>
          <option value="active_member">Active Member</option>
          <option value="applicant">Applicant</option>
          <option value="fellow">Fellow</option>
          <option value="alumni">Alumni</option>
        </select>
        <select value={filter.status} onChange={set('status')} className="input-field w-44">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <input placeholder="Filter by country..." value={filter.country} onChange={set('country')} className="input-field w-44" />
      </div>

      {error && <div className="text-coral mb-4">{error}</div>}

      <div className="glass-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">ID</th>
              <th className="table-header">Name</th>
              <th className="table-header">Email</th>
              <th className="table-header">Country / City</th>
              <th className="table-header">Age</th>
              <th className="table-header">Tier</th>
              <th className="table-header">Badges</th>
              <th className="table-header">Engagement</th>
              <th className="table-header">Lina</th>
              <th className="table-header">Registered</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} className="hover:bg-white/5">
                <td className="table-cell font-mono text-teal-neon">{m.id}</td>
                <td className="table-cell">
                  <div className="font-medium text-white">{m.first_name} {m.last_name}</div>
                  {m.school_or_university && <div className="text-white/30 text-xs">{m.school_or_university}</div>}
                </td>
                <td className="table-cell text-white/60 text-sm">{m.email}</td>
                <td className="table-cell text-sm">
                  <div className="text-white/70">{m.country || '--'}</div>
                  <div className="text-white/30 text-xs">{m.city}</div>
                </td>
                <td className="table-cell text-center">{m.age || '--'}</td>
                <td className="table-cell"><span className={`badge-pill ${tierColor(m.tier)}`}>{m.tier}</span></td>
                <td className="table-cell text-center font-mono">{m.total_badges}</td>
                <td className="table-cell text-center font-mono text-teal-neon">{m.engagement_score}</td>
                <td className="table-cell text-center font-mono">{m.lina_conversation_count}</td>
                <td className="table-cell text-white/40 text-xs">{new Date(m.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan="10" className="table-cell text-center text-white/30">No members found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
