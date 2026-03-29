import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function EngagementDashboard() {
  const [tab, setTab] = useState('overview');
  const [patientData, setPatientData] = useState(null);
  const [providerData, setProviderData] = useState(null);
  const [siteData, setSiteData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [outcomes, setOutcomes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [p, pr, s, a, o] = await Promise.all([
        api.get('/engagement/patient-engagement').catch(() => ({ data: {} })),
        api.get('/engagement/provider-performance').catch(() => ({ data: [] })),
        api.get('/engagement/site-activity').catch(() => ({ data: {} })),
        api.get('/engagement/compliance-alerts').catch(() => ({ data: [] })),
        api.get('/engagement/outcome-correlation').catch(() => ({ data: {} }))
      ]);
      setPatientData(p.data || p || {});
      setProviderData(pr.data?.providers || pr.providers || pr.data || []);
      setSiteData(s.data || s || {});
      setAlerts(a.data?.alerts || a.alerts || a.data || []);
      setOutcomes(o.data || o || {});
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const sendNudge = async (patientId, nudgeType) => {
    setNudging(patientId);
    try {
      await api.post('/engagement/send-nudge', { patientId, nudgeType });
      setAlerts(prev => prev.filter(a => !(a.patientId === patientId && a.alertType === nudgeType)));
    } catch (err) { console.error(err); }
    finally { setNudging(null); }
  };

  const tabs = [
    { id: 'overview', label: 'Patient Engagement' },
    { id: 'providers', label: 'Provider Performance' },
    { id: 'sites', label: 'Site Activity' },
    { id: 'alerts', label: `Alerts${alerts.length > 0 ? ` (${alerts.length})` : ''}` },
    { id: 'outcomes', label: 'Outcome Correlation' }
  ];

  if (loading) return <div className="text-center py-12 text-dark-400">Loading engagement analytics...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Human Engagement Analytics</h1>
        <p className="text-dark-400 text-sm mt-1">Track patient, provider, and site engagement across the MSK ecosystem</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 overflow-x-auto pb-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-msk-600/20 text-msk-400' : 'text-dark-400 hover:text-white hover:bg-dark-800'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ── PATIENT ENGAGEMENT ── */}
      {tab === 'overview' && patientData && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Active Patients" value={patientData.activePatients || 0} sub="Last 30 days" color="blue" />
            <MetricCard label="ROM Assessments/Week" value={patientData.romAssessmentFrequency || '0'} sub="Per patient avg" color="cyan" />
            <MetricCard label="Exercise Compliance" value={`${patientData.exerciseComplianceRate || 0}%`} sub="Sessions logged vs expected" color={parseFloat(patientData.exerciseComplianceRate) > 70 ? 'green' : 'yellow'} />
            <MetricCard label="PROMs Completion" value={`${patientData.promsCompletionRate || 0}%`} sub="Surveys completed" color={parseFloat(patientData.promsCompletionRate) > 80 ? 'green' : 'yellow'} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Avg Pain Score" value={patientData.painScoreTrend?.[patientData.painScoreTrend.length-1]?.avg_vas || '—'} sub="Latest VAS (0-10)" color="blue" />
            <MetricCard label="No-Show Rate" value={`${patientData.noShowRate || 0}%`} sub="Appointments missed" color={parseFloat(patientData.noShowRate) > 10 ? 'red' : 'green'} />
            <MetricCard label="Messages/Case" value={patientData.messages?.avgPerCase || '0'} sub="Avg communication" color="blue" />
            <MetricCard label="Total Messages" value={patientData.messages?.total || 0} sub="Last 30 days" color="cyan" />
          </div>

          {/* Engagement Funnel */}
          <div className="card">
            <h3 className="text-white font-bold mb-6">Patient Engagement Funnel</h3>
            <div className="space-y-3">
              {[
                { stage: 'Case Created', count: patientData.funnelCaseCreated || 0, pct: 100 },
                { stage: 'AI Triage Complete', count: patientData.funnelTriaged || 0, pct: patientData.funnelCaseCreated > 0 ? Math.round((patientData.funnelTriaged || 0) / patientData.funnelCaseCreated * 100) : 0 },
                { stage: 'First Message Sent', count: patientData.funnelMessaged || 0, pct: patientData.funnelCaseCreated > 0 ? Math.round((patientData.funnelMessaged || 0) / patientData.funnelCaseCreated * 100) : 0 },
                { stage: 'ROM Assessment Done', count: patientData.funnelRomDone || 0, pct: patientData.funnelCaseCreated > 0 ? Math.round((patientData.funnelRomDone || 0) / patientData.funnelCaseCreated * 100) : 0 },
                { stage: 'PROM Completed', count: patientData.funnelPromDone || 0, pct: patientData.funnelCaseCreated > 0 ? Math.round((patientData.funnelPromDone || 0) / patientData.funnelCaseCreated * 100) : 0 },
                { stage: 'Appointment Attended', count: patientData.funnelApptAttended || 0, pct: patientData.funnelCaseCreated > 0 ? Math.round((patientData.funnelApptAttended || 0) / patientData.funnelCaseCreated * 100) : 0 },
              ].map((f, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-dark-300">{f.stage}</span>
                    <span className="text-white font-medium">{f.count} <span className="text-dark-400">({f.pct}%)</span></span>
                  </div>
                  <div className="w-full bg-dark-800 rounded-full h-2">
                    <div className="bg-msk-500 h-2 rounded-full transition-all" style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PROVIDER PERFORMANCE ── */}
      {tab === 'providers' && (
        <div className="card">
          <h3 className="text-white font-bold mb-4">Provider Performance</h3>
          {(providerData || []).length === 0 ? (
            <p className="text-dark-400 text-sm">No provider data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium text-right">Cases</th>
                    <th className="pb-3 font-medium text-right">Reports</th>
                    <th className="pb-3 font-medium text-right">Avg Turnaround</th>
                    <th className="pb-3 font-medium text-right">Consultations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {providerData.map((p, i) => (
                    <tr key={i}>
                      <td className="py-3 text-white font-medium">Dr. {p.first_name} {p.last_name}</td>
                      <td className="py-3 text-right text-dark-300">{p.cases_assigned || 0}</td>
                      <td className="py-3 text-right text-dark-300">{p.reports_finalized || 0}</td>
                      <td className="py-3 text-right">
                        <span className={`font-medium ${parseFloat(p.avg_turnaround_hours) <= 24 ? 'text-green-400' : parseFloat(p.avg_turnaround_hours) <= 48 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {p.avg_turnaround_hours ? `${p.avg_turnaround_hours}h` : '—'}
                        </span>
                      </td>
                      <td className="py-3 text-right text-dark-300">{p.consultations_completed || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── SITE ACTIVITY ── */}
      {tab === 'sites' && siteData && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Cases Today" value={siteData.casesToday || 0} color="blue" />
            <MetricCard label="Cases This Week" value={siteData.casesThisWeek || 0} color="cyan" />
            <MetricCard label="Cases This Month" value={siteData.casesThisMonth || 0} color="green" />
            <MetricCard label="Repeat Visit Rate" value={`${siteData.repeatRate || 0}%`} color="gold" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Source Breakdown */}
            <div className="card">
              <h3 className="text-white font-bold mb-4">Intake Source</h3>
              <div className="space-y-3">
                {(siteData.sources || []).map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-dark-300 capitalize">{s.source || 'unknown'}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-dark-800 rounded-full h-2">
                        <div className="bg-msk-500 h-2 rounded-full" style={{ width: `${siteData.totalCases > 0 ? (s.count / siteData.totalCases * 100) : 0}%` }} />
                      </div>
                      <span className="text-white font-medium text-sm w-8 text-right">{s.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Peak Hours */}
            <div className="card">
              <h3 className="text-white font-bold mb-4">Peak Usage Hours</h3>
              <div className="space-y-2">
                {(siteData.peakHours || []).slice(0, 8).map((h, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-dark-300 text-sm font-mono">{String(h.hour).padStart(2, '0')}:00</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-dark-800 rounded-full h-2">
                        <div className="bg-cyan-500 h-2 rounded-full" style={{ width: `${(siteData.peakHours || []).length > 0 ? (h.count / siteData.peakHours[0].count * 100) : 0}%` }} />
                      </div>
                      <span className="text-white font-medium text-sm w-8 text-right">{h.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPLIANCE ALERTS ── */}
      {tab === 'alerts' && (
        <div>
          {alerts.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-4xl mb-4">&#10003;</div>
              <h3 className="text-white font-bold mb-2">All Clear</h3>
              <p className="text-dark-400 text-sm">No patients need engagement nudges right now</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a, i) => (
                <div key={i} className={`card border-l-4 ${
                  a.alertType === 'exercise_reminder' ? 'border-l-yellow-500' :
                  a.alertType === 'prom_reminder' ? 'border-l-purple-500' :
                  'border-l-blue-500'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium">{a.patientName || `Patient #${a.patientId}`}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.alertType === 'exercise_reminder' ? 'bg-yellow-500/20 text-yellow-400' :
                          a.alertType === 'prom_reminder' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {a.alertType?.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-dark-400 text-sm">{a.details}</p>
                    </div>
                    <button
                      onClick={() => sendNudge(a.patientId, a.alertType)}
                      disabled={nudging === a.patientId}
                      className="btn-primary text-sm px-4 py-2 flex-shrink-0"
                    >
                      {nudging === a.patientId ? 'Sending...' : 'Send Nudge'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── OUTCOME CORRELATION ── */}
      {tab === 'outcomes' && outcomes && (
        <div>
          <div className="card mb-6">
            <h3 className="text-white font-bold mb-2">Exercise Compliance vs ROM Improvement</h3>
            <p className="text-dark-400 text-sm mb-6">Patients who complete more exercise sessions see greater range of motion improvement</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
                <div className="text-center">
                  <p className="text-dark-400 text-sm mb-2">High Compliance (&gt;70%)</p>
                  <p className="text-4xl font-black text-green-400">{outcomes.highCompliance?.avgRomImprovement || '—'}°</p>
                  <p className="text-dark-400 text-xs mt-1">avg ROM improvement</p>
                  <p className="text-dark-500 text-xs mt-2">{outcomes.highCompliance?.patientCount || 0} patients</p>
                </div>
              </div>
              <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
                <div className="text-center">
                  <p className="text-dark-400 text-sm mb-2">Low Compliance (&lt;70%)</p>
                  <p className="text-4xl font-black text-red-400">{outcomes.lowCompliance?.avgRomImprovement || '—'}°</p>
                  <p className="text-dark-400 text-xs mt-1">avg ROM improvement</p>
                  <p className="text-dark-500 text-xs mt-2">{outcomes.lowCompliance?.patientCount || 0} patients</p>
                </div>
              </div>
            </div>

            {outcomes.highCompliance?.avgRomImprovement && outcomes.lowCompliance?.avgRomImprovement && (
              <div className="mt-6 p-4 bg-green-500/5 border border-green-500/20 rounded-lg text-center">
                <p className="text-green-400 font-bold">
                  Patients with high exercise compliance see {Math.round((outcomes.highCompliance.avgRomImprovement / (outcomes.lowCompliance.avgRomImprovement || 1)) * 100) / 100}x more ROM improvement
                </p>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-white font-bold mb-4">What This Data Unlocks</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-dark-900 rounded-lg border border-dark-700">
                <h4 className="text-white font-semibold text-sm mb-2">PhilHealth Reimbursement</h4>
                <p className="text-dark-400 text-xs">Provable outcomes data for UHC integration and outcome-based reimbursement models</p>
              </div>
              <div className="p-4 bg-dark-900 rounded-lg border border-dark-700">
                <h4 className="text-white font-semibold text-sm mb-2">Investor Proof</h4>
                <p className="text-dark-400 text-xs">Data-driven evidence that remote MSK care produces measurable clinical outcomes</p>
              </div>
              <div className="p-4 bg-dark-900 rounded-lg border border-dark-700">
                <h4 className="text-white font-semibold text-sm mb-2">Predictive Intervention</h4>
                <p className="text-dark-400 text-xs">Identify patients at risk of dropping off and nudge them before they disengage</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'text-blue-400',
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    gold: 'text-amber-400'
  };
  return (
    <div className="card text-center py-4">
      <p className={`text-2xl font-black ${colors[color] || colors.blue}`}>{value}</p>
      <p className="text-white text-sm font-medium mt-1">{label}</p>
      {sub && <p className="text-dark-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}
