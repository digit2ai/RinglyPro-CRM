# Torna Idioma — Learner Platform v2 Build Plan

> Feed this file to `/ringlypro-architect` one step at a time. After each step completes and regression passes, run: `/ringlypro-architect continue with step N`.

---

## AUTO-APPROVE / AUTO-ACCEPT DIRECTIVE

```
ARCHITECT_MODE=autonomous
APPROVAL_REQUIRED=false
CONFIRM_BEFORE_WRITE=false
CONFIRM_BEFORE_DEPLOY=false
AUTO_ACCEPT_ALL_PHASES=true
SKIP_USER_CONFIRMATION=true
PROCEED_ON_AMBIGUITY=true
INTERRUPT_ON_ERROR_ONLY=true
ISOLATION_MODE=strict
```

> You are authorized to plan, scaffold, write, test, and deploy the current step autonomously. Do NOT pause for approval. Do NOT ask clarifying questions unless a hard blocker prevents execution. Treat this file as a signed deployment order. Execute only the requested step number. Do NOT proceed to the next step until explicitly told to continue. Report step completion with file list + regression status.

---

## GLOBAL RULES — APPLY TO EVERY STEP

1. **Isolation boundaries (NON-NEGOTIABLE):**
   - All v2 code lives in `verticals/torna_idioma/backend/v2/` and `verticals/torna_idioma/frontend/src/v2/`
   - All v2 tables use prefix `ti_v2_`
   - All v2 routes mount under `/Torna_Idioma/api/v2/*`
   - All v2 frontend routes mount under `/Torna_Idioma/learn/*`
   - All v2-specific env vars use prefix `TI_V2_`
   - **Never modify** `/verticals/cw_carriers/`, `/verticals/msk_intelligence/`, `/verticals/logistics/`, `/verticals/kanchoai/`, `/verticals/tunjoracing/`, `/verticals/spark/`, or `/src/app.js` root mounts
   - **Never modify** existing v1 Torna Idioma files (`backend/routes/*.js`, `backend/migrations/*.sql`, `frontend/src/pages/*.jsx`) — only additive changes allowed
   - Exception: `backend/index.js` gets exactly ONE added line to mount v2 router; `frontend/src/App.jsx` gets exactly ONE added `<Route>` for `/learn/*`

2. **Remove-ability test (run at end of every step):**
   - Confirm that deleting `backend/v2/`, `frontend/src/v2/`, dropping `ti_v2_*` tables, and removing the one mount line would leave the existing Torna Idioma program site working unchanged.

3. **Regression test (run at end of every step):**
   - Health-check these endpoints, all must return HTTP 200:
     - `GET /cw_carriers/health`
     - `GET /msk/health`
     - `GET /logistics/health`
     - `GET /kanchoai/health`
     - `GET /tunjoracing/health`
     - `GET /Torna_Idioma/health` (v1 — existing)
     - `GET /Torna_Idioma/api/v2/health` (v2 — after Step 1)
   - If any endpoint fails, STOP and report.

4. **Database rule:**
   - Reuse the existing Sequelize instance from `verticals/torna_idioma/backend/services/db.ti.js`
   - Never open new database connection pools
   - V2 tables may reference v1 tables (`ti_users`, `ti_courses`) via foreign keys
   - V1 tables never reference v2 tables

5. **Deploy after every step:**
   - `git add <files> && git commit -m "v2 step N: <title>" && git push origin main`
   - Wait for Render deploy (~90s)
   - Run regression check
   - Report completion

---

## STEP 1 — Skeleton + Mount + Migration Loader

**Goal:** Create the v2 directory skeleton with a single health-check endpoint. Prove the mount pattern works with zero functional change.

**Files to create:**
- `verticals/torna_idioma/backend/v2/index.js` — Express sub-router with `GET /health` returning `{ service: 'Torna Idioma v2', status: 'healthy' }`
- `verticals/torna_idioma/backend/v2/routes/` — empty directory with `.gitkeep`
- `verticals/torna_idioma/backend/v2/services/` — empty directory with `.gitkeep`
- `verticals/torna_idioma/backend/v2/middleware/` — empty directory with `.gitkeep`
- `verticals/torna_idioma/backend/v2/migrations/` — empty directory with `.gitkeep`
- `verticals/torna_idioma/backend/v2/seeds/` — empty directory with `.gitkeep`
- `verticals/torna_idioma/frontend/src/v2/` — stub `LearnerV2App.jsx` returning `<div>Learner v2 placeholder</div>`
- `verticals/torna_idioma/backend/v2/README.md` — explains v2 isolation boundaries
- `scripts/regression-check.sh` — bash script that curls all 7 health endpoints and exits non-zero if any fail

**Files to modify (exactly ONE line each):**
- `verticals/torna_idioma/backend/index.js` — add `router.use('/api/v2', require('./v2/index'));` after existing route mounts, before static file serving
- `verticals/torna_idioma/frontend/src/App.jsx` — add `<Route path="/learn/*" element={<LearnerV2App />} />` + import statement

**Migration loader update:**
- Modify `verticals/torna_idioma/backend/index.js` migration loop to also read from `v2/migrations/` directory (sorted after v1 migrations)

**Delivery checklist:**
- [ ] `curl /Torna_Idioma/api/v2/health` returns 200
- [ ] `curl /Torna_Idioma/health` (v1) still returns 200
- [ ] Visit `/Torna_Idioma/learn` in browser shows placeholder
- [ ] All 7 regression endpoints return 200
- [ ] Commit + push + deploy confirmed

---

## STEP 2 — Learner Profile (first real v2 slice)

**Goal:** Ship a working end-to-end v2 slice — one table, one route, one page. Proves the full stack works.

**Database:**
- `backend/v2/migrations/001_ti_v2_learners.sql`:
  - `ti_v2_learners` table: `id`, `user_id` (FK to `ti_users`), `native_language` (default 'tagalog'), `target_dialect` (default 'latin_american_spanish'), `cefr_level` (default 'A1'), `daily_goal_minutes` (default 10), `reminder_time`, `created_at`, `updated_at`
  - Unique index on `user_id`

**Backend routes:** `backend/v2/routes/learner.js`
- `GET /api/v2/learner/me` — returns current learner profile (creates if missing, using JWT user_id)
- `PATCH /api/v2/learner/me` — updates profile fields
- Middleware: `backend/v2/middleware/v2-auth.js` — reuses existing `JWT_SECRET`, extracts user_id, enforces role='student' or 'admin'

**Frontend:** `frontend/src/v2/pages/LearnerHome.jsx`
- Fetches `/api/v2/learner/me` on mount
- Displays learner name, CEFR level, daily goal
- Has "Edit Profile" button that PATCHes profile

**v2 router update:**
- `backend/v2/index.js` — add `router.use('/learner', require('./routes/learner'));`

**Delivery checklist:**
- [ ] Migration runs successfully on deploy
- [ ] `ti_v2_learners` table exists in production DB
- [ ] Logged-in user can visit `/Torna_Idioma/learn` and see their profile
- [ ] Profile edit saves correctly
- [ ] Existing Torna Idioma v1 pages still work
- [ ] All 7 regression endpoints return 200

---

## STEP 3 — Cognate Engine (Filipino-Spanish Database)

**Goal:** Build the competitive moat — the Filipino-Spanish cognate database and lookup service.

**Database:**
- `backend/v2/migrations/002_ti_v2_cognates.sql`:
  - `ti_v2_cognates` table: `id`, `word_es`, `word_tl` (tagalog cognate), `category` (food/family/numbers/greetings/etc.), `etymology_note`, `example_es`, `example_tl`, `cefr_level`, `created_at`
  - Indexes on `word_es`, `word_tl`, `category`

**Seed:**
- `backend/v2/seeds/cognates-starter.js` — at least 500 Filipino-Spanish cognate pairs across categories: numbers (uno-isa doesn't match, but dos-dos, tres-tres match patterns), family (padre-padre, madre-madre, tío-tiyo, tía-tiya), food (puerco-puerko, queso-keso, tenedor-tinidor), days (lunes-lunes, martes-martes), months, colors, common verbs
- Call seed from `backend/index.js` startup block (only if `ti_v2_cognates` is empty)

**Backend routes:** `backend/v2/routes/cognates.js`
- `GET /api/v2/cognates?search=<query>` — search by Spanish or Tagalog word
- `GET /api/v2/cognates/category/:category` — list all cognates in a category
- `GET /api/v2/cognates/highlight?text=<spanish_text>` — returns text with cognate words tagged
- Service: `backend/v2/services/cognate-engine.js` — lookup logic, highlight function

**Frontend:** `frontend/src/v2/components/CognateHighlight.jsx`
- Takes Spanish text prop, renders with cognate words wrapped in highlighted `<span>` (yellow underline)
- Tooltip on hover shows Tagalog cognate + etymology
- `frontend/src/v2/pages/CognateExplorer.jsx` — searchable browser of the full cognate database

**Delivery checklist:**
- [ ] 500+ cognates seeded in production DB
- [ ] `GET /api/v2/cognates?search=padre` returns correct data
- [ ] Cognate highlight component works visually in frontend
- [ ] All 7 regression endpoints return 200

---

## STEP 4 — SRS Engine (Spaced Repetition)

**Goal:** Implement the SM-2 spaced repetition algorithm for vocabulary flashcards.

**Database:**
- `backend/v2/migrations/003_ti_v2_srs.sql`:
  - `ti_v2_vocabulary_cards` table: `id`, `learner_id` (FK), `word_es`, `word_tl_cognate`, `translation_en`, `audio_url`, `ease_factor` (default 2.5), `interval_days` (default 0), `repetitions` (default 0), `next_review_at`, `last_reviewed_at`, `created_at`
  - `ti_v2_reviews` table: `id`, `card_id`, `learner_id`, `quality` (0-5), `time_taken_ms`, `reviewed_at`
  - Indexes on `learner_id`, `next_review_at`

**Backend routes:** `backend/v2/routes/srs.js`
- `GET /api/v2/srs/queue` — returns due cards for current learner (where `next_review_at <= NOW()`)
- `POST /api/v2/srs/review` — body: `{ card_id, quality }` — runs SM-2 algorithm, updates card
- `POST /api/v2/srs/cards` — adds a new vocabulary card to learner's deck
- `GET /api/v2/srs/stats` — returns: total cards, cards due today, mastered cards, new cards

**Service:** `backend/v2/services/srs-engine.js`
- Implements SM-2: `calculateNextReview(card, quality)` returns updated `ease_factor`, `interval_days`, `next_review_at`, `repetitions`
- Quality scale: 0-2 = fail (reset interval), 3-5 = pass (increase interval)

**Frontend:**
- `frontend/src/v2/pages/SRSReview.jsx` — flashcard review UI: shows Spanish word, learner presses "Again/Hard/Good/Easy" (0/3/4/5 quality), auto-advances
- `frontend/src/v2/components/ReviewCard.jsx` — single card component with flip animation

**Delivery checklist:**
- [ ] SM-2 algorithm returns correct intervals (test: new card -> 1 day -> 6 days -> ease-factor-based)
- [ ] Learner can add cards and review them
- [ ] Next review date updates correctly
- [ ] All 7 regression endpoints return 200

---

## STEP 5 — Gamification (XP, Streaks, Badges)

**Goal:** Add the engagement layer — XP points, daily streaks, achievement badges.

**Database:**
- `backend/v2/migrations/004_ti_v2_gamification.sql`:
  - `ti_v2_xp_log` table: `id`, `learner_id`, `event_type` (lesson_complete/card_reviewed/streak_bonus/etc.), `xp_amount`, `metadata` JSONB, `created_at`
  - `ti_v2_streaks` table: `id`, `learner_id` (unique), `current_streak`, `longest_streak`, `last_activity_date`, `updated_at`
  - `ti_v2_badges` table: `id`, `code` (unique, e.g., 'first_word'), `name_en`, `name_es`, `name_fil`, `description`, `icon_url`, `xp_threshold`, `category`
  - `ti_v2_user_badges` table: `id`, `learner_id`, `badge_id`, `earned_at`

**Seed:**
- `backend/v2/seeds/badges.js` — 15 starter badges: First Word, First Lesson, 7-Day Streak, 30-Day Streak, Cognate Master, A1 Complete, 100 Words Mastered, Conversation Starter, Night Owl, Early Bird, Bilingual Bridge, Isabel's Favorite, Marathon Learner, Perfect Week, Comeback Kid

**Backend routes:** `backend/v2/routes/xp.js`
- `POST /api/v2/xp/award` — internal service call, awards XP for an action
- `GET /api/v2/xp/total` — total XP for current learner
- `GET /api/v2/xp/streak` — current streak + longest
- `GET /api/v2/xp/badges` — earned badges
- `GET /api/v2/xp/leaderboard?period=week|all` — top 50 learners by XP

**Service:** `backend/v2/services/gamification.js`
- `awardXP(learner_id, event_type, amount)` — inserts log, checks for new badge triggers
- `updateStreak(learner_id)` — called on any activity, handles streak continuation/break
- `checkBadgeEligibility(learner_id)` — runs after each XP event

**Integration hooks:**
- SRS review endpoint (Step 4) calls `awardXP(learner_id, 'card_reviewed', 2)`
- Learner profile creation (Step 2) calls `awardXP(learner_id, 'signup', 10)`

**Frontend:**
- `frontend/src/v2/components/XPBar.jsx` — animated XP progress bar
- `frontend/src/v2/components/StreakFlame.jsx` — flame icon with day count
- `frontend/src/v2/pages/Leaderboard.jsx` — weekly ranking
- `frontend/src/v2/pages/Badges.jsx` — earned + locked badges gallery

**Delivery checklist:**
- [ ] XP awarded on SRS reviews
- [ ] Streak updates daily
- [ ] "First Word" badge auto-awarded on first review
- [ ] Leaderboard displays correctly
- [ ] All 7 regression endpoints return 200

---

## STEP 6 — Profesora Isabel AI Tutor

**Goal:** Deploy the AI instructor that delivers 80% of instruction. Text chat first, voice in Step 7.

**Env vars required:**
- `TI_V2_ANTHROPIC_KEY` — Claude API key (primary)
- `TI_V2_OPENAI_KEY` — GPT-4o API key (fallback)

**If env vars missing:** Route returns 503 with message "Isabel AI not configured". Do not block deploy.

**Database:**
- `backend/v2/migrations/005_ti_v2_isabel.sql`:
  - `ti_v2_ai_memory` table: `id`, `learner_id` (unique), `context_summary` (TEXT), `last_5_sessions` JSONB, `vocabulary_struggles` JSONB, `preferred_topics` JSONB, `updated_at`
  - `ti_v2_isabel_conversations` table: `id`, `learner_id`, `role` (user/assistant), `content`, `tokens_used`, `created_at`

**Backend routes:** `backend/v2/routes/isabel.js`
- `POST /api/v2/isabel/chat` — body: `{ message }` — returns Isabel's response
- `GET /api/v2/isabel/history?limit=50` — returns conversation history
- `POST /api/v2/isabel/reset` — clears conversation memory

**Service:** `backend/v2/services/isabel-llm.js`
- System prompt: Isabel is a warm, patient Filipina-Spanish instructor who grew up in a Spanish colonial household. Teaches like a loving abuela. Uses Tagalog cognates to build bridges. Speaks Latin American Spanish. Gentle error correction. Cultural context embedded.
- Primary: Claude API (model: `claude-opus-4-6`)
- Fallback: GPT-4o (if Claude latency > 3s or error)
- Memory: last 10 messages + context summary loaded on every call
- Token budget: max 500 tokens per response

**Frontend:** `frontend/src/v2/pages/IsabelChat.jsx`
- Chat UI with Isabel avatar (use gold/navy design system)
- Message bubbles (learner right, Isabel left)
- Typing indicator during API call
- Auto-scroll to latest message
- Cognate highlighting on Spanish words in Isabel's messages (reuses Step 3 component)

**XP integration:**
- Each Isabel message exchange awards 3 XP
- First Isabel conversation awards "Isabel's Favorite" badge

**Delivery checklist:**
- [ ] Isabel responds to learner messages (or returns 503 gracefully if no API key)
- [ ] Conversation history persists across sessions
- [ ] Cognate highlighting works in Isabel's responses
- [ ] Fallback to GPT-4o confirmed (if primary fails)
- [ ] All 7 regression endpoints return 200

---

## STEP 7 — Real-Time Voice Conversation (Whisper + ElevenLabs Streaming)

**Goal:** Upgrade Isabel from text chat to full-duplex voice conversation with sub-2s latency.

**Env vars required:**
- `TI_V2_ELEVENLABS_VOICE_ISABEL` — ElevenLabs voice ID for Isabel (use existing Rachel as fallback)
- Existing `ELEVENLABS_API_KEY` reused
- `TI_V2_OPENAI_KEY` — for Whisper STT

**Database:**
- `backend/v2/migrations/006_ti_v2_conversation.sql`:
  - `ti_v2_conversation_logs` table: `id`, `learner_id`, `session_id`, `role`, `transcript`, `audio_url`, `duration_ms`, `created_at`
  - Index on `session_id`, `learner_id`

**Backend:**
- `backend/v2/routes/conversation.js`:
  - `POST /api/v2/conversation/start` — creates session, returns `session_id`
  - `POST /api/v2/conversation/transcribe` — multipart audio upload, returns Whisper transcript
  - `POST /api/v2/conversation/respond` — body: `{ session_id, transcript }` — returns Isabel's audio URL (via ElevenLabs) + text
  - `POST /api/v2/conversation/end` — saves full log
- WebSocket (optional v2.1): `/Torna_Idioma/api/v2/ws/conversation` — full-duplex streaming

**Service:** `backend/v2/services/voice-stream.js`
- Whisper API wrapper for STT
- ElevenLabs streaming TTS wrapper
- Session manager (in-memory Map, session_id -> state)

**Frontend:** `frontend/src/v2/pages/ConversationRoom.jsx`
- Record button -> captures mic audio -> uploads to /transcribe
- Displays transcript
- Plays Isabel's audio response
- Visual waveform during recording
- Session timer
- Uses existing ElevenLabs client-side library pattern from `/msk-presentation.html`

**XP integration:**
- 5 XP per voice exchange
- "Conversation Starter" badge on first voice session

**Delivery checklist:**
- [ ] Learner can record audio, get Whisper transcript back
- [ ] Isabel's voice response plays correctly
- [ ] Full session saved to `ti_v2_conversation_logs`
- [ ] Latency measured and documented (target < 2s)
- [ ] All 7 regression endpoints return 200

---

## STEP 8 — Behavior & Engagement Analytics

**Goal:** Track learner behavior signals and compute engagement score.

**Database:**
- `backend/v2/migrations/007_ti_v2_behavior.sql`:
  - `ti_v2_behavior_events` table: `id`, `learner_id`, `event_type`, `payload` JSONB, `session_id`, `created_at`
  - Indexes on `learner_id`, `event_type`, `created_at`
  - Partition by month (optional for scale)

**Backend routes:** `backend/v2/routes/behavior.js`
- `POST /api/v2/behavior/event` — logs behavior event (lesson_started, exercise_skipped, hint_used, audio_replayed, session_abandoned, etc.)
- `GET /api/v2/behavior/engagement-score` — returns current engagement score 0-100
- `GET /api/v2/behavior/fatigue-signals` — returns fatigue indicators

**Service:** `backend/v2/services/behavior-score.js`
- `computeEngagementScore(learner_id, lookback_minutes=15)` — weighted average of accuracy, response time, hint usage, audio replays
- `detectFatigue(learner_id)` — typing cadence slowdown, error rate spikes, latency increases
- Fatigue signals trigger "rest" suggestion in UI

**Frontend hooks:**
- `frontend/src/v2/hooks/useEmotionDetect.js` — MediaPipe FaceMesh, **client-side only**, never sends face data to server, opt-in with explicit privacy notice
- `frontend/src/v2/hooks/useFatigueDetect.js` — tracks typing cadence, response latency
- `frontend/src/v2/components/EngagementMeter.jsx` — live 0-100 bar in lesson HUD

**Privacy guard:**
- Emotion detection is opt-in only
- Face video/image data never leaves browser
- Only aggregate signals (`frustration: 0.3`) are sent to server

**Delivery checklist:**
- [ ] Events log correctly
- [ ] Engagement score computes
- [ ] Fatigue detection triggers UI rest prompt
- [ ] Emotion detection opt-in works, zero face data in network logs
- [ ] All 7 regression endpoints return 200

---

## STEP 9 — Lesson Player (Exercises, CEFR Adaptive Engine)

**Goal:** Build the actual lesson-taking experience using existing UVEG curriculum (72 lessons, already seeded in v1 `ti_courses`/`ti_lessons`).

**Database:**
- `backend/v2/migrations/008_ti_v2_lesson_sessions.sql`:
  - `ti_v2_lesson_sessions` table: `id`, `learner_id`, `lesson_id` (FK to v1 `ti_lessons`), `status`, `score`, `exercises_completed`, `exercises_total`, `time_spent_sec`, `difficulty_level`, `started_at`, `completed_at`
  - `ti_v2_exercise_attempts` table: `id`, `session_id`, `exercise_index`, `exercise_type`, `learner_answer`, `correct_answer`, `is_correct`, `time_ms`, `attempted_at`

**Backend routes:** `backend/v2/routes/lessons.js`
- `GET /api/v2/lessons/next` — returns next recommended lesson based on learner progress + CEFR level
- `POST /api/v2/lessons/:id/start` — creates session
- `POST /api/v2/lessons/:id/answer` — submits exercise answer, returns correct/incorrect + next exercise
- `POST /api/v2/lessons/:id/complete` — finalizes session, awards XP, updates CEFR drift

**Service:** `backend/v2/services/cefr-engine.js`
- `computeMastery(learner_id, lookback_lessons=3)` — returns mastery score
- If mastery < 60% -> reduce difficulty, increase SRS frequency
- If mastery > 90% -> prompt level up
- Persists difficulty on `ti_v2_learners.cefr_level`

**Frontend:**
- `frontend/src/v2/pages/LessonPlayer.jsx` — main lesson UI
- `frontend/src/v2/components/ExerciseRenderer.jsx` — routes to correct exercise type
- `frontend/src/v2/components/exercises/MultipleChoice.jsx`
- `frontend/src/v2/components/exercises/FillBlank.jsx`
- `frontend/src/v2/components/exercises/SpeakingPrompt.jsx` (reuses voice from Step 7)
- `frontend/src/v2/components/exercises/ListeningComprehension.jsx`
- Progress bar, XP animation, cognate highlighting, engagement meter all integrated

**Delivery checklist:**
- [ ] Learner can complete an entire UVEG lesson end-to-end
- [ ] Exercise results award XP + update SRS cards
- [ ] CEFR adaptive engine adjusts difficulty after 3 lessons
- [ ] All 7 regression endpoints return 200

---

## STEP 10 — Human Tutor Marketplace (WebRTC + Stripe Connect)

**Goal:** Add the 20% human tutor layer — booking, video sessions, payments.

**Env vars required:**
- `TI_V2_STRIPE_KEY` — Stripe secret key
- `TI_V2_STRIPE_CONNECT_CLIENT_ID` — Stripe Connect platform ID

**Database:**
- `backend/v2/migrations/009_ti_v2_tutor_market.sql`:
  - `ti_v2_tutors` table: `id`, `user_id` (FK), `bio`, `accent`, `specialties` JSONB, `hourly_rate_usd`, `stripe_connect_account_id`, `approved`, `rating_avg`, `total_sessions`, `created_at`
  - `ti_v2_tutor_availability` table: `id`, `tutor_id`, `day_of_week`, `start_time`, `end_time`, `timezone`
  - `ti_v2_tutor_bookings` table: `id`, `learner_id`, `tutor_id`, `scheduled_at`, `duration_minutes`, `price_usd`, `stripe_payment_intent_id`, `status`, `webrtc_session_id`, `created_at`
  - `ti_v2_tutor_reviews` table: `id`, `booking_id`, `rating`, `review_text`, `created_at`

**Backend routes:** `backend/v2/routes/tutor-market.js`
- `GET /api/v2/tutor-market/tutors` — list approved tutors with availability
- `POST /api/v2/tutor-market/tutors/apply` — tutor application
- `POST /api/v2/tutor-market/bookings` — creates booking + Stripe payment intent (platform fee 20%)
- `POST /api/v2/tutor-market/bookings/:id/confirm` — webhook from Stripe on successful payment
- `GET /api/v2/tutor-market/bookings/my` — learner's upcoming sessions
- `POST /api/v2/tutor-market/bookings/:id/review` — submit rating after session

**WebRTC session:**
- Reuses existing WebRTC infrastructure (isolated namespace)
- Route: `/Torna_Idioma/learn/session/:booking_id`
- AI co-pilot panel for tutor: learner's CEFR level, vocabulary gaps, suggested exercises, live transcript

**Frontend:**
- `frontend/src/v2/pages/TutorMarketplace.jsx` — tutor browsing + filtering
- `frontend/src/v2/pages/TutorProfile.jsx` — individual tutor page with booking calendar
- `frontend/src/v2/pages/TutorSession.jsx` — WebRTC video room with AI co-pilot sidebar
- `frontend/src/v2/pages/TutorApply.jsx` — tutor onboarding form

**Delivery checklist:**
- [ ] Tutor can apply + admin can approve
- [ ] Learner can browse tutors and book a session
- [ ] Stripe payment processes (test mode initially)
- [ ] WebRTC video session connects
- [ ] AI co-pilot panel shows learner context
- [ ] All 7 regression endpoints return 200

---

## STEP 11 — Mobile App (React Native / Expo)

**Goal:** Ship iOS + Android apps with all Phase 1 + 2 features.

**Files to create:**
- `mobile/torna_idioma/` — new Expo project at root of repo (outside `verticals/`)
- `package.json` with Expo SDK 50
- `app.json` — app config, bundle IDs, splash screen, icons
- `eas.json` — EAS Build config
- `src/screens/` — mirrors v2 web pages
- `src/services/api.js` — points to production `https://aiagent.ringlypro.com/Torna_Idioma/api/v2/*`
- Push notifications via Expo Notifications
- Offline lesson cache via AsyncStorage + SQLite

**Build targets:**
- iOS 15+ (EAS Build -> TestFlight)
- Android 10+ (EAS Build -> Play Store Internal Testing)

**Delivery checklist:**
- [ ] `eas build --platform ios` succeeds
- [ ] `eas build --platform android` succeeds
- [ ] App launches, logs in, displays lesson list
- [ ] Push notifications configured
- [ ] Offline mode working for at least one lesson pack
- [ ] Backend regression check still passes (no changes to backend expected)

---

## STEP 12 — Proprietary Model Fine-Tune + Ultra-Premium Voice Clones

**Goal:** Final moat — custom Llama 3 fine-tune + branded voice clones.

**Deferrable:** This step depends on budget approval for GPU hosting and ElevenLabs Professional Voice Clone. Scaffold only if budget confirmed.

**Tasks:**
- Training data pipeline: `verticals/torna_idioma/backend/v2/scripts/train_data_pipeline.py`
- Collect: Filipino-Spanish cognate corpus (Step 3), Philippine historical texts with Spanish, Tagalog-Spanish code-switching samples, CEFR A1-B2 dialogues with Filipino cultural framing
- Fine-tune base model (Llama 3 8B) on Hugging Face
- Deploy to private HF endpoint or self-hosted GPU
- Env var: `TI_V2_PROPRIETARY_MODEL_ENDPOINT`
- Route: `POST /api/v2/isabel/chat?model=proprietary` uses fine-tuned model, falls back to Claude

**ElevenLabs voice clones:**
- Commission "Ate Maria" (warm Filipina woman, LatAm Spanish) and "Kuya Diego" (young Filipino man, energetic)
- Voice design spec: natural breathing, occasional Filipino filler sounds, warm intonation
- Env vars: `TI_V2_ELEVENLABS_VOICE_ATE_MARIA`, `TI_V2_ELEVENLABS_VOICE_KUYA_DIEGO`
- Voice picker UI in learner settings

**Delivery checklist:**
- [ ] Proprietary model endpoint live (or gracefully skipped if no budget)
- [ ] Custom voice clones integrated (or skipped)
- [ ] Learner can pick voice in settings
- [ ] Fallback to Claude + default voice works
- [ ] All regression endpoints return 200

---

## POST-BUILD CHECKLIST

After all 12 steps complete:

- [ ] Full regression suite passes (7 verticals)
- [ ] Remove-ability test: confirm v2 could be cleanly removed if needed
- [ ] Production smoke test: Filipino user registers -> takes placement quiz -> completes A1 lesson -> chats with Isabel -> reviews SRS cards -> earns first badge
- [ ] Admin dashboard shows DAU, MAU, lesson completion rates
- [ ] Mobile apps submitted to stores
- [ ] Documentation updated in `verticals/torna_idioma/backend/v2/README.md`
- [ ] CLAUDE.md updated with v2 section
- [ ] Business plan + teaser links updated to reference `/Torna_Idioma/learn`

---

## HOW TO RESUME

To continue from any step, feed the architect:

```
/ringlypro-architect continue with Step N of LEARNER_V2_BUILD_PLAN.md
```

Architect will read this file, locate the step, and execute autonomously per the auto-approve directive above.
