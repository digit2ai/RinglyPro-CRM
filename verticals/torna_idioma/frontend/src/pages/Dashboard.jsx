import React, { useState, useEffect } from 'react';
import { getUser, getLang } from '../services/auth';
import api from '../services/api';

const t = {
  en: {
    welcome: 'Welcome to Torna Idioma',
    subtitle: 'The Return of the Cultural Language — Vida · Cultura · Legado',
    kpis: 'Program Overview',
    students: 'Students', teachers: 'Teachers', bpo: 'BPO Workers', courses: 'Courses',
    enrollments: 'Active Enrollments', certs: 'Certifications', schools: 'Schools', partners: 'Partners',
    events: 'Upcoming Events', supporters: 'Supporters', placements: 'BPO Placements', donations: 'Total Donations',
    avgIncrease: 'Avg Salary Increase', quickActions: 'Quick Actions',
    actionCourses: 'Browse Courses', actionProgress: 'My Progress', actionEvents: 'Cultural Events', actionMetrics: 'Program Metrics',
    pillar1: 'DIGNITY', pillar1d: 'Reclaiming a language that belongs to the Filipino soul.',
    pillar2: 'PRIDE', pillar2d: 'Restoring our identity as a Hispanic-Asian nation.',
    pillar3: 'PRIZE', pillar3d: 'Unlocking global careers and higher salaries.',
    recentActivity: 'Platform Status',
  },
  es: {
    welcome: 'Bienvenido a Torna Idioma',
    subtitle: 'El Retorno del Idioma Cultural — Vida · Cultura · Legado',
    kpis: 'Resumen del Programa',
    students: 'Estudiantes', teachers: 'Profesores', bpo: 'Trabajadores BPO', courses: 'Cursos',
    enrollments: 'Inscripciones Activas', certs: 'Certificaciones', schools: 'Escuelas', partners: 'Socios',
    events: 'Próximos Eventos', supporters: 'Apoyadores', placements: 'Colocaciones BPO', donations: 'Total Donaciones',
    avgIncrease: 'Aumento Salarial Promedio', quickActions: 'Acciones Rápidas',
    actionCourses: 'Ver Cursos', actionProgress: 'Mi Progreso', actionEvents: 'Eventos Culturales', actionMetrics: 'Métricas del Programa',
    pillar1: 'DIGNIDAD', pillar1d: 'Reclamando un idioma que pertenece al alma filipina.',
    pillar2: 'ORGULLO', pillar2d: 'Restaurando nuestra identidad como nación hispano-asiática.',
    pillar3: 'PREMIO', pillar3d: 'Desbloqueando carreras globales y salarios más altos.',
    recentActivity: 'Estado de la Plataforma',
  },
  fil: {
    welcome: 'Maligayang Pagdating sa Torna Idioma',
    subtitle: 'Ang Pagbabalik ng Kultural na Wika — Vida · Cultura · Legado',
    kpis: 'Pangkalahatang-tanaw ng Programa',
    students: 'Mga Estudyante', teachers: 'Mga Guro', bpo: 'Mga Manggagawa sa BPO', courses: 'Mga Kurso',
    enrollments: 'Aktibong Pag-enrol', certs: 'Mga Sertipikasyon', schools: 'Mga Paaralan', partners: 'Mga Kasosyo',
    events: 'Mga Paparating na Kaganapan', supporters: 'Mga Tagasuporta', placements: 'Mga Paglalagay sa BPO', donations: 'Kabuuang Donasyon',
    avgIncrease: 'Average na Pagtaas ng Sahod', quickActions: 'Mabilis na Aksyon',
    actionCourses: 'Mag-browse ng Kurso', actionProgress: 'Aking Progreso', actionEvents: 'Mga Kultural na Kaganapan', actionMetrics: 'Mga Sukatan ng Programa',
    pillar1: 'DIGNIDAD', pillar1d: 'Pagbawi ng wikang pag-aari ng kaluluwa ng Pilipino.',
    pillar2: 'PAGMAMALAKI', pillar2d: 'Pagpapanumbalik ng ating pagkakakilanlan bilang Hispanic-Asian na bansa.',
    pillar3: 'GANTIMPALA', pillar3d: 'Pagbubukas ng pandaigdigang karera at mas mataas na sahod.',
    recentActivity: 'Katayuan ng Platform',
  }
};

export default function Dashboard() {
  const user = getUser();
  const lang = getLang();
  const L = t[lang] || t.en;
  const [kpis, setKpis] = useState(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'official';

  useEffect(() => {
    if (isAdmin) {
      api.get('/analytics/overview').then(r => setKpis(r.data.kpis)).catch(() => {});
    }
  }, []);

  const quickActions = [
    { label: L.actionCourses, path: '/Torna_Idioma/courses', icon: '📚', color: '#C9A84C' },
    { label: L.actionProgress, path: '/Torna_Idioma/progress', icon: '📊', color: '#2A3F6A' },
    { label: L.actionEvents, path: '/Torna_Idioma/events', icon: '🎭', color: '#C41E3A' },
    ...(isAdmin ? [{ label: L.actionMetrics, path: '/Torna_Idioma/program-metrics', icon: '📈', color: '#8B6914' }] : []),
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerContent}>
          <h1 style={s.headerTitle}>{L.welcome}</h1>
          <p style={s.headerSub}>{L.subtitle}</p>
        </div>
      </div>

      <div style={s.body}>
        {/* Three Pillars */}
        <div style={s.pillarsRow}>
          {[
            { num: 'I', title: L.pillar1, desc: L.pillar1d },
            { num: 'II', title: L.pillar2, desc: L.pillar2d },
            { num: 'III', title: L.pillar3, desc: L.pillar3d },
          ].map((p, i) => (
            <div key={i} style={s.pillarCard}>
              <div style={s.pillarNum}>{p.num}</div>
              <div style={s.pillarTitle}>{p.title}</div>
              <div style={s.pillarDesc}>{p.desc}</div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <h3 style={s.sectionTitle}>{L.quickActions}</h3>
        <div style={s.actionsGrid}>
          {quickActions.map((a, i) => (
            <a key={i} href={a.path} style={{ ...s.actionCard, borderLeftColor: a.color }}>
              <span style={s.actionIcon}>{a.icon}</span>
              <span style={s.actionLabel}>{a.label}</span>
              <span style={s.arrow}>&rarr;</span>
            </a>
          ))}
        </div>

        {/* KPIs (admin/official only) */}
        {isAdmin && kpis && (
          <>
            <h3 style={s.sectionTitle}>{L.kpis}</h3>
            <div style={s.kpiGrid}>
              {[
                { val: kpis.total_students, label: L.students, color: '#2A3F6A' },
                { val: kpis.total_teachers, label: L.teachers, color: '#8B6914' },
                { val: kpis.total_bpo_workers, label: L.bpo, color: '#C41E3A' },
                { val: kpis.published_courses, label: L.courses, color: '#C9A84C' },
                { val: kpis.active_enrollments, label: L.enrollments, color: '#2A3F6A' },
                { val: kpis.certifications_issued, label: L.certs, color: '#8B6914' },
                { val: kpis.participating_schools, label: L.schools, color: '#C41E3A' },
                { val: kpis.active_partners, label: L.partners, color: '#C9A84C' },
                { val: kpis.upcoming_events, label: L.events, color: '#2A3F6A' },
                { val: kpis.total_supporters, label: L.supporters, color: '#8B6914' },
                { val: kpis.bpo_placements, label: L.placements, color: '#C41E3A' },
                { val: `₱${(kpis.total_donations_php || 0).toLocaleString()}`, label: L.donations, color: '#C9A84C' },
              ].map((k, i) => (
                <div key={i} style={{ ...s.kpiCard, borderBottomColor: k.color }}>
                  <div style={{ ...s.kpiValue, color: k.color }}>{k.val}</div>
                  <div style={s.kpiLabel}>{k.label}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Platform Status */}
        <h3 style={s.sectionTitle}>{L.recentActivity}</h3>
        <div style={s.statusCard}>
          <div style={s.statusRow}><span style={s.statusDot}/> API: Healthy</div>
          <div style={s.statusRow}><span style={s.statusDot}/> Database: Connected</div>
          <div style={s.statusRow}><span style={s.statusDot}/> Role: {user?.role?.replace('_',' ') || 'N/A'}</div>
          <div style={s.statusRow}><span style={s.statusDot}/> Phase: 1 — Foundation</div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '48px 32px 40px', borderBottom: '3px solid #C9A84C' },
  headerContent: { maxWidth: 800 },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#E8D48B', fontStyle: 'italic' },
  body: { padding: '32px 32px 48px', maxWidth: 1100 },
  pillarsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 36 },
  pillarCard: { background: '#fff', padding: '28px 20px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', borderTop: '3px solid #C9A84C' },
  pillarNum: { fontFamily: "'Playfair Display',serif", fontSize: 32, fontWeight: 800, color: '#C9A84C', marginBottom: 4 },
  pillarTitle: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#1B2A4A', letterSpacing: 3, marginBottom: 8 },
  pillarDesc: { fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 },
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: '#1B2A4A', marginBottom: 16, marginTop: 8, borderBottom: '2px solid #C9A84C', paddingBottom: 8, display: 'inline-block' },
  actionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 36 },
  actionCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #C9A84C', textDecoration: 'none', color: '#2C2C2C', transition: 'transform 0.2s, box-shadow 0.2s' },
  actionIcon: { fontSize: 24 },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: 600 },
  arrow: { color: '#C9A84C', fontSize: 18, fontWeight: 700 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 36 },
  kpiCard: { background: '#fff', padding: '20px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #C9A84C' },
  kpiValue: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#1B2A4A', marginBottom: 4 },
  kpiLabel: { fontSize: 12, color: '#6B6B6B', letterSpacing: 0.5 },
  statusCard: { background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 12 },
  statusRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#2C2C2C' },
  statusDot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10B981' },
};
