import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatRenderer from '../components/ChatRenderer'

const SAMPLES = [
  'Compare ORMC, AdventHealth Orlando, and Florida Hospital for prostatectomy, hysterectomy, and ventral hernia',
  'Build a business plan for project 96',
  'Brief me on Mount Sinai NY for my 3pm meeting',
  'Top 10 robotic candidates in Florida',
  'Tell me about Dr. David Samadi',
  'Draft an outreach email to Dr. Samadi referencing his robotic work',
]

const TOOL_LABELS = {
  query_hospitals: 'Searching hospitals',
  query_surgeons: 'Searching surgeons',
  search_surgeons_by_territory: 'Ranking territory surgeons (live CMS)',
  search_surgeons_by_hospital: 'Ranking hospital surgeons (Care Compare)',
  enrich_surgeon: 'Enriching surgeon (PubMed + ClinicalTrials.gov)',
  generate_briefing: 'Compiling pre-meeting briefing',
  generate_business_plan: 'Building business plan + auto-seeding surgeons',
  compare_hospital_procedure_volumes: 'Cross-tabulating hospital procedure volumes',
  query_hospital_drg_volumes: 'Querying hospital MS-DRG discharges',
  draft_outreach: 'Gathering personalization material',
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

// ─── Voice helpers (Web Speech API — browser-native, zero API cost) ────────
const SpeechRecognitionImpl =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const speechSupported = !!SpeechRecognitionImpl;
const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

function stripMarkdownForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '. code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/-{3,}/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const [voiceMode, setVoiceMode] = useState(false) // when on: TTS reads responses aloud
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const scrollRef = useRef(null)
  const recognitionRef = useRef(null)
  const ttsSpokenLenRef = useRef(0)
  const navigate = useNavigate()

  useEffect(() => { loadHistory() }, [])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages, busy])

  // Stop TTS on unmount or when leaving voice mode
  useEffect(() => {
    if (!voiceMode && ttsSupported) {
      window.speechSynthesis.cancel()
    }
    return () => { if (ttsSupported) window.speechSynthesis.cancel() }
  }, [voiceMode])

  // ─── Speech-to-text (mic) ────────────────────────────────────
  function startListening() {
    if (!speechSupported || listening || busy) return
    if (ttsSupported) window.speechSynthesis.cancel() // stop reading while user speaks
    const r = new SpeechRecognitionImpl()
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-US'
    r.onresult = (e) => {
      let final = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      if (final) {
        setInput(prev => (prev + ' ' + final).trim())
        setInterimTranscript('')
      } else {
        setInterimTranscript(interim)
      }
    }
    r.onerror = () => { setListening(false); setInterimTranscript('') }
    r.onend = () => { setListening(false); setInterimTranscript('') }
    r.start()
    recognitionRef.current = r
    setListening(true)
  }

  function stopListening() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {}
    }
    setListening(false)
    setInterimTranscript('')
  }

  // ─── Text-to-speech (chunked, follows streaming text) ────────
  function speakChunk(text) {
    if (!ttsSupported || !voiceMode || !text) return
    const cleaned = stripMarkdownForSpeech(text)
    if (!cleaned) return
    const u = new SpeechSynthesisUtterance(cleaned)
    u.rate = 1.05
    u.pitch = 1.0
    u.volume = 1.0
    // Pick a clean voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => /Samantha|Karen|Google US English|Microsoft Aria/i.test(v.name))
    if (preferred) u.voice = preferred
    window.speechSynthesis.speak(u)
  }

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
    ttsSpokenLenRef.current = 0 // reset speech cursor for this turn
    if (ttsSupported) window.speechSynthesis.cancel()

    try {
      await streamChat({
        question,
        conversationId,
        confirmedAction,
        onEvent: (evt) => {
          if (evt.type === 'text') {
            assistantText += evt.content
            setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: assistantText, toolCalls }; return c })

            // Voice mode: flush spoken text at sentence boundaries so it sounds natural
            if (voiceMode) {
              const sentenceEnd = assistantText.lastIndexOf('.', assistantText.length)
              const newlineEnd = assistantText.lastIndexOf('\n', assistantText.length)
              const flushPos = Math.max(sentenceEnd, newlineEnd)
              if (flushPos > ttsSpokenLenRef.current + 40) {
                const chunk = assistantText.slice(ttsSpokenLenRef.current, flushPos + 1)
                speakChunk(chunk)
                ttsSpokenLenRef.current = flushPos + 1
              }
            }
          } else if (evt.type === 'tool_call') {
            toolCalls = [...toolCalls, { name: evt.tool, status: 'running' }]
            setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], toolCalls }; return c })
          } else if (evt.type === 'tool_result') {
            toolCalls = toolCalls.map(t => t.name === evt.tool && t.status === 'running' ? { ...t, status: 'done' } : t)
            setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], toolCalls }; return c })
          } else if (evt.type === 'done') {
            if (evt.conversation_id) { setConversationId(evt.conversation_id); loadHistory() }
            // Voice mode: flush any remaining unsung text at end of turn
            if (voiceMode && assistantText.length > ttsSpokenLenRef.current) {
              speakChunk(assistantText.slice(ttsSpokenLenRef.current))
              ttsSpokenLenRef.current = assistantText.length
            }
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
        <div className="border-b border-slate-800 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Ask SurgicalMind</h1>
            <p className="text-xs text-slate-400 mt-1">Natural-language queries grounded in CMS, NPI Registry, IRS, state filings, and your project pipeline.</p>
          </div>
          {(speechSupported || ttsSupported) && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setVoiceMode(v => !v)}
                title={voiceMode ? 'Voice mode on — responses read aloud' : 'Enable voice mode'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  voiceMode
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  {voiceMode ? (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </>
                  ) : (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <line x1="22" y1="9" x2="16" y2="15" />
                      <line x1="16" y1="9" x2="22" y2="15" />
                    </>
                  )}
                </svg>
                {voiceMode ? 'Voice on' : 'Voice off'}
              </button>
            </div>
          )}
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
          onSubmit={(e) => { e.preventDefault(); if (busy || !input.trim()) return; const q = input; setInput(''); stopListening(); send(q); }}
          className="border-t border-slate-800 px-6 py-4 bg-slate-950"
        >
          <div className="max-w-3xl mx-auto flex gap-3 items-stretch">
            <div className="flex-1 relative">
              <input
                type="text"
                value={listening && interimTranscript ? (input + ' ' + interimTranscript).trim() : input}
                onChange={e => setInput(e.target.value)}
                disabled={busy}
                placeholder={busy ? 'Thinking...' : listening ? 'Listening...' : 'Ask anything about hospitals, surgeons, payments, your pipeline...'}
                className={`w-full bg-slate-900 border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 ${listening ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-slate-700'}`}
              />
              {listening && (
                <div className="absolute -top-6 left-1 flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                  Listening...
                </div>
              )}
            </div>
            {speechSupported && (
              <button
                type="button"
                onClick={() => listening ? stopListening() : startListening()}
                disabled={busy}
                title={listening ? 'Stop listening' : 'Speak your question'}
                className={`px-4 rounded-xl flex items-center justify-center transition-all ${
                  listening
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold py-3 px-6 rounded-xl">Ask</button>
          </div>
        </form>
      </main>
    </div>
  )
}
