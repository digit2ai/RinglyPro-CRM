import React, { useState, useEffect } from 'react';
import { admin as adminApi } from '../../api';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.dashboard().then(d => setData(d.dashboard)).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-coral">{error}</div>;
  if (!data) return <div className="p-8 text-white/40">Loading dashboard...</div>;

  const stats = [
    { label: 'Community Members', value: data.community.total, sub: `${data.community.active} active` },
    { label: 'Fellows', value: data.fellows.total, sub: `${data.fellows.active} active` },
    { label: 'Mentors', value: data.mentors.total, sub: `${data.mentors.active} active` },
    { label: 'Sponsors', value: data.sponsors.total, sub: `${data.sponsors.active} active` },
    { label: 'Applications', value: data.applications.total, sub: `${data.applications.pending_review} pending` },
    { label: 'Events', value: data.events },
    { label: 'Badges', value: data.badges },
    { label: 'Opportunities', value: data.opportunities },
    { label: 'Lina Conversations', value: data.lina_conversations }
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            {s.sub && <div className="text-white/30 text-xs mt-1">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Cohorts */}
      <h2 className="text-lg font-bold text-white mb-4">Cohorts</h2>
      <div className="space-y-3 mb-12">
        {(data.cohorts || []).map(c => (
          <div key={c.id} className="glass-card flex justify-between items-center">
            <div>
              <div className="font-semibold text-white">{c.name}</div>
              <div className="text-white/40 text-sm">{c.city} -- {c.status}</div>
            </div>
            <div className="text-teal-neon font-mono text-sm">{c.current_fellows_count}/{c.max_fellows} fellows</div>
          </div>
        ))}
      </div>

      {/* Country Breakdown */}
      <h2 className="text-lg font-bold text-white mb-4">Top Countries</h2>
      <div className="glass-card">
        <div className="space-y-2">
          {(data.country_breakdown || []).slice(0, 10).map((c, i) => (
            <div key={i} className="flex justify-between items-center py-1">
              <span className="text-white/70 text-sm">{c.country || 'Unknown'}</span>
              <span className="text-teal-neon font-mono text-sm">{c.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
