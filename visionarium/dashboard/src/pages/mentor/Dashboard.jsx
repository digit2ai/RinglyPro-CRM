import React, { useState, useEffect } from 'react';
import { mentors } from '../../api';

export default function MentorDashboard() {
  const [mentor, setMentor] = useState(null);
  const [myFellows, setMyFellows] = useState([]);
  const [briefings, setBriefings] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    mentors.me().then(d => setMentor(d.mentor)).catch(e => setError(e.message));
    mentors.myFellows().then(d => setMyFellows(d.fellows || [])).catch(() => {});
    mentors.linaBriefings().then(d => setBriefings(d.briefings || [])).catch(() => {});
  }, []);

  if (error) return <div className="p-8 text-coral">{error}</div>;

  return (
    <div className="p-8">
      <div className="flex justify-center mb-8">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69dfd39cfcac588c6b2329f9.png" alt="Visionarium" className="h-32" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-8">Mentor Dashboard</h1>

      {mentor && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="stat-card"><div className="stat-value">{myFellows.length}</div><div className="stat-label">Assigned Fellows</div></div>
          <div className="stat-card"><div className="stat-value">{mentor.total_fellows_mentored}</div><div className="stat-label">Total Mentored</div></div>
          <div className="stat-card"><div className="stat-value">{mentor.availability_hours_per_month}h</div><div className="stat-label">Monthly Availability</div></div>
        </div>
      )}

      <h2 className="text-lg font-bold text-white mb-4">Your Fellows</h2>
      <div className="space-y-3 mb-8">
        {myFellows.length === 0 ? <p className="text-white/30">No fellows assigned yet</p> : myFellows.map(f => (
          <div key={f.id} className="glass-card">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-white">{f.member?.first_name} {f.member?.last_name}</div>
                <div className="text-white/40 text-sm">{f.member?.email}</div>
                <div className="text-white/30 text-xs mt-1">Engagement: {f.member?.engagement_score || 0} -- Badges: {f.member?.total_badges || 0}</div>
              </div>
              <div className="text-right">
                <span className={`badge-pill ${f.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>{f.status}</span>
                {f.project && <div className="text-teal-neon text-xs mt-1">Project: {f.project.title || 'In progress'}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold text-white mb-4">Lina Briefing Summaries</h2>
      <div className="space-y-3">
        {briefings.length === 0 ? <p className="text-white/30">No Lina conversations logged yet</p> : briefings.slice(0,10).map(b => (
          <div key={b.id} className="glass-card">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-white/50 text-sm">{b.summary || 'No summary'}</div>
                <div className="text-white/30 text-xs mt-1">Topics: {(b.topics || []).join(', ') || 'None'}</div>
              </div>
              <div className="text-right">
                <span className={`badge-pill ${b.sentiment === 'positive' ? 'bg-green-500/20 text-green-400' : b.sentiment === 'negative' ? 'bg-coral/20 text-coral' : 'bg-white/10 text-white/40'}`}>{b.sentiment}</span>
                {b.escalated && <div className="text-coral text-xs mt-1">ESCALATED</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
