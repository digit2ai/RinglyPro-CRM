import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';

/**
 * Badges gallery — earned + locked badges.
 * Route: /Torna_Idioma/learn/badges
 */
export default function Badges() {
  const authed = isAuthenticated();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    v2Api.get('/xp/badges')
      .then((r) => setData(r))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authed]);

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Badges</h1>
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
          <div style={styles.crestMotto}>Badges & Achievements</div>
          <h1 style={styles.title}>Your Collection</h1>
          {data && (
            <p style={styles.subtitle}>
              {data.earned_count} of {data.total_count} earned
            </p>
          )}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {loading && <div style={styles.loading}>Loading badges...</div>}

        {data && data.earned_count > 0 && (
          <>
            <div style={styles.sectionLabel}>EARNED</div>
            <div style={styles.grid}>
              {data.earned.map((b) => (
                <BadgeCard key={b.id} badge={b} earned={true} />
              ))}
            </div>
          </>
        )}

        {data && data.locked.length > 0 && (
          <>
            <div style={styles.sectionLabel}>LOCKED</div>
            <div style={styles.grid}>
              {data.locked.map((b) => (
                <BadgeCard key={b.id} badge={b} earned={false} />
              ))}
            </div>
          </>
        )}

        <div style={styles.footer}>
          Step 5 of 12 · Gamification · <a href="/Torna_Idioma/learn" style={styles.link}>← Learner Home</a>
        </div>
      </div>
    </div>
  );
}

function BadgeCard({ badge, earned }) {
  const colorMap = {
    gold: { bg: 'rgba(201, 168, 76, 0.15)', border: 'rgba(201, 168, 76, 0.5)', text: '#C9A84C' },
    emerald: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.5)', text: '#10b981' },
    sapphire: { bg: 'rgba(14, 165, 233, 0.15)', border: 'rgba(14, 165, 233, 0.5)', text: '#0ea5e9' },
    ruby: { bg: 'rgba(196, 30, 58, 0.15)', border: 'rgba(196, 30, 58, 0.5)', text: '#fca5a5' },
    amethyst: { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.5)', text: '#c4b5fd' }
  };
  const c = colorMap[badge.color] || colorMap.gold;

  return (
    <div
      style={{
        ...cardStyles.card,
        background: earned ? c.bg : 'rgba(15, 26, 46, 0.4)',
        borderColor: earned ? c.border : 'rgba(100, 116, 139, 0.2)',
        opacity: earned ? 1 : 0.55
      }}
    >
      <div
        style={{
          ...cardStyles.icon,
          background: earned ? c.bg : 'rgba(100, 116, 139, 0.15)',
          color: earned ? c.text : '#64748b',
          borderColor: earned ? c.border : 'rgba(100, 116, 139, 0.3)'
        }}
      >
        {badge.icon || '?'}
      </div>
      <div style={cardStyles.name}>{badge.name_en}</div>
      <div style={cardStyles.desc}>{badge.description}</div>
      {badge.xp_reward > 0 && (
        <div style={cardStyles.xp}>+{badge.xp_reward} XP</div>
      )}
      {earned && badge.earned_at && (
        <div style={cardStyles.earnedDate}>
          {new Date(badge.earned_at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

const cardStyles = {
  card: {
    border: '1px solid',
    borderRadius: 14,
    padding: 20,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.3s'
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 1
  },
  name: { fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginTop: 6 },
  desc: { fontSize: 11, color: '#94a3b8', lineHeight: 1.5, minHeight: 32 },
  xp: {
    fontSize: 10,
    fontWeight: 700,
    color: '#C9A84C',
    background: 'rgba(201, 168, 76, 0.1)',
    padding: '3px 10px',
    borderRadius: 10,
    marginTop: 4
  },
  earnedDate: { fontSize: 9, color: '#64748b', marginTop: 2 }
};

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
    marginBottom: 8
  },
  subtitle: { fontSize: 14, color: '#94a3b8' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#C9A84C',
    letterSpacing: 2.5,
    marginTop: 32,
    marginBottom: 14
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 16
  },
  card: {
    maxWidth: 480,
    margin: '60px auto',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center'
  },
  btn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    padding: '12px 28px',
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block'
  },
  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20
  },
  loading: { color: '#94a3b8', textAlign: 'center', padding: 40 },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#64748b',
    marginTop: 32,
    letterSpacing: 0.5
  },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
