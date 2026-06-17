import React, { useState } from 'react';
import api from '../services/api';
import { tr, uiLang } from '../i18n';

// Strip the Spanish voice marker used internally so it never reaches the UI.
const stripEs = s => String(s || '').replace(/⟦es⟧/g, '');

// Escape HTML so LLM content can never inject markup via dangerouslySetInnerHTML.
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
  return String(text || '').split('\n').map((line, i) => {
    const html = escapeHtml(stripEs(line))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:#F5E6C8;padding:1px 4px;border-radius:3px;font-size:13px">$1</code>');
    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
    return <p key={i} style={{ margin: '4px 0', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

// Hardcoded sample banks. Source lines are exercise CONTENT (allowed to be ES/EN/FIL).
const BANKS = {
  enToEs: [
    'Good morning, how may I help you today?',
    'The library opens at nine in the morning.',
    'My family lives in a small town near the sea.',
    'Could you please repeat the question more slowly?',
    'We are learning Spanish to honor our shared history.',
  ],
  filToEs: [
    'Magandang umaga po, kumusta kayo?',
    'Ang aklatan ay nagbubukas tuwing alas-nuwebe.',
    'Nakatira ang aking pamilya malapit sa dagat.',
    'Salamat po sa inyong tulong kahapon.',
    'Nais kong matuto ng Espanyol para sa aking trabaho.',
  ],
  esToEn: [
    'Buenos días, ¿en qué puedo ayudarle hoy?',
    'La biblioteca abre a las nueve de la mañana.',
    'Mi familia vive en un pueblo pequeño cerca del mar.',
    // Short José Rizal public-domain Spanish lines.
    'Adiós, Patria adorada, región del sol querida.',
    'Una mañana de diciembre el vapor Tabo subía despacio por el río Pásig.',
  ],
};

export default function TranslationAtelier() {
  const [direction, setDirection] = useState('enToEs');
  const [idx, setIdx] = useState(0);
  const [userText, setUserText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const directions = [
    { key: 'enToEs', label: tr('atelier.enToEs') },
    { key: 'filToEs', label: tr('atelier.filToEs') },
    { key: 'esToEn', label: tr('atelier.esToEn') },
  ];

  const bank = BANKS[direction] || [];
  const sourceText = stripEs(bank[idx] || '');
  const directionLabel = (directions.find(d => d.key === direction) || {}).label || direction;

  const selectDirection = (key) => {
    if (key === direction) return;
    setDirection(key);
    setIdx(0);
    setUserText('');
    setFeedback('');
    setError('');
  };

  const newPrompt = () => {
    if (bank.length <= 1) return;
    let next = idx;
    while (next === idx) next = Math.floor(Math.random() * bank.length);
    setIdx(next);
    setUserText('');
    setFeedback('');
    setError('');
  };

  const grade = async () => {
    if (!userText.trim() || loading) return;
    setLoading(true);
    setError('');
    setFeedback('');
    const prompt = `Translation exercise (${directionLabel}). Source: "${sourceText}". My translation: "${userText.trim()}". Please grade my translation.`;
    try {
      const r = await api.post('/tutor/chat', {
        messages: [{ role: 'user', content: prompt }],
        mode: 'translation',
        interface_lang: uiLang(),
        immersion_level: 2,
      });
      if (r && r.data && r.data.success && r.data.reply) {
        setFeedback(r.data.reply);
      } else {
        setError(tr('common.error'));
      }
    } catch (e) {
      setError(tr('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.avatar}>TA</div>
          <div>
            <h1 style={s.headerTitle}>{tr('atelier.title')}</h1>
            <p style={s.headerSub}>{tr('atelier.subtitle')}</p>
          </div>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.mainCol}>
          {/* Direction selector */}
          <div style={s.sectionLabel}>{tr('atelier.direction')}</div>
          <div style={s.dirRow}>
            {directions.map(d => (
              <button
                key={d.key}
                onClick={() => selectDirection(d.key)}
                style={direction === d.key ? { ...s.dirBtn, ...s.dirBtnActive } : s.dirBtn}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Source line */}
          <div style={s.card}>
            <div style={s.cardHead}>
              <span style={s.sectionLabel}>{tr('atelier.source')}</span>
              <button onClick={newPrompt} disabled={bank.length <= 1} style={s.newBtn}>
                {tr('atelier.newPrompt')}
              </button>
            </div>
            <p style={s.sourceText}>{sourceText}</p>
            {direction === 'esToEn' && (
              <p style={s.rizalNote}>{tr('atelier.rizalNote')}</p>
            )}
          </div>

          {/* Your translation */}
          <div style={s.sectionLabel}>{tr('atelier.yourTranslation')}</div>
          <textarea
            value={userText}
            onChange={e => setUserText(e.target.value)}
            placeholder={tr('atelier.placeholder')}
            style={s.textarea}
            rows={4}
            disabled={loading}
          />

          <div style={s.actionRow}>
            <button
              onClick={grade}
              disabled={loading || !userText.trim()}
              style={{ ...s.gradeBtn, opacity: loading || !userText.trim() ? 0.5 : 1 }}
            >
              {loading ? tr('atelier.grading') : tr('atelier.grade')}
            </button>
          </div>

          {/* Feedback */}
          {error && (
            <div style={s.errorBox}>{error}</div>
          )}
          {(loading || feedback) && (
            <div style={s.card}>
              <div style={s.sectionLabel}>{tr('atelier.feedback')}</div>
              {loading && !feedback ? (
                <div style={s.thinkingRow}>
                  <span style={s.dots}><span>.</span><span>.</span><span>.</span></span>
                  <span style={s.thinkingText}>{tr('atelier.grading')}</span>
                </div>
              ) : (
                <div style={s.feedbackBody}>{renderMarkdown(feedback)}</div>
              )}
            </div>
          )}
        </div>

        {/* Side note */}
        <div style={s.sideCol}>
          <div style={s.methodCard}>
            <div style={s.methodBadge}>MÉTODO RIZAL</div>
            <p style={s.methodText}>{tr('atelier.subtitle')}</p>
          </div>
          <div style={s.sampleCard}>
            <div style={s.sampleLabel}>{tr('atelier.sampleLabel')}</div>
            {bank.map((line, i) => (
              <button
                key={i}
                onClick={() => { setIdx(i); setUserText(''); setFeedback(''); setError(''); }}
                style={i === idx ? { ...s.sampleItem, ...s.sampleItemActive } : s.sampleItem}
              >
                {stripEs(line)}
              </button>
            ))}
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
  avatar: { width: 52, height: 52, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '2px solid #C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#C9A84C', fontFamily: "'Playfair Display',serif", letterSpacing: 1 },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: 13, color: '#E8D48B', fontStyle: 'italic', maxWidth: 560 },
  body: { flex: 1, display: 'flex', gap: 0, maxWidth: 1200, width: '100%' },
  mainCol: { flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  sideCol: { width: 260, padding: '24px 20px', borderLeft: '1px solid #F5E6C8', background: '#FFFDF5', flexShrink: 0 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase' },
  dirRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  dirBtn: { padding: '10px 16px', background: '#fff', border: '1px solid #F5E6C8', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1B2A4A', transition: 'all 0.2s', fontFamily: "'Inter',sans-serif" },
  dirBtnActive: { background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: '1px solid #8B6914' },
  card: { background: '#fff', border: '1px solid #F5E6C8', borderLeft: '3px solid #C9A84C', borderRadius: 10, padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 },
  newBtn: { padding: '6px 12px', background: '#FFFDF5', border: '1px solid #C9A84C', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#8B6914', cursor: 'pointer' },
  sourceText: { margin: 0, fontSize: 18, lineHeight: 1.6, color: '#0F1A2E', fontFamily: "'Playfair Display',serif" },
  rizalNote: { margin: '10px 0 0', fontSize: 12, color: '#8B6914', fontStyle: 'italic' },
  textarea: { padding: '14px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, fontFamily: "'Inter',sans-serif", resize: 'vertical', outline: 'none', lineHeight: 1.6, background: '#fff' },
  actionRow: { display: 'flex', justifyContent: 'flex-end' },
  gradeBtn: { padding: '12px 28px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1, whiteSpace: 'nowrap' },
  errorBox: { background: '#FBE7EA', border: '1px solid #C41E3A', color: '#C41E3A', borderRadius: 8, padding: '12px 16px', fontSize: 14 },
  feedbackBody: { fontSize: 14, color: '#2C2C2C', marginTop: 6 },
  thinkingRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 },
  dots: { fontSize: 24, color: '#C9A84C', letterSpacing: 3 },
  thinkingText: { fontSize: 13, color: '#8B6914', fontStyle: 'italic' },
  methodCard: { padding: 16, background: '#0F1A2E', borderRadius: 8, textAlign: 'center' },
  methodBadge: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 2, marginBottom: 8 },
  methodText: { fontSize: 12, color: '#E8D48B', lineHeight: 1.6, fontStyle: 'italic' },
  sampleCard: { marginTop: 20 },
  sampleLabel: { fontSize: 11, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  sampleItem: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 6, background: '#fff', border: '1px solid #F5E6C8', borderRadius: 6, cursor: 'pointer', fontSize: 12, lineHeight: 1.5, color: '#6B6B6B', fontFamily: "'Inter',sans-serif" },
  sampleItemActive: { borderLeft: '3px solid #C9A84C', color: '#1B2A4A', fontWeight: 600, background: '#FFFDF5' },
};
