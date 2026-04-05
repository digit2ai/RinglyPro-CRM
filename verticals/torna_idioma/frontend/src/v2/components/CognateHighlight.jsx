import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';

/**
 * CognateHighlight — renders Spanish text with Filipino cognates highlighted.
 *
 * Usage:
 *   <CognateHighlight text="La familia de Juan vive en la casa nueva." />
 *
 * Cognate words get a gold underline and a hover tooltip showing the
 * Tagalog cognate plus etymology note.
 *
 * Calls GET /api/v2/cognates/highlight?text=... on mount to tokenize.
 * Falls back to plain text on error.
 */
export default function CognateHighlight({ text, inline = false }) {
  const [tokens, setTokens] = useState(null);
  const [cognateCount, setCognateCount] = useState(0);

  useEffect(() => {
    if (!text) {
      setTokens([]);
      return;
    }
    v2Api.get(`/cognates/highlight?text=${encodeURIComponent(text)}`)
      .then((r) => {
        setTokens(r.tokens || []);
        setCognateCount(r.cognate_count || 0);
      })
      .catch(() => setTokens(null));
  }, [text]);

  if (tokens === null) {
    return <span style={inline ? styles.wrapperInline : styles.wrapper}>{text}</span>;
  }

  return (
    <span style={inline ? styles.wrapperInline : styles.wrapper}>
      {tokens.map((t, i) =>
        t.isCognate ? (
          <span
            key={i}
            style={styles.cognate}
            title={`Tagalog: ${t.cognate.word_tl}${t.cognate.note ? ` — ${t.cognate.note}` : ''}`}
          >
            {t.text}
            <span style={styles.tooltip}>
              <strong>{t.cognate.word_tl}</strong>
              <span style={styles.tooltipCat}>{t.cognate.category}</span>
              {t.cognate.note && <span style={styles.tooltipNote}>{t.cognate.note}</span>}
            </span>
          </span>
        ) : (
          <span key={i}>{t.text}</span>
        )
      )}
      {!inline && cognateCount > 0 && (
        <span style={styles.badge}>
          {cognateCount} cognate{cognateCount !== 1 ? 's' : ''}
        </span>
      )}
    </span>
  );
}

const styles = {
  wrapper: { display: 'inline', lineHeight: 1.8 },
  wrapperInline: { display: 'inline' },
  cognate: {
    position: 'relative',
    color: '#E8D48B',
    borderBottom: '2px solid #C9A84C',
    cursor: 'help',
    padding: '0 1px'
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%) translateY(-4px)',
    background: 'rgba(15, 26, 46, 0.98)',
    color: '#e2e8f0',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(201, 168, 76, 0.3)',
    fontSize: 12,
    whiteSpace: 'normal',
    minWidth: 160,
    maxWidth: 280,
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.2s',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    textAlign: 'left'
  },
  tooltipCat: {
    fontSize: 10,
    color: '#C9A84C',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  tooltipNote: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' },
  badge: {
    display: 'inline-block',
    marginLeft: 10,
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 10,
    background: 'rgba(201, 168, 76, 0.12)',
    color: '#C9A84C',
    letterSpacing: 0.5,
    verticalAlign: 'middle'
  }
};

// Inject hover CSS once (styled-components-free way to handle pseudo-class)
if (typeof document !== 'undefined' && !document.getElementById('ti-v2-cognate-hover')) {
  const s = document.createElement('style');
  s.id = 'ti-v2-cognate-hover';
  s.textContent = `
    [data-ti-cognate]:hover > span[role="tooltip"],
    span[style*="cursor: help"]:hover > span[style*="opacity: 0"] { opacity: 1 !important; }
    span[style*="border-bottom: 2px solid"]:hover > span { opacity: 1 !important; pointer-events: auto !important; }
  `;
  document.head.appendChild(s);
}
