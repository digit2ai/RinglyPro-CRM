import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { SkeletonDashboard } from '../components/Skeleton';

export default function Dashboard() {
  const user = api.getUser();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await api.get('/cases?limit=10');
      setCases(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyBadge = (urgency) => {
    const map = { emergency: 'badge-emergency', urgent: 'badge-urgent', priority: 'badge-priority', routine: 'badge-routine' };
    return `badge ${map[urgency] || 'badge-routine'}`;
  };

  const getStatusLabel = (status) => {
    const labels = {
      intake: 'Intake', triage: 'Triage', imaging_ordered: 'Imaging Ordered',
      imaging_received: 'Imaging Received', under_review: 'Under Review',
      report_ready: 'Report Ready', consult_scheduled: 'Consult Scheduled',
      consult_complete: 'Consult Complete', follow_up: 'Follow-Up',
      closed: 'Closed', emergency: 'Emergency'
    };
    return labels[status] || status;
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          {greeting()}, {user?.firstName}
        </h1>
        <p className="text-dark-400 mt-1">
          {user?.role === 'radiologist' ? 'Review your case queue and pending reports' :
           user?.role === 'admin' ? 'Monitor platform operations and KPIs' :
           'Track your cases and diagnostic reports'}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {user?.role !== 'radiologist' && (
          <Link to="/cases/new" className="card hover:border-msk-500/50 transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-msk-600/20 flex items-center justify-center text-2xl group-hover:bg-msk-600/30 transition-all">
                ➕
              </div>
              <div>
                <h3 className="text-white font-semibold">New Case</h3>
                <p className="text-dark-400 text-sm">Start a diagnostic case</p>
              </div>
            </div>
          </Link>
        )}
        <Link to="/cases" className="card hover:border-msk-500/50 transition-all group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center text-2xl group-hover:bg-purple-600/30 transition-all">
              📋
            </div>
            <div>
              <h3 className="text-white font-semibold">
                {user?.role === 'radiologist' ? 'Case Queue' : 'My Cases'}
              </h3>
              <p className="text-dark-400 text-sm">{cases.length} active</p>
            </div>
          </div>
        </Link>
        <Link to="/reports" className="card hover:border-msk-500/50 transition-all group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-600/20 flex items-center justify-center text-2xl group-hover:bg-green-600/30 transition-all">
              📄
            </div>
            <div>
              <h3 className="text-white font-semibold">Reports</h3>
              <p className="text-dark-400 text-sm">View diagnostic reports</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Cases */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Recent Cases</h2>
          <Link to="/cases" className="text-msk-400 text-sm hover:text-msk-300">View All</Link>
        </div>

        {loading ? (
          <SkeletonDashboard />
        ) : cases.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🦴</div>
            <p className="text-dark-400">No cases yet</p>
            {user?.role !== 'radiologist' && (
              <Link to="/cases/new" className="btn-primary inline-block mt-4">Create Your First Case</Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                  <th className="pb-3 font-medium">Case #</th>
                  <th className="pb-3 font-medium">Patient</th>
                  <th className="pb-3 font-medium">Complaint</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Urgency</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {cases.map(c => (
                  <tr key={c.id} className="hover:bg-dark-800/50 cursor-pointer" onClick={() => window.location.href = `/msk/cases/${c.id}`}>
                    <td className="py-3 text-msk-400 font-mono text-sm">{c.case_number}</td>
                    <td className="py-3 text-white">
                      {c.patient_first_name ? `${c.patient_first_name} ${c.patient_last_name}` : 'Unassigned'}
                    </td>
                    <td className="py-3 text-dark-300 text-sm max-w-xs truncate">{c.chief_complaint}</td>
                    <td className="py-3">
                      <span className="badge status-intake">{getStatusLabel(c.status)}</span>
                    </td>
                    <td className="py-3">
                      <span className={getUrgencyBadge(c.urgency)}>{c.urgency}</span>
                    </td>
                    <td className="py-3 text-dark-400 text-sm">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
