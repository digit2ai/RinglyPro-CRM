'use strict';

/**
 * v2 Voice Conversation Routes
 *
 * Full voice exchange with Profesora Isabel:
 *   1. Learner holds mic, records Spanish audio
 *   2. POST /api/v2/conversation/exchange  (multipart: audio blob + session_id)
 *   3. Backend: Whisper STT -> Isabel LLM -> ElevenLabs TTS
 *   4. Returns JSON: { transcript, reply_text, audio_base64, turn_number, latency }
 *   5. Frontend plays audio_base64 and displays both transcripts
 *
 * Also:
 *   POST /api/v2/conversation/start  — allocate a session_id
 *   POST /api/v2/conversation/end    — finalize session (optional)
 *   GET  /api/v2/conversation/status — configuration check
 *   GET  /api/v2/conversation/sessions/:id — full transcript for a session
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');
const voiceStream = require('../services/voice-stream');
const isabelLLM = require('../services/isabel-llm');
const gamification = require('../services/gamification');

// Multer: memory storage, 10MB cap per audio upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

async function getLearnerId(userId) {
  const [rows] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  if (rows.length > 0) return rows[0].id;
  await sequelize.query(
    `INSERT INTO ti_v2_learners (user_id, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
    { bind: [userId] }
  );
  const [created] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  return created[0].id;
}

// GET /api/v2/conversation/status
router.get('/status', (req, res) => {
  const cfg = voiceStream.isConfigured();
  res.json({
    success: true,
    configured: cfg.stt && cfg.tts,
    stt_ready: cfg.stt,
    tts_ready: cfg.tts,
    isabel_voice_id: cfg.voice_id,
    whisper_model: voiceStream.WHISPER_MODEL,
    tts_model: voiceStream.TTS_MODEL
  });
});

// POST /api/v2/conversation/start
router.post('/start', v2Auth.learner, async (req, res) => {
  try {
    const sessionId = crypto.randomUUID();
    res.json({
      success: true,
      session_id: sessionId,
      started_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[v2/conversation] start error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/conversation/exchange
 *
 * Multipart form:
 *   - audio: Blob/File (required) — user's recorded speech
 *   - session_id: string (required)
 *
 * Returns:
 *   {
 *     success, session_id, turn_number,
 *     user: { transcript, latency_ms },
 *     isabel: { text, audio_base64, mime, voice_id, latency_ms, tokens },
 *     total_latency_ms
 *   }
 */
router.post('/exchange', v2Auth.learner, upload.single('audio'), async (req, res) => {
  const sessionStart = Date.now();
  try {
    const sessionId = req.body.session_id || req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: 'session_id required' });
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'audio file required (multipart field: audio)' });
    }

    const learnerId = await getLearnerId(req.user.id);

    // Step 1: Whisper STT
    let sttResult;
    try {
      sttResult = await voiceStream.transcribe(req.file.buffer, req.file.mimetype || 'audio/webm', 'es');
    } catch (e) {
      if (e.code === 'STT_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'Speech-to-text not configured', code: e.code });
      }
      throw e;
    }

    const transcript = sttResult.text;
    if (!transcript || transcript.length === 0) {
      return res.status(400).json({
        error: 'Transcription was empty — please speak more clearly or check microphone'
      });
    }

    // Persist user turn
    const [[turnCountRow]] = await sequelize.query(
      `SELECT COALESCE(MAX(turn_number), -1)::int AS n FROM ti_v2_conversation_logs WHERE session_id = $1`,
      { bind: [sessionId] }
    );
    const nextTurn = (turnCountRow.n || -1) + 1;

    await sequelize.query(
      `INSERT INTO ti_v2_conversation_logs
       (learner_id, session_id, turn_number, role, transcript, duration_ms, stt_model, latency_ms, created_at)
       VALUES ($1, $2, $3, 'user', $4, $5, $6, $7, NOW())`,
      {
        bind: [
          learnerId,
          sessionId,
          nextTurn,
          transcript,
          sttResult.duration_ms,
          sttResult.model,
          sttResult.latency_ms
        ]
      }
    );

    // Step 2: Profesora Isabel generates a response (reuses Step 6 LLM)
    const llmResult = await isabelLLM.chat(learnerId, transcript);

    // Step 3: ElevenLabs TTS on Isabel's reply
    // Look up learner's voice_preference (Step 12 voice picker)
    const [[learnerPref]] = await sequelize.query(
      `SELECT voice_preference FROM ti_v2_learners WHERE id = $1`,
      { bind: [learnerId] }
    );
    const voiceId = voiceStream.resolveVoiceId(learnerPref?.voice_preference || 'isabel_default');

    let ttsResult;
    try {
      ttsResult = await voiceStream.synthesize(llmResult.text, voiceId);
    } catch (e) {
      if (e.code === 'TTS_NOT_CONFIGURED') {
        // Return text-only reply — still useful
        await persistAssistantTurn(learnerId, sessionId, nextTurn + 1, llmResult.text, null, null, null, llmResult.latency_ms, llmResult.tokens, { tts_error: 'not_configured' });
        return res.json({
          success: true,
          session_id: sessionId,
          turn_number: nextTurn + 1,
          user: { transcript, latency_ms: sttResult.latency_ms },
          isabel: {
            text: llmResult.text,
            audio_base64: null,
            mime: null,
            voice_id: null,
            latency_ms: llmResult.latency_ms,
            tokens: llmResult.tokens,
            tts_error: 'not_configured'
          },
          total_latency_ms: Date.now() - sessionStart
        });
      }
      throw e;
    }

    // Persist assistant turn with full metadata
    await persistAssistantTurn(
      learnerId,
      sessionId,
      nextTurn + 1,
      llmResult.text,
      ttsResult.voice_id,
      ttsResult.model,
      ttsResult.latency_ms + llmResult.latency_ms,
      llmResult.latency_ms,
      llmResult.tokens,
      { tts_latency: ttsResult.latency_ms, tts_bytes: ttsResult.size_bytes, llm_model: llmResult.model }
    );

    // Award gamification XP (5 per voice exchange)
    let gamificationResult = null;
    try {
      gamificationResult = await gamification.recordActivity(learnerId, 'isabel_voice', null, {
        session_id: sessionId,
        turn: nextTurn + 1
      });
    } catch (e) {
      console.warn('[v2/conversation] gamification failed:', e.message);
    }

    res.json({
      success: true,
      session_id: sessionId,
      turn_number: nextTurn + 1,
      user: {
        transcript,
        latency_ms: sttResult.latency_ms,
        duration_ms: sttResult.duration_ms
      },
      isabel: {
        text: llmResult.text,
        audio_base64: ttsResult.audio.toString('base64'),
        mime: 'audio/mpeg',
        voice_id: ttsResult.voice_id,
        latency_ms: llmResult.latency_ms + ttsResult.latency_ms,
        llm_latency_ms: llmResult.latency_ms,
        tts_latency_ms: ttsResult.latency_ms,
        tokens: llmResult.tokens,
        model: llmResult.model
      },
      total_latency_ms: Date.now() - sessionStart,
      gamification: gamificationResult
    });
  } catch (err) {
    console.error('[v2/conversation] exchange error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function persistAssistantTurn(
  learnerId,
  sessionId,
  turnNumber,
  transcript,
  voiceId,
  ttsModel,
  turnLatencyMs,
  llmLatencyMs,
  tokens,
  metadata
) {
  await sequelize.query(
    `INSERT INTO ti_v2_conversation_logs
     (learner_id, session_id, turn_number, role, transcript, tts_model, tts_voice_id, latency_ms, tokens_used, metadata, created_at)
     VALUES ($1, $2, $3, 'assistant', $4, $5, $6, $7, $8, $9::jsonb, NOW())`,
    {
      bind: [
        learnerId,
        sessionId,
        turnNumber,
        transcript,
        ttsModel,
        voiceId,
        turnLatencyMs,
        tokens || 0,
        JSON.stringify(metadata || {})
      ]
    }
  );
}

// POST /api/v2/conversation/end
router.post('/end', v2Auth.learner, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const [[stats]] = await sequelize.query(
      `SELECT COUNT(*)::int AS turns,
              SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END)::int AS user_turns,
              MIN(created_at) AS started_at,
              MAX(created_at) AS ended_at
       FROM ti_v2_conversation_logs WHERE session_id = $1`,
      { bind: [session_id] }
    );
    res.json({ success: true, session_id, stats });
  } catch (err) {
    console.error('[v2/conversation] end error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/conversation/sessions/:id
router.get('/sessions/:id', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const [rows] = await sequelize.query(
      `SELECT id, session_id, turn_number, role, transcript, latency_ms, tokens_used, created_at
       FROM ti_v2_conversation_logs
       WHERE session_id = $1 AND learner_id = $2
       ORDER BY turn_number ASC`,
      { bind: [req.params.id, learnerId] }
    );
    res.json({ success: true, session_id: req.params.id, count: rows.length, turns: rows });
  } catch (err) {
    console.error('[v2/conversation] session fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/conversation/sessions — list recent sessions
router.get('/sessions', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const [rows] = await sequelize.query(
      `SELECT session_id,
              MIN(created_at) AS started_at,
              MAX(created_at) AS ended_at,
              COUNT(*)::int AS turns
       FROM ti_v2_conversation_logs
       WHERE learner_id = $1
       GROUP BY session_id
       ORDER BY started_at DESC
       LIMIT 20`,
      { bind: [learnerId] }
    );
    res.json({ success: true, count: rows.length, sessions: rows });
  } catch (err) {
    console.error('[v2/conversation] sessions list error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
