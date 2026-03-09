import React, { useState, useRef } from 'react';
import api from '../services/api';

const SUGGESTIONS = [
  "Show all open loads",
  "Call carriers for load #1",
  "Add a note to PepsiCo — confirmed Q2 volume up 15%",
  "Who are our top 5 carriers this month?",
  "Send a status update to Agri-Dairy",
  "Show me loads delivered late this week",
  "Create a follow-up task for the new shipper lead",
  "What's our load coverage rate today?",
  "Show call history",
  "Show dashboard",
];

export default function NLP() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const inputRef = useRef(null);

  const submitCommand = async (text) => {
    const cmd = text || input;
    if (!cmd.trim()) return;
    setLoading(true);
    setInput('');

    const entry = { input: cmd, time: new Date().toLocaleTimeString(), response: null, loading: true };
    setHistory(prev => [entry, ...prev]);

    try {
      const res = await api.post('/nlp/command', { input: cmd });
      setHistory(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], response: res.data, loading: false };
        return updated;
      });
    } catch (err) {
      setHistory(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], response: { success: false, message: err.response?.data?.error || 'Error processing command' }, loading: false };
        return updated;
      });
    }
    setLoading(false);
  };

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      submitCommand(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.start();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCommand();
    }
  };

  return (
    <div>
      <h2 style={s.title}>NLP ASSISTANT</h2>
      <p style={s.subtitle}>Tell Rachel what to do — powered by AI</p>

      <div style={s.inputArea}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell Rachel what to do..."
          style={s.input}
          disabled={loading}
        />
        <button onClick={() => submitCommand()} disabled={loading || !input.trim()} style={s.sendBtn}>
          {loading ? '...' : 'Send'}
        </button>
        <button onClick={startVoice} disabled={loading} style={{ ...s.voiceBtn, ...(listening ? s.voiceBtnActive : {}) }}>
          {listening ? '...' : 'Mic'}
        </button>
      </div>

      <div style={s.suggestionsArea}>
        <div style={s.suggestLabel}>Try these commands:</div>
        <div style={s.chips}>
          {SUGGESTIONS.map((cmd, i) => (
            <button key={i} onClick={() => { setInput(cmd); submitCommand(cmd); }} style={s.chip}>{cmd}</button>
          ))}
        </div>
      </div>

      <div style={s.historyArea}>
        {history.map((entry, i) => (
          <div key={i} style={s.historyEntry}>
            <div style={s.cmdRow}>
              <span style={s.cmdTime}>{entry.time}</span>
              <span style={s.cmdText}>{entry.input}</span>
            </div>
            {entry.loading ? (
              <div style={s.responseLoading}>Processing...</div>
            ) : entry.response ? (
              <div style={{ ...s.response, ...(entry.response.success ? {} : s.responseError) }}>
                <div style={s.responseMeta}>
                  {entry.response.intent && <span style={s.intentBadge}>{entry.response.intent}</span>}
                  {entry.response.confidence > 0 && <span style={s.confBadge}>{Math.round(entry.response.confidence * 100)}% confidence</span>}
                </div>
                <div style={s.responseMsg}>{entry.response.message}</div>
                {entry.response.data && (
                  <div style={s.responseData}>
                    {Array.isArray(entry.response.data) ? (
                      <table style={s.dataTable}>
                        <thead>
                          <tr>{Object.keys(entry.response.data[0] || {}).slice(0, 6).map(k => <th key={k} style={s.dataTh}>{k}</th>)}</tr>
                        </thead>
                        <tbody>
                          {entry.response.data.slice(0, 10).map((row, ri) => (
                            <tr key={ri}>{Object.values(row).slice(0, 6).map((v, ci) => <td key={ci} style={s.dataTd}>{v != null ? String(v).substring(0, 40) : '—'}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    ) : typeof entry.response.data === 'object' ? (
                      <pre style={s.jsonPre}>{JSON.stringify(entry.response.data, null, 2)}</pre>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  title: { fontSize: 28, color: '#C8962A' },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 20 },
  inputArea: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  input: { flex: '1 1 200px', padding: '12px 14px', background: '#161B22', border: '2px solid #1A4FA8', borderRadius: 10, color: '#E6EDF3', fontSize: 15, outline: 'none', minWidth: 0 },
  sendBtn: { padding: '12px 20px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  voiceBtn: { padding: '12px 16px', background: '#21262D', color: '#8B949E', border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer' },
  voiceBtnActive: { background: '#F85149', color: '#fff' },
  suggestionsArea: { marginBottom: 24 },
  suggestLabel: { fontSize: 12, color: '#484F58', marginBottom: 8, textTransform: 'uppercase' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { padding: '6px 14px', background: '#21262D', border: '1px solid #30363D', borderRadius: 20, color: '#8B949E', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  historyArea: { display: 'flex', flexDirection: 'column', gap: 12 },
  historyEntry: { background: '#161B22', border: '1px solid #21262D', borderRadius: 10, padding: 16 },
  cmdRow: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 },
  cmdTime: { fontSize: 11, color: '#484F58' },
  cmdText: { fontSize: 14, color: '#C8962A', fontWeight: 500 },
  responseLoading: { color: '#8B949E', fontSize: 13, fontStyle: 'italic' },
  response: { },
  responseError: { borderLeft: '3px solid #F85149', paddingLeft: 12 },
  responseMeta: { display: 'flex', gap: 8, marginBottom: 6 },
  intentBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#1A4FA822', color: '#1A4FA8', border: '1px solid #1A4FA844' },
  confBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#21262D', color: '#8B949E' },
  responseMsg: { fontSize: 14, color: '#E6EDF3', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  responseData: { marginTop: 10, maxHeight: 300, overflow: 'auto' },
  dataTable: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  dataTh: { textAlign: 'left', padding: '6px 8px', background: '#0D1117', color: '#8B949E', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #21262D' },
  dataTd: { padding: '6px 8px', color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  jsonPre: { fontSize: 12, color: '#8B949E', background: '#0D1117', padding: 10, borderRadius: 6, overflow: 'auto' }
};
