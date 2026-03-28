import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import ImagingUpload from '../components/ImagingUpload';
import ROMAssessment from '../components/ROMAssessment';

export default function CaseDetail() {
  const { id } = useParams();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState(false);
  const user = api.getUser();

  useEffect(() => { loadCase(); }, [id]);

  const loadCase = async () => {
    try {
      const data = await api.get(`/cases/${id}`);
      setCaseData(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runTriage = async () => {
    setTriaging(true);
    try {
      await api.post(`/cases/${id}/triage`, {});
      await loadCase();
    } catch (err) {
      console.error(err);
    } finally {
      setTriaging(false);
    }
  };

  const updateStatus = async (status) => {
    try {
      await api.put(`/cases/${id}`, { status });
      await loadCase();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading case...</div>;
  if (!caseData) return <div className="text-center py-12 text-red-400">Case not found</div>;

  const urgencyColors = { emergency: 'text-red-400', urgent: 'text-orange-400', priority: 'text-yellow-400', routine: 'text-green-400' };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link to="/cases" className="text-msk-400 text-sm hover:text-msk-300 mb-2 inline-block">← Back to Cases</Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Case {caseData.case_number}
            <span className={`badge badge-${caseData.urgency}`}>{caseData.urgency}</span>
          </h1>
          <p className="text-dark-400 mt-1">
            Created {new Date(caseData.created_at).toLocaleString()} |
            Status: <span className="text-white font-medium capitalize">{caseData.status.replace(/_/g, ' ')}</span>
          </p>
        </div>

        <div className="flex gap-2">
          {caseData.status === 'intake' && (
            <button onClick={runTriage} disabled={triaging} className="btn-primary text-sm">
              {triaging ? 'Running Triage...' : 'Run AI Triage'}
            </button>
          )}
          {['admin', 'radiologist'].includes(user?.role) && caseData.status !== 'closed' && (
            <button onClick={() => updateStatus('closed')} className="btn-secondary text-sm">Close Case</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chief Complaint */}
          <div className="card">
            <h2 className="text-lg font-bold text-white mb-4">Chief Complaint</h2>
            <p className="text-dark-200">{caseData.chief_complaint}</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
              <div>
                <span className="text-dark-400 text-sm">Pain Location</span>
                <p className="text-white font-medium">{caseData.pain_location || '—'}</p>
              </div>
              <div>
                <span className="text-dark-400 text-sm">Mechanism</span>
                <p className="text-white font-medium capitalize">{caseData.injury_mechanism || '—'}</p>
              </div>
              <div>
                <span className="text-dark-400 text-sm">Severity</span>
                <p className={`font-bold text-lg ${caseData.severity >= 7 ? 'text-red-400' : caseData.severity >= 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {caseData.severity || '—'}/10
                </p>
              </div>
              <div>
                <span className="text-dark-400 text-sm">Case Type</span>
                <p className="text-white font-medium capitalize">{(caseData.case_type || '').replace('_', ' ')}</p>
              </div>
              <div>
                <span className="text-dark-400 text-sm">Sport Context</span>
                <p className="text-white font-medium">{caseData.sport_context || '—'}</p>
              </div>
              <div>
                <span className="text-dark-400 text-sm">Onset Date</span>
                <p className="text-white font-medium">{caseData.onset_date ? new Date(caseData.onset_date).toLocaleDateString() : '—'}</p>
              </div>
            </div>

            {caseData.functional_limitations && (
              <div className="mt-4 pt-4 border-t border-dark-700">
                <span className="text-dark-400 text-sm">Functional Limitations</span>
                <p className="text-dark-200 mt-1">{caseData.functional_limitations}</p>
              </div>
            )}
          </div>

          {/* Triage Result */}
          {caseData.triage_result && (
            <div className="card border-purple-500/30">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                🤖 AI Triage Result
              </h2>
              <div className="space-y-3">
                <div>
                  <span className="text-dark-400 text-sm">Decision</span>
                  <p className="text-white font-bold capitalize">{caseData.triage_result.decisionType?.replace(/_/g, ' ')}</p>
                </div>
                {caseData.triage_result.imagingProtocol && (
                  <div>
                    <span className="text-dark-400 text-sm">Recommended Protocol</span>
                    <p className="text-cyan-400 font-medium">{caseData.triage_result.imagingProtocol}</p>
                  </div>
                )}
                <div>
                  <span className="text-dark-400 text-sm">Reasoning</span>
                  <p className="text-dark-200 text-sm">{caseData.triage_result.reasoning}</p>
                </div>
                <div>
                  <span className="text-dark-400 text-sm">Confidence</span>
                  <p className="text-white font-medium">{Math.round((caseData.triage_result.confidenceScore || 0) * 100)}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Imaging */}
          {caseData.imaging && caseData.imaging.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-bold text-white mb-4">Imaging Orders</h2>
              <div className="space-y-3">
                {caseData.imaging.map(img => (
                  <div key={img.id} className="p-4 bg-dark-900 rounded-lg border border-dark-700">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-medium">{img.modality} — {img.body_region}</p>
                        {img.protocol && <p className="text-dark-400 text-sm mt-1">{img.protocol}</p>}
                        {img.center_name && <p className="text-dark-400 text-sm">Center: {img.center_name}</p>}
                      </div>
                      <span className="badge status-intake capitalize">{img.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reports */}
          {caseData.reports && caseData.reports.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-bold text-white mb-4">Diagnostic Reports</h2>
              {caseData.reports.map(r => (
                <div key={r.id} className="p-4 bg-dark-900 rounded-lg border border-dark-700 mb-3">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-white font-medium capitalize">{r.report_type} Report</p>
                      <p className="text-dark-400 text-sm">
                        Dr. {r.radiologist_first_name} {r.radiologist_last_name} | {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`badge ${r.status === 'finalized' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {r.status}
                    </span>
                  </div>
                  {r.summary && <p className="text-dark-200 text-sm mb-2"><strong>Summary:</strong> {r.summary}</p>}
                  {r.impression && <p className="text-dark-200 text-sm mb-2"><strong>Impression:</strong> {r.impression}</p>}
                  {r.recovery_timeline_weeks && (
                    <p className="text-msk-400 text-sm"><strong>Recovery:</strong> ~{r.recovery_timeline_weeks} weeks</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Patient Info */}
          <div className="card">
            <h3 className="text-md font-bold text-white mb-3">Patient</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-dark-400">Name:</span> <span className="text-white">{caseData.patient_first_name} {caseData.patient_last_name}</span></p>
              {caseData.sport && <p><span className="text-dark-400">Sport:</span> <span className="text-white">{caseData.sport}</span></p>}
              {caseData.team && <p><span className="text-dark-400">Team:</span> <span className="text-white">{caseData.team}</span></p>}
            </div>
          </div>

          {/* Radiologist */}
          <div className="card">
            <h3 className="text-md font-bold text-white mb-3">Radiologist</h3>
            {caseData.radiologist_first_name ? (
              <div className="text-sm">
                <p className="text-white font-medium">Dr. {caseData.radiologist_first_name} {caseData.radiologist_last_name}</p>
                {caseData.credentials && <p className="text-dark-400 text-xs mt-1">{caseData.credentials}</p>}
              </div>
            ) : (
              <p className="text-dark-400 text-sm">Not yet assigned</p>
            )}
          </div>

          {/* Timeline */}
          <div className="card">
            <h3 className="text-md font-bold text-white mb-4">Case Timeline</h3>
            {caseData.timeline && caseData.timeline.length > 0 ? (
              <div className="space-y-4">
                {caseData.timeline.map((event, i) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-msk-500 mt-1.5" />
                      {i < caseData.timeline.length - 1 && <div className="w-px flex-1 bg-dark-700 mt-1" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-white text-sm font-medium">{event.event_title}</p>
                      {event.event_description && <p className="text-dark-400 text-xs mt-0.5">{event.event_description}</p>}
                      <p className="text-dark-500 text-xs mt-1">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dark-400 text-sm">No timeline events yet</p>
            )}
          </div>

          {/* Video Consultation */}
          {caseData.consultation && (
            <div className="card border-green-500/20">
              <h3 className="text-md font-bold text-white mb-3">Video Consultation</h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-dark-400">Status:</span> <span className="text-white capitalize">{caseData.consultation.status?.replace('_', ' ')}</span></p>
                <p><span className="text-dark-400">Scheduled:</span> <span className="text-white">{caseData.consultation.scheduled_at ? new Date(caseData.consultation.scheduled_at).toLocaleString() : '—'}</span></p>
              </div>
              {['scheduled', 'confirmed', 'in_progress'].includes(caseData.consultation?.status) && caseData.consultation?.meeting_url && (
                <Link
                  to={`/video/${caseData.consultation.meeting_url.split('/').pop()}`}
                  className="btn-primary w-full text-center text-sm mt-3 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Join Video Call
                </Link>
              )}
            </div>
          )}

          {/* Pricing */}
          <div className="card">
            <h3 className="text-md font-bold text-white mb-3">Service Tier</h3>
            <p className="text-msk-400 font-medium capitalize">{(caseData.pricing_tier || 'imaging_review').replace(/_/g, ' ')}</p>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h3 className="text-md font-bold text-white mb-3">Actions</h3>
            <div className="space-y-2">
              <Link to={`/messages/${id}`} className="btn-secondary w-full text-center text-sm block">
                💬 Messages
              </Link>
              <Link to={`/appointments/schedule?caseId=${id}`} className="btn-secondary w-full text-center text-sm block">
                📅 Schedule Appointment
              </Link>
              <Link to={`/proms?caseId=${id}`} className="btn-secondary w-full text-center text-sm block">
                📝 Assessments (PROMs)
              </Link>
              <a href={`/msk/api/v1/fhir/cases/${id}/export/pdf`} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full text-center text-sm block">
                📄 Export PDF
              </a>
              {['admin', 'radiologist', 'staff'].includes(user?.role) && (
                <Link to={`/rehab/create?caseId=${id}&patientId=${caseData.patient_id || ''}`} className="btn-secondary w-full text-center text-sm block">
                  🏋️ Create Exercise Program
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Imaging Upload + ROM Assessment */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-bold text-white mb-4">Upload Imaging</h2>
          <ImagingUpload caseId={id} onUploadComplete={() => loadCase()} />
        </div>
        <ROMAssessment caseId={parseInt(id)} onMeasurementSaved={() => loadCase()} />
      </div>
    </div>
  );
}
