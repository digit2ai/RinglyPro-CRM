import { useEffect, useRef, useState } from 'react';

/**
 * useFatigueDetect — pure JS fatigue detection hook.
 *
 * Tracks:
 *   - Keystroke cadence (intervals between keystrokes)
 *   - Response latency (time from prompt shown to answer submitted)
 *   - Error rate (wrong answers in a row)
 *
 * Returns:
 *   {
 *     fatigueLevel: 0-100 (higher = more fatigued),
 *     signals: string[],
 *     reset: () => void,
 *     recordKeystroke: () => void,
 *     recordAnswer: (correct: boolean, timeMs: number) => void
 *   }
 *
 * No camera, no audio, no external libraries.
 * State is in-memory only — never persisted, never sent to server
 * until the caller explicitly posts a behavior event.
 */
export default function useFatigueDetect() {
  const [fatigueLevel, setFatigueLevel] = useState(0);
  const [signals, setSignals] = useState([]);

  const keystrokesRef = useRef([]);            // timestamps of recent keystrokes
  const answersRef = useRef([]);               // [{correct, time_ms, ts}]
  const consecutiveWrongRef = useRef(0);
  const baselineRef = useRef({ typingMs: null, answerMs: null });
  const startedAtRef = useRef(Date.now());

  const compute = () => {
    const now = Date.now();
    const newSignals = [];

    // Signal 1: Typing cadence slowdown (> 40% below baseline)
    const recentKeystrokes = keystrokesRef.current.filter((t) => now - t < 60_000);
    if (recentKeystrokes.length >= 5) {
      const intervals = [];
      for (let i = 1; i < recentKeystrokes.length; i++) {
        intervals.push(recentKeystrokes[i] - recentKeystrokes[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (baselineRef.current.typingMs == null && intervals.length >= 10) {
        baselineRef.current.typingMs = avg;
      } else if (baselineRef.current.typingMs && avg > baselineRef.current.typingMs * 1.4) {
        newSignals.push('typing_slowdown');
      }
    }

    // Signal 2: Response latency spike (> 2x baseline)
    const recentAnswers = answersRef.current.filter((a) => now - a.ts < 300_000);
    if (recentAnswers.length >= 3) {
      const avg = recentAnswers.reduce((s, a) => s + a.time_ms, 0) / recentAnswers.length;
      if (baselineRef.current.answerMs == null && recentAnswers.length >= 5) {
        baselineRef.current.answerMs = avg;
      } else if (baselineRef.current.answerMs && avg > baselineRef.current.answerMs * 2) {
        newSignals.push('answer_latency_spike');
      }
    }

    // Signal 3: Consecutive wrong answers
    if (consecutiveWrongRef.current >= 3) {
      newSignals.push('error_spike');
    }

    // Signal 4: Long session (>45 minutes continuous)
    const sessionMinutes = (now - startedAtRef.current) / 60_000;
    if (sessionMinutes > 45) {
      newSignals.push('long_session');
    }

    // Composite fatigue level
    const level = Math.min(100, newSignals.length * 30);
    setFatigueLevel(level);
    setSignals(newSignals);
  };

  // Run compute every 15 seconds
  useEffect(() => {
    const interval = setInterval(compute, 15_000);
    return () => clearInterval(interval);
  }, []);

  const recordKeystroke = () => {
    keystrokesRef.current.push(Date.now());
    // Prune to last 60 seconds
    const cutoff = Date.now() - 60_000;
    keystrokesRef.current = keystrokesRef.current.filter((t) => t > cutoff);
  };

  const recordAnswer = (correct, timeMs) => {
    answersRef.current.push({ correct: !!correct, time_ms: timeMs, ts: Date.now() });
    if (correct) {
      consecutiveWrongRef.current = 0;
    } else {
      consecutiveWrongRef.current += 1;
    }
    // Prune to last 10 minutes
    const cutoff = Date.now() - 600_000;
    answersRef.current = answersRef.current.filter((a) => a.ts > cutoff);
    compute();
  };

  const reset = () => {
    keystrokesRef.current = [];
    answersRef.current = [];
    consecutiveWrongRef.current = 0;
    startedAtRef.current = Date.now();
    setFatigueLevel(0);
    setSignals([]);
  };

  return { fatigueLevel, signals, recordKeystroke, recordAnswer, reset };
}
