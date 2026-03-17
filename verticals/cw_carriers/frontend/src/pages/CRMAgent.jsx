import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';

const SUGGESTIONS = [
  "Show pipeline",
  "Search contacts for carriers",
  "Create contact for John Smith at ABC Trucking",
  "Create deal 'PepsiCo Q2 Shipment' for $15000",
  "Move deal 'PepsiCo' to closed won",
  "Show metrics",
  "Log note for PepsiCo: Confirmed Q2 volume increase 15%",
  "Delete contact john@test.com",
  "Search deals for shipment",
  "Create task: Follow up with new carrier lead",
];

export default function CRMAgent() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    setMessages([{
      type: 'agent',
      text: "Hi! I'm your HubSpot CRM Agent. I can create, modify, and delete contacts & deals, manage your pipeline, log activities, and more.\n\nTry: \"show pipeline\", \"create contact for John Smith\", or \"help\" for all commands."
    }]);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { type: 'user', text: msg }]);

    try {
      const res = await api.post('/crm-agent/chat', { message: msg });
      const d = res.data;
      const agentMsg = { type: 'agent', text: d.reply || 'No response.' };
      const newMsgs = [agentMsg];

      if (d.actions_taken?.length > 0) {
        for (const a of d.actions_taken) {
          newMsgs.push({
            type: a.type === 'error' ? 'error' : 'action',
            text: a.type === 'error' ? `❌ ${a.crm}: ${a.details}` : `✓ ${a.type.replace(/_/g, ' ')} in ${a.crm.toUpperCase()}: ${a.details || ''}`
          });
        }
      }

      if (d.data) {
        newMsgs.push({ type: 'data', data: d.data });
      }

      if (d.suggestions?.length > 0) {
        newMsgs.push({ type: 'suggestions', suggestions: d.suggestions });
      }

      setMessages(prev => [...prev, ...newMsgs]);
    } catch (err) {
      setMessages(prev => [...prev, { type: 'error', text: 'Error: ' + (err.response?.data?.error || err.message) }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={s.container}>
      <h2 style={s.title}>HUBSPOT CRM AGENT</h2>
      <p style={s.subtitle}>Natural language interface — create, modify & delete contacts, deals, tasks</p>

      {/* Suggestions */}
      <div style={s.suggestionsArea}>
        <div style={s.suggestLabel}>Quick commands:</div>
        <div style={s.chips}>
          {SUGGESTIONS.slice(0, 6).map((cmd, i) => (
            <button key={i} onClick={() => sendMessage(cmd)} style={s.chip}>{cmd}</button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={s.chatArea} ref={chatRef}>
        {messages.map((msg, i) => {
          if (msg.type === 'user') {
            return <div key={i} style={s.msgUser}>{msg.text}</div>;
          }
          if (msg.type === 'agent') {
            return <div key={i} style={s.msgAgent} dangerouslySetInnerHTML={{ __html: formatMsg(msg.text) }} />;
          }
          if (msg.type === 'action') {
            return <div key={i} style={s.actionCard}>{msg.text}</div>;
          }
          if (msg.type === 'error') {
            return <div key={i} style={s.errorCard}>{msg.text}</div>;
          }
          if (msg.type === 'data') {
            return <div key={i} style={s.dataCard}>{renderData(msg.data)}</div>;
          }
          if (msg.type === 'suggestions') {
            return (
              <div key={i} style={s.sugChips}>
                {msg.suggestions.map((s2, j) => (
                  <button key={j} onClick={() => sendMessage(s2)} style={s.sugChip}>{s2}</button>
                ))}
              </div>
            );
          }
          return null;
        })}
        {loading && <div style={s.typing}>Agent is working...</div>}
      </div>

      {/* Input */}
      <div style={s.inputArea}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="e.g. Create contact for John Smith at ABC Trucking..." style={s.input} disabled={loading} />
        <button onClick={() => sendMessage()} disabled={loading || !input.trim()} style={s.sendBtn}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function formatMsg(text) {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#C8962A">$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/• /g, '&bull; ');
}

function renderData(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return <em style={{ color: '#484F58' }}>No results</em>;
    const keys = Object.keys(data[0]).slice(0, 5);
    return (
      <table style={ds.table}>
        <thead>
          <tr>{keys.map(k => <th key={k} style={ds.th}>{k}</th>)}</tr>
        </thead>
        <tbody>
          {data.slice(0, 15).map((row, i) => (
            <tr key={i}>{keys.map(k => <td key={k} style={ds.td}>{row[k] != null ? String(row[k]).substring(0, 40) : '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (typeof data === 'object' && data !== null) {
    return <pre style={ds.json}>{JSON.stringify(data, null, 2)}</pre>;
  }
  return String(data);
}

const ds = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '6px 8px', background: '#0D1117', color: '#8B949E', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #21262D' },
  td: { padding: '6px 8px', color: '#E6EDF3', borderBottom: '1px solid #21262D' },
  json: { fontSize: 11, color: '#8B949E', background: '#0D1117', padding: 10, borderRadius: 6, overflow: 'auto', margin: 0 }
};

const s = {
  container: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' },
  title: { fontSize: 28, color: '#C8962A', flexShrink: 0 },
  subtitle: { color: '#8B949E', fontSize: 14, marginBottom: 12, flexShrink: 0 },
  suggestionsArea: { marginBottom: 12, flexShrink: 0 },
  suggestLabel: { fontSize: 11, color: '#484F58', marginBottom: 6, textTransform: 'uppercase' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { padding: '5px 12px', background: '#21262D', border: '1px solid #30363D', borderRadius: 20, color: '#8B949E', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  chatArea: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0', borderTop: '1px solid #21262D', borderBottom: '1px solid #21262D' },
  msgUser: { alignSelf: 'flex-end', maxWidth: '80%', padding: '10px 14px', background: 'linear-gradient(135deg, #1A4FA8, #0EA5E9)', color: '#fff', borderRadius: '12px 12px 4px 12px', fontSize: 14, lineHeight: 1.5 },
  msgAgent: { alignSelf: 'flex-start', maxWidth: '85%', padding: '10px 14px', background: '#161B22', border: '1px solid #21262D', color: '#E6EDF3', borderRadius: '12px 12px 12px 4px', fontSize: 14, lineHeight: 1.5 },
  actionCard: { alignSelf: 'flex-start', maxWidth: '80%', padding: '8px 12px', background: '#23863622', border: '1px solid #23863644', borderRadius: 8, color: '#238636', fontSize: 12 },
  errorCard: { alignSelf: 'flex-start', maxWidth: '80%', padding: '8px 12px', background: '#F8514922', border: '1px solid #F8514944', borderRadius: 8, color: '#F85149', fontSize: 12 },
  dataCard: { alignSelf: 'flex-start', maxWidth: '95%', padding: '10px 12px', background: '#0D1117', border: '1px solid #21262D', borderRadius: 8, overflow: 'auto' },
  sugChips: { alignSelf: 'flex-start', display: 'flex', gap: 6, flexWrap: 'wrap' },
  sugChip: { padding: '4px 10px', background: '#1A4FA822', border: '1px solid #1A4FA844', borderRadius: 16, color: '#1A4FA8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  typing: { alignSelf: 'flex-start', color: '#484F58', fontSize: 12, fontStyle: 'italic', padding: '4px 0' },
  inputArea: { display: 'flex', gap: 8, paddingTop: 12, flexShrink: 0 },
  input: { flex: 1, padding: '12px 14px', background: '#161B22', border: '2px solid #1A4FA8', borderRadius: 10, color: '#E6EDF3', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  sendBtn: { padding: '12px 20px', background: '#1A4FA8', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
};
