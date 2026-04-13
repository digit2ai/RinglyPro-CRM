import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Conversation } from '@11labs/client';
import api from '../services/api';
import ImagingUpload from '../components/ImagingUpload';
import ROMAssessment from '../components/ROMAssessment';
import DiagnosticCopilot from '../components/DiagnosticCopilot';

// Fetches an image via authenticated API and returns a blob URL for <img src>
function AuthImage({ fileId, alt, className, style, onClick }) {
  const [src, setSrc] = React.useState(null);
  React.useEffect(() => {
    let revoke = null;
    const token = localStorage.getItem('msk_token');
    fetch(`/msk/api/v1/imaging/file/${fileId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setSrc(url);
      })
      .catch(() => {});
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [fileId]);
  if (!src) return <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827' }}><span className="text-dark-500 text-sm">Loading...</span></div>;
  return <img src={src} alt={alt} className={className} style={style} onClick={onClick} />;
}

export default function CaseDetail() {
  const { id } = useParams();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState(false);
  const [imagingFiles, setImagingFiles] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const user = api.getUser();

  useEffect(() => { loadCase(); loadImagingFiles(); }, [id]);

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

  const loadImagingFiles = async () => {
    try {
      const data = await api.get(`/imaging/files/${id}`);
      setImagingFiles(data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const reanalyzeImage = async (fileId) => {
    try {
      await api.post(`/imaging/analyze/${fileId}`, {});
      await loadImagingFiles();
    } catch (err) {
      console.error(err);
    }
  };

  // ── Lina Voice Assistant ───────────────────────────────────────
  const [voiceStatus, setVoiceStatus] = useState('idle'); // idle | connecting | connected | error
  const [isSpeaking, setIsSpeaking] = useState(false);
  const conversationRef = useRef(null);

  const startVoiceCall = useCallback(async () => {
    setVoiceStatus('connecting');
    try {
      // Get signed URL + dynamic case data from backend
      const tokenData = await api.post('/voice/case-assistant-token', { caseId: parseInt(id) });
      if (!tokenData.success || !tokenData.signed_url) {
        throw new Error(tokenData.error || 'Failed to get voice token');
      }

      const conversation = await Conversation.startSession({
        signedUrl: tokenData.signed_url,
        dynamicVariables: tokenData.dynamic_variables,
        onConnect: () => { setVoiceStatus('connected'); },
        onDisconnect: () => { setVoiceStatus('idle'); conversationRef.current = null; },
        onError: (err) => { console.error('[Lina Voice]', err); setVoiceStatus('error'); },
        onModeChange: ({ mode }) => { setIsSpeaking(mode === 'speaking'); }
      });

      conversationRef.current = conversation;
    } catch (err) {
      console.error('[Lina Voice] Start error:', err);
      setVoiceStatus('error');
      setTimeout(() => setVoiceStatus('idle'), 3000);
    }
  }, [id]);

  const endVoiceCall = useCallback(async () => {
    if (conversationRef.current) {
      await conversationRef.current.endSession();
      conversationRef.current = null;
    }
    setVoiceStatus('idle');
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (conversationRef.current) conversationRef.current.endSession().catch(() => {}); };
  }, []);

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

          {/* Uploaded Images + AI Analysis */}
          {imagingFiles.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-bold text-white mb-4">
                Uploaded Imaging ({imagingFiles.length} file{imagingFiles.length > 1 ? 's' : ''})
              </h2>

              {/* Image grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {imagingFiles.map(file => {
                  const isImage = ['jpg', 'jpeg', 'png', 'image/jpeg', 'image/png'].some(t =>
                    (file.file_type || '').includes(t) || (file.mime_type || '').includes(t)
                  );
                  const analysis = file.ai_analysis ? (typeof file.ai_analysis === 'string' ? JSON.parse(file.ai_analysis) : file.ai_analysis) : null;

                  return (
                    <div key={file.id} className="relative group">
                      <div
                        className={`rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                          selectedImage === file.id ? 'border-msk-500 ring-2 ring-msk-500/30' : 'border-dark-700 hover:border-dark-500'
                        }`}
                        onClick={() => setSelectedImage(selectedImage === file.id ? null : file.id)}
                      >
                        {isImage ? (
                          <AuthImage fileId={file.id} alt={file.file_name} className="w-full h-40 object-cover bg-dark-900" />
                        ) : (
                          <div className="w-full h-40 bg-dark-900 flex items-center justify-center">
                            <div className="text-center">
                              <span className="text-3xl">
                                {file.file_type === 'dicom' ? '🏥' : file.file_type === 'pdf' ? '📄' : '📁'}
                              </span>
                              <p className="text-dark-400 text-xs mt-2 uppercase">{file.file_type}</p>
                            </div>
                          </div>
                        )}
                        {/* AI analysis badge */}
                        {analysis && (
                          <div className="absolute top-2 right-2 bg-green-500/90 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            AI Analyzed
                          </div>
                        )}
                      </div>
                      <p className="text-dark-400 text-xs mt-1 truncate">{file.file_name}</p>
                      <p className="text-dark-500 text-xs">{new Date(file.created_at).toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>

              {/* Full-size image viewer + AI analysis detail */}
              {selectedImage && (() => {
                const file = imagingFiles.find(f => f.id === selectedImage);
                if (!file) return null;
                const isImage = ['jpg', 'jpeg', 'png', 'image/jpeg', 'image/png'].some(t =>
                  (file.file_type || '').includes(t) || (file.mime_type || '').includes(t)
                );
                const analysis = file.ai_analysis ? (typeof file.ai_analysis === 'string' ? JSON.parse(file.ai_analysis) : file.ai_analysis) : null;

                return (
                  <div className="border-t border-dark-700 pt-4">
                    {/* Full-size image */}
                    {isImage && (
                      <div className="mb-4 bg-black rounded-lg overflow-hidden">
                        <AuthImage fileId={file.id} alt={file.file_name} className="w-full object-contain" style={{ maxHeight: '600px' }} />
                      </div>
                    )}

                    {/* AI Analysis Results */}
                    {analysis ? (
                      <div className="bg-dark-900 rounded-lg border border-dark-700 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-white font-bold flex items-center gap-2">
                            <span className="text-purple-400">AI</span> Image Analysis
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              analysis.confidenceLevel === 'High' ? 'bg-green-500/20 text-green-400' :
                              analysis.confidenceLevel === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {analysis.confidenceLevel} Confidence
                            </span>
                            <button onClick={() => reanalyzeImage(file.id)} className="text-xs text-dark-400 hover:text-msk-400">
                              Re-analyze
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                          <div>
                            <span className="text-dark-400">Modality:</span>{' '}
                            <span className="text-white font-medium">{analysis.modality}</span>
                          </div>
                          <div>
                            <span className="text-dark-400">Body Region:</span>{' '}
                            <span className="text-white font-medium">{analysis.bodyRegion}</span>
                          </div>
                        </div>

                        <div className="mb-3">
                          <p className="text-dark-400 text-sm font-medium mb-1">Findings</p>
                          <p className="text-dark-200 text-sm leading-relaxed">{analysis.findings}</p>
                        </div>

                        <div className="mb-3 bg-dark-800/50 rounded-lg p-3 border-l-4 border-msk-500">
                          <p className="text-dark-400 text-sm font-medium mb-1">Impression</p>
                          <p className="text-white text-sm font-medium">{analysis.impression}</p>
                        </div>

                        {analysis.abnormalitiesDetected && analysis.abnormalitiesDetected.length > 0 && (
                          <div className="mb-3">
                            <p className="text-dark-400 text-sm font-medium mb-1">Abnormalities Detected</p>
                            <div className="flex flex-wrap gap-1.5">
                              {analysis.abnormalitiesDetected.map((a, i) => (
                                <span key={i} className="bg-red-500/15 text-red-400 text-xs px-2 py-1 rounded-md border border-red-500/20">
                                  {a}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {analysis.icd10Suggestions && analysis.icd10Suggestions.length > 0 && (
                          <div className="mb-3">
                            <p className="text-dark-400 text-sm font-medium mb-1">Suggested ICD-10 Codes</p>
                            <div className="flex flex-wrap gap-1.5">
                              {analysis.icd10Suggestions.map((c, i) => (
                                <span key={i} className="bg-blue-500/15 text-blue-400 text-xs px-2 py-1 rounded-md border border-blue-500/20">
                                  <strong>{c.code}</strong> {c.description}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {analysis.recommendedFollowUp && (
                          <div className="mb-3">
                            <p className="text-dark-400 text-sm font-medium mb-1">Recommended Follow-Up</p>
                            <p className="text-dark-200 text-sm">{analysis.recommendedFollowUp}</p>
                          </div>
                        )}

                        {analysis.limitations && (
                          <div className="text-dark-500 text-xs italic">
                            Limitations: {analysis.limitations}
                          </div>
                        )}

                        <div className="mt-3 pt-3 border-t border-dark-700">
                          <p className="text-dark-500 text-xs">
                            AI-assisted preliminary read -- must be reviewed and finalized by a qualified radiologist.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-dark-900 rounded-lg border border-dark-700 p-4 text-center">
                        <p className="text-dark-400 text-sm mb-2">No AI analysis available for this file</p>
                        <button onClick={() => reanalyzeImage(file.id)} className="btn-primary text-sm">
                          Run AI Analysis
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
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

          {/* Lina Voice Assistant */}
          <div className={`card ${voiceStatus === 'connected' ? 'border-green-500/50 ring-1 ring-green-500/20' : 'border-msk-500/30'}`}>
            <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2">
              {voiceStatus === 'connected' && (
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              )}
              Lina — Case Assistant
            </h3>
            <p className="text-dark-400 text-xs mb-3">
              {voiceStatus === 'idle' && 'Talk to Lina about this case — she knows the full clinical picture.'}
              {voiceStatus === 'connecting' && 'Connecting to Lina...'}
              {voiceStatus === 'connected' && (isSpeaking ? 'Lina is speaking...' : 'Lina is listening...')}
              {voiceStatus === 'error' && 'Connection failed. Try again.'}
            </p>

            {voiceStatus === 'connected' && (
              <div className="flex justify-center mb-3">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isSpeaking
                    ? 'bg-gradient-to-br from-green-500 to-emerald-600 scale-110 shadow-lg shadow-green-500/30'
                    : 'bg-gradient-to-br from-msk-500 to-blue-600 animate-pulse'
                }`}>
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </div>
            )}

            {voiceStatus === 'idle' || voiceStatus === 'error' ? (
              <button onClick={startVoiceCall} className="w-full bg-gradient-to-r from-msk-500 to-blue-600 hover:from-msk-400 hover:to-blue-500 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Talk to Lina
              </button>
            ) : voiceStatus === 'connecting' ? (
              <button disabled className="w-full bg-dark-700 text-dark-400 py-3 rounded-lg flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </button>
            ) : (
              <button onClick={endVoiceCall} className="w-full bg-red-600 hover:bg-red-500 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L8.228 3.684A1 1 0 007.28 3H5z" />
                </svg>
                End Call
              </button>
            )}
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

      {/* AI Diagnostic Copilot — radiologist/admin only */}
      {['admin', 'radiologist'].includes(user?.role) && (
        <div className="mt-6">
          <DiagnosticCopilot caseId={parseInt(id)} onReportGenerated={() => loadCase()} />
        </div>
      )}

      {/* Imaging Upload + ROM Assessment */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-bold text-white mb-4">Upload Imaging</h2>
          <ImagingUpload caseId={id} onUploadComplete={() => { loadCase(); loadImagingFiles(); }} />
        </div>
        <ROMAssessment caseId={parseInt(id)} onMeasurementSaved={() => loadCase()} />
      </div>
    </div>
  );
}
