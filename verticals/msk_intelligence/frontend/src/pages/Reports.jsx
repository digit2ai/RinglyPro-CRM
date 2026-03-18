import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const data = await api.get('/reports');
      setReports(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading reports...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Diagnostic Reports</h1>
        <p className="text-dark-400 text-sm">{reports.length} reports</p>
      </div>

      {reports.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📄</div>
          <p className="text-dark-400 text-lg">No reports yet</p>
          <p className="text-dark-500 text-sm mt-2">Reports will appear here once a radiologist completes a review</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <div key={r.id} className="card hover:border-dark-500 transition-all cursor-pointer"
              onClick={() => window.location.href = `/msk/cases/${r.case_id}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-white font-bold capitalize">{r.report_type} Report</h3>
                    <span className={`badge ${r.status === 'finalized' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                      {r.status}
                    </span>
                    <span className="text-dark-500 text-sm font-mono">{r.case_number}</span>
                  </div>

                  {r.summary && <p className="text-dark-300 text-sm mb-3">{r.summary}</p>}

                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-dark-400">Radiologist: </span>
                      <span className="text-white">Dr. {r.radiologist_first_name} {r.radiologist_last_name}</span>
                    </div>
                    {r.credentials && (
                      <div>
                        <span className="text-dark-500">{r.credentials}</span>
                      </div>
                    )}
                    {r.severity_grade && (
                      <div>
                        <span className="text-dark-400">Severity: </span>
                        <span className="text-orange-400">{r.severity_grade}</span>
                      </div>
                    )}
                    {r.recovery_timeline_weeks && (
                      <div>
                        <span className="text-dark-400">Recovery: </span>
                        <span className="text-msk-400">~{r.recovery_timeline_weeks} weeks</span>
                      </div>
                    )}
                  </div>

                  {r.impression && (
                    <div className="mt-3 pt-3 border-t border-dark-700">
                      <span className="text-dark-400 text-sm">Impression: </span>
                      <span className="text-dark-200 text-sm">{r.impression}</span>
                    </div>
                  )}
                </div>

                <div className="text-dark-400 text-sm text-right">
                  {new Date(r.created_at).toLocaleDateString()}
                  {r.finalized_at && (
                    <p className="text-green-500 text-xs mt-1">Finalized {new Date(r.finalized_at).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
