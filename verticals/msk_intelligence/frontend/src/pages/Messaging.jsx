import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

export default function Messaging() {
  const { caseId: paramCaseId } = useParams();
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(paramCaseId || null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const user = api.getUser();

  useEffect(() => { loadCases(); }, []);
  useEffect(() => { if (selectedCase) loadMessages(); }, [selectedCase]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadCases = async () => {
    try {
      const data = await api.get('/cases?limit=100');
      setCases(data.data || []);
      if (!selectedCase && data.data?.length > 0) setSelectedCase(data.data[0].id);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadMessages = async () => {
    try {
      const data = await api.get(`/messages/${selectedCase}`);
      setMessages(data.data || []);
    } catch (err) { console.error(err); }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !selectedCase) return;
    setSending(true);
    try {
      await api.post('/messages', { caseId: selectedCase, content: newMsg.trim() });
      setNewMsg('');
      await loadMessages();
    } catch (err) { console.error(err); }
    finally { setSending(false); }
  };

  if (loading) return <div className="text-center py-12 text-dark-400">Loading...</div>;

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">
      {/* Case list sidebar */}
      <div className="w-72 border-r border-dark-700 bg-dark-900 overflow-y-auto">
        <div className="p-4 border-b border-dark-700">
          <h2 className="text-white font-bold">Messages</h2>
          <p className="text-dark-400 text-xs mt-1">{cases.length} cases</p>
        </div>
        {cases.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCase(c.id)}
            className={`w-full text-left p-3 border-b border-dark-800 transition-all ${selectedCase === c.id ? 'bg-msk-600/10 border-l-2 border-l-msk-500' : 'hover:bg-dark-800'}`}
          >
            <p className="text-white text-sm font-medium truncate">{c.case_number}</p>
            <p className="text-dark-400 text-xs truncate">{c.chief_complaint || 'No complaint'}</p>
          </button>
        ))}
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col">
        {selectedCase ? (
          <>
            <div className="p-4 border-b border-dark-700 bg-dark-900/50">
              <h3 className="text-white font-semibold">
                {cases.find(c => c.id === selectedCase)?.case_number || 'Case'}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-dark-400 text-sm">No messages yet. Start the conversation.</div>
              ) : messages.map(m => (
                <div key={m.id} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-xl px-4 py-3 ${m.sender_id === user?.id ? 'bg-msk-600/20 text-msk-100 rounded-br-sm' : 'bg-dark-800 text-dark-200 rounded-bl-sm'}`}>
                    <p className="text-[10px] uppercase tracking-wider opacity-50 mb-1">
                      {m.first_name} {m.last_name} · {m.role}
                    </p>
                    <p className="text-sm">{m.content}</p>
                    <p className="text-[10px] opacity-40 mt-1">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 border-t border-dark-700 bg-dark-900/50 flex gap-3">
              <input
                type="text"
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                className="input-field flex-1"
                placeholder="Type a message..."
              />
              <button type="submit" disabled={sending || !newMsg.trim()} className="btn-primary px-6">
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-dark-400">Select a case to view messages</div>
        )}
      </div>
    </div>
  );
}
