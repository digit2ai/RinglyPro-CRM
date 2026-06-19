# Torna Idioma — Speaking-First Learning Design Blueprint

**Subject taught:** Spanish (Latin American). **Medium of instruction:** Tagalog + English. **Learners:** Filipino + English speakers. **Standards:** CEFR (primary) + ACTFL (cross-walked). **Bar to beat:** LanguaTalk, Speak, Praktika, Pimsleur, ELSA.

> This blueprint replaces the "read-a-passage → mark complete" model with a **speaking-first** ecosystem. Every design choice carries a one-line SLA (Second-Language Acquisition) rationale. It is written to drive a real rebuild — Section 6 maps every feature to *exists / upgrade / build-new* with phases.

---

## 0. Design Principles (the spine)

1. **Output beats recognition.** Learners must *produce* speech every single day. (SLA: Swain's Output Hypothesis — pushed output forces grammatical processing that comprehension alone never triggers.)
2. **Comprehensible input first, then output.** Each loop opens with input slightly above current level (i+1). (SLA: Krashen's Input Hypothesis — acquisition needs understandable input, not rules.)
3. **Meaning before form.** Teach in Spanish, *explain* in Tagalog/English only when meaning breaks down. (SLA: focus-on-form — brief form correction inside meaningful tasks outperforms isolated grammar drills.)
4. **Spacing and retrieval.** Vocabulary lives in an SRS; speaking targets recur on a schedule. (SLA: spacing effect + testing effect.)
5. **Credible assessment.** No auto-100. Scores are criterion-referenced against a published rubric and gate level advancement. (SLA: assessment validity — a certificate only means something if it can be failed.)
6. **Leverage the L1 bridge.** Filipino has ~4,000 Spanish loanwords; teach cognates explicitly as scaffolding, and flag false friends. (SLA: positive transfer — cognate awareness accelerates lexical uptake for Filipino learners specifically.)

---

## 1. Learner Journey (end-to-end)

```
ONBOARD → PLACEMENT (adaptive + oral) → set CEFR level + daily goal
   ↓
DAILY SPEAKING LOOP  ←──────────────┐  (repeats; ~10–20 min/day)
   ↓                                 │
UNIT (4–6 loops)                     │  spaced review pulls back here
   ↓                                 │
FORMATIVE CHECK (end of unit) ───────┘  pass → next unit; fail → targeted remediation
   ↓
SUMMATIVE ORAL ASSESSMENT (end of CEFR sub-level, e.g. A1→A2)
   ↓
CERTIFICATION  (CEFR badge + Rizal Studies cultural record)  → next level
```

### 1.1 Onboarding (≤ 3 min, Tagalog UI)
- Welcome in Tagalog: "Matuto tayong magsalita ng Espanyol." Set **why** (work/BPO, travel, heritage, school credit) — drives content theming.
- Pick **daily goal** (5/10/20 min) and **reminder time** (already in `ti_v2_learners.daily_goal_minutes` / `reminder_time`).
- Mic + permissions check with a throwaway "Say *hola*" so the very first thing a learner does is **speak**. (SLA: lowers affective filter early; speaking is normalized as routine, not exam.)

### 1.2 Placement — adaptive + oral (the credibility differentiator)
Two stages, both required:
- **Stage A — Adaptive comprehension/usage (3–4 min):** item-response-style branching MCQ + fill-blank from the seed bank. Each correct answer raises difficulty, each miss lowers it, until the band stabilizes. Outputs a provisional CEFR band (A1–B1+).
- **Stage B — Oral elicitation (2–3 min):** Isabel asks 3 escalating spoken prompts ("¿Cómo te llamas?" → "Cuéntame sobre tu familia." → "¿Qué hiciste ayer?"). STT transcribes; the oral rubric (Section 5) scores fluency + range + pronunciation. (SLA: comprehension placement alone systematically *over*-places speakers who can read but not talk — the oral stage corrects this.)
- **Result:** `cefr_level` set on `ti_v2_learners`; learner sees an honest band with a Tagalog explanation and a "first unit" recommendation. Re-placeable anytime.

### 1.3 Unit progression
- A **unit** = one theme (e.g. "Presentaciones") = 4–6 daily loops + 1 formative check.
- Units are sequenced by CEFR can-do statements (the seed JSON already segments Module 1 into elements 1.1–1.6 — these become the first 6 units).
- Adaptive engine (`cefr-engine.js`) nudges difficulty: mastery < 60% → reinforce + raise SRS frequency; > 90% → offer accelerate.

### 1.4 Formative checks (low stakes, frequent)
At each unit end: a 5-minute mixed check including **at least one speaking task** scored on the rubric. Pass ≥ 70% → advance. Below → auto-generated remediation loop targeting the specific missed targets. (SLA: formative assessment for learning; failure routes to practice, not punishment.)

### 1.5 Summative oral assessment (high stakes, gated)
At each CEFR sub-level boundary: a **structured oral proficiency interview (OPI-style)** with Isabel — warm-up, level-checks, probes, role-play, wind-down (~8–12 min). Scored against the full 5-criterion rubric by the AI judge, with human-review flag for borderline (±1 band). Must pass to certify. (SLA: ACTFL OPI is the field standard for sampling sustained, unrehearsed speech.)

### 1.6 Certification
- **CEFR certificate** (A1, A2, B1…) issued only on passing the summative oral + the cumulative formative record. Stored as a badge + verifiable record (extends `ti_v2_user_badges` with a cert sub-type and the rubric breakdown).
- **Rizal Studies record:** separate, *cultural-literacy* transcript (Philippine–Hispanic heritage passages completed + a short spoken reflection per cluster). It is a **co-curricular record, not a language grade** — kept distinct so the language certificate stays criterion-pure. The current "mark complete / placeholder score" is replaced by a 60-second spoken reflection scored pass/revise.

---

## 2. The Core Daily Loop (speaking-first)

Target 10–20 min. Seven micro-steps; the learner **hears, then says, every step**. XP awarded per step (ties to `gamification.js`).

| # | Step | Learner HEARS / SEES | Learner DOES & SAYS | SLA rationale |
|---|------|----------------------|---------------------|---------------|
| 1 | **Comprehensible Input** | 30–45s audio mini-scene (native LatAm voice) with Spanish captions; cognates auto-highlighted (`CognateHighlight`) | Listens; taps any word for Tagalog gloss; answers 1 gist question aloud ("¿De qué hablan?") | i+1 input primes the target before production |
| 2 | **Listen & Shadow** | The scene replayed line-by-line | **Shadows** each line — repeats immediately, matching rhythm/intonation; waveform overlay vs. model | Shadowing builds prosody + articulatory motor memory faster than silent study |
| 3 | **Vocabulary in Context** | The 5 night's roots (Cinco Raíces) shown *inside* the scene's sentences, not as isolated cards | Says each derived form in a frame sentence; rates recall → feeds SM-2 SRS | Lexis learned in context + retrieval-tested sticks; ties to existing `vocab.js`/SM-2 |
| 4 | **Guided Speaking Task** | A controlled prompt with scaffold ("Preséntate usando *llamarse* y *ser*.") | Speaks a constrained utterance; instant cognate/false-friend flag | Controlled output bridges input → free production (i.e. pushed but supported) |
| 5 | **Free Conversation with Isabel** | Isabel opens a real exchange on the theme (voice, full-duplex) | **Unscripted talk** 2–4 turns; negotiates meaning when stuck | Interaction Hypothesis — meaning negotiation drives acquisition |
| 6 | **Pronunciation + Grammar Feedback** | Per-phoneme score + 1 grammar note in Tagalog ("Tama, pero gamitin ang *está* dito, hindi *es*.") | Re-says the flagged item once (repair) | Immediate corrective recast + forced repair = uptake |
| 7 | **Spaced Review** | Due SRS items (`srs/queue`) surfaced as quick **speak-the-answer** cards | Says the answer aloud before flipping; grades 0–5 | Spacing + speaking the retrieval (not just recognizing) |

**Loop close:** streak flame updates, XP bar animates, tomorrow's preview. If `detectFatigue` fires, the loop offers a graceful stop after step 5. (SLA: ending on a successful exchange protects motivation.)

**Key change from v1:** Cinco Raíces stops being a standalone flashcard chore — it is **embedded as step 3** and its review tail becomes **step 7**, and both are now *spoken*, not silent.

---

## 3. Lesson / Unit Architecture

### 3.1 Repeatable Unit Template

```
UNIT: <theme>                         CEFR target: <sub-level>
─────────────────────────────────────────────────────────────
1. OBJECTIVES  (can-do statements)
   "Kaya kong..." / "I can..."  — 3–5, observable, speaking-weighted
2. TARGET LANGUAGE
   - Functions (e.g. greeting, self-intro)
   - Vocabulary (the unit's Cinco Raíces roots + derived forms)
   - Grammar in focus (1–2 points, taught for use not analysis)
   - Pronunciation focus (1 contrast, e.g. /b/ vs /β/, rolled rr)
   - Cognate bridge + false-friend warnings (Tagalog)
3. MODEL DIALOGUE  (the comprehensible-input scene; audio + captions)
4. CONTROLLED PRACTICE  (guided speaking; substitution, transformation, Q&A)
5. COMMUNICATIVE TASK  (roleplay / info-gap / scenario sim with Isabel)
6. SPEAKING ASSESSMENT  (formative; rubric-scored, ≥70% to pass)
7. REVIEW  (SRS scheduling of this unit's targets; spiral into later units)
```

Authoring rule: each unit must contain **≥ 60% spoken-production time**. A unit that is mostly reading fails review and is sent back to authors. (SLA: time-on-task in the target skill predicts gains in that skill — to teach speaking, learners must spend the time speaking.)

### 3.2 Worked Gold-Standard Unit — **A1, "Presentaciones" (Greetings & Introductions)**

Maps directly to the seed file's element **1.1** (`saludar, llamarse, ser, estar, presentar`).

**1. Objectives (can-do)**
- Kaya kong **bumati** at **magpaalam** sa Espanyol. / I can greet and say goodbye.
- Kaya kong **magpakilala** (pangalan, saan galing, trabaho). / I can introduce myself (name, origin, job).
- Kaya kong **magtanong** ng pangalan at kumustahin ang iba. / I can ask someone's name and how they are.

**2. Target language**
- **Functions:** greeting, leave-taking, self-introduction, asking name/state.
- **Vocabulary (Cinco Raíces, night 1):** `saludar, llamar(se), ser, estar, presentar` + derived forms (`me llamo / te llamas / se llama`, `soy / eres / es`, `estoy / estás / está`).
- **Grammar in focus:** `ser` vs `estar` (identity vs state) — the one contrast that unlocks intros and "¿cómo estás?". Taught contrastively, not via conjugation tables.
- **Pronunciation focus:** Spanish vowels are *pure and short* (a-e-i-o-u), unlike English diphthongized vowels — drill `hola, estás, llamo`. The `ll` sound.
- **Cognate bridge (Tagalog):** `presentar → ipresenta/presentasyon`, `favor → pabor`, `gracias → grasya` exists in Filipino. **False-friend warning:** Spanish `embarazada` = *pregnant*, NOT "embarrassed" (`avergonzado`). Tagalog `kumusta` *is* Spanish `¿cómo está?` — use this as the headline bridge: "Alam mo na ito!"

**3. Model dialogue (input scene — 35s audio, LatAm voices)**
> — ¡Hola! Buenos días. Me llamo Ana. ¿Y tú, cómo te llamas?
> — Hola, Ana. Me llamo Pedro. Mucho gusto.
> — Mucho gusto, Pedro. ¿De dónde eres?
> — Soy de Manila. ¿Y tú?
> — Yo soy de México. ¿Cómo estás hoy?
> — Estoy muy bien, gracias.

Cognates auto-highlighted; gist question (spoken): *"¿De dónde es Pedro?"*

**4. Controlled practice (guided speaking)**
- Substitution drill (spoken): "Me llamo ___" → learner inserts own name, then 3 given names.
- Transformation: turn statement → question ("Se llama Ana" → "¿Cómo se llama?").
- `ser`/`estar` choice aloud: "Yo ___ de Manila / Yo ___ bien." Instant flag if swapped.

**5. Communicative task (roleplay with Isabel)**
- **Scenario sim:** "Nasa isang networking event ka sa Makati." Isabel plays a stranger; learner must greet, introduce self (name + origin + job using `trabajar`), ask the stranger's name, and close politely. Unscripted; Isabel adapts. (SLA: scenario rehearsal = transfer-appropriate processing for real use.)

**6. Speaking assessment (formative, rubric-scored)**
- 60-second monologue: "Preséntate." + a 4-turn Q&A with Isabel.
- Scored on 5 criteria (Section 5); **≥ 70%** to advance. Sample bar at A1: intelligible despite L1 accent, correct `me llamo`/`soy`, can ask one question.

**7. Review**
- The 5 roots enter SRS (SM-2). `ser`/`estar` flagged for spiral re-test in Unit 3 and Unit 5.
- "Kumusta" cognate logged as a mastered bridge in the cognate map.

---

## 4. Speaking Mechanics to Add

Each mechanic states **what it is**, **what the learner does**, and **how it's assessed**.

### 4.1 Roleplay / Scenario Simulations
- **What:** Branching, persona-driven situations (market in CDMX, BPO customer call, doctor visit, ordering food, job interview) run by Isabel with a fixed goal the learner must achieve.
- **Does:** Learner converses to complete the task; Isabel improvises obstacles ("No hay café, ¿quiere té?").
- **Assessed:** Task completion (did they achieve the goal?) + interaction sub-score from the rubric. (SLA: situated, goal-directed practice transfers to real performance better than decontextualized drills.)

### 4.2 Shadowing
- **What:** Immediate repetition of native audio, line-by-line, matching pace and melody (used in daily loop step 2).
- **Does:** Listens → repeats within ~1s → sees waveform/pitch overlay vs. model.
- **Assessed:** Timing alignment + prosody match (not word accuracy) → feeds the pronunciation sub-score. (SLA: shadowing trains the phonological loop and suprasegmentals that isolated-word drills miss.)

### 4.3 Pronunciation Scoring + Feedback
- **What:** Phoneme/word-level scoring (ELSA-style) on every spoken utterance via forced-alignment STT.
- **Does:** Speaks; gets a color-coded per-word/per-phoneme score, a Tagalog tip, and a one-tap "say it again" repair.
- **Assessed:** Rolls into the pronunciation criterion; persistent low phonemes auto-create targeted SRS "say-it" cards. (SLA: salient, immediate phonetic feedback + repair drives pronunciation gains; delayed feedback does not.)

### 4.4 Turn-Taking Conversation
- **What:** Full-duplex voice with Isabel that rewards *initiating and sustaining* exchanges, not just answering.
- **Does:** Asks questions, reacts, takes the lead; barge-in allowed.
- **Assessed:** Interaction criterion — counts learner-initiated turns, repair moves, and back-channels. (SLA: interactional competence is a CEFR descriptor in its own right; answering ≠ conversing.)

### 4.5 "Día de Español" Immersion Tiers
A graduated immersion challenge — opt-in tiers that progressively raise the Spanish-only bar.
- **Tier 1 — Hora de Español:** one daily loop run with Tagalog hints hidden unless requested.
- **Tier 2 — Medio Día:** all UI prompts + Isabel stay in Spanish for a session; hints only on double-tap.
- **Tier 3 — Día Completo:** a full-day streak challenge — every interaction in Spanish, scenario sims back-to-back, zero L1 scaffolds.
- **Assessed:** Completion + average rubric score across the day's spoken tasks; awards an escalating badge and counts toward the summative readiness signal. (SLA: managed pushed-immersion raises output volume and automaticity without overwhelming the affective filter — tiers control the i+1 dose.)

---

## 5. Assessment & CEFR

### 5.1 Formative vs Summative
| | Formative | Summative |
|---|-----------|-----------|
| When | End of every unit (+ inside loops) | End of each CEFR sub-level |
| Stakes | Low — routes to practice | High — gates certification |
| Format | Mixed, ≥1 speaking task | OPI-style oral interview |
| Result | Pass ≥70% or remediate | Pass to certify; borderline → human review |

### 5.2 Oral Proficiency Rubric (criterion-referenced, 5 dimensions)
Each dimension scored **1–5**; weighted; mapped to CEFR/ACTFL. **No auto-100** — the AI judge must cite evidence (transcript spans) for each score, and a sample utterance is shown to the learner.

| Criterion | Weight | What it measures | 1 (low) ↔ 5 (high) anchor |
|-----------|:--:|------------------|---------------------------|
| **Fluency** | 20% | Flow, pace, pausing, automaticity | 1: word-by-word, long silences ↔ 5: smooth, near-native rhythm for level |
| **Accuracy** | 25% | Grammar & vocabulary correctness for level | 1: errors block meaning ↔ 5: control of level-appropriate forms |
| **Pronunciation** | 20% | Phonemes, stress, intonation, intelligibility | 1: hard to understand ↔ 5: clearly intelligible, accurate prosody |
| **Range** | 15% | Breadth of vocab & structures attempted | 1: memorized chunks only ↔ 5: flexible, varied for level |
| **Interaction** | 20% | Initiating, sustaining, repairing, turn-taking | 1: only responds ↔ 5: drives and repairs the conversation |

**Scoring rule:** weighted score → band. Example A1 pass = weighted ≥ 70% **and** no single criterion at 1. Pronunciation and Interaction are deliberately weighted heavily because they are exactly what passive-reading courses neglect. (SLA: analytic rubrics give reliable, defensible, *diagnostic* scores — learners see which dimension to improve.)

### 5.3 CEFR / ACTFL cross-walk
| CEFR | ACTFL (speaking) | Torna milestone |
|------|------------------|-----------------|
| A1 | Novice Mid–High | Modules 1–2 cert |
| A2 | Intermediate Low | Module 3–4 cert |
| B1 | Intermediate Mid–High | Module 5–6 cert |
| B1+ | Advanced Low (emerging) | Program capstone |

### 5.4 Roll-up to advancement & certificates
- **Loop → Unit:** each spoken step logs to `ti_v2_exercise_attempts`; unit formative aggregates.
- **Unit → Sub-level:** mastery model (`cefr-engine.js`) tracks rolling rubric averages across units; sustained ≥ pass bar unlocks the summative.
- **Summative → Certificate:** pass the OPI → CEFR certificate issued with the **full rubric breakdown** (so it's defensible to an employer/school). Fail → diagnostic report ("Accuracy 3/5 on past tense — repeat Unit 5–6") and a retake cooldown. Certificates can be revoked-by-design only by re-test; they are *earnable and failable*. (SLA: a credential's value is its difficulty to fake — criterion gating + transcript evidence makes it credible.)

---

## 6. Map to Build (features → exists / upgrade / build-new)

Status legend: **EXISTS** (v1 or v2 scaffold present) · **UPGRADE** (extend current) · **NEW** (build). Current assets confirmed: v1 `routes/{vocab,voice,courses,rizal,emperador,tutor}.js`, v1 pages (`CincoRaices, AITutor, TranslationAtelier, RizalModule, Emperador, CourseCatalog`); v2 scaffold (`v2/routes/{srs,isabel,conversation,lessons,xp,cognates,behavior}`, v2 pages, `cefr-engine.js`, `srs-engine.js`, `gamification.js`).

| # | Feature | Status | Where it lives / what to do | Phase |
|---|---------|--------|-----------------------------|:--:|
| 1 | Cinco Raíces SM-2 SRS | EXISTS | Keep engine (`srs-engine.js`, `srs.js`). | — |
| 2 | **Speak-the-answer SRS** (say it aloud before flip) | UPGRADE | Add audio-record + STT check to `SRSReview.jsx`; quality auto-suggested from pronunciation score. | **P1** |
| 3 | Embed vocab into context scenes (loop step 3) | UPGRADE | Surface SRS items inside model-dialogue sentences, not bare cards. | **P1** |
| 4 | Isabel text tutor | EXISTS | `isabel.js` / `IsabelChat.jsx`. | — |
| 5 | **Isabel full-duplex voice + turn-taking** | UPGRADE | Finish `conversation.js`/`ConversationRoom.jsx` (Whisper STT + ElevenLabs TTS, <2s); add barge-in. | **P1** |
| 6 | **Pronunciation scoring + feedback** | NEW | New `services/pronunciation.js` (forced-alignment STT → phoneme scores) + `components/PronScore.jsx`; Tagalog tips + repair. | **P1** |
| 7 | **Shadowing module** (loop step 2) | NEW | `components/Shadow.jsx` with waveform/pitch overlay; reuse audio + record stack. | **P1** |
| 8 | **Daily Speaking Loop orchestrator** (7 steps) | NEW | `pages/DailyLoop.jsx` + `services/loop-engine.js` sequencing input→shadow→vocab→guided→Isabel→feedback→review. | **P1** |
| 9 | **Unit template + authoring schema** | UPGRADE | Extend seed JSON to full unit (objectives/dialogue/tasks/assessment), not vocab-only; new `ti_v2_units` from `ti_lessons`. | **P1** |
| 10 | A1 "Presentaciones" gold unit | NEW | Author per Section 3.2 as the reference build. | **P1** |
| 11 | **Oral placement** (Stage B) | NEW | `routes/placement.js` (adaptive MCQ) + oral elicitation via Isabel; sets `cefr_level`. | **P2** |
| 12 | Adaptive comprehension placement (Stage A) | UPGRADE | Item-branching over existing seed bank. | **P2** |
| 13 | **Formative unit checks** (rubric-scored speaking) | NEW | `routes/assessment.js` + rubric engine; gate at 70%; remediation routing. | **P2** |
| 14 | **Oral rubric AI judge** (5-criterion, evidence-cited) | NEW | `services/oral-rubric.js` (Claude judge w/ transcript-span citations, no auto-100); human-review queue for borderline. | **P2** |
| 15 | **Roleplay / scenario simulations** | NEW | Scenario library + `services/scenario.js` driving Isabel personas; task-completion scoring. | **P2** |
| 16 | **Summative OPI-style oral exam** | NEW | `routes/oral-exam.js` structured interview flow; gates certificate. | **P3** |
| 17 | **CEFR certificate issuance** (w/ rubric breakdown) | UPGRADE | Extend `ti_v2_badges`/`user_badges` with cert sub-type + verifiable record. | **P3** |
| 18 | **Día de Español immersion tiers** | NEW | Tiered session modes + badges; hooks into loop + scenarios. | **P3** |
| 19 | Rizal Studies → spoken reflection (replace placeholder score) | UPGRADE | `rizal.js`: passage → 60s spoken reflection, pass/revise; co-curricular record, not language grade. | **P3** |
| 20 | Emperador leaderboard / XP / streaks | EXISTS | `emperador.js`, `gamification.js`; rebalance XP to reward *spoken* steps highest. | P3 (tune) |
| 21 | Translation Atelier (write→graded) | EXISTS | Keep as supplementary literacy track; clearly labeled non-speaking. | — |
| 22 | Legacy static Course Catalog ("30 min" readings) | RETIRE | Demote to optional "Lecturas" reference; remove "mark complete" credit toward the language certificate. | P3 |
| 23 | Tagalog-medium UI + cognate bridge | EXISTS/UPGRADE | `i18n/fil.js` + `cognates.js`/`CognateHighlight`; expand false-friend dataset; surface in every loop. | P1 (ongoing) |

### Phasing rationale (P1 ships "teach speaking" first)
- **P1 — Make it speak (highest impact):** features 2,3,5,6,7,8,9,10,23. After P1 a learner does the full speaking loop on the A1 gold unit with pronunciation feedback and voice Isabel. This alone closes the honest gap.
- **P2 — Make it credible:** features 11–15. Placement, rubric judge, formative gates, scenarios — assessment that can be failed.
- **P3 — Make it certify & immersive:** features 16–19, 22, plus XP rebalance — summative exam, CEFR certificates, immersion tiers, Rizal spoken reflection, retire passive catalog.

---

## 7. Tagalog-Medium Instruction + Filipino–Spanish Cognate Leverage

- **Explain in Tagalog/English, teach in Spanish.** All instructions, error explanations, can-do statements, and hints are Tagalog-first (English toggle). The *target language and all speaking* are Spanish. Tagalog scaffolds are progressively hidden via Día de Español tiers. (SLA: L1 support reduces cognitive load for low-proficiency learners, then is faded to force target-language processing.)
- **Cognate bridge as a first-class engine.** ~4,000 Spanish loanwords live in Filipino. The cognate engine (`cognates.js`/`CognateHighlight`) auto-highlights them in every scene and headlines the win: *kumusta ← ¿cómo está?, silya ← silla, mesa ← mesa, kabayo ← caballo, pamilya ← familia, grasya ← gracias, pabor ← favor*. (SLA: cognate awareness produces measurable, Filipino-specific lexical acceleration.)
- **False-friend guardrails.** Each unit flags traps: `embarazada ≠ embarrassed (= pregnant)`, `éxito ≠ exit (= success)`, `largo ≠ large (= long)`, `ropa ≠ rope (= clothes)`. Flagged inline during speaking with a Tagalog warning. (SLA: explicit negative-transfer warnings prevent fossilized cognate errors.)
- **Pronunciation contrasts framed from Filipino/English.** Spanish pure vowels vs English diphthongs; rolled `rr`; `b/v` merge; `ñ` (familiar to Filipino `niy-`). Pronunciation tips are written in Tagalog phonetic terms learners already know.

---

## Appendix — Net change vs v1 (one-paragraph summary for engineers)

v1 = passive reading + "mark complete" + isolated flashcards + text-leaning tutor. v2 per this blueprint = a **7-step daily speaking loop** (input→shadow→contextual vocab→guided talk→free voice conversation→pronunciation/grammar repair→spoken SRS), built on a **repeatable unit template** with a fully authored **A1 gold unit**, gated by **criterion-referenced oral assessment** (adaptive+oral placement → formative unit checks → summative OPI → CEFR certificate with rubric evidence), enriched by **roleplay sims, shadowing, pronunciation scoring, turn-taking, and Día de Español immersion tiers**, all delivered **Tagalog-medium with an explicit Filipino–Spanish cognate bridge**. P1 makes it speak; P2 makes it credible; P3 makes it certify.
