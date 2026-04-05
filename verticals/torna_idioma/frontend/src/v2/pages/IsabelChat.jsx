import React, { useEffect, useRef, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';
import CognateHighlight from '../components/CognateHighlight';

/**
 * Profesora Isabel — chat UI at /Torna_Idioma/learn/isabel
 *
 * Loads conversation history on mount, sends messages to /api/v2/isabel/chat,
 * renders assistant messages with CognateHighlight so Spanish words with
 * Filipino cognates are automatically underlined in gold.
 */
export default function IsabelChat() {
  const authed = isAuthenticated();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    Promise.all([v2Api.get('/isabel/history?limit=50'), v2Api.get('/isabel/status')])
      .then(([h, s]) => {
        setMessages(h.history || []);
        setStatus(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');

    try {
      const r = await v2Api.post('/isabel/chat', { message: text });
      const assistantMsg = {
        role: 'assistant',
        content: r.response.text,
        model_used: r.response.model,
        created_at: new Date().toISOString(),
        fallback: r.response.fallback
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      setError(e.message);
      // Remove optimistic user message on failure
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Clear your entire conversation history with Isabel?')) return;
    try {
      await v2Api.post('/isabel/reset', {});
      setMessages([]);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>Profesora Isabel</h1>
          <p style={styles.subtitle}>Login to start chatting with your AI Spanish tutor.</p>
          <a href="/Torna_Idioma/login" style={styles.btn}>Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.chat}>
        <div style={styles.header}>
          <div style={styles.avatar}>
            <span style={styles.avatarText}>PI</span>
            <span style={{ ...styles.statusDot, background: status?.configured ? '#10b981' : '#f59e0b' }} />
          </div>
          <div style={styles.headerText}>
            <div style={styles.headerName}>Profesora Isabel</div>
            <div style={styles.headerStatus}>
              {status?.configured ? 'Online · ready to teach' : 'Demo mode'}
            </div>
          </div>
          <button onClick={handleReset} style={styles.resetBtn} title="Clear conversation">
            Reset
          </button>
        </div>

        <div ref={scrollRef} style={styles.messages}>
          {loading && <div style={styles.loading}>Loading conversation...</div>}

          {!loading && messages.length === 0 && (
            <div style={styles.welcome}>
              <div style={styles.welcomeAvatar}>PI</div>
              <h2 style={styles.welcomeTitle}>¡Bienvenido, mi apo!</h2>
              <p style={styles.welcomeText}>
                I'm Profesora Isabel, your warm Filipina-Hispanic Spanish teacher.<br />
                Say hola and let's begin reclaiming your heritage language together.
              </p>
              <div style={styles.suggestions}>
                {[
                  'Hola Profesora!',
                  '¿Cómo estás?',
                  'Teach me about family words',
                  'I want to learn food vocabulary'
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    style={styles.suggestion}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={m.id || i}
              style={{
                ...styles.message,
                ...(m.role === 'user' ? styles.messageUser : styles.messageIsabel)
              }}
            >
              {m.role === 'assistant' && <div style={styles.msgLabel}>Profesora Isabel</div>}
              <div style={styles.msgBubble}>
                {m.role === 'assistant' ? <CognateHighlight text={m.content} inline /> : m.content}
              </div>
              {m.model_used && m.model_used !== 'mock' && (
                <div style={styles.msgMeta}>{m.model_used}</div>
              )}
              {m.fallback && <div style={styles.msgFallback}>Fallback: {m.fallback}</div>}
            </div>
          ))}

          {sending && (
            <div style={{ ...styles.message, ...styles.messageIsabel }}>
              <div style={styles.msgLabel}>Profesora Isabel</div>
              <div style={{ ...styles.msgBubble, ...styles.typing }}>
                <span style={styles.dot} />
                <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSend} style={styles.inputRow}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Profesora Isabel..."
            style={styles.input}
            disabled={sending}
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            style={{ ...styles.sendBtn, opacity: !input.trim() || sending ? 0.5 : 1 }}
          >
            Send
          </button>
        </form>

        <div style={styles.footer}>
          Step 6 of 12 · Profesora Isabel ·{' '}
          <a href="/Torna_Idioma/learn" style={styles.link}>← Learner Home</a>
        </div>
      </div>
    </div>
  );
}

// Inject typing animation keyframes
if (typeof document !== 'undefined' && !document.getElementById('ti-v2-isabel-anim')) {
  const s = document.createElement('style');
  s.id = 'ti-v2-isabel-anim';
  s.textContent = `
    @keyframes ti-v2-dot-bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-6px); opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 50%, #0F1A2E 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '24px 16px 16px',
    display: 'flex',
    justifyContent: 'center'
  },
  chat: {
    maxWidth: 720,
    width: '100%',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 48px)',
    overflow: 'hidden',
    backdropFilter: 'blur(12px)'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid rgba(201, 168, 76, 0.2)',
    display: 'flex',
    alignItems: 'center',
    gap: 14
  },
  avatar: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid rgba(232, 212, 139, 0.5)'
  },
  avatarText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 900,
    color: '#0F1A2E',
    letterSpacing: 1
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '2px solid #1B2A4A'
  },
  headerText: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: 700, color: '#fff' },
  headerStatus: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  resetBtn: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.5
  },

  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    minHeight: 300
  },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },

  welcome: {
    textAlign: 'center',
    padding: '32px 16px'
  },
  welcomeAvatar: {
    width: 80,
    height: 80,
    margin: '0 auto 16px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 900,
    color: '#0F1A2E',
    border: '3px solid rgba(232, 212, 139, 0.5)'
  },
  welcomeTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    fontWeight: 800,
    color: '#C9A84C',
    marginBottom: 8
  },
  welcomeText: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.7,
    marginBottom: 24
  },
  suggestions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  suggestion: {
    background: 'rgba(201, 168, 76, 0.08)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    color: '#C9A84C',
    padding: '8px 14px',
    borderRadius: 20,
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
    fontWeight: 600
  },

  message: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '85%' },
  messageUser: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  messageIsabel: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  msgLabel: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 1, textTransform: 'uppercase' },
  msgBubble: {
    padding: '12px 16px',
    borderRadius: 14,
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  msgMeta: { fontSize: 9, color: '#64748b', marginTop: 2 },
  msgFallback: { fontSize: 9, color: '#f59e0b', marginTop: 2 },

  typing: { display: 'flex', gap: 6, alignItems: 'center', padding: '14px 18px' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#C9A84C',
    animation: 'ti-v2-dot-bounce 1.2s infinite ease-in-out',
    display: 'inline-block'
  },

  errorBox: {
    margin: '0 24px 12px',
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 10,
    borderRadius: 8,
    fontSize: 12
  },

  inputRow: {
    padding: '16px 24px',
    borderTop: '1px solid rgba(201, 168, 76, 0.2)',
    display: 'flex',
    gap: 10
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    background: 'rgba(15, 26, 46, 0.7)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit'
  },
  sendBtn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '12px 20px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.5
  },

  gate: {
    maxWidth: 480,
    margin: '60px auto',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center'
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 900,
    color: '#fff',
    marginBottom: 12
  },
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 24 },
  btn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    padding: '12px 28px',
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block'
  },

  footer: {
    textAlign: 'center',
    fontSize: 10,
    color: '#64748b',
    padding: '8px 16px 14px',
    letterSpacing: 0.5
  },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
