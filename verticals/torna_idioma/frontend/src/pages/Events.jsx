import React, { useState, useEffect } from 'react';
import { getLang, getUser } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'Cultural Events', sub: 'Connect with the Spanish-Filipino community through workshops, festivals, and cultural experiences.', upcoming: 'Upcoming Events', past: 'Past Events', register: 'Register', registered: 'Registered ✓', registering: '...', seats: 'seats left', full: 'Full', location: 'Location', date: 'Date', type: 'Type', noEvents: 'No upcoming events. Check back soon!', cultural: 'Cultural', workshop: 'Workshop', social: 'Social', info_session: 'Info Session', conference: 'Conference', all: 'All Types', filterType: 'Event Type', myEvents: 'My Events', noMyEvents: 'You haven\'t registered for any events yet.' },
  es: { title: 'Eventos Culturales', sub: 'Conéctate con la comunidad hispano-filipina a través de talleres, festivales y experiencias culturales.', upcoming: 'Próximos Eventos', past: 'Eventos Pasados', register: 'Registrarse', registered: 'Registrado ✓', registering: '...', seats: 'asientos', full: 'Lleno', location: 'Ubicación', date: 'Fecha', type: 'Tipo', noEvents: '¡No hay eventos próximos! Vuelve pronto.', cultural: 'Cultural', workshop: 'Taller', social: 'Social', info_session: 'Sesión Informativa', conference: 'Conferencia', all: 'Todos', filterType: 'Tipo de Evento', myEvents: 'Mis Eventos', noMyEvents: 'Aún no te has registrado en ningún evento.' },
  fil: { title: 'Mga Cultural Events', sub: 'Kumonekta sa komunidad ng Espanyol-Pilipino sa mga workshop, festival, at karanasan.', upcoming: 'Mga Paparating na Event', past: 'Mga Nakaraang Event', register: 'Mag-register', registered: 'Registered ✓', registering: '...', seats: 'upuan', full: 'Puno', location: 'Lokasyon', date: 'Petsa', type: 'Uri', noEvents: 'Walang paparating na event. Bumalik muli!', cultural: 'Kultural', workshop: 'Workshop', social: 'Social', info_session: 'Info Session', conference: 'Conference', all: 'Lahat', filterType: 'Uri ng Event', myEvents: 'Mga Event Ko', noMyEvents: 'Hindi ka pa nag-register sa anumang event.' },
};

const typeColors = { cultural: '#C41E3A', workshop: '#C9A84C', social: '#10B981', info_session: '#2A3F6A', conference: '#8B6914' };
const typeIcons = { cultural: '🏛️', workshop: '📝', social: '🎉', info_session: '📋', conference: '🎤' };

export default function Events() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const user = getUser();
  const [events, setEvents] = useState([]);
  const [myRegs, setMyRegs] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(null);
  const [tab, setTab] = useState('upcoming');

  useEffect(() => {
    Promise.all([
      api.get('/advocacy/events?include_past=true').then(r => setEvents(r.data.events || [])),
      api.get('/advocacy/events/my').then(r => setMyRegs(r.data.registrations || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const regEventIds = new Set(myRegs.map(r => r.event_id));
  const t = (obj, field) => obj?.[`${field}_${lang}`] || obj?.[`${field}_en`] || '';

  const handleRegister = async (eventId) => {
    setRegistering(eventId);
    try {
      await api.post(`/advocacy/events/${eventId}/register`, { user_id: user?.id, guest_name: user?.full_name, guest_email: user?.email });
      setMyRegs(prev => [...prev, { event_id: eventId }]);
    } catch {} finally { setRegistering(null); }
  };

  const now = new Date();
  const upcoming = events.filter(e => new Date(e.event_date) >= now);
  const past = events.filter(e => new Date(e.event_date) < now);
  const displayEvents = tab === 'upcoming' ? upcoming : tab === 'past' ? past : events.filter(e => regEventIds.has(e.id));
  const filtered = displayEvents.filter(e => typeFilter === 'all' || e.event_type === typeFilter);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Tabs */}
        <div style={s.tabs}>
          <button onClick={() => setTab('upcoming')} style={{ ...s.tab, ...(tab === 'upcoming' ? s.tabActive : {}) }}>{L.upcoming} ({upcoming.length})</button>
          <button onClick={() => setTab('past')} style={{ ...s.tab, ...(tab === 'past' ? s.tabActive : {}) }}>{L.past} ({past.length})</button>
          <button onClick={() => setTab('my')} style={{ ...s.tab, ...(tab === 'my' ? s.tabActive : {}) }}>{L.myEvents} ({myRegs.length})</button>
        </div>

        {/* Type filter */}
        <div style={s.filterRow}>
          <span style={s.filterLabel}>{L.filterType}</span>
          {['all','cultural','workshop','social','info_session','conference'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ ...s.filterBtn, ...(typeFilter === t ? s.filterActive : {}) }}>{L[t] || t}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={s.empty}>{tab === 'my' ? L.noMyEvents : L.noEvents}</div>
        ) : (
          <div style={s.eventList}>
            {filtered.map(e => {
              const isReg = regEventIds.has(e.id);
              const isPast = new Date(e.event_date) < now;
              const seatsLeft = e.capacity ? e.capacity - (e.registered_count || 0) : null;
              const isFull = seatsLeft !== null && seatsLeft <= 0;
              return (
                <div key={e.id} style={{ ...s.eventCard, opacity: isPast ? 0.7 : 1 }}>
                  <div style={s.eventDateBlock}>
                    <div style={s.eventMonth}>{new Date(e.event_date).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short' }).toUpperCase()}</div>
                    <div style={s.eventDay}>{new Date(e.event_date).getDate()}</div>
                    <div style={s.eventYear}>{new Date(e.event_date).getFullYear()}</div>
                  </div>
                  <div style={s.eventContent}>
                    <div style={s.eventTop}>
                      <span style={{ ...s.typeBadge, background: typeColors[e.event_type] || '#C9A84C' }}>
                        {typeIcons[e.event_type] || '📅'} {L[e.event_type] || e.event_type}
                      </span>
                    </div>
                    <h3 style={s.eventTitle}>{t(e, 'title')}</h3>
                    <p style={s.eventDesc}>{t(e, 'description')}</p>
                    <div style={s.eventMeta}>
                      <span>📍 {e.location}</span>
                      <span>🕐 {new Date(e.event_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {seatsLeft !== null && <span>{isFull ? L.full : `${seatsLeft} ${L.seats}`}</span>}
                    </div>
                    {!isPast && (
                      <div style={s.eventActions}>
                        {isReg ? (
                          <span style={s.registeredBadge}>{L.registered}</span>
                        ) : (
                          <button onClick={() => handleRegister(e.id)} disabled={isFull || registering === e.id} style={{ ...s.registerBtn, opacity: isFull ? 0.5 : 1 }}>
                            {registering === e.id ? L.registering : isFull ? L.full : L.register}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '40px 32px 32px', borderBottom: '3px solid #C9A84C' },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic', maxWidth: 600 },
  body: { padding: '24px 32px 48px', maxWidth: 900 },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #F5E6C8' },
  tab: { padding: '10px 24px', background: 'none', border: 'none', borderBottom: '3px solid transparent', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#6B6B6B', marginBottom: -2 },
  tabActive: { color: '#1B2A4A', borderBottomColor: '#C9A84C' },
  filterRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  filterLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', marginRight: 8 },
  filterBtn: { padding: '5px 14px', border: '1px solid #ddd', background: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#6B6B6B' },
  filterActive: { background: '#1B2A4A', color: '#C9A84C', borderColor: '#1B2A4A' },
  eventList: { display: 'flex', flexDirection: 'column', gap: 16 },
  eventCard: { display: 'flex', gap: 20, background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  eventDateBlock: { width: 70, flexShrink: 0, textAlign: 'center', padding: '12px 8px', background: '#0F1A2E', borderRadius: 8, color: '#fff' },
  eventMonth: { fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 1 },
  eventDay: { fontFamily: "'Playfair Display',serif", fontSize: 32, fontWeight: 800, lineHeight: 1 },
  eventYear: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  eventContent: { flex: 1 },
  eventTop: { marginBottom: 8 },
  typeBadge: { fontSize: 10, fontWeight: 700, color: '#fff', padding: '3px 10px', borderRadius: 12, letterSpacing: 0.5 },
  eventTitle: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#1B2A4A', marginBottom: 6 },
  eventDesc: { fontSize: 13, color: '#6B6B6B', lineHeight: 1.6, marginBottom: 12 },
  eventMeta: { display: 'flex', gap: 16, fontSize: 12, color: '#8B6914', flexWrap: 'wrap', marginBottom: 12 },
  eventActions: { },
  registerBtn: { padding: '8px 24px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 },
  registeredBadge: { fontSize: 13, fontWeight: 700, color: '#10B981' },
  empty: { textAlign: 'center', padding: 48, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#6B6B6B', fontSize: 15 },
};
