import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function Consultations() {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = api.getUser();

  useEffect(() => { loadConsultations(); }, []);

  const loadConsultations = async () => {
    try {
      const data = await api.get('/consultations?limit=50');
      setConsultations(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      scheduled: 'bg-blue-500/20 text-blue-400',
      confirmed: 'bg-cyan-500/20 text-cyan-400',
      in_progress: 'bg-green-500/20 text-green-400 animate-pulse',
      completed: 'bg-dark-700 text-dark-300',
      cancelled: 'bg-red-500/20 text-red-400'
    };
    return map[status] || 'bg-dark-700 text-dark-300';
  };

  const extractMeetingId = (url) => {
    if (!url) return null;
    const parts = url.split('/');
    return parts[parts.length - 1];
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading consultations...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Video Consultations</h1>
          <p className="text-dark-400 text-sm mt-1">
            {user?.role === 'patient' ? 'Your scheduled and past consultations' : 'All video consultations'}
          </p>
        </div>
      </div>

      {consultations.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-dark-400 mb-2">No consultations yet</p>
          <p className="text-dark-500 text-sm">
            Video consultations are scheduled as part of the diagnostic workflow
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {consultations.map(c => {
            const meetingId = extractMeetingId(c.meeting_url);
            const isPast = c.status === 'completed' || c.status === 'cancelled';
            const isActive = c.status === 'scheduled' || c.status === 'confirmed' || c.status === 'in_progress';

            return (
              <div key={c.id} className={`card hover:border-dark-500 transition-all ${c.status === 'in_progress' ? 'border-green-500/30' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-medium">{c.case_number}</span>
                      <span className={`badge text-xs ${getStatusBadge(c.status)}`}>
                        {c.status?.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-dark-400">
                      <span>Patient: <span className="text-dark-200">{c.patient_first_name} {c.patient_last_name}</span></span>
                      <span>Radiologist: <span className="text-dark-200">Dr. {c.radiologist_first_name} {c.radiologist_last_name}</span></span>
                      <span>Scheduled: <span className="text-dark-200">{new Date(c.scheduled_at).toLocaleString()}</span></span>
                      <span>Duration: <span className="text-dark-200">{c.duration_minutes || 30} min</span></span>
                    </div>

                    {c.notes && (
                      <p className="text-dark-400 text-xs mt-2 italic">{c.notes}</p>
                    )}
                  </div>

                  <div className="ml-4">
                    {isActive && meetingId && (
                      <Link
                        to={`/video/${meetingId}`}
                        className={`btn-primary text-sm flex items-center gap-2 ${c.status === 'in_progress' ? 'animate-pulse' : ''}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {c.status === 'in_progress' ? 'Rejoin' : 'Join'}
                      </Link>
                    )}
                    {isPast && (
                      <span className="text-dark-500 text-sm">
                        {c.completed_at ? new Date(c.completed_at).toLocaleString() : '—'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
