# Torna Idioma — Competitive & Pedagogical Research for a University-Grade AI Spanish Speaking Program

**Prepared for:** Digit2AI / Torna Idioma rebuild
**Date:** June 2026
**Scope:** Deep teardown of LanguaTalk, Speak, and Praktika + 6 contrast players; SLA/pedagogy and speaking-tech research; concrete, stack-aware build recommendations.

> **Methodology & honesty note.** Findings combine primary sources (vendors' own sites, engineering blogs, Microsoft/Azure docs, ACTFL/Instituto Cervantes, academic SLA literature) with reputable third-party reviews. Where a fact is vendor marketing, single-sourced, or unconfirmable, it is flagged inline as **[unverified]** or **[vendor claim]**. Pricing is a June 2026 snapshot and shifts with promos/region — re-confirm before quoting publicly. Most consumer vendors do **not** disclose their exact LLM/ASR/TTS stack; only Duolingo, Speak, and Praktika publish meaningful technical detail.

---

## 1. Executive Summary

The AI-speaking market has converged on one loop — **talk to an AI by voice → get feedback → review later** — but the leaders win on three separable axes, and **no single product does all three well**:

1. **Conversational realism (latency + voice quality).** The frontier is native speech-to-speech (OpenAI Realtime / gpt-realtime), giving sub-400ms turn-taking with interruption, versus the classic STT→LLM→TTS pipeline at >1.5s. **Speak** (OpenAI Realtime + a proprietary ASR trained on accented learner speech) and **Praktika** (ElevenLabs TTS + Whisper-on-Baseten at sub-300ms STT + GPT-5.2 multi-agent) lead here. **LanguaTalk/Langua** wins on *voice quality* (native-speaker-cloned TTS), praised as the most human-sounding in the category.

2. **Pronunciation diagnosis.** **ELSA Speak** owns this: proprietary ASR built for non-native speech, **per-phoneme scoring**, color-coded (green/yellow/red) feedback with tap-to-fix IPA + mouth/tongue guidance, research-backed (Interspeech 2016, SLATE 2023). Everyone else's pronunciation feedback is weak-to-absent; Talkpal's is independently rated inaccurate.

3. **Retention & structure (SRS + curriculum + assessment).** This is the **most exposed flank in the entire market.** Praktika has **no spaced repetition at all**. Speak's "Smart Review" is contested and has **no cross-session error tracking**. Langua has context-to-SRS but an **opaque algorithm and no structured CEFR ladder or placement test**. Only Pimsleur (graduated-interval recall), Duolingo (Half-Life Regression, open-sourced), Babbel (staged review), and Lingvist (adaptive KME) treat memory rigorously — and none of *those* are strong open conversation tutors.

**The strategic gap Torna Idioma should attack:** a product that combines (a) genuine low-latency conversation, (b) real pronunciation scoring, and (c) **the rigorous, university-grade structure everyone else skips** — a real adaptive placement test, a CEFR/ACTFL-mapped curriculum, longitudinal error tracking that recycles your *own* mistakes into FSRS-scheduled review, and formative→summative oral assessment aligned to DELE/SIELE. The retention + assessment + structure layer is where a "university-grade" program differentiates from consumer toys, and it is precisely where Claude (for tutoring, error diagnosis, and content/grammar/vocab scoring) plus a focused pronunciation API can beat better-funded incumbents.

A second strategic point: **feedback timing is an unsolved field-wide weakness.** Babbel, Duolingo, and Talkpal all deliver feedback *after* the conversation; real-time turn-by-turn correction during speech is rare. A tutor that corrects gently in-flow (Praktika-style recast) AND produces a deep post-call diagnostic is differentiating.

---

## 2. Competitor Teardown Table

Legend: ✓ = present/strong · ~ = partial/weak/contested · ✗ = absent · ? = unverified

| Product | Core loop | Speaking practice | ASR / Pronunciation | Feedback | SRS / Review | CEFR / Curriculum | Assessment | Gamification | Pricing (USD, ~2026) | Key strength | Key weakness |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **LanguaTalk / Langua** | Converse → mine vocab from transcript → review | ✓ Open chat, roleplay, debate, **shadowing**, custom; interruptible "Call Mode" beta | ~ "GPT-powered" **[unverified]**; **native-speaker-cloned TTS (best-in-class voice)**; ASR struggles w/ strong accents | ✓ Configurable: real-time + written + "more native" rephrase + audio/written post-call report + auto grammar drills | ~ Has SRS from saved transcript words; **algorithm undisclosed**; buggy for Mandarin | ✗ Mostly free-form/mode-driven; **no locked A1→C2 ladder** | ✗ No formal placement test (self-selected difficulty) | ✗ Deliberately minimal; only "Vocab & Games" | Std ~$19.99/mo (caps); Unlimited ~$29.99/mo; 5–7d trial; edu from ~$500/mo | Most human voices + richest configurable feedback | No beginner on-ramp, no curriculum/placement, opaque stack |
| **Speak** | Leveled course + AI tutor; high-rep spoken output | ✓ Tutor Q&A → Roleplay → Free Talk; **GPT-4o Realtime Live Roleplays** ("faster than a human") | ✓ **Proprietary ASR trained on accented L2 speech** + phonetic matching pipeline; in-lesson pronunciation feedback | ~ Instant line-by-line in-lesson; **post-convo summary shallow, NO cross-session error tracking** | ~ "Smart Review" marketed as SRS but **contested; no long-term vocab tracking** | ~ CEFR-aligned but **content cliff at intermediate/advanced**; thin upper levels | ~ Self-selected start; **no clear formal placement** | ~ XP "earn-by-value"; lighter than Duolingo | Premium $83.99/yr; Plus $164.99/yr; 7d trial | Speaking volume + realtime latency + L2 ASR moat; $1B-backed | Shallow feedback, weak SRS, advanced content cliff, mode silos |
| **Praktika** | Onboard → personalized path → spoken lesson w/ **animated avatar** | ✓ Avatar roleplay w/ defined role/setting/goal; **no audio-only mode** | ~ **Whisper on Baseten (sub-300ms STT)**; "0.1s lip-sync" **[vendor claim]**; users report mispronunciations/limited accents | ~ In-flow **recast** correction + grammar surfaced at end of exchange; weekly progress dashboard | ✗ **No spaced repetition; saved words never recycled** (biggest gap) | ~ CEFR A1–C1; best for A2–B2; over-relies on English at A1 | ✗ Self-selected CEFR level; no real adaptive placement | ? Streak/XP exist but **specifics unverified** | Single flat tier ~$8/mo headline; 7–14d trial; **3-mo min, dynamic pricing** | Polished avatar immersion + best-in-class voice infra (ElevenLabs+GPT-5.2) | No SRS, rigid scripts, avatar-only, billing/refund friction |
| **Pimsleur** | 30-min audio lessons; speak aloud from L1 | ✓ Active spoken production via prompts; **backchaining**; Voice Coach + AI Conversation Coach (beta, **ES-only**) | ~ Voice Coach ASR pronunciation feedback **[vendor undisclosed]**; record-and-compare fallback | ~ Anticipation self-assessment; Voice Coach where available; grammar feedback ES beta only | ✓ **Graduated Interval Recall** (1967), expanding intervals baked into audio | ~ ~50 langs; Levels of 30 lessons; CEFR ceiling ~B1–B2 **[reviewer est.]** | ✗ **No placement** — everyone starts Lesson 1 | ~ Light (badges/points 2025, streaks, mini-games) | Single $19.95/mo; All-Access ~$20.95/mo; Lifetime ~$299–475; 7d trial | Forces spoken production from minute one; hands-free; scientific SRS | Weak literacy/reading; no placement; partial AI coverage |
| **Babbel (Speak/Live/AI)** | Classroom-style 10–15 min lessons | ~ **Babbel Live human classes DISCONTINUED for individuals Jul 2025**; **Babbel Speak** AI voice trainer (28 scripted scenarios, beta, ~5 langs) | ✓ "AI-enhanced" ASR trained on own audio (correct+incorrect, accents); real native-speaker dialogues (not TTS) | ~ Real-time pronunciation; **conversation feedback delivered AFTER**; in-lesson grammar pop-ups | ✓ **Review Manager** explicit stages: 1d→4d→7d→14d→60d→6mo | ✓ A1–C1 (5 levels); 14 langs; ES/FR/DE/IT deepest | ✓ Auto placement quiz (retakeable, "quick quiz") | ✗ Minimal by design ("classroom not game") | Mo $14.99; 12-mo ~$7.99/mo; Lifetime ~$249–299 | Pedagogical structure + native dialogue + disciplined CEFR SRS | Killed human classes; AI replacement scripted, ~5 langs, post-hoc feedback, model undisclosed |
| **Duolingo Max** | Gamified path; XP/streaks/hearts; "Birdbrain" ML | ~ **Video Call w/ Lily (GPT-4o)** + **Roleplay (GPT-4)**; reviewers call calls novelty/short | ✓ Dedicated ASR+TTS teams; real-time voice | ✓ Explain-My-Answer (GPT) + post-session accuracy/complexity feedback | ✓ **Half-Life Regression** (open-sourced, ACL 2016); resurfaces "before you forget" | ✓ A1→B2 (B1 in dev); CEFR courses for major langs | ✓ In-app adaptive placement; separate **Duolingo English Test** (proctored, CEFR-mapped) | ✓ **Best-in-class**: XP, streaks, Leagues, hearts, gems | Super ~$6.99/mo annual; **Max $29.99/mo or ~$168/yr** | Best gamified engagement (50M+ DAU) + GPT feedback | Speaking shallow vs. marketing; limited langs; $30/mo for Max |
| **Talkpal** | Conversation-first immersion; **no structured courses** | ✓ Voice/Call, Roleplay, **Debate**, Photo, Characters | ~ "GPT-4 powered" **[self-branded, unverified]**; **pronunciation feedback rated inaccurate**, robotic TTS | ~ Grammar incidental only; **weak post-convo analysis (generic daily recap)** | ✗ **No reliable SRS** (marketing only) | ~ ~57 langs; references A1–C2 but **no CEFR ladder**; too simple at B2+ | ~ Light AI-conversation tests | ~ Shallow points/badges | Free ~10 min/day; ~$9.99–14.99/mo; annual ~$5/mo | Breadth + naturalness of unscripted modes | Thin feedback/structure; "why pay vs free ChatGPT voice?" |
| **ELSA Speak** | Listen → record → **per-phoneme score** → fix red sounds → retry | ~ Drills + **AI Conversationalist** roleplay + IELTS prep (**English only**) | ✓✓ **Best-in-class: proprietary accented-speech ASR, per-phoneme scoring, 95%+ claimed, research-backed** | ✓ **Green/Yellow/Red** per-phoneme + tap-to-fix IPA + mouth/tongue videos | ? Adaptive re-surfacing; **no documented formal SRS** | ~ English only; maps CEFR A1–C2 + IELTS/TOEFL | ✓ "ELSA Score" placement (3 of 5 skills) → CEFR/IELTS | ~ Light challenges/contests | Pro $11.99/mo or $59.99/yr; Lifetime ~$89–175 | Granular phoneme-level pronunciation diagnosis (the reference standard) | English-only, no Spanish; IPA too technical for beginners; weak grammar/vocab |
| **Lingvist** (SRS angle) | Fill-in-blank context flashcards, frequency-ordered | ✗ Vocab-focused; minimal speaking | ✗ Not a speaking product | ~ Correctness only | ✓ **Adaptive "Knowledge Mapping Engine"** (personalizes from aggregate forgetting curve; ACT-R-attributed **[unverified]**) | ~ Frequency-based, mature courses few | ✓ ~50-word placement predicts 2,000+ words | ✗ Minimal | ~$9.99/mo or $79.99/yr | Efficient high-frequency vocab acquisition | Vocab-only; "teaches in a vacuum"; weak for true beginners |

---

## 3. What Makes the Best Ones Effective at Producing SPEAKERS

Distilling across the leaders, the mechanisms that actually move oral proficiency:

1. **Volume of spoken output, early and often.** Speak's entire thesis ("speak more than any other app," 1B+ sentences) and Pimsleur's "produce from lesson 1" both operationalize **Swain's Output Hypothesis** — production forces syntactic processing you can skip when only listening. Apps that front-load *output* (not just comprehension) produce speakers faster. Krashen's comprehensible input is necessary but, per Swain's own French-immersion finding, **not sufficient** for speaking.

2. **Low-latency, interruptible turn-taking.** Conversation feels real only under ~400–700ms response and the ability to barge in. Speak's GPT-4o Realtime and Praktika's sub-300ms STT make practice psychologically "live," which sustains the volume in #1. The classic pipeline (>1.5s) feels like a walkie-talkie and depresses output.

3. **Scenario/task framing over free chat.** Praktika (defined role/setting/goal per avatar), Speak (roleplay tasks to complete), and Langua (interview/doctor/business roleplays) embody **Task-Based Language Teaching** — a communicative goal forces target vocabulary/grammar into use, which open chat does not guarantee. "Order at the café and get the bill split" produces more usable language than "chat about anything."

4. **The right feedback at the right moment.** Praktika's gentle **recast** (restate correctly without breaking flow) protects confidence and lowers Krashen's affective filter; Langua's *configurable* correction (subtle vs. explicit, in-flow vs. post-call) lets the learner control desirable difficulty. The winners separate **fluency practice** (don't interrupt) from **accuracy work** (post-call diagnosis) instead of doing both badly at once.

5. **Pronunciation made visible and fixable.** ELSA's per-phoneme green/yellow/red + tap-to-fix IPA + articulatory guidance turns an invisible skill into a measurable, improvable one. Most conversation apps ignore pronunciation entirely; this is a real differentiator and a genuine pedagogical lever (noticing → correction → re-attempt).

6. **Spacing that beats forgetting.** Pimsleur (graduated-interval recall) and Duolingo (Half-Life Regression — schedule the review just before predicted forgetting) win long-term retention. The apps that are great at *conversation* (Praktika, Speak, Talkpal) are weak-to-absent at *retention* — which is why learners plateau.

**The synthesis no incumbent has nailed:** comprehensible input (i+1) + abundant scenario-driven output + interactional feedback (recast in-flow, diagnose post-call) + visible pronunciation correction + spaced recycling of *the learner's own errors and vocabulary*. Owning that full chain is the route to actually "producing speakers."

---

## 4. Must-Have Feature Set for a University-Grade AI Spanish Speaking Program

Grouped by pedagogical function. "University-grade" means it can carry placement, instruction, formative feedback, and defensible summative assessment.

**A. Diagnostic & placement (table stakes that most rivals SKIP)**
- **Adaptive oral placement test** that produces a CEFR (A1–C2) and ACTFL (Novice–Superior) estimate from a short spoken sample + adaptive questions. (Speak, Praktika, Talkpal all lack a rigorous one — easy win.)
- Skill-disaggregated profile (speaking fluency, pronunciation, grammar accuracy, vocabulary range, listening) à la ELSA Score, not a single number.

**B. Structured, CEFR/ACTFL-mapped curriculum**
- A real A1→C1 ladder of **can-do statements** ("I can order food and ask for the bill"), each tied to scenarios and target structures — the spine Langua/Talkpal lack and Speak thins out at upper levels.
- Spanish-specific content: ser/estar, subjunctive, preterite vs. imperfect, por/para, gendered agreement, and **dialect/register awareness** (LatAm vs. peninsular, tú/usted/vos) — this is a Spanish-program credibility marker.

**C. Speaking practice engine**
- **Three guidance tiers** (guided Q&A → scenario roleplay → free conversation), Speak-style, so learners scaffold up.
- **Task-based scenarios** with explicit communicative goals; suggested replies + slower TTS for beginners, full natural speed for advanced.
- **Interruptible, low-latency voice** with barge-in.
- **Shadowing** drills (Langua-style) for prosody/fluency.
- Optional **debate mode** (Talkpal-style) for advanced output stretch.

**D. Feedback (the depth incumbents lack)**
- **In-flow gentle recast** during fluency practice (don't break the conversation).
- **Deep post-call diagnostic report**: grammar errors with explanations, vocabulary range, pronunciation issues, "more native" rephrasings, and a fluency metric — text **and** audio.
- **Pronunciation scoring** at word/phoneme level with visual color feedback and articulatory tips (ELSA-grade ambition; see §5 for feasibility).
- **Longitudinal error log** that tracks recurring mistakes *across sessions* (Speak's #1 gap) and drives targeted remediation.

**E. Retention / spaced repetition (the market's biggest open flank)**
- **FSRS-scheduled review** of (1) vocabulary mined from the learner's own transcripts and (2) **their own error patterns** — recycle real mistakes back into practice. Praktika has zero SRS; beating this is straightforward and high-impact.
- Context-based cards (full sentences from real conversations), not isolated words (Lingvist/Langua principle).

**F. Assessment & certification readiness**
- **Formative** can-do self-checks throughout; **summative** periodic oral exams scored to CEFR/ACTFL descriptors.
- **DELE/SIELE alignment**: practice tasks mirroring SIELE "Oral expression and interaction" and DELE speaking sections so the program credibly prepares learners for the recognized Spanish certifications (Instituto Cervantes).
- Exportable progress transcript / certificate of level — important for the **university (UVEG/Makati) partnership** context.

**G. Motivation (calibrated, not gimmicky)**
- Streaks/XP tied to *meaningful* output (Speak's "earn-by-value," not Duolingo's streak-for-streak). University learners tolerate less candy; reward minutes-spoken and accuracy gains.

**H. Accessibility / modality**
- **Audio-only / hands-free mode** (Praktika's gap; Pimsleur's superpower) for commute practice.
- Mobile + web; works on the existing Torna Idioma React SPA.

---

## 5. Technology Approaches — Flagged by Feasibility With OUR Stack

Our current/available stack: **Anthropic Claude** (tutor LLM, already wired per recent commits — `claude-sonnet-4-6`), **neural Edge TTS** (already integrated), **browser `SpeechRecognition` (Web Speech API)** available, and the **option to add a cloud ASR/pronunciation API**.

### 5.1 The conversation pipeline (STT → Claude → TTS)

**What we can build today (HIGH feasibility):** Browser `webkitSpeechRecognition` → text → Claude (tutor persona + scenario system prompt) → neural Edge TTS audio back. This is the classic pipeline.
- **Trade-off — latency.** Pipeline latency is **>1.5s** end-to-end (STT 200–500ms + Claude generation + TTS synthesis), vs. **<400ms** for native speech-to-speech systems (OpenAI gpt-realtime, Gemini 2.5 Flash). Anthropic does **not** currently offer a native speech-to-speech Realtime API, so we **cannot match Speak's "faster than a human" turn-taking with Claude alone.**
- **Mitigations:** stream Claude tokens into a streaming TTS as they arrive (start speaking before the full reply is generated); keep replies short; use VAD for snappy endpointing; pre-warm connections. Realistic target ~700ms–1.1s perceived — good enough for tutoring, not quite "live phone call."
- **Trade-off — browser ASR quality.** Web Speech API supports `es-ES`/`es-MX` but: it is **server-based** (Chrome→Google, Edge→Azure; won't work offline), **inconsistent accuracy**, **no DPA/uptime guarantee**, weak on **heavily-accented L2 speech** — exactly our users. Firefox is effectively unsupported; Safari needs the webkit prefix. **Recommendation:** ship browser ASR for the MVP/free tier, but plan a **cloud ASR** path (Azure Speech, Whisper, or Deepgram) for accuracy and for the pronunciation features below.

### 5.2 Pronunciation assessment (the ELSA-grade ambition)

This is where to add **one cloud API**. **Azure Pronunciation Assessment** (part of Azure AI Speech) is the most production-ready option and a strong fit:
- Returns **Accuracy, Fluency, Completeness, Prosody** + an overall **PronScore**, at **phoneme / syllable / word / full-text** granularity — i.e., ELSA-grade per-phoneme scoring without building ASR.
- **Spanish supported** (`es-ES`, `es-MX`; docs recommend trying both and using the higher-scoring locale).
- **Two modes:** *scripted* (reading scenario — set `ReferenceText`, get miscue/Omission/Insertion detection) and *unscripted* (speaking scenario — no reference text).
- **Streaming mode** with unlimited recording length; pause/resume supported. **JavaScript SDK exists** (`pronunciationAssessment.js` samples) → usable from our React front end.
- **Pricing:** same as Azure speech-to-text (Standard/commitment tier); pronunciation spend counts toward the STT commitment — cost is predictable and modest.

**Two critical caveats for our design:**
1. **Prosody assessment is `en-US`-only.** For Spanish we get Accuracy + Fluency + (Completeness in scripted mode) but **not** the Prosody score. Plan pronunciation feedback around accuracy/fluency for Spanish; don't promise prosody scoring we can't deliver.
2. **For unscripted speech, Azure uses a different (weaker) STT than its main engine.** Microsoft's own recommended pattern: **call a high-accuracy STT first to get the reference text, then run *scripted* pronunciation assessment against it.** This is the architecture we should adopt for free-conversation pronunciation scoring.

**Browser-only pronunciation scoring is NOT feasible** at ELSA/Azure quality — there is no client-side phoneme scorer. The realistic split: **browser ASR for casual practice; Azure Pronunciation Assessment (cloud) for graded pronunciation work and assessments.**

### 5.3 Content / grammar / vocabulary scoring — **Claude's home turf (HIGH feasibility, low cost)**

A key finding from the Azure docs: for **content assessment (vocabulary, grammar, topic relevance)** of spoken transcripts, **Azure itself tells you to hand the transcript to an LLM** (their example uses `gpt-4o` with a grading prompt returning `{vocabulary, grammar, topic}` 0–100). **We do this natively with Claude** — no extra vendor. So:
- **Claude = tutor + grammar/vocab/topic scorer + error-pattern extractor + post-call report generator + recast engine.** This is the cheapest, highest-leverage part of the whole build and directly attacks Speak's "shallow feedback / no cross-session tracking" weakness.
- Persist Claude's per-turn error extractions to a DB → that becomes the **longitudinal error log** and the **FSRS card source**.

### 5.4 Spaced repetition (HIGH feasibility, build in-house)

- Implement **FSRS** (Free Spaced Repetition Scheduler) — open-source, three-variable memory model (difficulty/stability/retrievability), needs **20–30% fewer reviews than SM-2** for the same retention, and is now Anki's default. Open-source ports exist in multiple languages; this is a DB-table + scheduler, no external API.
- Cards generated from (a) transcript-mined vocabulary and (b) the learner's own error patterns from §5.3. **This single feature beats Praktika (no SRS) and Speak (no cross-session tracking) outright.**

### 5.5 TTS quality

- Neural Edge TTS (already integrated) is **free and good enough** for the tutor voice and is a defensible MVP choice. **Trade-off:** Langua's native-speaker-cloned voices and Praktika's ElevenLabs voices sound more human and lifted Praktika's session length +15%. If voice quality becomes a churn factor, ElevenLabs (or Azure neural voices with es-MX/es-ES Spanish) is a drop-in upgrade for premium tiers. For Spanish, ensure dialect-appropriate voices (LatAm vs. peninsular).

### 5.6 Assessment alignment (process, not tech)

- **CEFR ↔ ACTFL ↔ DELE/SIELE** mapping is a content/design task, not an integration. ACTFL OPIc itself reports on ACTFL **and** CEFR (A1–C2) scales — use those public descriptors to drive Claude's rubric for oral scoring. SIELE (A1–C1, all-digital, CEFR-scored) and DELE (A1–C2, pass/fail) are the recognized Spanish certs (Instituto Cervantes) to align practice tasks toward.

### Feasibility summary

| Capability | Feasibility w/ our stack | Approach |
|---|---|---|
| Conversational tutor (text/voice) | **HIGH (now)** | Claude + Edge TTS + browser ASR |
| Low-latency "live" turn-taking (<400ms) | **LOW** | No Anthropic speech-to-speech; mitigate via streaming TTS (~0.7–1.1s) |
| Grammar/vocab/topic scoring | **HIGH (now)** | Claude (Azure's own recommended pattern) |
| Longitudinal error tracking | **HIGH (now)** | Persist Claude extractions to DB |
| Spaced repetition | **HIGH (build)** | FSRS in-house |
| Per-phoneme pronunciation scoring | **MEDIUM (add API)** | Azure Pronunciation Assessment (es-ES/es-MX; **no prosody in Spanish**; STT-first-then-scripted for free speech) |
| Adaptive oral placement | **MEDIUM–HIGH** | Claude-driven adaptive questioning + Azure pronunciation + rubric → CEFR/ACTFL |
| Native-grade TTS voices | **HIGH (add API)** | ElevenLabs / Azure neural for premium |

---

## 6. Prioritized Recommendations for Torna Idioma (build order)

**Phase 0 — Foundations (re-confirm + spike).**
- Re-test the live LanguaTalk/Speak/Praktika apps hands-on to confirm the **[unverified]** items (LLM/TTS vendors, SRS algorithms, placement tests).
- Spike the **streaming Claude → streaming Edge TTS** path and measure real perceived latency; this gates the conversation UX.

**Phase 1 — The conversational core + the feedback Claude already enables (highest leverage, lowest external cost).**
1. **Three-tier speaking engine** on Claude + Edge TTS + browser ASR: guided Q&A → scenario roleplay → free talk, with **task-based Spanish scenarios** (café, doctor, interview, market — with tú/usted/vos register tags).
2. **In-flow recast + deep post-call diagnostic report** (grammar, vocab range, "more native" rephrasings) — Claude-generated, text + audio. This alone beats Speak/Talkpal on feedback depth.
3. **Longitudinal error log**: persist Claude's per-turn error extractions to PostgreSQL. This is the data spine for everything later.

**Phase 2 — Retention (beat the market's biggest gap).**
4. **FSRS spaced repetition** over transcript-mined vocab + the learner's own errors. Context-sentence cards. This is the single clearest differentiator vs. Praktika (no SRS) and Speak (no cross-session tracking).

**Phase 3 — Structure & placement (make it "university-grade").**
5. **CEFR/ACTFL can-do curriculum spine** (A1→C1) with Spanish-specific grammar progression and scenarios mapped to each level.
6. **Adaptive oral placement test** → CEFR + ACTFL estimate + skill-disaggregated profile.

**Phase 4 — Pronunciation (add the one cloud API).**
7. Integrate **Azure Pronunciation Assessment** (es-ES/es-MX) for word/phoneme accuracy + fluency with green/yellow/red visual feedback and tap-to-fix tips. Use **STT-first-then-scripted** for free-speech scoring. Set expectations: **no prosody score in Spanish.** Gate behind a paid tier (cost control).

**Phase 5 — Assessment, certification & polish.**
8. **Periodic summative oral exams** scored to CEFR/ACTFL via Claude rubric; exportable level transcript/certificate (for the UVEG/Makati university partnership).
9. **DELE/SIELE-aligned practice tasks** (mirror SIELE oral expression & interaction).
10. **Calibrated motivation** (minutes-spoken + accuracy-gain XP), **audio-only hands-free mode**, and **premium TTS voices** (ElevenLabs/Azure neural, dialect-correct) as upsells.

**What NOT to over-invest in early:** chasing sub-400ms "live phone call" latency (Anthropic can't natively deliver it — diminishing returns vs. streaming mitigation); heavy Duolingo-style gamification (wrong fit for university learners); building our own ASR/pronunciation engine (Speak/ELSA spent years and $ — buy Azure instead).

**The one-line strategy:** *Win on the structure, feedback depth, retention, and assessment rigor that every well-funded conversation app skips — using Claude for the brain and one pronunciation API for the ears — rather than trying to out-spend Speak/Praktika on raw conversational latency.*

---

## 7. Sources

**Primary competitor sources**
- LanguaTalk / Langua — https://languatalk.com/ , https://languatalk.com/try-langua , https://support.languatalk.com/article/142 , /article/143 , /article/136 , /article/152
- Speak — https://www.speak.com/ , ASR engineering: https://www.speak.com/blog/asr-levelup , Live Roleplays/Realtime: https://www.speak.com/blog/live-roleplays , speech matching: https://www.speak.com/blog/matching-v2 , Series C ($1B): https://www.speak.com/blog/series-c , Series B (OpenAI fund): https://www.speak.com/blog/speak-announces-27m-series-b-led-by-openai-startup-fund , help: https://help.speak.com/en/articles/5358417 , https://help.speak.com/en/articles/8880569
- Praktika — https://praktika.ai/ , OpenAI case study (GPT-5.2 multi-agent): https://openai.com/index/praktika/ , ElevenLabs case study: https://elevenlabs.io/blog/praktika-scales-immersive-language-learning-with-elevenlabs-tts , Baseten/Whisper sub-300ms: https://www.baseten.co/resources/customers/praktika/ , Series A: https://techcrunch.com/2024/05/22/praktika-raises-35-5m-to-use-ai-avatars-to-make-learning-languages-feel-more-natural/
- Pimsleur — https://www.pimsleur.com/the-pimsleur-method , graduated interval recall: https://www.pimsleur.com/blog/why-graduated-interval-recall
- Babbel — https://uk.babbel.com/ (Babbel Speak press), https://support.babbel.com/ (Review Manager, AI Conversation), Babbel Live discontinuation: https://strommeninc.com/ , https://www.change.org/
- Duolingo — Video Call/GPT-4o launch: https://investors.duolingo.com/ , Roleplay/GPT-4: https://openai.com/index/duolingo , Half-Life Regression: https://research.duolingo.com/ , https://github.com/duolingo/halflife-regression , Duolingo English Test (CEFR): https://englishtest.duolingo.com/
- Talkpal — https://talkpal.ai/ , https://en.wikipedia.org/wiki/Talkpal_AI
- ELSA Speak — https://elsaspeak.com/ , efficacy/accuracy: https://elsaspeak.com/en/efficacy , API: https://elsaspeak.com/en/elsa-api , research: Interspeech 2016 & SLATE 2023 (ISCA Archive)
- Lingvist — https://lingvist.com/ , https://lingvist.com/blog/spaced-repetition-in-learning/

**Pedagogy (SLA)**
- Krashen Input Hypothesis (i+1) — critical review: http://jehd.thebrpi.org/journals/jehd/Vol_4_No_4_December_2015/16.pdf
- Swain Output Hypothesis — overview: https://vietnamteachingjobs.com/blog/what-is-swains-output-hypothesis-and-why-does-it-matter-for-language-learning/ ; critique (PDF): https://www.researchgate.net/publication/375608465
- Interaction Hypothesis (Long) / instructed SLA — Cambridge: https://www.cambridge.org/core/journals/language-teaching/article/interaction-and-instructed-second-language-acquisition/78A156EE200F744F5978F99BFB073DBE
- Fundamental SLA theories (input/output/interaction synthesis): https://www.davidpublisher.com/Public/uploads/Contribute/610217e179c07.pdf

**Speaking-specific technology**
- Azure Pronunciation Assessment (scores, granularity, es-ES/es-MX, scripted vs unscripted, streaming, JS SDK, prosody=en-US only, content scoring via LLM): https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment ; transparency note: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/transparency-note-pronunciation-assessment ; pricing: https://azure.microsoft.com/pricing/details/cognitive-services/speech-services
- Web Speech API (SpeechRecognition) browser support / es-ES / server-based / accuracy limits: https://www.assemblyai.com/blog/speech-recognition-javascript-web-speech-api , https://www.testmuai.com/learning-hub/speech-recognition-api-browser-support/
- Real-time speech-to-speech vs STT→LLM→TTS latency (<400ms vs >1.5s), turn detection, interruption: https://openai.com/index/introducing-gpt-realtime/ , https://inworld.ai/resources/best-speech-to-speech-apis , https://www.latent.space/p/realtime-api

**Spaced repetition**
- FSRS vs SM-2 (memory model, 20–30% fewer reviews, Anki default 23.10): https://faqs.ankiweb.net/what-spaced-repetition-algorithm , https://deepwiki.com/open-spaced-repetition/fsrs-optimizer/7.3-comparison-with-sm-2 , https://github.com/open-spaced-repetition/fsrs4anki
- Duolingo Half-Life Regression (ACL 2016, open-sourced): https://github.com/duolingo/halflife-regression
- Pimsleur Graduated Interval Recall: https://www.pimsleur.com/blog/why-graduated-interval-recall

**Assessment & certification**
- ACTFL OPI / OPIc (Novice–Superior, reports ACTFL+CEFR A1–C2): https://www.actfl.org/assessment-research-and-development/actfl-assessments/actfl-postsecondary-assessments/oral-proficiency-interview-opi , https://www.languagetesting.com/oral-proficiency-interview-by-computer-opic , ACTFL Proficiency Guidelines 2012
- DELE / SIELE (Instituto Cervantes; CEFR alignment; DELE A1–C2 pass/fail, SIELE A1–C1 CEFR-scored digital): https://www.cervantes.org/ , https://nyork.cervantes.es/en/spanish_exams/spanish_exams_info.htm , https://cursosinternacionales.usal.es/en/what-difference-between-siele-and-dele

**Could not verify (re-confirm by hands-on testing):** exact LLM/TTS/ASR vendors for Langua, Babbel, Talkpal; SRS algorithms for Langua/ELSA; formal placement tests for Speak/Praktika/Talkpal; Praktika gamification specifics; ELSA ASR internals (DTW vs neural); the "GPT-5 Duolingo speech tool" third-party claim (treat as **false** — not in any official source); all live 2026 prices/region variants; Praktika's "0.1s lip-sync" (vendor claim, conflicts with verified sub-300ms STT).
