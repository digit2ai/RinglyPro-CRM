import React, { useState, useEffect } from 'react';
import { lina as linaApi } from '../../api';

export default function AdminLina() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    linaApi.analytics().then(d => setData(d.analytics)).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-coral">{error}</div>;
  if (!data) return <div className="p-8 text-white/40">Loading Lina analytics...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Lina AI Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="stat-card">
          <div className="stat-value">{data.total_conversations}</div>
          <div className="stat-label">Total Conversations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.escalation_count}</div>
          <div className="stat-label">Escalations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.escalation_rate}</div>
          <div className="stat-label">Escalation Rate</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card">
          <h3 className="text-lg font-bold text-white mb-4">By Language</h3>
          {(data.by_language || []).map((l, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-white/5">
              <span className="text-white/70">{l.language === 'en' ? 'English' : 'Spanish'}</span>
              <span className="text-teal-neon font-mono">{l.count}</span>
            </div>
          ))}
        </div>
        <div className="glass-card">
          <h3 className="text-lg font-bold text-white mb-4">By Sentiment</h3>
          {(data.by_sentiment || []).map((s, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-white/5">
              <span className="text-white/70">{s.sentiment}</span>
              <span className={`font-mono ${s.sentiment === 'positive' ? 'text-green-400' : s.sentiment === 'negative' ? 'text-coral' : 'text-white/50'}`}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
