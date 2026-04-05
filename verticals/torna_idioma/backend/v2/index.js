'use strict';

/**
 * Torna Idioma — Learner Platform v2
 *
 * Isolation boundaries (see LEARNER_V2_BUILD_PLAN.md):
 *   - All v2 routes mount under /Torna_Idioma/api/v2/*
 *   - All v2 tables use prefix ti_v2_
 *   - All v2 frontend routes mount under /Torna_Idioma/learn/*
 *   - All v2-specific env vars use prefix TI_V2_
 *   - Reuses parent Sequelize instance (never opens new DB pools)
 *
 * Remove-ability test: deleting backend/v2/, frontend/src/v2/, dropping
 * ti_v2_* tables, and removing the single mount line in ../index.js
 * would leave the existing Torna Idioma program site working unchanged.
 */

const express = require('express');
const router = express.Router();

// v2 health check — smoke test endpoint used by regression script
router.get('/health', (req, res) => {
  res.json({
    service: 'Torna Idioma Learner v2',
    status: 'healthy',
    version: '2.0.0-alpha',
    phase: 'step-8-behavior-analytics',
    timestamp: new Date().toISOString()
  });
});

// Step 2 — Learner profile
router.use('/learner', require('./routes/learner'));

// Step 3 — Cognate engine
router.use('/cognates', require('./routes/cognates'));

// Step 4 — Spaced Repetition System (SM-2 algorithm)
router.use('/srs', require('./routes/srs'));

// Step 5 — Gamification (XP, streaks, badges, leaderboard)
router.use('/xp', require('./routes/xp'));

// Step 6 — Profesora Isabel AI tutor (text chat)
router.use('/isabel', require('./routes/isabel'));

// Step 7 — Real-time voice conversation (Whisper STT + ElevenLabs TTS)
router.use('/conversation', require('./routes/conversation'));

// Step 8 — Behavior & engagement analytics
router.use('/behavior', require('./routes/behavior'));

// Future route mounts (added in subsequent steps):
//   router.use('/srs',          require('./routes/srs'));          // Step 4
//   router.use('/xp',           require('./routes/xp'));           // Step 5
//   router.use('/isabel',       require('./routes/isabel'));       // Step 6
//   router.use('/conversation', require('./routes/conversation')); // Step 7
//   router.use('/behavior',     require('./routes/behavior'));     // Step 8
//   router.use('/lessons',      require('./routes/lessons'));      // Step 9
//   router.use('/tutor-market', require('./routes/tutor-market')); // Step 10

module.exports = router;
