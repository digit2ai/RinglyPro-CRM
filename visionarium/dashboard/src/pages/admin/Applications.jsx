import React, { useState, useEffect } from 'react';
import { applications as appsApi } from '../../api';

const STATUSES = ['draft','submitted','under_review','interview','accepted','waitlisted','rejected'];

export default function AdminApplications() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    const params = {};
    if (filter) params.status = filter;
    appsApi.list(params).then(d => { setList(d.applications || []); setTotal(d.total || 0); }).catch(e => setError(e.message));
  };
  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (id, status) => {
    await appsApi.update(id, { status });
    load();
  };

  const statusColor = (s) => {
    const map = { submitted:'bg-teal/20 text-teal-neon', under_review:'bg-gold/20 text-gold', interview:'bg-blue-500/20 text-blue-400', accepted:'bg-green-500/20 text-green-400', waitlisted:'bg-white/10 text-white/50', rejected:'bg-coral/20 text-coral', draft:'bg-white/5 text-white/30' };
    return map[s] || 'bg-white/10 text-white/50';
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Applications ({total})</h1>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input-field w-48">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <div className="text-coral mb-4">{error}</div>}

      <div className="space-y-3">
        {list.map(a => (
          <div key={a.id} className="glass-card">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-white">{a.applicant?.first_name} {a.applicant?.last_name}</div>
                <div className="text-white/40 text-sm">{a.applicant?.email} -- {a.applicant?.country} -- Age {a.applicant?.age}</div>
                <div className="text-white/30 text-xs mt-1">Track: {a.track_preference || 'Not specified'} -- Cohort: {a.cohort?.name || a.cohort_id}</div>
                {a.written_vision && <p className="text-white/50 text-sm mt-2 line-clamp-2">{a.written_vision}</p>}
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <span className={`badge-pill ${statusColor(a.status)}`}>{a.status}</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {a.status === 'submitted' && <button onClick={() => updateStatus(a.id, 'under_review')} className="text-xs text-gold hover:underline">Review</button>}
                  {a.status === 'under_review' && <button onClick={() => updateStatus(a.id, 'interview')} className="text-xs text-blue-400 hover:underline">Interview</button>}
                  {(a.status === 'interview' || a.status === 'under_review') && (
                    <>
                      <button onClick={() => updateStatus(a.id, 'accepted')} className="text-xs text-green-400 hover:underline">Accept</button>
                      <button onClick={() => updateStatus(a.id, 'waitlisted')} className="text-xs text-white/40 hover:underline">Waitlist</button>
                      <button onClick={() => updateStatus(a.id, 'rejected')} className="text-xs text-coral hover:underline">Reject</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-white/30 py-8">No applications found</div>}
      </div>
    </div>
  );
}
