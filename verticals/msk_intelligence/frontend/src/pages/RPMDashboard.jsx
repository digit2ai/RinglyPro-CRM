import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function RPMDashboard() {
  const [enrollments, setEnrollments] = useState([]);
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualEntry, setManualEntry] = useState({ readingType: 'pain_score', value: '', unit: 'score' });
  const user = api.getUser();

  useEffect(() => { loadEnrollments(); }, []);
  useEffect(() => { if (selectedEnrollment) loadDashboard(); }, [selectedEnrollment]);

  const loadEnrollments = async () => {
    try {
      if (user?.role === 'patient') {
        const data = await api.get('/rpm/my-enrollment');
        if (data.data) {
          setEnrollments([data.data]);
          setSelectedEnrollment(data.data.id);
        }
      } else {
        // Providers see all enrollments (placeholder — would need a list endpoint)
        const data = await api.get('/rpm/my-enrollment').catch(() => ({ data: null }));
        if (data.data) setEnrollments([data.data]);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadDashboard = async () => {
    try {
      const data = await api.get(`/rpm/dashboard/${selectedEnrollment}`);
      setDashboard(data.data || null);
    } catch (err) { console.error(err); }
  };

  const submitManualReading = async () => {
    if (!manualEntry.value || !selectedEnrollment) return;
    try {
      await api.post('/rpm/readings', {
        enrollmentId: selectedEnrollment,
        readings: [{
          readingType: manualEntry.readingType,
          value: parseFloat(manualEntry.value),
          unit: manualEntry.unit,
          source: 'manual',
          recordedAt: new Date().toISOString()
        }]
      });
      setManualEntry({ ...manualEntry, value: '' });
      await loadDashboard();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading RPM data...</div>;

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📱</div>
        <h1 className="text-2xl font-bold text-white mb-2">Remote Patient Monitoring</h1>
        <p className="text-dark-400">No active RPM enrollment.</p>
        <p className="text-dark-500 text-sm mt-1">Your provider can enroll you in remote monitoring as part of your care plan.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Remote Patient Monitoring</h1>
      <p className="text-dark-400 mb-8">Track your recovery metrics daily</p>

      {/* Enrollment Info */}
      {enrollments[0] && (
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold">Active Enrollment</h3>
              <p className="text-dark-400 text-sm mt-1">
                Type: <span className="text-white capitalize">{enrollments[0].monitoring_type?.replace('_', ' ') || 'General'}</span>
                {enrollments[0].start_date && ` · Started ${new Date(enrollments[0].start_date).toLocaleDateString()}`}
              </p>
            </div>
            <span className="badge bg-green-500/20 text-green-400">{enrollments[0].status}</span>
          </div>
        </div>
      )}

      {/* Manual Data Entry */}
      <div className="card mb-6">
        <h3 className="text-white font-semibold mb-4">Log Reading</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-dark-400 mb-1">Type</label>
            <select value={manualEntry.readingType} onChange={e => setManualEntry({ ...manualEntry, readingType: e.target.value })} className="input-field">
              <option value="pain_score">Pain Score (0-10)</option>
              <option value="step_count">Step Count</option>
              <option value="active_minutes">Active Minutes</option>
              <option value="sleep_hours">Sleep Hours</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-dark-400 mb-1">Value</label>
            <input type="number" value={manualEntry.value} onChange={e => setManualEntry({ ...manualEntry, value: e.target.value })} className="input-field" placeholder="0" />
          </div>
          <div className="flex items-end">
            <button onClick={submitManualReading} disabled={!manualEntry.value} className="btn-primary w-full">Log</button>
          </div>
        </div>
      </div>

      {/* Dashboard Data */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Object.entries(dashboard.latest || {}).map(([type, reading]) => (
            <div key={type} className="card text-center">
              <p className="text-dark-400 text-xs capitalize mb-1">{type.replace('_', ' ')}</p>
              <p className="text-2xl font-bold text-white">{reading.value}</p>
              <p className="text-dark-500 text-[10px]">{reading.unit} · {new Date(reading.recorded_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent Readings */}
      {dashboard?.readings?.length > 0 && (
        <div className="card">
          <h3 className="text-white font-semibold mb-4">Recent Readings</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Value</th>
                  <th className="pb-2">Source</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {dashboard.readings.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 text-white text-sm capitalize">{r.reading_type?.replace('_', ' ')}</td>
                    <td className="py-2 text-msk-400 font-bold">{r.value} {r.unit}</td>
                    <td className="py-2 text-dark-400 text-sm capitalize">{r.source}</td>
                    <td className="py-2 text-dark-400 text-sm">{new Date(r.recorded_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
