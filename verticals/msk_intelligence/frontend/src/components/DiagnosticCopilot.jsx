import React, { useState, useRef, useCallback } from 'react';
import api from '../services/api';

// Microphone icon SVG
const MicIcon = ({ active }) => (
  <svg className={`w-4 h-4 ${active ? 'text-red-400' : 'text-msk-400'}`} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

// Dictation hook using Web Speech API
function useDictation(onResult) {
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          onResult(finalTranscript.trim(), false);
        } else {
          interim += transcript;
          onResult(finalTranscript + interim, true);
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [onResult]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return { isListening, toggleListening };
}

export default function DiagnosticCopilot({ caseId, onReportGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [error, setError] = useState(null);

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await api.post('/copilot/generate-report', { caseId });
      setReport(data.report);
      setEditData(data.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const finalizeReport = async () => {
    setFinalizing(true);
    try {
      const genData = await api.post('/copilot/generate-report', { caseId });
      await api.put(`/copilot/finalize-report/${genData.reportId}`, editData);
      setFinalized(true);
      if (onReportGenerated) onReportGenerated();
    } catch (err) {
      setError(err.message);
    } finally {
      setFinalizing(false);
    }
  };

  const handleEdit = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  if (finalized) {
    return (
      <div className="card border-green-500/30">
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-white font-bold">Report Finalized</h3>
          <p className="text-dark-400 text-sm mt-1">The diagnostic report has been published to the patient's case.</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="card border-purple-500/20">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold">AI Diagnostic Copilot</h3>
            <p className="text-dark-400 text-sm mt-1 mb-4">
              Generate a comprehensive draft report from all case data — complaint, triage, ROM measurements, PROMs, and patient communications. Review and finalize.
            </p>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <button onClick={generateReport} disabled={generating} className="btn-primary text-sm">
              {generating ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing case data...
                </span>
              ) : 'Generate AI Report Draft'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-purple-500/20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">AI-Generated Report Draft</h3>
            <p className="text-dark-500 text-xs">Review, edit, and finalize</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)} className="btn-secondary text-xs px-3 py-1.5">
            {editing ? 'Preview' : 'Edit'}
          </button>
          <button onClick={() => { setReport(null); setEditData({}); }} className="text-dark-400 hover:text-white text-xs px-2">
            Regenerate
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {editing && (
        <div className="mb-4 p-3 bg-msk-600/10 border border-msk-500/20 rounded-lg flex items-center gap-2">
          <MicIcon active={false} />
          <p className="text-msk-400 text-xs">Dictation enabled — click the microphone icon on any field to dictate. Speech is appended to existing text.</p>
        </div>
      )}

      <div className="space-y-4">
        <ReportField
          label="Clinical Summary"
          value={editData.summary}
          editing={editing}
          onChange={v => handleEdit('summary', v)}
        />

        <ReportField
          label="Detailed Findings"
          value={editData.detailedFindings}
          editing={editing}
          onChange={v => handleEdit('detailedFindings', v)}
          multiline
        />

        <ReportField
          label="Diagnostic Impression"
          value={editData.impression}
          editing={editing}
          onChange={v => handleEdit('impression', v)}
          multiline
          highlight
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-dark-400 text-xs font-medium">Severity Grade</span>
            {editing ? (
              <select value={editData.severityGrade} onChange={e => handleEdit('severityGrade', e.target.value)} className="input-field mt-1 text-sm">
                <option value="Mild">Mild</option>
                <option value="Moderate">Moderate</option>
                <option value="Severe">Severe</option>
              </select>
            ) : (
              <p className={`font-bold mt-1 ${editData.severityGrade === 'Severe' ? 'text-red-400' : editData.severityGrade === 'Moderate' ? 'text-yellow-400' : 'text-green-400'}`}>
                {editData.severityGrade}
              </p>
            )}
          </div>
          <div>
            <span className="text-dark-400 text-xs font-medium">Recovery Timeline</span>
            {editing ? (
              <input type="number" value={editData.recoveryWeeks} onChange={e => handleEdit('recoveryWeeks', parseInt(e.target.value))} className="input-field mt-1 text-sm" />
            ) : (
              <p className="text-white font-bold mt-1">{editData.recoveryWeeks} weeks</p>
            )}
          </div>
        </div>

        <ReportField
          label="Recovery Plan"
          value={editData.recoveryDescription}
          editing={editing}
          onChange={v => handleEdit('recoveryDescription', v)}
          multiline
        />

        <ReportField
          label="Performance Impact"
          value={editData.performanceImpact}
          editing={editing}
          onChange={v => handleEdit('performanceImpact', v)}
        />
        <ReportField
          label="Return to Activity"
          value={editData.returnToPlay}
          editing={editing}
          onChange={v => handleEdit('returnToPlay', v)}
          multiline
        />

        {editData.sportSpecificNotes && (
          <ReportField
            label="Sport-Specific Notes"
            value={editData.sportSpecificNotes}
            editing={editing}
            onChange={v => handleEdit('sportSpecificNotes', v)}
          />
        )}

        {editData.icd10Codes?.length > 0 && (
          <div>
            <span className="text-dark-400 text-xs font-medium">ICD-10 Codes</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {editData.icd10Codes.map((code, i) => (
                <span key={i} className="px-3 py-1 bg-dark-800 rounded-lg text-xs">
                  <span className="text-msk-400 font-bold">{code.code}</span>
                  <span className="text-dark-400 ml-2">{code.description}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {editData.recommendedFollowUp && (
          <ReportField
            label="Recommended Follow-Up"
            value={editData.recommendedFollowUp}
            editing={editing}
            onChange={v => handleEdit('recommendedFollowUp', v)}
          />
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 pt-4 border-t border-dark-700 flex gap-3">
        <button onClick={finalizeReport} disabled={finalizing} className="btn-primary flex-1">
          {finalizing ? 'Finalizing...' : 'Approve & Finalize Report'}
        </button>
        <button onClick={() => setEditing(!editing)} className="btn-secondary">
          {editing ? 'Preview' : 'Edit Draft'}
        </button>
      </div>
    </div>
  );
}

function ReportField({ label, value, editing, onChange, multiline, highlight }) {
  const handleDictation = useCallback((transcript, isInterim) => {
    // Append dictated text to existing value
    if (!isInterim) {
      const existing = value || '';
      const separator = existing && !existing.endsWith(' ') ? ' ' : '';
      onChange(existing + separator + transcript);
    }
  }, [value, onChange]);

  const { isListening, toggleListening } = useDictation(handleDictation);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-dark-400 text-xs font-medium">{label}</span>
        {editing && (
          <button
            onClick={toggleListening}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
              isListening
                ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                : 'bg-dark-800 border border-dark-600 text-dark-300 hover:text-msk-400 hover:border-msk-500/30'
            }`}
            title={isListening ? 'Stop dictation' : 'Start dictation'}
          >
            <MicIcon active={isListening} />
            {isListening ? (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Listening...
              </span>
            ) : (
              'Dictate'
            )}
          </button>
        )}
      </div>
      {editing ? (
        <div className="relative mt-1">
          {multiline ? (
            <textarea
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              className={`input-field text-sm w-full ${isListening ? 'ring-2 ring-red-500/50 border-red-500/30' : ''}`}
              rows={3}
            />
          ) : (
            <input
              type="text"
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              className={`input-field text-sm w-full ${isListening ? 'ring-2 ring-red-500/50 border-red-500/30' : ''}`}
            />
          )}
        </div>
      ) : (
        <p className={`mt-1 text-sm ${highlight ? 'text-white font-medium bg-dark-800 rounded-lg p-3' : 'text-dark-200'}`}>
          {value || '—'}
        </p>
      )}
    </div>
  );
}
