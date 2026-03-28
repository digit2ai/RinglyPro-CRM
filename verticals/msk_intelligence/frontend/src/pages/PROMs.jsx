import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function PROMs() {
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');
  const navigate = useNavigate();
  const [instruments, setInstruments] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (caseId) {
      loadPending();
      loadHistory();
    }
  }, [caseId]);

  const loadPending = async () => {
    try {
      const data = await api.get(`/proms/pending/${caseId}`);
      setInstruments(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    try {
      const data = await api.get(`/proms/history/${caseId}`);
      setHistory(data.data || []);
    } catch (err) { console.error(err); }
  };

  const selectInstrument = (inst) => {
    setSelectedInstrument(inst);
    setAnswers({});
    setCurrentQ(0);
    setSubmitted(false);
  };

  const handleAnswer = (questionId, value) => {
    setAnswers({ ...answers, [questionId]: value });
  };

  const submitProm = async () => {
    setSubmitting(true);
    try {
      await api.post('/proms/submit', {
        caseId: parseInt(caseId),
        instrumentCode: selectedInstrument.code,
        answers,
        collectionPoint: 'intake'
      });
      setSubmitted(true);
      await loadHistory();
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading assessments...</div>;

  if (!caseId) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-white mb-4">Patient Assessments</h1>
        <p className="text-dark-400">Open a case to complete assessments.</p>
      </div>
    );
  }

  // Show submitted confirmation
  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Assessment Complete</h2>
        <p className="text-dark-400 mb-6">Thank you! Your responses have been recorded.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setSelectedInstrument(null); setSubmitted(false); }} className="btn-secondary">More Assessments</button>
          <button onClick={() => navigate(`/cases/${caseId}`)} className="btn-primary">Back to Case</button>
        </div>
      </div>
    );
  }

  // Show questionnaire
  if (selectedInstrument) {
    const questions = selectedInstrument.questions || [];
    const q = questions[currentQ];
    const totalQ = questions.length;
    const progress = totalQ > 0 ? ((currentQ + 1) / totalQ) * 100 : 0;

    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">{selectedInstrument.name}</h1>
            <p className="text-dark-400 text-sm">Question {currentQ + 1} of {totalQ}</p>
          </div>
          <button onClick={() => setSelectedInstrument(null)} className="text-dark-400 hover:text-white text-sm">Cancel</button>
        </div>

        <div className="w-full bg-dark-800 rounded-full h-1.5 mb-8">
          <div className="bg-msk-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>

        {q && (
          <div className="card">
            <h3 className="text-lg text-white font-medium mb-6">{q.text}</h3>

            {q.type === 'scale' && (
              <div>
                <input
                  type="range"
                  min={q.min || 0}
                  max={q.max || 10}
                  value={answers[q.id] ?? Math.round(((q.max || 10) - (q.min || 0)) / 2)}
                  onChange={e => handleAnswer(q.id, parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-dark-400 mt-2">
                  <span>{q.min || 0} — None</span>
                  <span className="text-white text-lg font-bold">{answers[q.id] ?? '—'}</span>
                  <span>{q.max || 10} — Worst</span>
                </div>
              </div>
            )}

            {q.type === 'likert' && q.options && (
              <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(q.id, i)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${answers[q.id] === i ? 'border-msk-500 bg-msk-600/10 text-white' : 'border-dark-600 bg-dark-800 text-dark-300 hover:border-dark-500'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                disabled={currentQ === 0}
                className="btn-secondary"
              >Back</button>
              {currentQ < totalQ - 1 ? (
                <button
                  onClick={() => setCurrentQ(currentQ + 1)}
                  disabled={answers[q.id] === undefined}
                  className="btn-primary"
                >Next</button>
              ) : (
                <button
                  onClick={submitProm}
                  disabled={submitting || answers[q.id] === undefined}
                  className="btn-primary"
                >{submitting ? 'Submitting...' : 'Submit'}</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Instrument selection + history
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Patient Assessments</h1>
      <p className="text-dark-400 mb-8">Complete outcome measures to track your recovery</p>

      {instruments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Pending Assessments</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {instruments.map(inst => (
              <button
                key={inst.code}
                onClick={() => selectInstrument(inst)}
                className="card hover:border-msk-500/50 transition-all text-left group"
              >
                <h3 className="text-white font-semibold group-hover:text-msk-400">{inst.name}</h3>
                <p className="text-dark-400 text-sm mt-1">{inst.description}</p>
                <p className="text-msk-400 text-xs mt-2">{(inst.questions || []).length} questions</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Completed Assessments</h2>
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.id} className="card flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{h.instrument_code}</p>
                  <p className="text-dark-400 text-sm">{h.collection_point} · {new Date(h.submitted_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-msk-400">{parseFloat(h.score).toFixed(1)}</p>
                  <p className="text-dark-400 text-xs">Score</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
