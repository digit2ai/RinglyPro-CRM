import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLang } from '../services/auth';
import api from '../services/api';

const BASE = '/torna-idioma';

const T = {
  en: { title: 'Course Catalog', sub: 'Explore Spanish courses designed for Filipino learners — from heritage to BPO careers.', all: 'All', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', general: 'General', bpo: 'BPO', cultural: 'Cultural', business: 'Business', certification: 'Certification', enroll: 'Enroll Now', enrolled: 'Continue', lessons: 'lessons', hours: 'hours', students: 'students', filterLevel: 'Level', filterCategory: 'Category', noResults: 'No courses match your filters.' },
  es: { title: 'Catálogo de Cursos', sub: 'Explora cursos de español diseñados para estudiantes filipinos — desde herencia hasta carreras BPO.', all: 'Todos', beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', general: 'General', bpo: 'BPO', cultural: 'Cultural', business: 'Negocios', certification: 'Certificación', enroll: 'Inscribirse', enrolled: 'Continuar', lessons: 'lecciones', hours: 'horas', students: 'estudiantes', filterLevel: 'Nivel', filterCategory: 'Categoría', noResults: 'No hay cursos que coincidan con tus filtros.' },
  fil: { title: 'Katalogo ng Kurso', sub: 'Mag-explore ng mga kurso sa Espanyol na dinisenyo para sa mga Pilipinong mag-aaral.', all: 'Lahat', beginner: 'Baguhan', intermediate: 'Katamtaman', advanced: 'Advanced', general: 'General', bpo: 'BPO', cultural: 'Kultural', business: 'Negosyo', certification: 'Sertipikasyon', enroll: 'Mag-enroll', enrolled: 'Magpatuloy', lessons: 'mga aralin', hours: 'oras', students: 'estudyante', filterLevel: 'Antas', filterCategory: 'Kategorya', noResults: 'Walang kursong tugma sa iyong mga filter.' },
};

const levelColors = { beginner: '#10B981', intermediate: '#C9A84C', advanced: '#C41E3A' };
const categoryIcons = { general: '📚', bpo: '🏢', cultural: '🏛️', business: '💼', certification: '🏆' };

export default function CourseCatalog() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const nav = useNavigate();
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [level, setLevel] = useState('all');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/courses').then(r => setCourses(r.data.courses || [])),
      api.get('/courses/my/enrollments').then(r => setEnrollments(r.data.enrollments || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const enrolledIds = new Set(enrollments.map(e => e.course_id));

  const handleEnroll = async (courseId) => {
    setEnrolling(courseId);
    try {
      await api.post(`/courses/${courseId}/enroll`);
      setEnrollments(prev => [...prev, { course_id: courseId }]);
    } catch (err) {
      if (err.response?.status === 409) setEnrollments(prev => [...prev, { course_id: courseId }]);
    } finally { setEnrolling(null); }
  };

  const t = (c, field) => c[`${field}_${lang}`] || c[`${field}_en`] || c[field] || '';
  const filtered = courses.filter(c => (level === 'all' || c.level === level) && (category === 'all' || c.category === category));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Filters */}
        <div style={s.filters}>
          <div style={s.filterGroup}>
            <span style={s.filterLabel}>{L.filterLevel}</span>
            {['all','beginner','intermediate','advanced'].map(l => (
              <button key={l} onClick={() => setLevel(l)} style={{ ...s.filterBtn, ...(level === l ? s.filterActive : {}) }}>{L[l]}</button>
            ))}
          </div>
          <div style={s.filterGroup}>
            <span style={s.filterLabel}>{L.filterCategory}</span>
            {['all','general','bpo','cultural','business','certification'].map(c => (
              <button key={c} onClick={() => setCategory(c)} style={{ ...s.filterBtn, ...(category === c ? s.filterActive : {}) }}>{L[c]}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={s.loading}>Loading courses...</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>{L.noResults}</div>
        ) : (
          <div style={s.grid}>
            {filtered.map(c => {
              const isEnrolled = enrolledIds.has(c.id);
              return (
                <div key={c.id} style={s.card}>
                  <div style={s.cardTop}>
                    <span style={s.catIcon}>{categoryIcons[c.category] || '📚'}</span>
                    <span style={{ ...s.levelBadge, background: levelColors[c.level] || '#C9A84C' }}>{L[c.level] || c.level}</span>
                  </div>
                  <h3 style={s.cardTitle}>{t(c, 'title')}</h3>
                  <p style={s.cardDesc}>{t(c, 'description')}</p>
                  <div style={s.cardMeta}>
                    <span>{c.total_lessons} {L.lessons}</span>
                    <span>{c.duration_hours} {L.hours}</span>
                    <span>{c.enrollment_count || 0} {L.students}</span>
                  </div>
                  {isEnrolled ? (
                    <button onClick={() => nav(`${BASE}/classroom/${c.id}`)} style={s.continueBtn}>{L.enrolled} →</button>
                  ) : (
                    <button onClick={() => handleEnroll(c.id)} disabled={enrolling === c.id} style={s.enrollBtn}>{enrolling === c.id ? '...' : L.enroll}</button>
                  )}
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
  body: { padding: '24px 32px 48px', maxWidth: 1100 },
  filters: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28, padding: 20, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  filterGroup: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  filterLabel: { fontSize: 12, fontWeight: 700, color: '#1B2A4A', letterSpacing: 1, textTransform: 'uppercase', minWidth: 80 },
  filterBtn: { padding: '5px 14px', border: '1px solid #ddd', background: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: '#6B6B6B', transition: 'all 0.2s' },
  filterActive: { background: '#1B2A4A', color: '#C9A84C', borderColor: '#1B2A4A' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 },
  card: { background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '4px solid #C9A84C', display: 'flex', flexDirection: 'column' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  catIcon: { fontSize: 28 },
  levelBadge: { fontSize: 10, fontWeight: 700, color: '#fff', padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#1B2A4A', marginBottom: 8 },
  cardDesc: { fontSize: 13, color: '#6B6B6B', lineHeight: 1.6, flex: 1, marginBottom: 16 },
  cardMeta: { display: 'flex', gap: 16, fontSize: 12, color: '#8B6914', marginBottom: 16, fontWeight: 500 },
  enrollBtn: { width: '100%', padding: '10px 0', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 1, fontFamily: "'Playfair Display',serif" },
  continueBtn: { width: '100%', padding: '10px 0', background: '#1B2A4A', color: '#C9A84C', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 1, fontFamily: "'Playfair Display',serif" },
  loading: { textAlign: 'center', padding: 48, color: '#6B6B6B', fontSize: 16 },
  empty: { textAlign: 'center', padding: 48, color: '#6B6B6B', fontSize: 15 },
};
