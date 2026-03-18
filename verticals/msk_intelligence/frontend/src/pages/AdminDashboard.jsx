import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.get('/admin/dashboard');
      setStats(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading analytics...</div>;
  if (!stats) return <div className="text-center py-12 text-red-400">Failed to load dashboard</div>;

  const formatCurrency = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Admin Dashboard</h1>
      <p className="text-dark-400 mb-8">Platform KPIs and operations overview</p>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Cases', value: stats.cases?.total_cases || 0, color: 'text-msk-400', sub: `${stats.cases?.new_last_24h || 0} new today` },
          { label: 'Active Cases', value: (stats.cases?.total_cases || 0) - (stats.cases?.closed || 0), color: 'text-blue-400', sub: `${stats.cases?.emergencies || 0} emergencies` },
          { label: 'Total Patients', value: stats.patients?.total_patients || 0, color: 'text-purple-400', sub: `${stats.patients?.new_last_30d || 0} new this month` },
          { label: 'Reports Finalized', value: stats.reports?.finalized || 0, color: 'text-green-400', sub: `${stats.reports?.drafts || 0} drafts pending` }
        ].map((stat, i) => (
          <div key={i} className="card">
            <p className="text-dark-400 text-sm">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
            <p className="text-dark-500 text-xs mt-2">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue & Subscriptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-dark-400 text-sm">Total Revenue</p>
          <p className="text-3xl font-bold text-green-400 mt-1">
            {formatCurrency(stats.revenue?.paid_revenue_cents || 0)}
          </p>
          <p className="text-dark-500 text-xs mt-2">
            {formatCurrency(stats.revenue?.revenue_last_30d_cents || 0)} last 30 days
          </p>
          <p className="text-dark-500 text-xs">
            {stats.revenue?.pending_invoices || 0} pending invoices
          </p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-sm">Active Subscriptions</p>
          <p className="text-3xl font-bold text-purple-400 mt-1">{stats.subscriptions?.active_subscriptions || 0}</p>
          <p className="text-dark-500 text-xs mt-2">
            MRR: {formatCurrency(stats.subscriptions?.monthly_recurring_cents || 0)}
          </p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-sm">B2B Contracts</p>
          <p className="text-3xl font-bold text-orange-400 mt-1">{stats.b2b?.active_contracts || 0}</p>
          <p className="text-dark-500 text-xs mt-2">
            Value: {formatCurrency(stats.b2b?.total_contract_value_cents || 0)}/mo
          </p>
        </div>
      </div>

      {/* Case Pipeline */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold text-white mb-4">Case Pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Intake', value: stats.cases?.intake || 0, color: 'bg-blue-500' },
            { label: 'Triage', value: stats.cases?.triage || 0, color: 'bg-purple-500' },
            { label: 'Imaging', value: stats.cases?.imaging || 0, color: 'bg-cyan-500' },
            { label: 'Under Review', value: stats.cases?.under_review || 0, color: 'bg-yellow-500' },
            { label: 'Report Ready', value: stats.cases?.report_ready || 0, color: 'bg-green-500' }
          ].map((stage, i) => (
            <div key={i} className="text-center p-4 bg-dark-900 rounded-lg">
              <div className={`w-3 h-3 rounded-full ${stage.color} mx-auto mb-2`} />
              <p className="text-2xl font-bold text-white">{stage.value}</p>
              <p className="text-dark-400 text-xs mt-1">{stage.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Turnaround */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold text-white mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-dark-400 text-sm">Avg Report Turnaround</p>
            <p className="text-2xl font-bold text-msk-400 mt-1">
              {stats.reports?.avg_turnaround_hours
                ? `${Math.round(stats.reports.avg_turnaround_hours)}h`
                : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-dark-400 text-sm">Urgent Cases</p>
            <p className="text-2xl font-bold text-orange-400 mt-1">{stats.cases?.urgent_cases || 0}</p>
          </div>
          <div>
            <p className="text-dark-400 text-sm">Cases (7 days)</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{stats.cases?.new_last_7d || 0}</p>
          </div>
        </div>
      </div>

      {/* Recent Cases */}
      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">Recent Cases</h2>
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
              {(stats.recentCases || []).map(c => (
                <tr key={c.id} className="hover:bg-dark-800/50 cursor-pointer"
                  onClick={() => window.location.href = `/msk/cases/${c.id}`}>
                  <td className="py-3 text-msk-400 font-mono text-sm">{c.case_number}</td>
                  <td className="py-3 text-white">{c.patient_first_name ? `${c.patient_first_name} ${c.patient_last_name}` : '—'}</td>
                  <td className="py-3 text-dark-300 text-sm max-w-xs truncate">{c.chief_complaint}</td>
                  <td className="py-3"><span className="badge status-intake capitalize">{c.status?.replace(/_/g, ' ')}</span></td>
                  <td className="py-3"><span className={`badge badge-${c.urgency}`}>{c.urgency}</span></td>
                  <td className="py-3 text-dark-400 text-sm">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
