import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatRenderer from '../components/ChatRenderer'

const SAMPLES = [
  'Top 10 robotic candidates in Florida',
  'Which surgeons at Tampa General received the most Intuitive payments in 2024?',
  'Compare Tampa General to Mayo Jacksonville',
  'Show me my projects in Planning stage',
  'List Florida hospitals with no robotic program but >15,000 surgical cases',
  'Top 5 surgeon champions across all my projects',
]

const TOOL_LABELS = {
  query_hospitals: 'Searching hospitals',
  query_surgeons: 'Searching surgeons',
  query_intuitive_payments: 'Querying Open Payments',
  query_procedure_volumes: 'Querying procedure volumes',
  query_business_plans: 'Querying business plans',
  query_surveys: 'Querying surveys',
  get_project_details: 'Fetching project details',
  compare_hospitals: 'Comparing hospitals',
  generate_report_link: 'Generating report link',
  start_business_plan: 'Starting business plan',
  send_surgeon_survey: 'Preparing survey',
}

async function streamChat({ question, conversationId, projectId, confirmedAction, onEvent, onError }) {
  const token = localStorage.getItem('intuitive_token')
  const res = await fetch('/intuitive/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
    body: JSON.stringify({ question, conversation_id: conversationId, project_id: projectId, confirmed_action: confirmedAction }),
  })
  if (!res.ok) { onError(new Error(`HTTP ${res.status}`)); return }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      try { onEvent(JSON.parse(line.slice(5).trim())) } catch (e) {}
    }
  }
}

export default function AskPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [history, setHistory] = useState([])
  const scrollRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => { loadHistory() }, [])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages, busy])

  async function loadHistory() {
    try {
      const token = localStorage.getItem('intuitive_token')
      const res = await fetch('/intuitive/api/v1/chat/conversations', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' },
      })
      const data = await res.json()
      if (data.conversations) setHistory(data.conversations.slice(0, 10))
    } catch (e) {}
  }

  async function loadConversation(id) {
    try {
      const token = localStorage.getItem('intuitive_token')
      const res = await fetch(`/intuitive/api/v1/chat/conversations/${id}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' },
      })
      const data = await res.json()
      if (data.conversation?.messages) {
        setMessages(data.conversation.messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(b => b.type === 'text').map(b => b.text).join('\n') : ''),
        })))
        setConversationId(id)
      }
    } catch (e) {}
  }

  function newConversation() {
    setMessages([])
    setConversationId(null)
  }

  async function send(question, confirmedAction) {
    if (!question && !confirmedAction) return
    setBusy(true)
    if (question) setMessages(m => [...m, { role: 'user', content: question }])
    let assistantText = ''
    let toolCalls = []
    setMessages(m => [...m, { role: 'assistant', content: '', toolCalls: [] }])

    try {
      await streamChat({
        question,
        conversationId,
        confirmedAction,
        onEvent: (evt) => {
          if (evt.type === 'text') {
            assistantText += evt.content
            setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: assistantText, toolCalls }; return c })
          } else if (evt.type === 'tool_call') {
            toolCalls = [...toolCalls, { name: evt.tool, status: 'running' }]
            setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], toolCalls }; return c })
          } else if (evt.type === 'tool_result') {
            toolCalls = toolCalls.map(t => t.name === evt.tool && t.status === 'running' ? { ...t, status: 'done' } : t)
            setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], toolCalls }; return c })
          } else if (evt.type === 'done') {
            if (evt.conversation_id) { setConversationId(evt.conversation_id); loadHistory() }
          } else if (evt.type === 'error') {
            assistantText += `\n\n_Error: ${evt.message}_`
            setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: assistantText }; return c })
          }
        },
        onError: (err) => {
          setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: `Error: ${err.message}` }; return c })
        },
      })
    } finally { setBusy(false) }
  }

  return (
    <div className="flex h-screen">
      {/* History sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <button onClick={newConversation} className="w-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold py-2 rounded-lg">+ New conversation</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {history.map(h => (
            <button
              key={h.conversation_id}
              onClick={() => loadConversation(h.conversation_id)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-all ${conversationId === h.conversation_id ? 'bg-violet-900/50 text-violet-200' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            >
              <div className="truncate">{h.title || 'Untitled'}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{new Date(h.updated_at).toLocaleDateString()}</div>
            </button>
          ))}
          {history.length === 0 && <p className="text-xs text-slate-500 italic px-3 py-2">No conversations yet.</p>}
        </div>
      </aside>

      {/* Main panel */}
      <main className="flex-1 flex flex-col">
        <div className="border-b border-slate-800 px-6 py-4">
          <h1 className="text-xl font-bold text-white">Ask SurgicalMind</h1>
          <p className="text-xs text-slate-400 mt-1">Natural-language queries grounded in CMS, NPI Registry, IRS, state filings, and your project pipeline.</p>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 && (
            <div className="max-w-2xl mx-auto">
              <h2 className="text-base font-semibold text-slate-200 mb-3">Try one of these</h2>
              <div className="grid grid-cols-2 gap-3">
                {SAMPLES.map((q, i) => (
                  <button key={i} onClick={() => send(q)} className="text-left bg-slate-900/60 hover:bg-slate-800/60 border border-slate-700 hover:border-violet-700 rounded-xl p-4 text-sm text-slate-300 transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((m, i) => (
              <div key={i}>
                {m.role === 'user' && (
                  <div className="text-right">
                    <div className="inline-block bg-violet-700/60 border border-violet-600/40 rounded-2xl px-4 py-2 text-sm text-white max-w-[80%]">{m.content}</div>
                  </div>
                )}
                {m.role === 'assistant' && (
                  <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-4 py-3">
                    {(m.toolCalls || []).length > 0 && (
                      <div className="mb-2 space-y-1">
                        {m.toolCalls.map((tc, j) => (
                          <div key={j} className="text-[11px] text-slate-500 italic flex items-center gap-2">
                            {tc.status === 'running' ? <span className="animate-pulse">&#9881;</span> : <span className="text-emerald-400">&#10003;</span>}
                            <span>{TOOL_LABELS[tc.name] || tc.name}{tc.status === 'running' ? '...' : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <ChatRenderer text={m.content} onConfirmAction={(p) => send(null, p)} />
                    {!m.content && busy && i === messages.length - 1 && (
                      <div className="flex gap-1 py-2">
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (busy || !input.trim()) return; const q = input; setInput(''); send(q); }}
          className="border-t border-slate-800 px-6 py-4 bg-slate-950"
        >
          <div className="max-w-3xl mx-auto flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={busy}
              placeholder={busy ? 'Thinking...' : 'Ask anything about hospitals, surgeons, payments, your pipeline...'}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button type="submit" disabled={busy || !input.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold py-3 px-6 rounded-xl">Ask</button>
          </div>
        </form>
      </main>
    </div>
  )
}
