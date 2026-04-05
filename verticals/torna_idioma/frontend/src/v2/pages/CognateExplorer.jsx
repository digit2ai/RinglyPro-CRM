import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';
import CognateHighlight from '../components/CognateHighlight';

/**
 * CognateExplorer — searchable browser of the Filipino-Spanish cognate database.
 *
 * Route: /Torna_Idioma/learn/cognates
 * Features:
 *   - Live search box (ES or TL)
 *   - Category filter
 *   - Highlight demo panel (paste Spanish text, see cognates marked)
 *   - Stats header showing total count + category breakdown
 */
export default function CognateExplorer() {
  const [results, setResults] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [demoText, setDemoText] = useState('La familia come pan con queso y chocolate en la cocina. El padre lee un libro importante.');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      v2Api.get('/cognates/stats'),
      v2Api.get('/cognates/categories')
    ])
      .then(([s, c]) => {
        setStats(s.stats);
        setCategories(c.categories || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedCategory) {
        v2Api.get(`/cognates/category/${selectedCategory}`)
          .then((r) => setResults(r.results || []));
      } else {
        v2Api.get(`/cognates?search=${encodeURIComponent(search)}&limit=100`)
          .then((r) => setResults(r.results || []));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, selectedCategory]);

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.header}>
          <div style={styles.crest}>
            <div style={styles.crestText}>TORNA IDIOMA</div>
            <div style={styles.crestMotto}>Cognate Engine</div>
          </div>
          <h1 style={styles.title}>Filipino–Spanish Cognates</h1>
          <p style={styles.subtitle}>
            Discover the 4,000+ Spanish loanwords hidden in Tagalog. Your Filipino heritage is already 20% Spanish.
          </p>
          {stats && (
            <div style={styles.statsBar}>
              <div style={styles.statPill}>
                <strong style={{ color: '#C9A84C' }}>{stats.total}</strong> pairs in database
              </div>
              <div style={styles.statPill}>
                <strong style={{ color: '#C9A84C' }}>{stats.categories.length}</strong> categories
              </div>
            </div>
          )}
        </div>

        {/* Highlight demo */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>Try the cognate highlighter</div>
          <textarea
            value={demoText}
            onChange={(e) => setDemoText(e.target.value)}
            style={styles.textarea}
            placeholder="Paste Spanish text here..."
            rows={3}
          />
          <div style={styles.highlightOutput}>
            <CognateHighlight text={demoText} />
          </div>
        </div>

        {/* Search + filter */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>Search the database</div>
          <div style={styles.searchRow}>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedCategory('');
              }}
              placeholder="Search Spanish or Tagalog word..."
              style={styles.searchInput}
            />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSearch('');
              }}
              style={styles.select}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.category} value={c.category}>
                  {fmtCategory(c.category)} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={styles.loading}>Loading cognates...</div>
          ) : (
            <div style={styles.resultsGrid}>
              {results.map((c) => (
                <div key={c.id} style={styles.resultCard}>
                  <div style={styles.resultWords}>
                    <span style={styles.wordEs}>{c.word_es}</span>
                    <span style={styles.arrow}>↔</span>
                    <span style={styles.wordTl}>{c.word_tl}</span>
                  </div>
                  <div style={styles.resultMeta}>
                    <span style={styles.categoryChip}>{fmtCategory(c.category)}</span>
                    <span style={styles.cefrChip}>{c.cefr_level}</span>
                  </div>
                  {c.etymology_note && <div style={styles.note}>{c.etymology_note}</div>}
                </div>
              ))}
              {results.length === 0 && (
                <div style={styles.empty}>No cognates found for "{search || selectedCategory}"</div>
              )}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          Step 3 of 12 · Cognate Engine ·{' '}
          <a href="/Torna_Idioma/learn" style={styles.link}>← Learner Home</a>
          {' · '}
          <a href="/Torna_Idioma/" style={styles.link}>Main Site</a>
        </div>
      </div>
    </div>
  );
}

function fmtCategory(c) {
  return c
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 50%, #0F1A2E 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '40px 24px 80px'
  },
  inner: { maxWidth: 960, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 36 },
  crest: { marginBottom: 16 },
  crestText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 16,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 4
  },
  crestMotto: {
    fontSize: 10,
    color: '#E8D48B',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 4,
    fontStyle: 'italic'
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
    fontWeight: 900,
    color: '#fff',
    marginBottom: 8
  },
  subtitle: { fontSize: 14, color: '#94a3b8', maxWidth: 620, margin: '0 auto 20px' },
  statsBar: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  statPill: {
    background: 'rgba(201, 168, 76, 0.08)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 12,
    color: '#94a3b8'
  },
  card: {
    background: 'rgba(27, 42, 74, 0.5)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    backdropFilter: 'blur(8px)'
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#C9A84C',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12
  },
  textarea: {
    width: '100%',
    background: 'rgba(15, 26, 46, 0.6)',
    color: '#e2e8f0',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    fontFamily: 'inherit',
    resize: 'vertical',
    lineHeight: 1.7
  },
  highlightOutput: {
    marginTop: 16,
    padding: 16,
    background: 'rgba(15, 26, 46, 0.4)',
    borderRadius: 10,
    border: '1px solid rgba(201, 168, 76, 0.12)',
    fontSize: 15,
    lineHeight: 1.9
  },
  searchRow: {
    display: 'flex',
    gap: 10,
    marginBottom: 20,
    flexWrap: 'wrap'
  },
  searchInput: {
    flex: '1 1 300px',
    padding: '12px 14px',
    background: 'rgba(15, 26, 46, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit'
  },
  select: {
    padding: '12px 14px',
    background: 'rgba(15, 26, 46, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit',
    minWidth: 180
  },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
    maxHeight: 600,
    overflowY: 'auto',
    padding: 4
  },
  resultCard: {
    background: 'rgba(15, 26, 46, 0.5)',
    border: '1px solid rgba(201, 168, 76, 0.12)',
    borderRadius: 10,
    padding: 14
  },
  resultWords: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  wordEs: { fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: '#C9A84C' },
  arrow: { color: '#64748b', fontSize: 14 },
  wordTl: { fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: '#10b981' },
  resultMeta: { display: 'flex', gap: 6, marginBottom: 6 },
  categoryChip: {
    fontSize: 9,
    padding: '2px 8px',
    borderRadius: 10,
    background: 'rgba(201, 168, 76, 0.1)',
    color: '#C9A84C',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: 600
  },
  cefrChip: {
    fontSize: 9,
    padding: '2px 8px',
    borderRadius: 10,
    background: 'rgba(14, 165, 233, 0.1)',
    color: '#0ea5e9',
    letterSpacing: 0.5,
    fontWeight: 600
  },
  note: { fontSize: 11, color: '#94a3b8', marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    color: '#64748b',
    padding: 32,
    fontSize: 13
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#64748b',
    marginTop: 24,
    letterSpacing: 0.5
  },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
