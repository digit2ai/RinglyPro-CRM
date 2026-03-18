import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function CaseList() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '', urgency: '' });
  const navigate = useNavigate();

  useEffect(() => { loadCases(); }, [filter]);

  const loadCases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filter.status) params.set('status', filter.status);
      if (filter.urgency) params.set('urgency', filter.urgency);
      const data = await api.get(`/cases?${params}`);
      setCases(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyBadge = (u) => {
    const m = { emergency: 'badge-emergency', urgent: 'badge-urgent', priority: 'badge-priority', routine: 'badge-routine' };
    return `badge ${m[u] || 'badge-routine'}`;
  };

  const statusLabel = (s) => {
    const l = {
      intake: 'Intake', triage: 'Triage', imaging_ordered: 'Imaging Ordered',
      imaging_received: 'Imaging Received', under_review: 'Under Review',
      report_ready: 'Report Ready', consult_scheduled: 'Consult Scheduled',
      consult_complete: 'Consult Complete', follow_up: 'Follow-Up',
      closed: 'Closed', emergency: 'Emergency'
    };
    return l[s] || s;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Cases</h1>
          <p className="text-dark-400 text-sm">{cases.length} cases found</p>
        </div>
        <Link to="/cases/new" className="btn-primary">New Case</Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="input-field w-auto">
            <option value="">All Statuses</option>
            {['intake','triage','imaging_ordered','imaging_received','under_review','report_ready','consult_scheduled','consult_complete','follow_up','closed'].map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
          <select value={filter.urgency} onChange={e => setFilter({ ...filter, urgency: e.target.value })} className="input-field w-auto">
            <option value="">All Urgencies</option>
            {['routine','priority','urgent','emergency'].map(u => (
              <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Cases Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-12 text-dark-400">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-dark-400 mb-4">No cases found</p>
            <Link to="/cases/new" className="btn-primary">Create First Case</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                  <th className="pb-3 font-medium">Case #</th>
                  <th className="pb-3 font-medium">Patient</th>
                  <th className="pb-3 font-medium">Chief Complaint</th>
                  <th className="pb-3 font-medium">Location</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Urgency</th>
                  <th className="pb-3 font-medium">Radiologist</th>
                  <th className="pb-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {cases.map(c => (
                  <tr key={c.id} className="hover:bg-dark-800/50 cursor-pointer transition-colors" onClick={() => navigate(`/cases/${c.id}`)}>
                    <td className="py-3 text-msk-400 font-mono text-sm">{c.case_number}</td>
                    <td className="py-3 text-white font-medium">
                      {c.patient_first_name ? `${c.patient_first_name} ${c.patient_last_name}` : '—'}
                    </td>
                    <td className="py-3 text-dark-300 text-sm max-w-xs truncate">{c.chief_complaint}</td>
                    <td className="py-3 text-dark-300 text-sm">{c.pain_location || '—'}</td>
                    <td className="py-3"><span className="badge status-intake">{statusLabel(c.status)}</span></td>
                    <td className="py-3"><span className={getUrgencyBadge(c.urgency)}>{c.urgency}</span></td>
                    <td className="py-3 text-dark-300 text-sm">
                      {c.radiologist_first_name ? `Dr. ${c.radiologist_last_name}` : 'Unassigned'}
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
