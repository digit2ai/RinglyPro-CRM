import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * TutorProfile — tutor detail + booking form at /Torna_Idioma/learn/tutors/:id
 */
export default function TutorProfile() {
  const { id } = useParams();
  const authed = isAuthenticated();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState({
    date: '',
    time: '',
    duration: 30,
    notes: ''
  });
  const [bookingResult, setBookingResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    v2Api.get(`/tutor-market/tutors/${id}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBook = async (e) => {
    e.preventDefault();
    if (!authed) {
      window.location.href = '/Torna_Idioma/login';
      return;
    }
    if (!booking.date || !booking.time) {
      setError('Please select a date and time');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const scheduled = new Date(`${booking.date}T${booking.time}:00`).toISOString();
      const r = await v2Api.post('/tutor-market/bookings', {
        tutor_id: parseInt(id, 10),
        scheduled_at: scheduled,
        duration_minutes: booking.duration,
        notes: booking.notes
      });
      setBookingResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={styles.container}><div style={styles.loading}>Loading tutor...</div></div>;
  if (!data?.tutor) return <div style={styles.container}><div style={styles.errorBox}>Tutor not found</div></div>;

  const tutor = data.tutor;
  const price = Math.round((Number(tutor.hourly_rate_usd) * booking.duration / 60) * 100) / 100;

  if (bookingResult) {
    return (
      <div style={styles.container}>
        <div style={styles.inner}>
          <div style={styles.successCard}>
            <div style={styles.successLabel}>BOOKING CONFIRMED</div>
            <h1 style={styles.successTitle}>You're booked with {tutor.display_name}!</h1>
            <div style={styles.bookingDetails}>
              <div style={styles.detailRow}>
                <span>When</span>
                <strong>{new Date(bookingResult.booking.scheduled_at).toLocaleString()}</strong>
              </div>
              <div style={styles.detailRow}>
                <span>Duration</span>
                <strong>{bookingResult.booking.duration_minutes} minutes</strong>
              </div>
              <div style={styles.detailRow}>
                <span>Price</span>
                <strong>${bookingResult.payment.amount_usd}</strong>
              </div>
              <div style={styles.detailRow}>
                <span>Payment mode</span>
                <strong style={{ color: bookingResult.payment.mode === 'live' ? '#10b981' : '#f59e0b' }}>
                  {bookingResult.payment.mode === 'live' ? 'Stripe Live' : 'Demo Mode'}
                </strong>
              </div>
              <div style={styles.detailRow}>
                <span>Status</span>
                <strong style={{ color: '#10b981' }}>{bookingResult.booking.status}</strong>
              </div>
            </div>
            {bookingResult.payment.mode !== 'live' && (
              <div style={styles.demoNotice}>
                <strong>Demo mode:</strong> Stripe Connect is not configured. This booking
                is auto-confirmed without real payment. Your session room is ready below.
              </div>
            )}
            <div style={styles.actionRow}>
              <a
                href={`/Torna_Idioma/learn/session/${bookingResult.booking.id}`}
                style={styles.btnPrimary}
              >
                Enter Session Room
              </a>
              <a href="/Torna_Idioma/learn/bookings" style={styles.btnSecondary}>
                View All Bookings
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.back}>
          <a href="/Torna_Idioma/learn/tutors" style={styles.link}>
            ← All tutors
          </a>
        </div>

        <div style={styles.profileHeader}>
          <div style={styles.avatarLarge}>
            {tutor.display_name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)}
          </div>
          <div>
            <h1 style={styles.name}>{tutor.display_name}</h1>
            <div style={styles.headline}>{tutor.headline}</div>
            <div style={styles.tagRow}>
              {(tutor.specialties || []).map((s) => (
                <span key={s} style={styles.tag}>
                  {s.replace('_', ' ')}
                </span>
              ))}
            </div>
            <div style={styles.statRow}>
              <span>
                <strong style={{ color: '#C9A84C' }}>{Number(tutor.rating_avg).toFixed(1)}</strong>
                <span style={{ color: '#94a3b8' }}> / {tutor.rating_count} reviews</span>
              </span>
              <span>
                <strong style={{ color: '#C9A84C' }}>{tutor.total_sessions}</strong>
                <span style={{ color: '#94a3b8' }}> sessions</span>
              </span>
              <span>
                <strong style={{ color: '#C9A84C' }}>{tutor.years_experience}</strong>
                <span style={{ color: '#94a3b8' }}> years exp</span>
              </span>
              <span>
                <strong style={{ color: '#10b981' }}>${Number(tutor.hourly_rate_usd)}/hr</strong>
              </span>
            </div>
          </div>
        </div>

        <div style={styles.twoCol}>
          {/* Left: bio + availability + reviews */}
          <div>
            <div style={styles.card}>
              <div style={styles.cardLabel}>ABOUT</div>
              <p style={styles.bio}>{tutor.bio}</p>
              {tutor.certifications?.length > 0 && (
                <>
                  <div style={styles.subLabel}>Certifications</div>
                  <ul style={styles.certList}>
                    {tutor.certifications.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {tutor.languages_spoken?.length > 0 && (
                <>
                  <div style={styles.subLabel}>Languages</div>
                  <div style={styles.langRow}>
                    {tutor.languages_spoken.map((l, i) => (
                      <span key={i} style={styles.langChip}>
                        {l}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {data.availability?.length > 0 && (
              <div style={styles.card}>
                <div style={styles.cardLabel}>AVAILABILITY (TUTOR'S TIMEZONE)</div>
                <div style={styles.timezoneNote}>Times in {tutor.timezone}</div>
                <div style={styles.availList}>
                  {data.availability.map((a, i) => (
                    <div key={i} style={styles.availRow}>
                      <span style={styles.availDay}>{DAYS[a.day_of_week]}</span>
                      <span style={styles.availTime}>
                        {a.start_time.slice(0, 5)} – {a.end_time.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.reviews?.length > 0 && (
              <div style={styles.card}>
                <div style={styles.cardLabel}>RECENT REVIEWS</div>
                {data.reviews.map((r, i) => (
                  <div key={i} style={styles.review}>
                    <div style={styles.reviewHead}>
                      <strong>{r.learner_name || 'Anonymous'}</strong>
                      <span style={styles.rating}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    {r.review_text && <div style={styles.reviewText}>{r.review_text}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: booking form */}
          <div>
            <div style={{ ...styles.card, position: 'sticky', top: 20 }}>
              <div style={styles.cardLabel}>BOOK A SESSION</div>
              {error && <div style={styles.errorBox}>{error}</div>}
              <form onSubmit={handleBook}>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Date</span>
                  <input
                    type="date"
                    value={booking.date}
                    onChange={(e) => setBooking({ ...booking, date: e.target.value })}
                    min={new Date().toISOString().slice(0, 10)}
                    style={styles.input}
                    required
                  />
                </label>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Time (your local)</span>
                  <input
                    type="time"
                    value={booking.time}
                    onChange={(e) => setBooking({ ...booking, time: e.target.value })}
                    style={styles.input}
                    required
                  />
                </label>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Duration</span>
                  <select
                    value={booking.duration}
                    onChange={(e) => setBooking({ ...booking, duration: parseInt(e.target.value, 10) })}
                    style={styles.input}
                  >
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </label>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Notes (optional)</span>
                  <textarea
                    value={booking.notes}
                    onChange={(e) => setBooking({ ...booking, notes: e.target.value })}
                    style={{ ...styles.input, minHeight: 80 }}
                    placeholder="What would you like to focus on?"
                  />
                </label>
                <div style={styles.priceBox}>
                  <span>Total</span>
                  <span style={styles.priceValue}>${price.toFixed(2)}</span>
                </div>
                <button type="submit" disabled={submitting} style={styles.btnPrimary}>
                  {submitting ? 'Booking...' : authed ? 'Book Session' : 'Login to Book'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div style={styles.footer}>
          Step 10 of 12 · Tutor Marketplace
        </div>
      </div>
    </div>
  );
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
  back: { marginBottom: 16 },
  link: { color: '#C9A84C', textDecoration: 'none', fontSize: 13 },

  profileHeader: {
    display: 'flex',
    gap: 24,
    alignItems: 'flex-start',
    marginBottom: 32,
    flexWrap: 'wrap'
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Playfair Display', serif",
    fontSize: 38,
    fontWeight: 900,
    color: '#0F1A2E',
    border: '3px solid rgba(232, 212, 139, 0.5)',
    flexShrink: 0
  },
  name: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
    fontWeight: 900,
    color: '#fff',
    marginBottom: 4
  },
  headline: { fontSize: 14, color: '#E8D48B', marginBottom: 12, fontStyle: 'italic' },
  tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  tag: {
    fontSize: 9,
    padding: '4px 10px',
    background: 'rgba(201, 168, 76, 0.12)',
    color: '#C9A84C',
    borderRadius: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 700
  },
  statRow: { display: 'flex', gap: 20, fontSize: 13, flexWrap: 'wrap' },

  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)',
    gap: 20
  },
  card: {
    background: 'rgba(27, 42, 74, 0.55)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 14,
    padding: 24,
    marginBottom: 18
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 2,
    marginBottom: 14
  },
  bio: { fontSize: 14, color: '#e2e8f0', lineHeight: 1.8, marginBottom: 16 },
  subLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 8
  },
  certList: { fontSize: 12, color: '#94a3b8', lineHeight: 1.9, paddingLeft: 18 },
  langRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  langChip: {
    fontSize: 11,
    padding: '4px 10px',
    background: 'rgba(14, 165, 233, 0.1)',
    color: '#0ea5e9',
    borderRadius: 12,
    fontWeight: 600
  },

  timezoneNote: { fontSize: 11, color: '#64748b', marginBottom: 10 },
  availList: { display: 'flex', flexDirection: 'column', gap: 6 },
  availRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'rgba(15, 26, 46, 0.5)',
    borderRadius: 8,
    fontSize: 12
  },
  availDay: { color: '#C9A84C', fontWeight: 700 },
  availTime: { color: '#e2e8f0' },

  review: {
    padding: '12px 0',
    borderBottom: '1px solid rgba(201, 168, 76, 0.1)'
  },
  reviewHead: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 },
  rating: { color: '#fcd34d', letterSpacing: 2 },
  reviewText: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6 },

  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    padding: '10px 12px',
    background: 'rgba(15, 26, 46, 0.7)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box'
  },
  priceBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'rgba(201, 168, 76, 0.08)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 13,
    color: '#94a3b8'
  },
  priceValue: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    fontWeight: 900,
    color: '#C9A84C'
  },
  btnPrimary: {
    width: '100%',
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '14px 28px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.5,
    textDecoration: 'none',
    display: 'inline-block',
    textAlign: 'center'
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '14px 28px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    display: 'inline-block'
  },
  actionRow: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 },

  successCard: {
    maxWidth: 560,
    margin: '40px auto',
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center'
  },
  successLabel: { fontSize: 11, fontWeight: 800, color: '#10b981', letterSpacing: 2, marginBottom: 10 },
  successTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    fontWeight: 900,
    color: '#fff',
    marginBottom: 24
  },
  bookingDetails: {
    background: 'rgba(15, 26, 46, 0.5)',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    textAlign: 'left'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: 13,
    color: '#94a3b8',
    borderBottom: '1px solid rgba(201, 168, 76, 0.08)'
  },
  demoNotice: {
    fontSize: 12,
    color: '#fcd34d',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: 10,
    padding: 14,
    lineHeight: 1.6,
    textAlign: 'left',
    marginBottom: 20
  },

  loading: { textAlign: 'center', color: '#94a3b8', padding: 60 },
  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 10,
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 14
  },
  footer: { textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 40 }
};
