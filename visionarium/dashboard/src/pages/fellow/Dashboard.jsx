import React, { useState, useEffect } from 'react';
import { fellows, opportunities as oppsApi, events as eventsApi, auth } from '../../api';

export default function FellowDashboard() {
  const [fellow, setFellow] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [badges, setBadges] = useState([]);
  const [opps, setOpps] = useState([]);
  const [evts, setEvts] = useState([]);
  const [error, setError] = useState('');
  const user = auth.getUser();
  const isCommunity = user?.tier === 'community' || user?.role === 'community';

  useEffect(() => {
    if (!isCommunity) {
      fellows.me().then(d => setFellow(d.fellow)).catch(() => {});
      fellows.mySchedule().then(d => setSchedule(d.schedule)).catch(() => {});
      fellows.myBadges().then(d => setBadges(d.badges || [])).catch(() => {});
    }
    oppsApi.list({}).then(d => setOpps(d.opportunities || [])).catch(() => {});
    eventsApi.pub().then(d => setEvts(d.events || [])).catch(() => {});
  }, []);

  if (isCommunity) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-4">Welcome, {user?.first_name}!</h1>
        <p className="text-white/60 mb-8">You are a member of the Visionarium Open Community. Explore events, earn badges, and apply for the Fellowship when applications open.</p>

        <h2 className="text-lg font-bold text-white mb-4">Upcoming Events</h2>
        <div className="space-y-3 mb-8">
          {evts.length === 0 ? <p className="text-white/30">No upcoming events</p> : evts.map(e => (
            <div key={e.id} className="glass-card flex justify-between items-center">
              <div><div className="text-white font-semibold">{e.title_en}</div><div className="text-white/40 text-sm">{e.type}</div></div>
              <div className="text-teal-neon font-mono text-sm">{e.start_datetime ? new Date(e.start_datetime).toLocaleDateString() : 'TBD'}</div>
            </div>
          ))}
        </div>

        <h2 className="text-lg font-bold text-white mb-4">Opportunities</h2>
        <div className="space-y-3">
          {opps.length === 0 ? <p className="text-white/30">No opportunities available yet</p> : opps.slice(0,5).map(o => (
            <div key={o.id} className="glass-card">
              <div className="font-semibold text-white">{o.title}</div>
              <div className="text-white/40 text-sm">{o.type} -- {o.location || 'Remote'}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Fellow Dashboard</h1>

      {fellow && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="stat-card"><div className="stat-value">{fellow.track === 'explorer_16_18' ? 'Explorer' : 'Builder'}</div><div className="stat-label">Track</div></div>
          <div className="stat-card"><div className="stat-value">{fellow.completion_rate}%</div><div className="stat-label">Completion</div></div>
          <div className="stat-card"><div className="stat-value">{badges.length}</div><div className="stat-label">Badges</div></div>
          <div className="stat-card"><div className="stat-value">{fellow.status}</div><div className="stat-label">Status</div></div>
        </div>
      )}

      {/* Schedule */}
      {schedule && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Weekly Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(schedule).filter(([k]) => ['monday','wednesday','friday'].includes(k)).map(([day, s]) => (
              <div key={day} className="glass-card">
                <div className="text-gold text-xs uppercase tracking-wider mb-2">{day}</div>
                <div className="font-semibold text-white">{s.activity}</div>
                <div className="text-white/40 text-sm">{s.format} -- {s.duration}</div>
                <div className="text-white/30 text-xs mt-1">{s.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mentor */}
      {fellow?.mentor && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Your Mentor</h2>
          <div className="glass-card">
            <div className="font-semibold text-white">{fellow.mentor.first_name} {fellow.mentor.last_name}</div>
            <div className="text-white/40 text-sm">{fellow.mentor.company} -- {fellow.mentor.title}</div>
          </div>
        </div>
      )}

      {/* Project */}
      {fellow?.project && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Capstone Project</h2>
          <div className="glass-card">
            <div className="font-semibold text-white">{fellow.project.title || 'Untitled'}</div>
            <div className="text-white/40 text-sm">Status: {fellow.project.status}</div>
            {fellow.project.description && <p className="text-white/50 text-sm mt-2">{fellow.project.description}</p>}
          </div>
        </div>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Badges Earned</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {badges.map(b => (
              <div key={b.id} className="glass-card text-center">
                <div className="text-teal-neon font-semibold">{b.badge?.name_en}</div>
                <div className="text-white/30 text-xs mt-1">{b.badge?.category}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
