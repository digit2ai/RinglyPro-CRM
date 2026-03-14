import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLang } from '../services/auth';
import api from '../services/api';

const BASE = '/Torna_Idioma';

export default function Classroom() {
  const { courseId, lessonId } = useParams();
  const nav = useNavigate();
  const lang = getLang();
  const [course, setCourse] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const t = (obj, field) => obj?.[`${field}_${lang}`] || obj?.[`${field}_en`] || obj?.[field] || '';

  useEffect(() => {
    setLoading(true);
    if (lessonId) {
      api.get(`/courses/lessons/${lessonId}`).then(r => {
        setLesson(r.data.lesson);
        try { setExercises(typeof r.data.lesson.exercises === 'string' ? JSON.parse(r.data.lesson.exercises) : (r.data.lesson.exercises || [])); } catch { setExercises([]); }
        setAnswers({}); setSubmitted(false); setScore(null);
      }).finally(() => setLoading(false));
    } else if (courseId) {
      api.get(`/courses/${courseId}`).then(r => {
        setCourse(r.data.course);
        if (r.data.course.lessons?.length > 0) {
          nav(`${BASE}/classroom/${courseId}/${r.data.course.lessons[0].id}`, { replace: true });
        }
      }).finally(() => setLoading(false));
    }
  }, [courseId, lessonId]);

  const courseLessons = lesson?.course_lessons || course?.lessons || [];

  const handleAnswer = (idx, val) => setAnswers(prev => ({ ...prev, [idx]: val }));

  const handleSubmit = async () => {
    let correct = 0;
    exercises.forEach((ex, i) => {
      if (ex.type === 'multiple_choice' && answers[i] === ex.answer) correct++;
      if (ex.type === 'fill_blank' && (answers[i] || '').trim().toLowerCase() === (ex.answer || '').toLowerCase()) correct++;
    });
    const pct = exercises.length > 0 ? Math.round((correct / exercises.length) * 100) : 100;
    setScore(pct);
    setSubmitted(true);
    try {
      await api.post(`/courses/lessons/${lessonId}/progress`, { status: 'completed', score: pct, time_spent_sec: 300 });
    } catch {}
  };

  const currentIdx = courseLessons.findIndex(l => l.id === parseInt(lessonId));
  const prevLesson = currentIdx > 0 ? courseLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < courseLessons.length - 1 ? courseLessons[currentIdx + 1] : null;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#6B6B6B' }}>Loading...</div>;

  return (
    <div style={s.page}>
      {/* Lesson sidebar */}
      <div style={{ ...s.sidebar, display: sidebarOpen ? 'flex' : 'none' }}>
        <div style={s.sidebarHeader}>
          <button onClick={() => nav(`${BASE}/courses`)} style={s.backBtn}>← Courses</button>
          <h3 style={s.sidebarTitle}>{t(lesson, 'course_title') || t(course, 'title')}</h3>
        </div>
        <div style={s.lessonList}>
          {courseLessons.map((l, i) => (
            <button key={l.id} onClick={() => nav(`${BASE}/classroom/${lesson?.course_id || courseId}/${l.id}`)}
              style={{ ...s.lessonItem, ...(l.id === parseInt(lessonId) ? s.lessonActive : {}) }}>
              <span style={s.lessonNum}>{i + 1}</span>
              <span style={s.lessonName}>{t(l, 'title')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={s.main}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={s.toggleSidebar}>
          {sidebarOpen ? '◀' : '▶'} Lessons
        </button>

        {lesson && (
          <>
            <div style={s.lessonHeader}>
              <div style={s.lessonMeta}>Lesson {currentIdx + 1} of {courseLessons.length} • {lesson.duration_minutes} min</div>
              <h1 style={s.lessonTitle}>{t(lesson, 'title')}</h1>
            </div>

            {/* Lesson content (markdown-like) */}
            <div style={s.contentArea}>
              {(t(lesson, 'content') || '').split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <h1 key={i} style={s.h1}>{line.slice(2)}</h1>;
                if (line.startsWith('## ')) return <h2 key={i} style={s.h2}>{line.slice(3)}</h2>;
                if (line.startsWith('- **')) {
                  const parts = line.slice(2).split('**');
                  return <div key={i} style={s.vocabItem}><strong style={s.vocabBold}>{parts[1]}</strong>{parts[2]}</div>;
                }
                if (line.startsWith('- ')) return <div key={i} style={s.listItem}>• {line.slice(2)}</div>;
                if (line.trim() === '') return <div key={i} style={{ height: 12 }} />;
                return <p key={i} style={s.para}>{line}</p>;
              })}
            </div>

            {/* Exercises */}
            {exercises.length > 0 && (
              <div style={s.exerciseSection}>
                <h2 style={s.exerciseTitle}>Practice Exercises</h2>
                {exercises.map((ex, i) => (
                  <div key={i} style={s.exerciseCard}>
                    <div style={s.exQuestion}>{i + 1}. {ex.q}</div>
                    {ex.type === 'multiple_choice' && (
                      <div style={s.options}>
                        {ex.options.map((opt, j) => {
                          const selected = answers[i] === j;
                          const isCorrect = submitted && j === ex.answer;
                          const isWrong = submitted && selected && j !== ex.answer;
                          return (
                            <button key={j} onClick={() => !submitted && handleAnswer(i, j)}
                              style={{ ...s.option, ...(selected ? s.optionSelected : {}), ...(isCorrect ? s.optionCorrect : {}), ...(isWrong ? s.optionWrong : {}) }}>
                              {String.fromCharCode(65 + j)}. {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {ex.type === 'fill_blank' && (
                      <input style={s.fillInput} type="text" value={answers[i] || ''} onChange={e => handleAnswer(i, e.target.value)} disabled={submitted} placeholder="Type your answer..." />
                    )}
                    {submitted && ex.type === 'fill_blank' && (
                      <div style={{ fontSize: 13, marginTop: 6, color: (answers[i] || '').trim().toLowerCase() === (ex.answer || '').toLowerCase() ? '#10B981' : '#C41E3A' }}>
                        {(answers[i] || '').trim().toLowerCase() === (ex.answer || '').toLowerCase() ? '✓ Correct!' : `✗ Answer: ${ex.answer}`}
                      </div>
                    )}
                  </div>
                ))}
                {!submitted ? (
                  <button onClick={handleSubmit} style={s.submitBtn}>Submit Answers</button>
                ) : (
                  <div style={s.scoreCard}>
                    <div style={s.scoreValue}>{score}%</div>
                    <div style={s.scoreLabel}>Score — {score >= 70 ? 'Lesson Complete! ✓' : 'Review and try again'}</div>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div style={s.navRow}>
              {prevLesson ? (
                <button onClick={() => nav(`${BASE}/classroom/${lesson.course_id}/${prevLesson.id}`)} style={s.navBtn}>← Previous</button>
              ) : <div/>}
              {nextLesson ? (
                <button onClick={() => nav(`${BASE}/classroom/${lesson.course_id}/${nextLesson.id}`)} style={s.navBtnPrimary}>Next Lesson →</button>
              ) : (
                <button onClick={() => nav(`${BASE}/progress`)} style={s.navBtnPrimary}>View Progress →</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { display: 'flex', minHeight: '100vh', fontFamily: "'Inter',sans-serif", background: '#FFF8E7' },
  sidebar: { width: 280, background: '#0F1A2E', color: '#fff', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', position: 'sticky', top: 0, height: '100vh' },
  sidebarHeader: { padding: '20px 16px 12px', borderBottom: '1px solid rgba(201,168,76,0.2)' },
  backBtn: { background: 'none', border: 'none', color: '#C9A84C', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8, fontWeight: 500 },
  sidebarTitle: { fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#E8D48B', fontWeight: 600 },
  lessonList: { flex: 1, padding: '8px 0' },
  lessonItem: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13, textAlign: 'left', transition: 'all 0.2s' },
  lessonActive: { background: 'rgba(201,168,76,0.1)', color: '#C9A84C', borderLeft: '3px solid #C9A84C' },
  lessonNum: { width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  lessonName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  main: { flex: 1, padding: '0 0 48px' },
  toggleSidebar: { background: '#1B2A4A', color: '#C9A84C', border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: '0 0 6px 0' },
  lessonHeader: { padding: '32px 40px 24px', borderBottom: '2px solid #C9A84C' },
  lessonMeta: { fontSize: 12, color: '#8B6914', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 },
  lessonTitle: { fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#1B2A4A' },
  contentArea: { padding: '28px 40px', maxWidth: 800 },
  h1: { fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, color: '#1B2A4A', marginBottom: 16 },
  h2: { fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 600, color: '#1B2A4A', marginTop: 24, marginBottom: 12, borderBottom: '1px solid #F5E6C8', paddingBottom: 6 },
  vocabItem: { padding: '6px 0 6px 16px', fontSize: 15, color: '#2C2C2C', lineHeight: 1.7 },
  vocabBold: { color: '#1B2A4A', fontSize: 16 },
  listItem: { padding: '4px 0 4px 16px', fontSize: 14, color: '#6B6B6B', lineHeight: 1.6 },
  para: { fontSize: 15, color: '#2C2C2C', lineHeight: 1.8, marginBottom: 8 },
  exerciseSection: { padding: '28px 40px', maxWidth: 800, borderTop: '2px solid #F5E6C8' },
  exerciseTitle: { fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: '#1B2A4A', marginBottom: 20 },
  exerciseCard: { background: '#fff', padding: 20, borderRadius: 8, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #F5E6C8' },
  exQuestion: { fontSize: 15, fontWeight: 600, color: '#1B2A4A', marginBottom: 12 },
  options: { display: 'flex', flexDirection: 'column', gap: 8 },
  option: { textAlign: 'left', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', fontSize: 14, cursor: 'pointer', transition: 'all 0.2s', color: '#2C2C2C' },
  optionSelected: { borderColor: '#C9A84C', background: '#FFF8E7' },
  optionCorrect: { borderColor: '#10B981', background: '#ECFDF5', color: '#065F46' },
  optionWrong: { borderColor: '#C41E3A', background: '#FEF2F2', color: '#991B1B' },
  fillInput: { width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' },
  submitBtn: { padding: '12px 32px', background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Playfair Display',serif", letterSpacing: 1 },
  scoreCard: { textAlign: 'center', padding: 24, background: '#fff', borderRadius: 8, border: '2px solid #C9A84C' },
  scoreValue: { fontFamily: "'Playfair Display',serif", fontSize: 48, fontWeight: 800, color: '#C9A84C' },
  scoreLabel: { fontSize: 14, color: '#6B6B6B', marginTop: 4 },
  navRow: { display: 'flex', justifyContent: 'space-between', padding: '24px 40px', maxWidth: 800 },
  navBtn: { padding: '10px 24px', background: '#fff', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#1B2A4A' },
  navBtnPrimary: { padding: '10px 24px', background: '#1B2A4A', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#C9A84C' },
};
