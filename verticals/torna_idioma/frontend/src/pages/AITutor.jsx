import React, { useState, useEffect, useRef } from 'react';
import { getLang } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'AI Spanish Tutor', sub: 'Practice conversational Spanish with Profesora Isabel — your personal AI teacher using the Don Quijote immersion method.', placeholder: 'Type your message in Spanish or English...', send: 'Send', thinking: 'Profesora Isabel is thinking...', level: 'Your Level', beginner: 'Beginner (A1-A2)', intermediate: 'Intermediate (B1-B2)', advanced: 'Advanced (C1-C2)', starters: 'Conversation Starters', tipTitle: 'Tips', tip1: 'Try writing in Spanish — Isabel will help with corrections', tip2: 'Ask about Filipino-Spanish word connections', tip3: 'Practice BPO phone scripts and customer service', tip4: 'Prepare for DELE certification exams', welcome: '¡Hola! 🇪🇸🇵🇭 I\'m **Profesora Isabel**, your AI Spanish tutor.\n\nI use the **Don Quijote immersion method** — we\'ll learn through conversation, culture, and real-life situations.\n\nDid you know? As a Filipino, you already know **hundreds** of Spanish words! Words like *kumusta*, *mesa*, *silya*, *kutsara* — all come from Spanish.\n\nChoose a conversation starter below, or just say **"¡Hola!"** to begin. ¿Estás listo/a? (Are you ready?)' },
  es: { title: 'Tutor de Español IA', sub: 'Practica español conversacional con la Profesora Isabel — tu profesora personal de IA con el método Don Quijote.', placeholder: 'Escribe tu mensaje en español o inglés...', send: 'Enviar', thinking: 'La Profesora Isabel está pensando...', level: 'Tu Nivel', beginner: 'Principiante (A1-A2)', intermediate: 'Intermedio (B1-B2)', advanced: 'Avanzado (C1-C2)', starters: 'Temas de Conversación', tipTitle: 'Consejos', tip1: 'Intenta escribir en español — Isabel te ayudará con correcciones', tip2: 'Pregunta sobre las conexiones Filipino-Español', tip3: 'Practica guiones telefónicos de BPO', tip4: 'Prepárate para los exámenes DELE', welcome: '¡Hola! 🇪🇸🇵🇭 Soy la **Profesora Isabel**, tu tutora de español con IA.\n\nUso el **método de inmersión Don Quijote** — aprenderemos a través de conversación, cultura y situaciones reales.\n\n¿Sabías que los filipinos ya conocen **cientos** de palabras en español? Palabras como *kumusta*, *mesa*, *silya*, *kutsara* — todas vienen del español.\n\nElige un tema de conversación abajo, o simplemente di **"¡Hola!"** para comenzar. ¿Estás listo/a?' },
  fil: { title: 'AI Spanish Tutor', sub: 'Mag-practice ng conversational Spanish kasama si Profesora Isabel — ang iyong personal na AI teacher gamit ang Don Quijote immersion method.', placeholder: 'I-type ang iyong mensahe sa Espanyol o Ingles...', send: 'Ipadala', thinking: 'Nag-iisip si Profesora Isabel...', level: 'Ang Antas Mo', beginner: 'Baguhan (A1-A2)', intermediate: 'Katamtaman (B1-B2)', advanced: 'Advanced (C1-C2)', starters: 'Mga Panimulang Paksa', tipTitle: 'Mga Tip', tip1: 'Subukang magsulat sa Espanyol — tutulungan ka ni Isabel', tip2: 'Magtanong tungkol sa koneksyon ng Filipino-Espanyol', tip3: 'Mag-practice ng BPO phone scripts', tip4: 'Maghanda para sa DELE certification exams', welcome: '¡Hola! 🇪🇸🇵🇭 Ako si **Profesora Isabel**, ang iyong AI Spanish tutor.\n\nGinagamit ko ang **Don Quijote immersion method** — matututo tayo sa pamamagitan ng pag-uusap, kultura, at real-life situations.\n\nAlam mo ba? Bilang Pilipino, alam mo na ang **daan-daang** salitang Espanyol! Mga salitang tulad ng *kumusta*, *mesa*, *silya*, *kutsara* — lahat galing sa Espanyol.\n\nPumili ng panimulang paksa sa ibaba, o sabihin lang **"¡Hola!"** para magsimula. ¿Estás listo/a?' },
};

function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    let html = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:#F5E6C8;padding:1px 4px;border-radius:3px;font-size:13px">$1</code>');
    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
    return <p key={i} style={{ margin: '4px 0', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

export default function AITutor() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [messages, setMessages] = useState([{ role: 'assistant', content: L.welcome }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState('beginner');
  const [starters, setStarters] = useState({});
  const chatEnd = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get('/tutor/starters').then(r => setStarters(r.data.starters || {})).catch(() => {});
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // Only send last 20 messages for context window
      const chatHistory = newMessages.filter(m => m.role !== 'system').slice(-20);
      const r = await api.post('/tutor/chat', { messages: chatHistory, level });
      setMessages(prev => [...prev, { role: 'assistant', content: r.data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '¡Disculpa! I encountered an error. Please try again. 🙏' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const currentStarters = starters[level] || [];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.avatar}>🇪🇸</div>
          <div>
            <h1 style={s.headerTitle}>{L.title}</h1>
            <p style={s.headerSub}>{L.sub}</p>
          </div>
        </div>
        <div style={s.levelSelect}>
          <label style={s.levelLabel}>{L.level}</label>
          <select value={level} onChange={e => setLevel(e.target.value)} style={s.select}>
            <option value="beginner">{L.beginner}</option>
            <option value="intermediate">{L.intermediate}</option>
            <option value="advanced">{L.advanced}</option>
          </select>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.chatCol}>
          {/* Messages */}
          <div style={s.chatArea}>
            {messages.map((m, i) => (
              <div key={i} style={{ ...s.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && <div style={s.botAvatar}>👩‍🏫</div>}
                <div style={m.role === 'user' ? s.userBubble : s.botBubble}>
                  {m.role === 'assistant' ? renderMarkdown(m.content) : <p style={{ margin: 0, lineHeight: 1.7 }}>{m.content}</p>}
                </div>
              </div>
            ))}
            {loading && (
              <div style={s.msgRow}>
                <div style={s.botAvatar}>👩‍🏫</div>
                <div style={s.thinkingBubble}>
                  <span style={s.dots}><span>.</span><span>.</span><span>.</span></span>
                  <span style={s.thinkingText}>{L.thinking}</span>
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          {/* Starters */}
          {messages.length <= 1 && currentStarters.length > 0 && (
            <div style={s.starterSection}>
              <div style={s.starterLabel}>{L.starters}</div>
              <div style={s.starterGrid}>
                {currentStarters.map((st, i) => (
                  <button key={i} onClick={() => sendMessage(st.prompt)} style={s.starterBtn}>
                    <span style={s.starterBtnLabel}>{st[`label_${lang}`] || st.label_en}</span>
                    <span style={s.starterBtnEs}>{st.label_es}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div style={s.inputRow}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={L.placeholder}
              style={s.input}
              rows={1}
              disabled={loading}
            />
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{ ...s.sendBtn, opacity: loading || !input.trim() ? 0.5 : 1 }}>
              {L.send}
            </button>
          </div>
        </div>

        {/* Tips sidebar */}
        <div style={s.tipsCol}>
          <h3 style={s.tipsTitle}>{L.tipTitle}</h3>
          {[L.tip1, L.tip2, L.tip3, L.tip4].map((tip, i) => (
            <div key={i} style={s.tipItem}>
              <span style={s.tipIcon}>{['💬','🇵🇭','🏢','🏆'][i]}</span>
              <span style={s.tipText}>{tip}</span>
            </div>
          ))}
          <div style={s.methodCard}>
            <div style={s.methodBadge}>DON QUIJOTE METHOD</div>
            <p style={s.methodText}>Immersion-based communicative teaching inspired by Spain's leading language schools. Learn by doing, not memorizing.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '24px 32px', borderBottom: '3px solid #C9A84C', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  avatar: { width: 52, height: 52, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '2px solid #C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: '#E8D48B', fontStyle: 'italic', maxWidth: 500 },
  levelSelect: { display: 'flex', alignItems: 'center', gap: 10 },
  levelLabel: { fontSize: 11, fontWeight: 700, color: '#E8D48B', letterSpacing: 1, textTransform: 'uppercase' },
  select: { padding: '8px 12px', borderRadius: 6, border: '1px solid #C9A84C', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  body: { flex: 1, display: 'flex', gap: 0, maxWidth: 1200 },
  chatCol: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  chatArea: { flex: 1, padding: '24px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 400 },
  msgRow: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  botAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#1B2A4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  botBubble: { background: '#fff', padding: '14px 18px', borderRadius: '4px 16px 16px 16px', maxWidth: '80%', fontSize: 14, color: '#2C2C2C', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '3px solid #C9A84C' },
  userBubble: { background: '#1B2A4A', color: '#fff', padding: '12px 18px', borderRadius: '16px 4px 16px 16px', maxWidth: '75%', fontSize: 14 },
  thinkingBubble: { background: '#fff', padding: '14px 18px', borderRadius: '4px 16px 16px 16px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '3px solid #C9A84C' },
  dots: { fontSize: 24, color: '#C9A84C', letterSpacing: 3, animation: 'pulse 1.5s infinite' },
  thinkingText: { fontSize: 13, color: '#8B6914', fontStyle: 'italic' },
  starterSection: { padding: '0 32px 16px' },
  starterLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  starterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 },
  starterBtn: { textAlign: 'left', padding: '10px 14px', background: '#fff', border: '1px solid #F5E6C8', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 2 },
  starterBtnLabel: { fontSize: 13, fontWeight: 600, color: '#1B2A4A' },
  starterBtnEs: { fontSize: 11, color: '#8B6914', fontStyle: 'italic' },
  inputRow: { display: 'flex', gap: 8, padding: '16px 32px', borderTop: '2px solid #F5E6C8', background: '#fff' },
  input: { flex: 1, padding: '12px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, fontFamily: "'Inter',sans-serif", resize: 'none', outline: 'none', lineHeight: 1.5 },
  sendBtn: { padding: '12px 24px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1, whiteSpace: 'nowrap' },
  tipsCol: { width: 260, padding: '24px 20px', borderLeft: '1px solid #F5E6C8', background: '#FFFDF5', flexShrink: 0 },
  tipsTitle: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A', marginBottom: 16 },
  tipItem: { display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #F5E6C8', alignItems: 'flex-start' },
  tipIcon: { fontSize: 18, flexShrink: 0, marginTop: 1 },
  tipText: { fontSize: 12, color: '#6B6B6B', lineHeight: 1.5 },
  methodCard: { marginTop: 24, padding: 16, background: '#0F1A2E', borderRadius: 8, textAlign: 'center' },
  methodBadge: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 2, marginBottom: 8 },
  methodText: { fontSize: 12, color: '#E8D48B', lineHeight: 1.6, fontStyle: 'italic' },
};
