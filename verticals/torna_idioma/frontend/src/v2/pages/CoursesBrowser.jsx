import React, { useEffect, useState } from 'react';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';

/**
 * CoursesBrowser — list UVEG courses with progress per learner.
 * Route: /Torna_Idioma/learn/courses
 */
export default function CoursesBrowser() {
  const authed = isAuthenticated();
  const [courses, setCourses] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    Promise.all([v2Api.get('/lessons/courses'), v2Api.get('/lessons/next').catch(() => null)])
      .then(([c, n]) => {
        setCourses(c.courses || []);
        setNext(n?.lesson || null);
      })
      .finally(() => setLoading(false));
  }, [authed]);

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>Courses</h1>
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
          <div style={styles.crestMotto}>UVEG SFL Curriculum</div>
          <h1 style={styles.title}>12 Modules · 72 Lessons</h1>
          <p style={styles.subtitle}>
            University-certified Spanish curriculum from Universidad Virtual del Estado de Guanajuato.
            CEFR A1 through B1+.
          </p>
        </div>

        {next && (
          <div style={styles.nextCard}>
            <div style={styles.nextLabel}>CONTINUE WHERE YOU LEFT OFF</div>
            <div style={styles.nextBody}>
              <div style={styles.nextText}>
                <div style={styles.nextCourse}>{next.course_title}</div>
                <div style={styles.nextTitle}>{next.title_en}</div>
                <div style={styles.nextMeta}>
                  {next.lesson_type} · {next.duration_minutes} min · {next.level.toUpperCase()}
                </div>
              </div>
              <a href={`/Torna_Idioma/learn/lesson/${next.id}`} style={styles.resumeBtn}>
                {next.session_status === 'in_progress' ? 'Resume' : 'Start'}
              </a>
            </div>
          </div>
        )}

        {loading && <div style={styles.loading}>Loading courses...</div>}

        <div style={styles.grid}>
          {courses.map((c) => {
            const pct = c.lesson_count ? Math.round((c.completed_count / c.lesson_count) * 100) : 0;
            return (
              <div key={c.id} style={styles.courseCard}>
                <div style={styles.courseSort}>#{c.sort_order}</div>
                <div style={styles.courseTitle}>{c.title_en}</div>
                <div style={styles.courseDesc}>{c.description_en?.slice(0, 140)}...</div>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                </div>
                <div style={styles.courseMeta}>
                  <span>
                    {c.completed_count}/{c.lesson_count} lessons
                  </span>
                  <span>{c.duration_hours}h · {c.level}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.footer}>
          Step 9 of 12 · Lesson Player · <a href="/Torna_Idioma/learn" style={styles.link}>← Home</a>
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
  inner: { maxWidth: 960, margin: '0 auto' },
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
  subtitle: { fontSize: 14, color: '#94a3b8', maxWidth: 560, margin: '0 auto' },

  nextCard: {
    background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.12), rgba(139, 105, 20, 0.08))',
    border: '1px solid rgba(201, 168, 76, 0.35)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 32
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 2.5,
    marginBottom: 14
  },
  nextBody: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  nextText: { flex: 1, minWidth: 240 },
  nextCourse: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 },
  nextTitle: { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, color: '#fff', margin: '4px 0' },
  nextMeta: { fontSize: 12, color: '#64748b' },
  resumeBtn: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    padding: '14px 32px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    textDecoration: 'none',
    letterSpacing: 0.5
  },

  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16
  },
  courseCard: {
    background: 'rgba(27, 42, 74, 0.55)',
    border: '1px solid rgba(201, 168, 76, 0.18)',
    borderRadius: 14,
    padding: 20,
    position: 'relative'
  },
  courseSort: {
    position: 'absolute',
    top: 12,
    right: 14,
    fontFamily: "'Playfair Display', serif",
    fontSize: 14,
    fontWeight: 800,
    color: '#C9A84C',
    opacity: 0.6
  },
  courseTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 15,
    fontWeight: 800,
    color: '#fff',
    marginBottom: 8,
    paddingRight: 32
  },
  courseDesc: { fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14, minHeight: 58 },
  progressBar: {
    height: 4,
    background: 'rgba(15, 26, 46, 0.7)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #C9A84C, #E8D48B)', transition: 'width 0.6s' },
  courseMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', fontWeight: 600 },

  gate: {
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
  footer: { textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 32 },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
