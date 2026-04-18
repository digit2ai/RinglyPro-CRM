import React, { useState, useEffect } from 'react';
import { fellows, opportunities as oppsApi, events as eventsApi, auth, cohorts as cohortsApi, applications as appsApi } from '../../api';

export default function FellowDashboard() {
  const [fellow, setFellow] = useState(null);
  const [cohortsList, setCohortsList] = useState([]);
  const [myApps, setMyApps] = useState([]);
  const [applying, setApplying] = useState(false);
  const [appForm, setAppForm] = useState({ cohort_id:'', track_preference:'', written_vision:'', scholarship_requested: false });
  const [appMsg, setAppMsg] = useState('');
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
    cohortsApi.list().then(d => setCohortsList(d.cohorts || [])).catch(() => {});
    appsApi.mine().then(d => setMyApps(d.applications || [])).catch(() => {});
  }, []);

  if (isCommunity) {
    return (
      <div className="p-8">
        <div className="flex justify-center mb-8">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69dfd39cfcac588c6b2329f9.png" alt="Visionarium" className="h-32" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">Welcome, {user?.first_name}!</h1>
        <p className="text-white/60 mb-8">You are a member of the Visionarium Open Community. Explore events, earn badges, and apply for the Fellowship when applications open.</p>

        {/* Fellowship Application */}
        <h2 className="text-lg font-bold text-white mb-4">Fellowship Application</h2>
        {myApps.length > 0 ? (
          <div className="space-y-3 mb-8">
            {myApps.map(a => (
              <div key={a.id} className="glass-card flex justify-between items-center">
                <div>
                  <div className="font-semibold text-white">{a.cohort?.name || `Cohort ${a.cohort_id}`}</div>
                  <div className="text-white/40 text-sm">Track: {a.track_preference || 'Not specified'}</div>
                </div>
                <span className={`badge-pill ${a.status === 'accepted' ? 'bg-green-500/20 text-green-400' : a.status === 'rejected' ? 'bg-coral/20 text-coral' : 'bg-teal/20 text-teal-neon'}`}>{a.status}</span>
              </div>
            ))}
          </div>
        ) : applying ? (
          <form onSubmit={async (e) => {
            e.preventDefault(); setAppMsg('');
            try {
              await appsApi.submit({ ...appForm, cohort_id: parseInt(appForm.cohort_id) });
              setAppMsg('Application submitted!');
              setApplying(false);
              appsApi.mine().then(d => setMyApps(d.applications || []));
            } catch(err) { setAppMsg(err.message); }
          }} className="glass-card mb-8 space-y-4">
            <select value={appForm.cohort_id} onChange={e => setAppForm(f => ({...f, cohort_id: e.target.value}))} className="input-field" required>
              <option value="">Select Cohort</option>
              {cohortsList.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
            </select>
            <select value={appForm.track_preference} onChange={e => setAppForm(f => ({...f, track_preference: e.target.value}))} className="input-field">
              <option value="">Select Track</option>
              <option value="explorer">Explorer (16-18)</option>
              <option value="builder">Builder (18-22)</option>
            </select>
            <textarea placeholder="Your vision -- Why do you want to join Visionarium?" value={appForm.written_vision} onChange={e => setAppForm(f => ({...f, written_vision: e.target.value}))} className="input-field min-h-[120px]" required />
            <label className="flex items-center gap-2 text-white/60 text-sm">
              <input type="checkbox" checked={appForm.scholarship_requested} onChange={e => setAppForm(f => ({...f, scholarship_requested: e.target.checked}))} className="accent-teal-neon" />
              I would like to request a scholarship
            </label>
            {appMsg && <div className="text-coral text-sm">{appMsg}</div>}
            <div className="flex gap-3">
              <button type="submit" className="btn-primary">Submit Application</button>
              <button type="button" onClick={() => setApplying(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="mb-8">
            <button onClick={() => setApplying(true)} className="btn-primary">Apply for Fellowship</button>
            {appMsg && <div className="text-green-400 text-sm mt-2">{appMsg}</div>}
          </div>
        )}

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
        <div className="space-y-3 mb-8">
          {opps.length === 0 ? <p className="text-white/30">No opportunities available yet</p> : opps.slice(0,5).map(o => (
            <div key={o.id} className="glass-card">
              <div className="font-semibold text-white">{o.title}</div>
              <div className="text-white/40 text-sm">{o.type} -- {o.location || 'Remote'}</div>
            </div>
          ))}
        </div>

        {/* Lina AI Coach */}
        <h2 className="text-lg font-bold text-white mb-4">Lina -- Your AI Coach</h2>
        <div className="glass-card mb-4">
          <p className="text-white/60 text-sm mb-4">Talk to Lina, your bilingual AI mentor. She can help with goal setting, interview practice, technical questions, and more -- available 24/7 in English and Spanish.</p>
          <elevenlabs-convai agent-id="agent_3301kp969e5tfcmb8jk2bam3exqa"></elevenlabs-convai>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-center mb-8">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69dfd39cfcac588c6b2329f9.png" alt="Visionarium" className="h-32" />
      </div>
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
        <div className="mb-8">
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

      {/* Lina AI Coach */}
      <h2 className="text-lg font-bold text-white mb-4">Lina -- Your AI Coach</h2>
      <div className="glass-card">
        <p className="text-white/60 text-sm mb-4">Talk to Lina, your bilingual AI mentor. She can help with goal setting, interview practice, technical questions, weekly reflections, and more -- available 24/7 in English and Spanish.</p>
        <elevenlabs-convai agent-id="agent_3301kp969e5tfcmb8jk2bam3exqa"></elevenlabs-convai>
      </div>
    </div>
  );
}
