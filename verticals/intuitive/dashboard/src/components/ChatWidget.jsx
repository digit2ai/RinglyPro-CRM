import React, { useState, useRef, useEffect } from 'react'
import ChatRenderer from './ChatRenderer'

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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify({ question, conversation_id: conversationId, project_id: projectId, confirmed_action: confirmedAction }),
  })
  if (!res.ok) {
    onError(new Error(`HTTP ${res.status}`))
    return
  }
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
      try {
        const evt = JSON.parse(line.slice(5).trim())
        onEvent(evt)
      } catch (e) {}
    }
  }
}

export default function ChatWidget({ currentProjectId }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

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
        projectId: currentProjectId,
        confirmedAction,
        onEvent: (evt) => {
          if (evt.type === 'text') {
            assistantText += evt.content
            setMessages(m => {
              const copy = [...m]
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: assistantText, toolCalls }
              return copy
            })
          } else if (evt.type === 'tool_call') {
            toolCalls = [...toolCalls, { name: evt.tool, status: 'running' }]
            setMessages(m => {
              const copy = [...m]
              copy[copy.length - 1] = { ...copy[copy.length - 1], toolCalls }
              return copy
            })
          } else if (evt.type === 'tool_result') {
            toolCalls = toolCalls.map(t => t.name === evt.tool && t.status === 'running' ? { ...t, status: 'done' } : t)
            setMessages(m => {
              const copy = [...m]
              copy[copy.length - 1] = { ...copy[copy.length - 1], toolCalls }
              return copy
            })
          } else if (evt.type === 'done') {
            if (evt.conversation_id) setConversationId(evt.conversation_id)
          } else if (evt.type === 'error') {
            assistantText += `\n\n_Error: ${evt.message}_`
            setMessages(m => {
              const copy = [...m]
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: assistantText, toolCalls }
              return copy
            })
          }
        },
        onError: (err) => {
          setMessages(m => {
            const copy = [...m]
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: `Error: ${err.message}` }
            return copy
          })
        },
      })
    } finally {
      setBusy(false)
    }
  }

  function handleConfirmAction(payload) {
    send(null, payload)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-2xl flex items-center justify-center transition-all"
        title="Ask SurgicalMind"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
    )
  }

  return (
    <div className="no-print fixed bottom-6 right-6 z-50 w-[400px] h-[600px] bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="bg-gradient-to-r from-violet-900/40 to-indigo-900/40 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-white">Ask SurgicalMind</div>
          <div className="text-[10px] text-violet-300/70">Hospitals &middot; Surgeons &middot; Pipeline &middot; Citations</div>
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="text-xs text-slate-500 space-y-2">
            <p className="text-slate-400">Try asking:</p>
            <ul className="space-y-1">
              {[
                'Top 5 hospitals in Florida by surgical volume',
                'Which surgeons at Tampa General received the most Intuitive payments?',
                'Compare AdventHealth Wesley Chapel to Tampa General',
                'Show me my projects in Planning stage',
              ].map((q, i) => (
                <li key={i}>
                  <button onClick={() => { setInput(q); }} className="text-left text-violet-400 hover:text-violet-200 underline text-xs">&rsaquo; {q}</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            {m.role === 'user' && (
              <div className="inline-block bg-violet-700/60 border border-violet-600/40 rounded-2xl px-3 py-2 text-sm text-white max-w-[85%]">{m.content}</div>
            )}
            {m.role === 'assistant' && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-3 py-2 text-sm text-slate-200 max-w-full">
                {(m.toolCalls || []).length > 0 && (
                  <div className="mb-2 space-y-1">
                    {m.toolCalls.map((tc, j) => (
                      <div key={j} className="text-[10px] text-slate-500 italic flex items-center gap-2">
                        {tc.status === 'running' ? <span className="animate-pulse">&#9881;</span> : <span className="text-emerald-400">&#10003;</span>}
                        <span>{TOOL_LABELS[tc.name] || tc.name}{tc.status === 'running' ? '...' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
                <ChatRenderer text={m.content} onConfirmAction={handleConfirmAction} />
                {!m.content && busy && i === messages.length - 1 && (
                  <div className="flex gap-1 py-2">
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (busy || !input.trim()) return; const q = input; setInput(''); send(q); }}
        className="border-t border-slate-700 px-3 py-3 flex gap-2 bg-slate-900/40"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={busy}
          placeholder={busy ? 'Thinking...' : 'Ask anything...'}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button type="submit" disabled={busy || !input.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-2 px-3 rounded-lg">Send</button>
      </form>
    </div>
  )
}
