import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAppointments(); }, []);

  const loadAppointments = async () => {
    try {
      const data = await api.get('/scheduling/upcoming');
      setAppointments(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const cancelAppt = async (id) => {
    try {
      await api.put(`/scheduling/${id}/cancel`, { cancelReason: 'Cancelled by user' });
      await loadAppointments();
    } catch (err) { console.error(err); }
  };

  const getStatusColor = (status) => ({
    scheduled: 'bg-blue-500/20 text-blue-400',
    confirmed: 'bg-cyan-500/20 text-cyan-400',
    completed: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-red-500/20 text-red-400',
    no_show: 'bg-dark-700 text-dark-400'
  }[status] || 'bg-dark-700 text-dark-400');

  if (loading) return <div className="text-center py-12 text-dark-400">Loading appointments...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Appointments</h1>
          <p className="text-dark-400 text-sm mt-1">Upcoming and past consultations</p>
        </div>
      </div>

      {appointments.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-4">📅</div>
          <p className="text-dark-400 mb-2">No appointments yet</p>
          <p className="text-dark-500 text-sm">Appointments are scheduled as part of the diagnostic workflow</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(a => {
            const isPast = new Date(a.scheduled_at) < new Date();
            return (
              <div key={a.id} className="card hover:border-dark-500 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-medium">{a.case_number || `Case #${a.case_id}`}</span>
                      <span className={`badge text-xs ${getStatusColor(a.status)}`}>{a.status?.replace('_', ' ')}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-dark-400">
                      <span>Date: <span className="text-dark-200">{new Date(a.scheduled_at).toLocaleDateString()}</span></span>
                      <span>Time: <span className="text-dark-200">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                      <span>Duration: <span className="text-dark-200">{a.duration_minutes || 30} min</span></span>
                      {a.provider_name && <span>Provider: <span className="text-dark-200">Dr. {a.provider_name}</span></span>}
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    {a.status === 'scheduled' && !isPast && (
                      <>
                        {a.consultation_id && (
                          <Link to={`/video/msk-appt-${a.id}`} className="btn-primary text-sm">Join</Link>
                        )}
                        <button onClick={() => cancelAppt(a.id)} className="btn-secondary text-sm text-red-400 hover:text-red-300">Cancel</button>
                      </>
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
