import React, { useState, useEffect } from 'react';
import { getLang } from '../services/auth';
import api from '../services/api';

const T = {
  en: { title: 'Program Metrics', sub: 'Government dashboard — real-time KPIs for the Torna Idioma initiative.', education: 'Education', workforce: 'Workforce', community: 'Community', students: 'Active Students', teachers: 'Teachers', bpoWorkers: 'BPO Trainees', courses: 'Published Courses', enrollments: 'Active Enrollments', certifications: 'Certifications Issued', schools: 'Participating Schools', partners: 'Active Partners', events: 'Upcoming Events', supporters: 'Supporters', placements: 'BPO Placements', avgSalary: 'Avg Salary Increase', donations: 'Total Donations' },
  es: { title: 'Métricas del Programa', sub: 'Panel gubernamental — KPIs en tiempo real para la iniciativa Torna Idioma.', education: 'Educación', workforce: 'Fuerza Laboral', community: 'Comunidad', students: 'Estudiantes Activos', teachers: 'Profesores', bpoWorkers: 'Aprendices BPO', courses: 'Cursos Publicados', enrollments: 'Inscripciones Activas', certifications: 'Certificaciones Emitidas', schools: 'Escuelas Participantes', partners: 'Socios Activos', events: 'Próximos Eventos', supporters: 'Simpatizantes', placements: 'Colocaciones BPO', avgSalary: 'Aumento Salarial Prom.', donations: 'Donaciones Totales' },
  fil: { title: 'Mga Sukatan ng Programa', sub: 'Dashboard ng gobyerno — real-time KPIs para sa Torna Idioma.', education: 'Edukasyon', workforce: 'Workforce', community: 'Komunidad', students: 'Aktibong Estudyante', teachers: 'Mga Guro', bpoWorkers: 'BPO Trainees', courses: 'Mga Naka-publish na Kurso', enrollments: 'Aktibong Enrollments', certifications: 'Mga Sertipikasyong Inisyu', schools: 'Mga Kalahok na Paaralan', partners: 'Aktibong Partners', events: 'Mga Paparating na Event', supporters: 'Mga Tagasuporta', placements: 'Mga BPO Placement', avgSalary: 'Ave. Pagtaas ng Sahod', donations: 'Kabuuang Donasyon' },
};

export default function ProgramMetrics() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/overview').then(r => setKpis(r.data.kpis || {})).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  const sections = [
    { title: L.education, color: '#1B2A4A', items: [
      { val: kpis.total_students || 0, label: L.students },
      { val: kpis.total_teachers || 0, label: L.teachers },
      { val: kpis.published_courses || 0, label: L.courses },
      { val: kpis.active_enrollments || 0, label: L.enrollments },
      { val: kpis.certifications_issued || 0, label: L.certifications },
    ]},
    { title: L.workforce, color: '#C9A84C', items: [
      { val: kpis.total_bpo_workers || 0, label: L.bpoWorkers },
      { val: kpis.bpo_placements || 0, label: L.placements },
      { val: kpis.avg_salary_increase_pct ? `+${Math.round(kpis.avg_salary_increase_pct)}%` : '—', label: L.avgSalary },
    ]},
    { title: L.community, color: '#10B981', items: [
      { val: kpis.participating_schools || 0, label: L.schools },
      { val: kpis.active_partners || 0, label: L.partners },
      { val: kpis.upcoming_events || 0, label: L.events },
      { val: kpis.total_supporters || 0, label: L.supporters },
      { val: kpis.total_donations_php ? `₱${Math.round(kpis.total_donations_php).toLocaleString()}` : '₱0', label: L.donations },
    ]},
  ];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {sections.map((sec, si) => (
          <div key={si} style={s.section}>
            <h2 style={{ ...s.sectionTitle, borderBottomColor: sec.color }}>{sec.title}</h2>
            <div style={s.kpiGrid}>
              {sec.items.map((k, ki) => (
                <div key={ki} style={{ ...s.kpiCard, borderBottomColor: sec.color }}>
                  <div style={{ ...s.kpiVal, color: sec.color }}>{k.val}</div>
                  <div style={s.kpiLabel}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: "'Inter',sans-serif", color: '#2C2C2C', background: '#FFF8E7', minHeight: '100vh' },
  header: { background: 'linear-gradient(135deg, #0F1A2E, #1B2A4A, #2A3F6A)', padding: '40px 32px 32px', borderBottom: '3px solid #C9A84C' },
  headerTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic' },
  body: { padding: '24px 32px 48px', maxWidth: 1000 },
  section: { marginBottom: 32 },
  sectionTitle: { fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: '#1B2A4A', marginBottom: 16, borderBottom: '2px solid #C9A84C', paddingBottom: 8, display: 'inline-block' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 16 },
  kpiCard: { background: '#fff', padding: '20px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #C9A84C' },
  kpiVal: { fontFamily: "'Playfair Display',serif", fontSize: 32, fontWeight: 800, marginBottom: 4 },
  kpiLabel: { fontSize: 11, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
};
