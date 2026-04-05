import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated, getUser } from '../../services/auth';

/**
 * Leaderboard — weekly XP ranking across all learners.
 * Route: /Torna_Idioma/learn/leaderboard
 */
export default function Leaderboard() {
  const authed = isAuthenticated();
  const me = getUser();
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    v2Api.get(`/xp/leaderboard?period=${period}&limit=50`)
      .then((r) => setData(r.leaderboard || []))
      .finally(() => setLoading(false));
  }, [authed, period]);

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyCard}>
          <h1 style={styles.title}>Leaderboard</h1>
          <p style={styles.subtitle}>Login to compare your progress with other learners.</p>
          <a href="/Torna_Idioma/login" style={styles.btn}>Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.header}>
          <div style={styles.crestText}>TORNA IDIOMA</div>
          <div style={styles.crestMotto}>Leaderboard</div>
          <h1 style={styles.title}>Top Learners</h1>
          <div style={styles.tabs}>
            <button
              onClick={() => setPeriod('week')}
              style={{ ...styles.tab, ...(period === 'week' ? styles.tabActive : {}) }}
            >
              This Week
            </button>
            <button
              onClick={() => setPeriod('all')}
              style={{ ...styles.tab, ...(period === 'all' ? styles.tabActive : {}) }}
            >
              All Time
            </button>
          </div>
        </div>

        {loading ? (
          <div style={styles.loading}>Loading rankings...</div>
        ) : data.length === 0 ? (
          <div style={styles.empty}>
            No learners on the leaderboard yet. Be the first — start reviewing cards to earn XP.
          </div>
        ) : (
          <div style={styles.list}>
            {data.map((row) => {
              const isMe = me?.email && row.full_name && me.full_name === row.full_name;
              return (
                <div
                  key={row.learner_id}
                  style={{
                    ...styles.row,
                    ...(isMe ? styles.rowMe : {}),
                    ...(row.rank <= 3 ? styles.rowTop3 : {})
                  }}
                >
                  <div style={styles.rank}>
                    {row.rank <= 3 ? (
                      <span style={{ ...styles.medal, color: rankColor(row.rank) }}>#{row.rank}</span>
                    ) : (
                      <span style={styles.rankNum}>#{row.rank}</span>
                    )}
                  </div>
                  <div style={styles.who}>
                    <div style={styles.name}>
                      {row.full_name || 'Anonymous'} {isMe && <span style={styles.youBadge}>You</span>}
                    </div>
                    {row.organization && (
                      <div style={styles.org}>{row.organization}</div>
                    )}
                  </div>
                  <div style={styles.xp}>
                    <div style={styles.xpValue}>{row.period_xp.toLocaleString()}</div>
                    <div style={styles.xpLabel}>XP</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={styles.footer}>
          Step 5 of 12 · Gamification · <a href="/Torna_Idioma/learn" style={styles.link}>← Learner Home</a>
        </div>
      </div>
    </div>
  );
}

function rankColor(rank) {
  if (rank === 1) return '#FCD34D'; // gold
  if (rank === 2) return '#E5E7EB'; // silver
  if (rank === 3) return '#D97706'; // bronze
  return '#94a3b8';
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 50%, #0F1A2E 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '40px 24px 80px'
  },
  inner: { maxWidth: 720, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 28 },
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
    marginTop: 16,
    marginBottom: 16
  },
  tabs: { display: 'flex', gap: 8, justifyContent: 'center' },
  tab: {
    background: 'transparent',
    border: '1px solid rgba(201, 168, 76, 0.3)',
    color: '#94a3b8',
    padding: '8px 20px',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: 'pointer'
  },
  tabActive: { background: 'rgba(201, 168, 76, 0.15)', color: '#C9A84C', borderColor: '#C9A84C' },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: 60,
    background: 'rgba(27, 42, 74, 0.5)',
    borderRadius: 16,
    border: '1px solid rgba(201, 168, 76, 0.15)'
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '14px 20px',
    background: 'rgba(27, 42, 74, 0.5)',
    border: '1px solid rgba(201, 168, 76, 0.12)',
    borderRadius: 12,
    transition: 'all 0.2s'
  },
  rowTop3: { background: 'rgba(201, 168, 76, 0.06)', borderColor: 'rgba(201, 168, 76, 0.25)' },
  rowMe: {
    background: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.4)'
  },
  rank: { minWidth: 48 },
  medal: { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 900 },
  rankNum: { color: '#64748b', fontSize: 14, fontWeight: 700 },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis' },
  org: { fontSize: 11, color: '#64748b', marginTop: 2 },
  youBadge: {
    fontSize: 9,
    fontWeight: 800,
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.15)',
    padding: '2px 8px',
    borderRadius: 10,
    letterSpacing: 1,
    marginLeft: 6
  },
  xp: { textAlign: 'right' },
  xpValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 900,
    color: '#C9A84C',
    lineHeight: 1
  },
  xpLabel: { fontSize: 9, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  emptyCard: {
    maxWidth: 480,
    margin: '60px auto',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center'
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
    fontSize: 11,
    color: '#64748b',
    marginTop: 28,
    letterSpacing: 0.5
  },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
