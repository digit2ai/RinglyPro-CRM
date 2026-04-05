import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';

/**
 * TutorMarketplace — browse human tutors at /Torna_Idioma/learn/tutors
 */
export default function TutorMarketplace() {
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [specialty, setSpecialty] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const q = specialty ? `?specialty=${specialty}` : '';
    v2Api.get(`/tutor-market/tutors${q}`)
      .then((r) => setTutors(r.tutors || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [specialty]);

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.header}>
          <div style={styles.crestText}>TORNA IDIOMA</div>
          <div style={styles.crestMotto}>Human Tutor Marketplace</div>
          <h1 style={styles.title}>20% Human, 80% Isabel</h1>
          <p style={styles.subtitle}>
            Book one-on-one video sessions with certified human tutors for cultural
            immersion, advanced conversation, and certification assessment.
          </p>
        </div>

        <div style={styles.filters}>
          {[
            { k: '', label: 'All Tutors' },
            { k: 'heritage', label: 'Heritage' },
            { k: 'bpo', label: 'BPO Training' },
            { k: 'business', label: 'Business' },
            { k: 'beginner', label: 'Beginner' },
            { k: 'conversation', label: 'Conversation' }
          ].map((f) => (
            <button
              key={f.k}
              onClick={() => setSpecialty(f.k)}
              style={{ ...styles.filter, ...(specialty === f.k ? styles.filterActive : {}) }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {loading && <div style={styles.loading}>Loading tutors...</div>}

        {tutors.length === 0 && !loading && (
          <div style={styles.empty}>No tutors match this specialty. Try another filter.</div>
        )}

        <div style={styles.grid}>
          {tutors.map((t) => (
            <a key={t.id} href={`/Torna_Idioma/learn/tutors/${t.id}`} style={styles.card}>
              <div style={styles.cardHead}>
                <div style={styles.avatar}>
                  {(t.display_name || '?')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div style={styles.headInfo}>
                  <div style={styles.name}>{t.display_name}</div>
                  <div style={styles.accent}>{fmtAccent(t.accent)}</div>
                </div>
              </div>
              <div style={styles.headline}>{t.headline}</div>
              <div style={styles.tagRow}>
                {(t.specialties || []).slice(0, 4).map((s) => (
                  <span key={s} style={styles.tag}>
                    {s.replace('_', ' ')}
                  </span>
                ))}
              </div>
              <div style={styles.statsRow}>
                <div style={styles.stat}>
                  <div style={styles.statValue}>{Number(t.rating_avg).toFixed(1)}</div>
                  <div style={styles.statLabel}>{t.rating_count} reviews</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statValue}>{t.total_sessions}</div>
                  <div style={styles.statLabel}>sessions</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statValue}>${Number(t.hourly_rate_usd).toFixed(0)}</div>
                  <div style={styles.statLabel}>/ hour</div>
                </div>
              </div>
              <div style={styles.cta}>View profile &rarr;</div>
            </a>
          ))}
        </div>

        <div style={styles.footer}>
          Step 10 of 12 · Tutor Marketplace ·{' '}
          <a href="/Torna_Idioma/learn/tutors/apply" style={styles.link}>
            Become a tutor
          </a>
          {' · '}
          <a href="/Torna_Idioma/learn/bookings" style={styles.link}>
            My bookings
          </a>
          {' · '}
          <a href="/Torna_Idioma/learn" style={styles.link}>
            ← Home
          </a>
        </div>
      </div>
    </div>
  );
}

function fmtAccent(a) {
  const map = {
    latin_american: 'Latin American',
    filipino_spanish: 'Filipino-Spanish (Chabacano)',
    spain: 'Spain (Castellano)',
    other: 'Other'
  };
  return map[a] || a;
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 50%, #0F1A2E 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '40px 24px 80px'
  },
  inner: { maxWidth: 1060, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 32 },
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
  subtitle: { fontSize: 14, color: '#94a3b8', maxWidth: 620, margin: '0 auto' },

  filters: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 32
  },
  filter: {
    background: 'transparent',
    border: '1px solid rgba(201, 168, 76, 0.3)',
    color: '#94a3b8',
    padding: '8px 16px',
    borderRadius: 20,
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: 'pointer'
  },
  filterActive: {
    background: 'rgba(201, 168, 76, 0.15)',
    color: '#C9A84C',
    borderColor: '#C9A84C'
  },

  loading: { textAlign: 'center', color: '#94a3b8', padding: 60 },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: 60,
    background: 'rgba(27, 42, 74, 0.5)',
    borderRadius: 16
  },
  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 18
  },
  card: {
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 16,
    padding: 24,
    textDecoration: 'none',
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'all 0.2s'
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 900,
    color: '#0F1A2E',
    border: '2px solid rgba(232, 212, 139, 0.5)'
  },
  headInfo: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 17,
    fontWeight: 800,
    color: '#fff'
  },
  accent: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  headline: { fontSize: 13, color: '#e2e8f0', lineHeight: 1.5, minHeight: 40 },
  tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tag: {
    fontSize: 9,
    padding: '3px 9px',
    background: 'rgba(201, 168, 76, 0.1)',
    color: '#C9A84C',
    borderRadius: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 700
  },
  statsRow: {
    display: 'flex',
    gap: 12,
    paddingTop: 12,
    borderTop: '1px solid rgba(201, 168, 76, 0.1)'
  },
  stat: { flex: 1, textAlign: 'center' },
  statValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 900,
    color: '#C9A84C',
    lineHeight: 1
  },
  statLabel: { fontSize: 9, color: '#94a3b8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  cta: {
    fontSize: 12,
    fontWeight: 700,
    color: '#C9A84C',
    textAlign: 'right',
    marginTop: 4
  },

  footer: { textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 40 },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
