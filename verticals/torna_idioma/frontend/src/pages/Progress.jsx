import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLang, getUser } from '../services/auth';
import api from '../services/api';

const BASE = '/torna-idioma';

const T = {
  en: { title: 'My Progress', sub: 'Track your Spanish learning journey — courses, lessons, and achievements.', totalCourses: 'Enrolled Courses', completedCourses: 'Completed', lessonsCompleted: 'Lessons Done', totalTime: 'Total Study Time', certifications: 'Certifications', avgScore: 'Avg Score', inProgress: 'In Progress', completed: 'Completed', notStarted: 'Not Started', continueBtn: 'Continue', progressLabel: 'Progress', hours: 'h', mins: 'm', lessons: 'lessons', noEnrollments: 'You haven\'t enrolled in any courses yet. Visit the Course Catalog to get started!' },
  es: { title: 'Mi Progreso', sub: 'Rastrea tu viaje de aprendizaje del español — cursos, lecciones y logros.', totalCourses: 'Cursos Inscritos', completedCourses: 'Completados', lessonsCompleted: 'Lecciones Hechas', totalTime: 'Tiempo Total de Estudio', certifications: 'Certificaciones', avgScore: 'Puntaje Promedio', inProgress: 'En Progreso', completed: 'Completado', notStarted: 'No Iniciado', continueBtn: 'Continuar', progressLabel: 'Progreso', hours: 'h', mins: 'm', lessons: 'lecciones', noEnrollments: 'No te has inscrito en ningún curso todavía. ¡Visita el Catálogo de Cursos para comenzar!' },
  fil: { title: 'Aking Progreso', sub: 'I-track ang iyong paglalakbay sa pag-aaral ng Espanyol.', totalCourses: 'Mga Kursong Na-enroll', completedCourses: 'Nakumpleto', lessonsCompleted: 'Mga Aralin na Tapos', totalTime: 'Kabuuang Oras ng Pag-aaral', certifications: 'Mga Sertipikasyon', avgScore: 'Average Score', inProgress: 'Kasalukuyan', completed: 'Nakumpleto', notStarted: 'Hindi Pa Nagsimula', continueBtn: 'Magpatuloy', progressLabel: 'Progreso', hours: 'h', mins: 'm', lessons: 'mga aralin', noEnrollments: 'Hindi ka pa nag-enroll sa anumang kurso. Bisitahin ang Katalogo ng Kurso!' },
};

const levelColors = { beginner: '#10B981', intermediate: '#C9A84C', advanced: '#C41E3A' };

export default function Progress() {
  const lang = getLang();
  const L = T[lang] || T.en;
  const nav = useNavigate();
  const user = getUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/courses/my/progress').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const t = (obj, field) => obj?.[`${field}_${lang}`] || obj?.[`${field}_en`] || '';
  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}${L.hours} ${m}${L.mins}` : `${m}${L.mins}`;
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  const summary = data?.summary || {};
  const enrollments = data?.enrollments || [];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.headerTitle}>{L.title}</h1>
        <p style={s.headerSub}>{L.sub}</p>
      </div>
      <div style={s.body}>
        {/* Summary cards */}
        <div style={s.summaryGrid}>
          {[
            { val: summary.total_courses || 0, label: L.totalCourses, color: '#1B2A4A' },
            { val: summary.completed_courses || 0, label: L.completedCourses, color: '#10B981' },
            { val: summary.total_lessons_completed || 0, label: L.lessonsCompleted, color: '#C9A84C' },
            { val: fmtTime(summary.total_time_sec || 0), label: L.totalTime, color: '#2A3F6A' },
            { val: summary.total_certifications || 0, label: L.certifications, color: '#8B6914' },
          ].map((k, i) => (
            <div key={i} style={{ ...s.summaryCard, borderBottomColor: k.color }}>
              <div style={{ ...s.summaryValue, color: k.color }}>{k.val}</div>
              <div style={s.summaryLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Course progress list */}
        {enrollments.length === 0 ? (
          <div style={s.empty}>
            <p>{L.noEnrollments}</p>
            <button onClick={() => nav(`${BASE}/courses`)} style={s.goBtn}>→ Course Catalog</button>
          </div>
        ) : (
          <div style={s.courseList}>
            {enrollments.map(e => {
              const pct = parseFloat(e.progress_pct) || 0;
              const statusColor = e.status === 'completed' ? '#10B981' : pct > 0 ? '#C9A84C' : '#6B6B6B';
              const statusText = e.status === 'completed' ? L.completed : pct > 0 ? L.inProgress : L.notStarted;
              return (
                <div key={e.id} style={s.courseCard}>
                  <div style={s.courseTop}>
                    <div>
                      <h3 style={s.courseName}>{t(e, 'title')}</h3>
                      <div style={s.courseMeta}>
                        <span style={{ ...s.levelDot, background: levelColors[e.level] || '#C9A84C' }}>{e.level}</span>
                        <span>{e.lessons_completed || 0}/{e.total_lessons || 0} {L.lessons}</span>
                        <span>{fmtTime(parseInt(e.total_time_sec) || 0)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ ...s.statusBadge, color: statusColor }}>{statusText}</div>
                      {e.avg_score > 0 && <div style={s.avgScore}>{L.avgScore}: {Math.round(e.avg_score)}%</div>}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${pct}%`, background: statusColor }} />
                  </div>
                  <div style={s.progressRow}>
                    <span style={s.progressPct}>{pct}% {L.progressLabel}</span>
                    <button onClick={() => nav(`${BASE}/classroom/${e.course_id}`)} style={s.continueBtn}>{L.continueBtn} →</button>
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
  headerSub: { fontSize: 14, color: '#E8D48B', fontStyle: 'italic' },
  body: { padding: '24px 32px 48px', maxWidth: 900 },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 32 },
  summaryCard: { background: '#fff', padding: '20px 16px', borderRadius: 8, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderBottom: '3px solid #C9A84C' },
  summaryValue: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: '#6B6B6B', letterSpacing: 0.5, textTransform: 'uppercase' },
  courseList: { display: 'flex', flexDirection: 'column', gap: 16 },
  courseCard: { background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #C9A84C' },
  courseTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16, flexWrap: 'wrap' },
  courseName: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#1B2A4A', marginBottom: 6 },
  courseMeta: { display: 'flex', gap: 12, fontSize: 12, color: '#6B6B6B', alignItems: 'center' },
  levelDot: { padding: '2px 8px', borderRadius: 10, color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' },
  statusBadge: { fontSize: 13, fontWeight: 700, letterSpacing: 0.5 },
  avgScore: { fontSize: 11, color: '#8B6914', marginTop: 4 },
  progressBar: { height: 8, background: '#F5E6C8', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', borderRadius: 4, transition: 'width 0.5s ease' },
  progressRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  progressPct: { fontSize: 13, fontWeight: 600, color: '#1B2A4A' },
  continueBtn: { background: 'none', border: 'none', color: '#C9A84C', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 },
  empty: { textAlign: 'center', padding: 48, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  goBtn: { marginTop: 16, padding: '10px 28px', background: '#C9A84C', color: '#0F1A2E', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
