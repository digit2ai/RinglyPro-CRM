import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';

export default function MyBookings() {
  const authed = isAuthenticated();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    v2Api.get('/tutor-market/bookings/my')
      .then((r) => setBookings(r.bookings || []))
      .finally(() => setLoading(false));
  }, [authed]);

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>My Bookings</h1>
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
          <div style={styles.crestMotto}>My Tutor Sessions</div>
          <h1 style={styles.title}>Booked Sessions</h1>
        </div>

        {loading && <div style={styles.loading}>Loading...</div>}

        {!loading && bookings.length === 0 && (
          <div style={styles.empty}>
            <p>You haven't booked any tutor sessions yet.</p>
            <a href="/Torna_Idioma/learn/tutors" style={styles.btnPrimary}>
              Browse Tutors
            </a>
          </div>
        )}

        <div style={styles.list}>
          {bookings.map((b) => (
            <div key={b.id} style={styles.card}>
              <div style={styles.cardHead}>
                <div>
                  <div style={styles.tutorName}>{b.tutor_name}</div>
                  <div style={styles.date}>{new Date(b.scheduled_at).toLocaleString()}</div>
                  <div style={styles.metaRow}>
                    <span>{b.duration_minutes} min</span>
                    <span>${Number(b.price_usd).toFixed(2)}</span>
                    <span style={{ color: statusColor(b.status) }}>{b.status}</span>
                  </div>
                </div>
                <a
                  href={`/Torna_Idioma/learn/session/${b.id}`}
                  style={styles.enterBtn}
                >
                  {b.status === 'completed' ? 'View' : 'Enter Room'}
                </a>
              </div>
              {b.notes && <div style={styles.notes}>{b.notes}</div>}
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <a href="/Torna_Idioma/learn/tutors" style={styles.link}>Browse tutors</a>
          {' · '}
          <a href="/Torna_Idioma/learn" style={styles.link}>← Home</a>
        </div>
      </div>
    </div>
  );
}

function statusColor(s) {
  if (s === 'completed') return '#10b981';
  if (s === 'in_progress') return '#0ea5e9';
  if (s === 'cancelled' || s === 'no_show') return '#ef4444';
  if (s === 'pending_payment') return '#f59e0b';
  return '#C9A84C';
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
  header: { textAlign: 'center', marginBottom: 32 },
  crestText: { fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 800, color: '#C9A84C', letterSpacing: 4 },
  crestMotto: { fontSize: 10, color: '#E8D48B', letterSpacing: 3, textTransform: 'uppercase', marginTop: 4, fontStyle: 'italic' },
  title: { fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.8rem, 4vw, 2.2rem)', fontWeight: 900, color: '#fff', marginTop: 16 },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  empty: { textAlign: 'center', padding: 60, background: 'rgba(27, 42, 74, 0.5)', borderRadius: 16, color: '#94a3b8' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: 'rgba(27, 42, 74, 0.55)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 14,
    padding: 20
  },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  tutorName: { fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 800, color: '#fff' },
  date: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  metaRow: { display: 'flex', gap: 14, fontSize: 11, color: '#64748b', marginTop: 6, fontWeight: 600, textTransform: 'uppercase' },
  enterBtn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    padding: '10px 20px',
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 12,
    textDecoration: 'none',
    letterSpacing: 0.5
  },
  notes: {
    marginTop: 12,
    padding: 10,
    background: 'rgba(15, 26, 46, 0.5)',
    borderRadius: 8,
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic'
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    padding: '12px 28px',
    borderRadius: 10,
    fontWeight: 800,
    textDecoration: 'none',
    display: 'inline-block',
    marginTop: 16
  },
  gate: { maxWidth: 480, margin: '60px auto', background: 'rgba(27, 42, 74, 0.6)', border: '1px solid rgba(201, 168, 76, 0.25)', borderRadius: 20, padding: 48, textAlign: 'center' },
  btn: { background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#0F1A2E', padding: '12px 28px', borderRadius: 8, fontWeight: 700, textDecoration: 'none', display: 'inline-block' },
  footer: { textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 32 },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
