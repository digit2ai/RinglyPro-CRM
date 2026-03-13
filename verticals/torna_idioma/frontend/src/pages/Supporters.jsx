import React, { useState, useEffect } from 'react';
import { getLang, getUser, hasRole } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'Supporters & Advocacy', sub: 'Join the movement to make Makati the first Spanish-enabled city in Asia.', statsTitle: 'Movement Impact', totalSupporters: 'Total Supporters', totalEvents: 'Events Held', upcomingEvents: 'Upcoming Events', totalRegistrations: 'Event Attendees', joinTitle: 'Become a Supporter', joinSub: 'Sign up to support the Torna Idioma initiative and receive updates on events, milestones, and volunteer opportunities.', name: 'Full Name', email: 'Email', phone: 'Phone (optional)', org: 'Organization (optional)', type: 'Supporter Type', individual: 'Individual', organization: 'Organization', business: 'Business', government: 'Government', academic: 'Academic', message: 'Message (optional)', newsletter: 'Subscribe to newsletter', submit: 'Join the Movement', submitting: 'Joining...', success: 'Welcome to the movement! You are now a supporter of Torna Idioma.', alreadyRegistered: 'This email is already registered as a supporter.', supporterListTitle: 'All Supporters', noSupporters: 'No supporters yet. Be the first!', date: 'Joined', typeLabel: 'Type' },
  es: { title: 'Simpatizantes y Promoción', sub: 'Únete al movimiento para hacer de Makati la primera ciudad hispanohablante de Asia.', statsTitle: 'Impacto del Movimiento', totalSupporters: 'Simpatizantes', totalEvents: 'Eventos Realizados', upcomingEvents: 'Próximos Eventos', totalRegistrations: 'Asistentes', joinTitle: 'Hazte Simpatizante', joinSub: 'Regístrate para apoyar la iniciativa Torna Idioma y recibir actualizaciones.', name: 'Nombre Completo', email: 'Correo Electrónico', phone: 'Teléfono (opcional)', org: 'Organización (opcional)', type: 'Tipo de Simpatizante', individual: 'Individual', organization: 'Organización', business: 'Empresa', government: 'Gobierno', academic: 'Académico', message: 'Mensaje (opcional)', newsletter: 'Suscribirse al boletín', submit: 'Únete al Movimiento', submitting: 'Uniéndose...', success: '¡Bienvenido al movimiento! Ahora eres simpatizante de Torna Idioma.', alreadyRegistered: 'Este correo ya está registrado.', supporterListTitle: 'Todos los Simpatizantes', noSupporters: 'Aún no hay simpatizantes. ¡Sé el primero!', date: 'Se unió', typeLabel: 'Tipo' },
  fil: { title: 'Mga Tagasuporta at Adbokasiya', sub: 'Sumali sa kilusan para gawing unang Spanish-enabled city sa Asia ang Makati.', statsTitle: 'Epekto ng Kilusan', totalSupporters: 'Mga Tagasuporta', totalEvents: 'Mga Event na Ginanap', upcomingEvents: 'Mga Paparating na Event', totalRegistrations: 'Mga Dumalo', joinTitle: 'Maging Tagasuporta', joinSub: 'Mag-sign up para suportahan ang Torna Idioma at makatanggap ng mga update.', name: 'Buong Pangalan', email: 'Email', phone: 'Telepono (opsyonal)', org: 'Organisasyon (opsyonal)', type: 'Uri ng Tagasuporta', individual: 'Indibidwal', organization: 'Organisasyon', business: 'Negosyo', government: 'Gobyerno', academic: 'Akademiko', message: 'Mensahe (opsyonal)', newsletter: 'Mag-subscribe sa newsletter', submit: 'Sumali sa Kilusan', submitting: 'Sumasali...', success: 'Maligayang pagdating! Ikaw na ay tagasuporta ng Torna Idioma.', alreadyRegistered: 'Naka-register na ang email na ito.', supporterListTitle: 'Lahat ng Tagasuporta', noSupporters: 'Wala pang tagasuporta. Maging una!', date: 'Sumali', typeLabel: 'Uri' },
};

const typeColors = { individual: '#2A3F6A', organization: '#C9A84C', business: '#10B981', government: '#C41E3A', academic: '#8B6914' };

export default function Supporters() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const user = getUser();
  const isAdmin = hasRole('admin', 'official');
  const [stats, setStats] = useState({});
  const [supporters, setSupporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ full_name: user?.full_name || '', email: user?.email || '', phone: '', organization: '', supporter_type: 'individual', message: '', is_newsletter: true });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const loads = [api.get('/advocacy/stats').then(r => setStats(r.data.stats || {}))];
    if (isAdmin) loads.push(api.get('/advocacy/supporters').then(r => setSupporters(r.data.supporters || [])));
    Promise.all(loads).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setResult(null);
    try {
      await api.post('/advocacy/supporters', form);
      setResult({ type: 'success', msg: L.success });
      setForm(f => ({ ...f, message: '' }));
    } catch (err) {
      setResult({ type: 'error', msg: err.response?.status === 409 ? L.alreadyRegistered : (err.response?.data?.error || 'Error') });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Stats */}
        <h2 style={s.sectionTitle}>{L.statsTitle}</h2>
        <div style={s.statsGrid}>
          {[
            { val: stats.total_supporters || 0, label: L.totalSupporters, color: '#1B2A4A' },
            { val: stats.total_events || 0, label: L.totalEvents, color: '#C9A84C' },
            { val: stats.upcoming_events || 0, label: L.upcomingEvents, color: '#10B981' },
            { val: stats.total_registrations || 0, label: L.totalRegistrations, color: '#8B6914' },
          ].map((k, i) => (
            <div key={i} style={{ ...s.statCard, borderBottomColor: k.color }}>
              <div style={{ ...s.statVal, color: k.color }}>{k.val}</div>
              <div style={s.statLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Join form */}
        <div style={s.joinSection}>
          <h2 style={s.sectionTitle}>{L.joinTitle}</h2>
          <p style={s.joinSub}>{L.joinSub}</p>
          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.formRow}>
              <input style={s.input} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder={L.name} required />
              <input style={s.input} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder={L.email} required />
            </div>
            <div style={s.formRow}>
              <input style={s.input} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder={L.phone} />
              <input style={s.input} value={form.organization} onChange={e => setForm({...form, organization: e.target.value})} placeholder={L.org} />
            </div>
            <div style={s.formRow}>
              <select style={s.input} value={form.supporter_type} onChange={e => setForm({...form, supporter_type: e.target.value})}>
                {['individual','organization','business','government','academic'].map(t => (
                  <option key={t} value={t}>{L[t]}</option>
                ))}
              </select>
            </div>
            <textarea style={{ ...s.input, minHeight: 80, resize: 'vertical' }} value={form.message} onChange={e => setForm({...form, message: e.target.value})} placeholder={L.message} />
            <label style={s.checkLabel}>
              <input type="checkbox" checked={form.is_newsletter} onChange={e => setForm({...form, is_newsletter: e.target.checked})} /> {L.newsletter}
            </label>
            {result && <div style={{ ...s.resultMsg, color: result.type === 'success' ? '#10B981' : '#C41E3A' }}>{result.msg}</div>}
            <button type="submit" disabled={submitting} style={s.submitBtn}>{submitting ? L.submitting : L.submit}</button>
          </form>
        </div>

        {/* Admin: supporter list */}
        {isAdmin && (
          <div style={s.listSection}>
            <h2 style={s.sectionTitle}>{L.supporterListTitle} ({supporters.length})</h2>
            {supporters.length === 0 ? (
              <div style={s.empty}>{L.noSupporters}</div>
            ) : (
              <div style={s.supporterList}>
                {supporters.map(sup => (
                  <div key={sup.id} style={s.supporterCard}>
                    <div style={s.supTop}>
                      <div>
                        <div style={s.supName}>{sup.full_name}</div>
                        <div style={s.supEmail}>{sup.email}</div>
                      </div>
                      <span style={{ ...s.supType, color: typeColors[sup.supporter_type] || '#6B6B6B' }}>{L[sup.supporter_type] || sup.supporter_type}</span>
                    </div>
                    {sup.organization && <div style={s.supOrg}>{sup.organization}</div>}
                    {sup.message && <div style={s.supMsg}>"{sup.message}"</div>}
                    <div style={s.supDate}>{L.date}: {new Date(sup.signed_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
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
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: '#1B2A4A', marginBottom: 16, borderBottom: '2px solid #C9A84C', paddingBottom: 8, display: 'inline-block' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 36 },
  statCard: { background: '#fff', padding: '20px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #C9A84C' },
  statVal: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
  joinSection: { marginBottom: 36 },
  joinSub: { fontSize: 14, color: '#6B6B6B', lineHeight: 1.6, marginBottom: 20, maxWidth: 600 },
  form: { background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  formRow: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 200, padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6B6B6B', marginBottom: 16 },
  resultMsg: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  submitBtn: { padding: '12px 32px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1 },
  listSection: { marginTop: 20 },
  supporterList: { display: 'flex', flexDirection: 'column', gap: 12 },
  supporterCard: { background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '3px solid #C9A84C' },
  supTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  supName: { fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: '#1B2A4A' },
  supEmail: { fontSize: 12, color: '#6B6B6B' },
  supType: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' },
  supOrg: { fontSize: 12, color: '#8B6914', marginBottom: 4 },
  supMsg: { fontSize: 13, color: '#6B6B6B', fontStyle: 'italic', marginBottom: 4 },
  supDate: { fontSize: 11, color: '#999' },
  empty: { textAlign: 'center', padding: 40, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', color: '#6B6B6B', fontSize: 15 },
};
