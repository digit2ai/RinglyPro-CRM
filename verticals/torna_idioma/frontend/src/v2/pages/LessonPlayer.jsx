import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v2Api } from '../services/v2-api';
import { isAuthenticated } from '../../services/auth';
import CognateHighlight from '../components/CognateHighlight';
import EngagementMeter from '../components/EngagementMeter';

/**
 * LessonPlayer — main lesson UI at /Torna_Idioma/learn/lesson/:id
 *
 * Flow:
 *   1. Fetch lesson + exercises
 *   2. Show content (markdown) with cognate highlighting
 *   3. Click "Start Exercises" → POST /lessons/:id/start
 *   4. Render current exercise (multiple_choice or fill_blank)
 *   5. Submit answer → POST /lessons/:id/answer → feedback + next exercise
 *   6. After final exercise → POST /lessons/:id/complete → score + CEFR check
 */
export default function LessonPlayer() {
  const { id } = useParams();
  const authed = isAuthenticated();
  const [lesson, setLesson] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [phase, setPhase] = useState('content'); // content | exercises | complete
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [results, setResults] = useState([]); // {index, correct}
  const [finalScore, setFinalScore] = useState(null);
  const [cefrResult, setCefrResult] = useState(null);
  const [gamification, setGamification] = useState(null);

  const startedRef = useRef(Date.now());
  const exerciseStartRef = useRef(null);

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    v2Api.get(`/lessons/${id}`)
      .then((r) => {
        setLesson(r.lesson);
        setExercises(r.lesson.exercises || []);
        if (r.session?.status === 'completed') {
          setPhase('complete');
          setFinalScore({ score: r.session.score });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, authed]);

  const startExercises = async () => {
    try {
      await v2Api.post(`/lessons/${id}/start`, {});
      setPhase('exercises');
      setCurrentIdx(0);
      setUserAnswer('');
      setFeedback(null);
      setResults([]);
      exerciseStartRef.current = Date.now();
    } catch (e) {
      setError(e.message);
    }
  };

  const submitAnswer = async () => {
    if (userAnswer === '' && userAnswer !== 0) return;
    const timeMs = Date.now() - (exerciseStartRef.current || Date.now());
    try {
      const r = await v2Api.post(`/lessons/${id}/answer`, {
        exercise_index: currentIdx,
        learner_answer: userAnswer,
        time_ms: timeMs
      });
      setFeedback(r);
      setResults((prev) => [...prev, { index: currentIdx, correct: r.is_correct }]);
    } catch (e) {
      setError(e.message);
    }
  };

  const nextExercise = () => {
    if (feedback?.is_final) {
      completeLesson();
      return;
    }
    setCurrentIdx((i) => i + 1);
    setUserAnswer('');
    setFeedback(null);
    exerciseStartRef.current = Date.now();
  };

  const completeLesson = async () => {
    try {
      const elapsed = Math.round((Date.now() - startedRef.current) / 1000);
      const r = await v2Api.post(`/lessons/${id}/complete`, { time_spent_sec: elapsed });
      setFinalScore(r);
      setCefrResult(r.cefr);
      setGamification(r.gamification);
      setPhase('complete');
    } catch (e) {
      setError(e.message);
    }
  };

  const applyLevelUp = async () => {
    if (!cefrResult?.newLevel) return;
    try {
      await v2Api.post('/lessons/cefr/apply', { level: cefrResult.newLevel });
      alert(`Level updated to ${cefrResult.newLevel}!`);
      setCefrResult({ ...cefrResult, recommendation: 'hold', currentLevel: cefrResult.newLevel });
    } catch (e) {
      alert(e.message);
    }
  };

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.gate}>
          <h1 style={styles.title}>Lesson</h1>
          <a href="/Torna_Idioma/login" style={styles.btn}>Login</a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading lesson...</div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>Lesson not found.</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.breadcrumb}>
            <a href="/Torna_Idioma/learn/courses" style={styles.link}>← Courses</a>
            {' / '}
            <span>{lesson.course_title}</span>
          </div>
          <h1 style={styles.title}>{lesson.title_en}</h1>
          <div style={styles.meta}>
            <span style={styles.metaPill}>{lesson.level.toUpperCase()}</span>
            <span style={styles.metaPill}>{lesson.lesson_type}</span>
            <span style={styles.metaPill}>{lesson.duration_minutes} min</span>
            <span style={styles.metaPill}>{lesson.exercise_count} exercises</span>
          </div>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {phase === 'content' && (
          <div style={styles.card}>
            <div style={styles.content}>
              <CognateHighlight text={lesson.content_en || ''} />
            </div>
            {exercises.length > 0 && (
              <div style={styles.actionRow}>
                <button onClick={startExercises} style={styles.btnPrimary}>
                  Start Exercises ({exercises.length})
                </button>
              </div>
            )}
          </div>
        )}

        {phase === 'exercises' && exercises[currentIdx] && (
          <div style={styles.card}>
            <div style={styles.progressRow}>
              <span style={styles.progressText}>
                Exercise {currentIdx + 1} of {exercises.length}
              </span>
              <EngagementMeter compact />
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${((currentIdx + (feedback ? 1 : 0)) / exercises.length) * 100}%`
                }}
              />
            </div>

            <div style={styles.exerciseBody}>
              <ExerciseRenderer
                exercise={exercises[currentIdx]}
                answer={userAnswer}
                onChange={setUserAnswer}
                disabled={!!feedback}
              />
            </div>

            {feedback ? (
              <div
                style={{
                  ...styles.feedback,
                  background: feedback.is_correct
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(196, 30, 58, 0.1)',
                  borderColor: feedback.is_correct
                    ? 'rgba(16, 185, 129, 0.3)'
                    : 'rgba(196, 30, 58, 0.3)'
                }}
              >
                <div style={styles.feedbackLabel}>
                  {feedback.is_correct ? 'CORRECT' : 'NOT QUITE'}
                </div>
                <div style={styles.feedbackMsg}>{feedback.feedback}</div>
                {!feedback.is_correct && (
                  <div style={styles.correctAnswer}>
                    Correct answer: <strong>{feedback.correct_answer}</strong>
                  </div>
                )}
                <button onClick={nextExercise} style={styles.btnPrimary}>
                  {feedback.is_final ? 'Complete Lesson' : 'Next Exercise →'}
                </button>
              </div>
            ) : (
              <button
                onClick={submitAnswer}
                disabled={userAnswer === '' && userAnswer !== 0}
                style={{ ...styles.btnPrimary, opacity: userAnswer === '' && userAnswer !== 0 ? 0.5 : 1 }}
              >
                Submit Answer
              </button>
            )}
          </div>
        )}

        {phase === 'complete' && finalScore && (
          <div style={styles.card}>
            <div style={styles.completeHeader}>
              <div style={styles.completeLabel}>LESSON COMPLETE</div>
              <div style={styles.scoreBig}>{finalScore.score}%</div>
              <div style={styles.scoreLabel}>
                {finalScore.correct_count}/{finalScore.total} correct
              </div>
            </div>

            {gamification && (
              <div style={styles.xpRow}>
                <span>
                  Total XP: <strong style={{ color: '#C9A84C' }}>{gamification.total_xp}</strong>
                </span>
                {gamification.new_badges?.length > 0 && (
                  <span style={styles.newBadges}>
                    New badges: {gamification.new_badges.map((b) => b.name_en).join(', ')}
                  </span>
                )}
              </div>
            )}

            {cefrResult && cefrResult.sampleCount >= 3 && (
              <div style={styles.cefrBox}>
                <div style={styles.cefrTitle}>CEFR Adaptive Engine</div>
                <div style={styles.cefrBody}>
                  <div>
                    Current level: <strong>{cefrResult.currentLevel}</strong>
                  </div>
                  <div>
                    Recent mastery: <strong>{cefrResult.mastery}%</strong> over {cefrResult.sampleCount} lessons
                  </div>
                  {cefrResult.recommendation === 'level_up' && (
                    <div style={styles.cefrAction}>
                      You're ready for <strong>{cefrResult.newLevel}</strong>!
                      <button onClick={applyLevelUp} style={styles.btnPrimary}>Level Up</button>
                    </div>
                  )}
                  {cefrResult.recommendation === 'level_down' && (
                    <div style={styles.cefrAction}>
                      Consider reinforcing at <strong>{cefrResult.newLevel}</strong> first.
                    </div>
                  )}
                  {cefrResult.recommendation === 'hold' && (
                    <div style={styles.cefrAction}>Keep going — you're on track.</div>
                  )}
                </div>
              </div>
            )}

            <div style={styles.actionRow}>
              <a href="/Torna_Idioma/learn/courses" style={styles.btnSecondary}>All Courses</a>
              <a href="/Torna_Idioma/learn" style={styles.btnSecondary}>Home</a>
            </div>
          </div>
        )}

        <div style={styles.footer}>
          Step 9 of 12 · Lesson Player · UVEG Curriculum
        </div>
      </div>
    </div>
  );
}

function ExerciseRenderer({ exercise, answer, onChange, disabled }) {
  if (!exercise) return null;

  if (exercise.type === 'multiple_choice') {
    return (
      <div>
        <div style={exStyles.prompt}>
          <CognateHighlight text={exercise.q} inline />
        </div>
        <div style={exStyles.options}>
          {exercise.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => !disabled && onChange(i)}
              disabled={disabled}
              style={{
                ...exStyles.optionBtn,
                ...(answer === i ? exStyles.optionSelected : {})
              }}
            >
              <span style={exStyles.optionLetter}>{String.fromCharCode(65 + i)}</span>
              <CognateHighlight text={opt} inline />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (exercise.type === 'fill_blank') {
    return (
      <div>
        <div style={exStyles.prompt}>
          <CognateHighlight text={exercise.q} inline />
        </div>
        <input
          type="text"
          value={answer}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Type your answer..."
          style={exStyles.input}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div style={exStyles.prompt}>
      <CognateHighlight text={exercise.q || 'Exercise'} inline />
      <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 12 }}>
        (Exercise type "{exercise.type}" — press Submit to continue)
      </div>
    </div>
  );
}

const exStyles = {
  prompt: {
    fontSize: 17,
    lineHeight: 1.7,
    color: '#fff',
    padding: '20px 0',
    fontWeight: 500
  },
  options: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  optionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 18px',
    background: 'rgba(15, 26, 46, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontFamily: 'inherit',
    fontSize: 14,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  optionSelected: {
    background: 'rgba(201, 168, 76, 0.15)',
    borderColor: '#C9A84C'
  },
  optionLetter: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 800,
    color: '#C9A84C',
    minWidth: 24
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(15, 26, 46, 0.7)',
    border: '1px solid rgba(201, 168, 76, 0.3)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'inherit',
    marginTop: 12
  }
};

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2A4A 50%, #0F1A2E 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '40px 24px 80px'
  },
  inner: { maxWidth: 820, margin: '0 auto' },
  header: { marginBottom: 24 },
  breadcrumb: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
    fontWeight: 900,
    color: '#fff',
    marginBottom: 12
  },
  meta: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  metaPill: {
    fontSize: 10,
    fontWeight: 700,
    color: '#C9A84C',
    background: 'rgba(201, 168, 76, 0.08)',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '4px 10px',
    borderRadius: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  card: {
    background: 'rgba(27, 42, 74, 0.6)',
    border: '1px solid rgba(201, 168, 76, 0.25)',
    borderRadius: 16,
    padding: 32,
    backdropFilter: 'blur(8px)'
  },
  content: {
    fontSize: 15,
    lineHeight: 1.9,
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap',
    marginBottom: 24,
    maxHeight: 600,
    overflowY: 'auto',
    padding: 4
  },
  actionRow: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 },
  progressRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 20 },
  progressText: { fontSize: 11, fontWeight: 700, color: '#C9A84C', letterSpacing: 1.5 },
  progressBar: {
    height: 4,
    background: 'rgba(15, 26, 46, 0.7)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14
  },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #C9A84C, #E8D48B)', transition: 'width 0.5s' },
  exerciseBody: { marginBottom: 20 },
  feedback: {
    border: '1px solid',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16
  },
  feedbackLabel: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
    color: '#C9A84C',
    marginBottom: 6
  },
  feedbackMsg: { fontSize: 14, color: '#e2e8f0', marginBottom: 10 },
  correctAnswer: { fontSize: 12, color: '#94a3b8', marginBottom: 14 },

  completeHeader: { textAlign: 'center', marginBottom: 24 },
  completeLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: '#C9A84C',
    letterSpacing: 2.5,
    marginBottom: 10
  },
  scoreBig: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 72,
    fontWeight: 900,
    color: '#C9A84C',
    lineHeight: 1
  },
  scoreLabel: { fontSize: 14, color: '#94a3b8', marginTop: 6 },
  xpRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: 16,
    background: 'rgba(15, 26, 46, 0.5)',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 10
  },
  newBadges: { color: '#10b981', fontSize: 12 },
  cefrBox: {
    background: 'rgba(14, 165, 233, 0.06)',
    border: '1px solid rgba(14, 165, 233, 0.25)',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16
  },
  cefrTitle: { fontSize: 11, fontWeight: 800, color: '#0ea5e9', letterSpacing: 1.5, marginBottom: 10 },
  cefrBody: { fontSize: 13, color: '#e2e8f0', lineHeight: 2 },
  cefrAction: { marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },

  btnPrimary: {
    background: 'linear-gradient(135deg, #C9A84C, #8B6914)',
    color: '#0F1A2E',
    border: 'none',
    padding: '14px 32px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.5
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
    border: '1px solid rgba(201, 168, 76, 0.2)',
    padding: '12px 24px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
    display: 'inline-block'
  },

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

  loading: { textAlign: 'center', color: '#94a3b8', padding: 60 },
  errorBox: {
    background: 'rgba(196, 30, 58, 0.1)',
    border: '1px solid rgba(196, 30, 58, 0.3)',
    color: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16
  },
  footer: { textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 32 },
  link: { color: '#C9A84C', textDecoration: 'none' }
};
