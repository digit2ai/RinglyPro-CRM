'use strict';

/**
 * Behavior Score Service
 *
 * Computes engagement scores and fatigue signals from ti_v2_behavior_events.
 * All inputs are aggregate signals — no raw face/audio data is ever processed.
 *
 * Engagement score (0-100):
 *   Weighted average of:
 *     - accuracy        (from recent SRS reviews quality)
 *     - response_speed  (recent latency vs baseline)
 *     - hint_usage      (fewer hints = higher score)
 *     - audio_replays   (fewer replays = higher score)
 *     - emotion_signal  (from opt-in client samples)
 *
 * Fatigue detection:
 *   - Typing cadence slowdown > 40% below baseline
 *   - Error rate spike > 3 consecutive wrong answers
 *   - Response latency increase > 2x baseline
 *   Returns count of fatigue signals in recent window.
 */

const sequelize = require('../../services/db.ti');

const LOOKBACK_MINUTES = 15;
const FATIGUE_LATENCY_MULTIPLIER = 2.0;
const FATIGUE_ERROR_THRESHOLD = 3;

/**
 * Compute engagement score for a learner over the lookback window.
 * @param {number} learnerId
 * @param {number} [lookbackMinutes=15]
 * @returns {Promise<{score, components, samples}>}
 */
async function computeEngagementScore(learnerId, lookbackMinutes = LOOKBACK_MINUTES) {
  if (!learnerId) return { score: 0, components: {}, samples: 0 };

  // SRS accuracy over recent window
  const [[srsStats]] = await sequelize.query(
    `SELECT
       COUNT(*)::int AS total,
       AVG(quality)::numeric(4,2) AS avg_quality,
       COUNT(*) FILTER (WHERE quality >= 3)::int AS correct,
       AVG(time_taken_ms)::int AS avg_time_ms
     FROM ti_v2_reviews
     WHERE learner_id = $1 AND reviewed_at >= NOW() - ($2 || ' minutes')::interval`,
    { bind: [learnerId, String(lookbackMinutes)] }
  );

  // Recent behavior events (hint usage, replays, etc.)
  const [[events]] = await sequelize.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'hint_used')::int AS hints,
       COUNT(*) FILTER (WHERE event_type = 'audio_replayed')::int AS replays,
       COUNT(*) FILTER (WHERE event_type = 'exercise_skipped')::int AS skips,
       AVG(engagement_score) FILTER (WHERE engagement_score IS NOT NULL)::numeric(5,2) AS avg_sample
     FROM ti_v2_behavior_events
     WHERE learner_id = $1 AND created_at >= NOW() - ($2 || ' minutes')::interval`,
    { bind: [learnerId, String(lookbackMinutes)] }
  );

  // Base sub-scores (each 0-100)
  const total = srsStats?.total || 0;
  const avgQuality = Number(srsStats?.avg_quality) || 0;
  const correct = srsStats?.correct || 0;

  // Accuracy: quality/5 * 100 (SM-2 grades 0-5 map to 0-100)
  const accuracyScore = total > 0 ? (avgQuality / 5) * 100 : 60;

  // Response speed: baseline 5000ms = 100, 15000ms = 0 (linear)
  const avgTime = srsStats?.avg_time_ms || 5000;
  const speedScore = Math.max(0, Math.min(100, 100 - ((avgTime - 5000) / 100)));

  // Hint penalty: each hint costs 5 points, max penalty 40
  const hintPenalty = Math.min(40, (events?.hints || 0) * 5);
  const hintScore = 100 - hintPenalty;

  // Replay penalty: each replay costs 4 points, max 30
  const replayPenalty = Math.min(30, (events?.replays || 0) * 4);
  const replayScore = 100 - replayPenalty;

  // Skip penalty: each skip costs 8 points, max 50
  const skipPenalty = Math.min(50, (events?.skips || 0) * 8);
  const skipScore = 100 - skipPenalty;

  // Client-side sample (from emotion detection if opted in)
  const sampleScore = Number(events?.avg_sample);
  const hasSample = !isNaN(sampleScore) && sampleScore > 0;

  // Weighted composite
  const weights = hasSample
    ? { accuracy: 0.25, speed: 0.15, hint: 0.15, replay: 0.1, skip: 0.1, sample: 0.25 }
    : { accuracy: 0.35, speed: 0.2, hint: 0.2, replay: 0.1, skip: 0.15, sample: 0 };

  let score =
    accuracyScore * weights.accuracy +
    speedScore * weights.speed +
    hintScore * weights.hint +
    replayScore * weights.replay +
    skipScore * weights.skip +
    (hasSample ? sampleScore * weights.sample : 0);

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    components: {
      accuracy: Math.round(accuracyScore),
      speed: Math.round(speedScore),
      hint: Math.round(hintScore),
      replay: Math.round(replayScore),
      skip: Math.round(skipScore),
      emotion_sample: hasSample ? Math.round(sampleScore) : null
    },
    weights,
    samples: total,
    lookback_minutes: lookbackMinutes
  };
}

/**
 * Detect fatigue signals in the recent window.
 * Returns an array of detected signals with descriptions.
 */
async function detectFatigue(learnerId, lookbackMinutes = LOOKBACK_MINUTES) {
  if (!learnerId) return { fatigued: false, signals: [] };

  const signals = [];

  // Signal 1: Response latency increase > 2x baseline
  const [[latencyStats]] = await sequelize.query(
    `SELECT
       AVG(time_taken_ms) FILTER (WHERE reviewed_at >= NOW() - ($2 || ' minutes')::interval)::int AS recent_avg,
       AVG(time_taken_ms)::int AS baseline_avg
     FROM ti_v2_reviews
     WHERE learner_id = $1 AND time_taken_ms IS NOT NULL`,
    { bind: [learnerId, String(lookbackMinutes)] }
  );

  if (latencyStats?.recent_avg && latencyStats?.baseline_avg) {
    const ratio = latencyStats.recent_avg / latencyStats.baseline_avg;
    if (ratio > FATIGUE_LATENCY_MULTIPLIER) {
      signals.push({
        type: 'latency_slowdown',
        severity: 'high',
        message: `Recent response time (${latencyStats.recent_avg}ms) is ${ratio.toFixed(1)}x slower than baseline (${latencyStats.baseline_avg}ms)`,
        ratio: Number(ratio.toFixed(2))
      });
    }
  }

  // Signal 2: Error rate spike — 3+ consecutive wrong answers
  const [recent] = await sequelize.query(
    `SELECT quality FROM ti_v2_reviews
     WHERE learner_id = $1
     ORDER BY reviewed_at DESC LIMIT 5`,
    { bind: [learnerId] }
  );

  let consecutiveFails = 0;
  for (const r of recent) {
    if (r.quality < 3) consecutiveFails++;
    else break;
  }
  if (consecutiveFails >= FATIGUE_ERROR_THRESHOLD) {
    signals.push({
      type: 'error_spike',
      severity: 'high',
      message: `${consecutiveFails} consecutive failed reviews detected`,
      count: consecutiveFails
    });
  }

  // Signal 3: High hint usage in short window
  const [[hintStats]] = await sequelize.query(
    `SELECT COUNT(*)::int AS hints
     FROM ti_v2_behavior_events
     WHERE learner_id = $1 AND event_type = 'hint_used'
       AND created_at >= NOW() - INTERVAL '5 minutes'`,
    { bind: [learnerId] }
  );
  if ((hintStats?.hints || 0) >= 5) {
    signals.push({
      type: 'high_hint_usage',
      severity: 'medium',
      message: `${hintStats.hints} hints used in the last 5 minutes`,
      count: hintStats.hints
    });
  }

  // Signal 4: Long session without break (>45 minutes of continuous activity)
  const [[sessionLen]] = await sequelize.query(
    `SELECT EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::int AS duration_sec,
            COUNT(*)::int AS events
     FROM ti_v2_behavior_events
     WHERE learner_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
    { bind: [learnerId] }
  );
  if ((sessionLen?.duration_sec || 0) > 2700 && (sessionLen?.events || 0) > 20) {
    signals.push({
      type: 'long_session',
      severity: 'medium',
      message: `${Math.round(sessionLen.duration_sec / 60)} minute session — time for a break!`,
      duration_sec: sessionLen.duration_sec
    });
  }

  // Signal 5: Explicit client-side fatigue events
  const [[clientFatigue]] = await sequelize.query(
    `SELECT COUNT(*)::int AS c
     FROM ti_v2_behavior_events
     WHERE learner_id = $1 AND event_type = 'fatigue_signal'
       AND created_at >= NOW() - ($2 || ' minutes')::interval`,
    { bind: [learnerId, String(lookbackMinutes)] }
  );
  if ((clientFatigue?.c || 0) > 0) {
    signals.push({
      type: 'client_reported',
      severity: 'low',
      message: `Client-side detector reported ${clientFatigue.c} fatigue sample(s)`,
      count: clientFatigue.c
    });
  }

  const fatigued = signals.some((s) => s.severity === 'high') || signals.length >= 3;

  return {
    fatigued,
    should_rest: fatigued,
    signal_count: signals.length,
    signals,
    rest_suggestion: fatigued
      ? "¡Descansa un poco, 'nak! You've studied hard — take a 5 minute break."
      : null
  };
}

/**
 * Log a behavior event. Never accepts raw sensor data — only aggregate signals.
 * @param {number} learnerId
 * @param {string} eventType
 * @param {object} [payload={}]
 * @param {number|null} [engagementScore]
 * @param {string|null} [sessionId]
 */
async function logEvent(learnerId, eventType, payload = {}, engagementScore = null, sessionId = null) {
  // Sanitize payload — strip anything that looks like raw biometric data
  const sanitized = sanitizePayload(payload);

  const [row] = await sequelize.query(
    `INSERT INTO ti_v2_behavior_events (learner_id, session_id, event_type, payload, engagement_score, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     RETURNING id`,
    {
      bind: [
        learnerId,
        sessionId || null,
        eventType,
        JSON.stringify(sanitized),
        engagementScore
      ]
    }
  );
  return row[0]?.id;
}

/**
 * Strip any suspicious raw-data fields from client-side payloads.
 * Privacy guard: never store images, audio, face landmarks, or raw video.
 */
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const BLOCKED_KEYS = [
    'image', 'image_data', 'video', 'video_data', 'audio', 'audio_data',
    'face_landmarks', 'face_mesh', 'raw_frame', 'blob', 'base64',
    'pixels', 'canvas_data'
  ];
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    const key = k.toLowerCase();
    if (BLOCKED_KEYS.some((blocked) => key.includes(blocked))) continue;
    if (typeof v === 'string' && v.length > 500) continue; // drop large strings
    if (typeof v === 'object' && v !== null) {
      out[k] = sanitizePayload(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = {
  computeEngagementScore,
  detectFatigue,
  logEvent,
  sanitizePayload,
  LOOKBACK_MINUTES
};
