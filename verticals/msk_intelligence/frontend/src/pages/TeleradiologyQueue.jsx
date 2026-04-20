import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const PRIORITY_BADGES = {
  stat: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'STAT' },
  urgent: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'URGENT' },
  priority: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'PRIORITY' },
  routine: { bg: 'bg-dark-700', text: 'text-dark-300', label: 'ROUTINE' }
};

const STATUS_BADGES = {
  pending: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  assigned: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  in_progress: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
  cancelled: { bg: 'bg-dark-700', text: 'text-dark-400' }
};

function SLATimer({ deadline, status }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [overdue, setOverdue] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!deadline || status === 'completed' || status === 'cancelled') {
      setTimeLeft(status === 'completed' ? 'Done' : '-');
      return;
    }

    const update = () => {
      const now = new Date();
      const dl = new Date(deadline);
      const diff = dl - now;

      if (diff <= 0) {
        setOverdue(true);
        const overMs = Math.abs(diff);
        const hrs = Math.floor(overMs / 3600000);
        const mins = Math.floor((overMs % 3600000) / 60000);
        setTimeLeft(`-${hrs}h ${mins}m`);
      } else {
        setOverdue(false);
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        setTimeLeft(`${hrs}h ${mins}m`);
      }
    };

    update();
    intervalRef.current = setInterval(update, 60000);
    return () => clearInterval(intervalRef.current);
  }, [deadline, status]);

  return (
    <span className={`font-mono text-sm ${overdue ? 'text-red-400 font-bold' : 'text-green-400'}`}>
      {timeLeft}
    </span>
  );
}

export default function TeleradiologyQueue() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active'); // active, completed, all
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, [filter]);

  const loadData = async () => {
    try {
      const statusParam = filter === 'active' ? '' : filter === 'completed' ? '?status=completed' : '';
      const [reqData, statsData] = await Promise.all([
        api.get(`/teleradiology/requests${statusParam}`),
        api.get('/teleradiology/stats')
      ]);
      let items = reqData.data || [];
      if (filter === 'active') {
        items = items.filter(r => !['completed', 'cancelled'].includes(r.status));
      }
      setRequests(items);
      setStats(statsData.data || {});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.put(`/teleradiology/requests/${id}`, { status: newStatus });
      loadData();
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="text-dark-400 text-center py-12">Loading teleradiology queue...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Teleradiology Queue</h1>
          <p className="text-dark-400 mt-1">Real-time reading queue with SLA tracking</p>
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4">{error}</div>}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <div className="card py-3 px-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.pending_count || 0}</p>
          <p className="text-xs text-dark-400 mt-1">Pending</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.in_progress_count || 0}</p>
          <p className="text-xs text-dark-400 mt-1">In Progress</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.completed_count || 0}</p>
          <p className="text-xs text-dark-400 mt-1">Completed</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.sla_met || 0}</p>
          <p className="text-xs text-dark-400 mt-1">SLA Met</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.sla_breached || 0}</p>
          <p className="text-xs text-dark-400 mt-1">SLA Breached</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.overdue || 0}</p>
          <p className="text-xs text-dark-400 mt-1">Overdue</p>
        </div>
        <div className="card py-3 px-4 text-center">
          <p className="text-2xl font-bold text-msk-400">{stats.avg_tat_hours ? `${parseFloat(stats.avg_tat_hours).toFixed(1)}h` : '-'}</p>
          <p className="text-xs text-dark-400 mt-1">Avg TAT</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {['active', 'completed', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-msk-600/20 text-msk-400' : 'bg-dark-800 text-dark-400 hover:text-white'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Queue Table */}
      {requests.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-dark-400 text-lg">No teleradiology requests {filter === 'active' ? 'in queue' : 'found'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const priority = PRIORITY_BADGES[req.priority] || PRIORITY_BADGES.routine;
            const statusBadge = STATUS_BADGES[req.status] || STATUS_BADGES.pending;

            return (
              <div key={req.id} className="card hover:border-dark-600 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Priority badge */}
                    <span className={`px-2 py-1 text-xs font-bold rounded ${priority.bg} ${priority.text}`}>
                      {priority.label}
                    </span>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">
                          {req.case_number || `Case #${req.case_id}`}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded ${statusBadge.bg} ${statusBadge.text}`}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-dark-400 text-sm mt-0.5">
                        {req.modality && <span className="mr-3">{req.modality}</span>}
                        {req.body_part && <span className="mr-3">{req.body_part}</span>}
                        {req.referring_provider_name && <span>Ref: {req.referring_provider_name}</span>}
                      </p>
                      {req.clinical_info && (
                        <p className="text-dark-500 text-xs mt-1 line-clamp-1">{req.clinical_info}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* SLA Timer */}
                    <div className="text-right">
                      <p className="text-xs text-dark-500 mb-1">SLA ({req.sla_hours}h)</p>
                      <SLATimer deadline={req.sla_deadline} status={req.status} />
                    </div>

                    {/* Assigned */}
                    <div className="text-right min-w-[120px]">
                      <p className="text-xs text-dark-500 mb-1">Radiologist</p>
                      <p className="text-sm text-dark-300">{req.assigned_radiologist_name || 'Unassigned'}</p>
                    </div>

                    {/* Actions */}
                    {req.status === 'pending' && (
                      <button
                        onClick={() => handleStatusChange(req.id, 'in_progress')}
                        className="btn-primary text-xs px-3 py-1"
                      >
                        Start
                      </button>
                    )}
                    {req.status === 'in_progress' && (
                      <button
                        onClick={() => handleStatusChange(req.id, 'completed')}
                        className="btn-primary text-xs px-3 py-1 bg-green-600 hover:bg-green-700"
                      >
                        Complete
                      </button>
                    )}
                    {req.status === 'completed' && req.case_id && (
                      <button
                        onClick={() => navigate(`/cases/${req.case_id}`)}
                        className="btn-secondary text-xs px-3 py-1"
                      >
                        View Case
                      </button>
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
