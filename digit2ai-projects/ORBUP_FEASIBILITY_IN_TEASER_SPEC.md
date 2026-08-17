# OrbUp / Torna — Project Design Studio — Enhanced Build Brief (Dev Prompt)

**Status:** SPEC ONLY — no implementation in this document. Hand to `/ringlypro-architect` or a senior Node dev as the complete requirements.
**Applies to BOTH brands:** OrbUp (orbup.app) and Torna (torna.dev) — same engine, same backend; only theme differs (OrbUp violet, Torna red).
**Owner:** Digit2AI.

---

## 0. THE OBJECTIVE (what we're building and why)

Turn the OrbUp/Torna teaser link from a one-way preview into a **Project Design Studio** — a Claude-Artifacts / ChatGPT-Canvas-style experience for a prospect's *own* application. In one magic link a prospect can:

1. **Describe** their idea — by voice (orb), typing, or attaching a document/email.
2. **See it** — an interactive **teaser** + a clickable **simulator** of the app.
3. **Read its feasibility** — a client-safe **Feasibility & Build Plan** (fit, scope, phased roadmap, timeline, risks-we-manage, investment) derived from our internal AI Triage + Premortem.
4. **Design it** — a conversational **Plan Copilot** (like Claude/ChatGPT) where they ask questions and edit the plan in natural language ("add a mobile app," "cut it to a 2-week MVP," "make it bilingual"), and the plan **rewrites itself live** on a canvas, with visible diffs and version history.
5. **Decide** — when the plan is right, **"Build this"** (books a call, carrying the *refined* scope) or **"Refine later."**

**The north-star experience:** a living document you talk to. Left = the plan (a canvas that updates as you chat) + the simulator. Right = the chat. The prospect walks away *knowing whether it's feasible for them to build* — because they watched the plan respond to their own choices.

**Cost target (measured):** base analysis ~$0.18/project (triage $0.08 + premortem $0.10). A full design session (Copilot, Haiku) ~$0.10–0.50. **All-in per fully-engaged prospect ~$0.30–$0.70**, hard-capped so it can never run away.

---

## 1. WHAT ALREADY EXISTS (reuse — do not rebuild)

- **Funnel:** identity gate (name/email/phone/lang, required) → `POST /projects/api/v1/intake/public/request` creates a `d2_projects` row → **auto-triage ~3s later** (`intake.js:301`, `inboxTriageAgent`, `claude-sonnet-4-6`) → `POST /public/teaser/:projectId` builds teaser JSON + embedded simulator (`voiceTeaserGenerator`) → served at `GET /projects/teaser/:token` (`teasers.js renderTeaserPage`, token = `crypto.randomUUID()`).
- **Triage data on the project row:** `triage_structured` (JSONB): `fit_score`(1–10), `fit_reasoning`, `problem_in_our_words`, `go_no_go_recommendation`(go/poc/no), `wedge_recommendation`, `regulatory_flags[]`, `portfolio_synergies[]`, `monetization_options[]`, `competitors_to_watch[]`, `conditions_if_any[]`, `stakeholder_questions_en/es[]`.
- **Premortem (manual today):** `premortemAgent` (`claude-sonnet-4-6`, `POST /api/v1/agents/premortem/:id`) → `failure_modes[]` (title, category, scenario, base_rate, likelihood/danger/prevention ranks) + mitigations + `verdict`(GO/RESHAPE/DECLINE).
- **Chat brain pattern:** `/api/voice-agent/chat` (Claude Haiku, context-from-context) + on-device Web Speech dictation (used by the orb). Reuse both for the Copilot.
- **Booking (hardened):** `/public/book/:id` (rate-limited, E.164-validated, SMS-confirmed).
- **Cost model:** Sonnet 4-6 `$3/M in, $15/M out`; Haiku `$1/M in, $5/M out`.

**House rules (MUST follow):** bilingual EN/ES (proper Spanish orthography), emoji-free, Cloudflare ~100s ceiling (no long sync endpoints — everything AI is async/polled), degrade gracefully with no `ANTHROPIC_API_KEY` (labeled heuristic, never fabricate), IDOR-safe (token-scoped, never enumerable ids), public endpoints rate-limited on `CF-Connecting-IP` + per-token + per-day caps, weeks-not-months, feature-flag everything default-safe.

---

## 2. THE EXPERIENCE (the north star — a heavy user's session)

Split view on the teaser page: **Left = the living Plan + simulator + teaser. Right = the Copilot chat.**

1. Prospect describes the idea (voice/type/attach) → teaser + simulator + first Plan appear (plan lazy-loads while triage runs).
2. Reads the Plan: feasibility score, v1 scope, phased roadmap, timeline, "risks we plan around," investment band.
3. Converses, and the canvas reacts to each message:
   - "Summarize in 3 bullets" / "why 4 weeks?" → chat **answers**, plan unchanged.
   - "Add a customer-facing mobile app" → plan **rewrites live**; banner: *"Added: mobile app → Phase 2. Timeline 4→6 wks. Investment adjusted."*
   - "Too much — cheapest useful version" → plan **shrinks**, timeline/cost drop, feasibility note updates.
4. Every step shows the **current, true state** — with **version history, undo, and reset-to-original** (like regenerating an artifact).
5. As scope changes, **feasibility/timeline/investment move**, so the prospect *feels* the tradeoffs.
6. When it's right → **"Build this"** carries the *refined* plan into the build + booking.

---

## 3. THE CLIENT-SAFE PROJECTION (the safety core)

One pure function `clientPlanFromTriage(project, teaser, lang)` transforms internal `triage_structured` + `premortem_structured` into a client-safe plan. **ALLOWLIST, not denylist:** the plan is assembled key-by-key from named safe fields; anything unmapped can never appear (same discipline as the CV engine's `applyPrivacy`).

### Projection policy (per field)
| Internal field | Client plan treatment |
|---|---|
| `problem_in_our_words` | **SHOW** — "The problem, in our words." |
| `fit_score` | **SHOW reframed** as **Feasibility/Fit** with positive label (7→"Strong fit"). Never an internal go/no-go. |
| `fit_reasoning` | **SHOW sanitized** (scrubber, §3c). |
| `wedge_recommendation` | **SHOW** — "Recommended first build (v1)." |
| `regulatory_flags[]` | **SHOW reframed** as "Key considerations to address" (drop internal severity). |
| timeline / delivery window | **SHOW** — phased roadmap, weeks (≤~4 for a PoC). |
| success metrics | **SHOW** — "What success looks like." |
| premortem `failure_modes[]` + mitigations | **SHOW reframed** as "Risks we plan around" (risk + *our* mitigation; drop base-rate %s and "the company failed" framing). |
| investment range | **SHOW (Phase 2)** — from the client `quote` (cost ×1.70 + IVA); never internal `cost`. |
| two next steps | **SHOW** — "Build this" / "Refine." |
| `go_no_go_recommendation`, premortem `verdict` | **HIDE from body**; drive the gate (§3b). |
| `conditions_if_any[]` | **REFRAME → "What we'll need from you"** (client-actionable only; drop governance). |
| `monetization_options[]` | **HIDE always** (your pricing strategy). |
| `portfolio_synergies[]` | **HIDE** (internal GTM) — default. |
| `competitors_to_watch[]` | **OPTIONAL** "Landscape we account for" (default HIDE). |
| conflict-of-interest / governance | **HIDE always** (allowlist guarantees). |

### 3b. Verdict gate (never printed)
- **GO/strong** → primary CTA "Move forward — book your build call."
- **RESHAPE/conditional** → plan shown; CTA becomes "Let's refine this together — book a scoping call"; emphasize "What we'll need." Never shows the word RESHAPE.
- **DECLINE/poor fit/hard legal block** → **no auto build-plan CTA**; show "This needs a conversation before we scope a build" + book-a-call. **Never fabricate a rosy plan for a no.**

### 3c. Scrubber (defense in depth)
Over allowlisted free-text: neutralize sentences mentioning submitter-as-principal / conflict-of-interest, any dollar figure matching a `monetization_options` value, the words decline/RESHAPE/go-no-go, and internal-severity tokens. Empty-after-scrub → omit, don't stub. The scrubber is the net; the allowlist is the control.

---

## 4. THE TEASER PAGE BECOMES THE STUDIO

Extend `teasers.js renderTeaserPage` into a two-pane Studio (responsive: stacks on mobile, side-by-side ≥900px), brand-themed (OrbUp violet / Torna red, read from host/lang as today):
- **Left pane (the canvas):** hero → **The Plan** (feasibility score, scope, roadmap, considerations, risks-we-manage, investment, next steps) → interactive **simulator** → Lina **voice** walkthrough.
- **Right pane:** the **Plan Copilot** chat (§5).
- Primary "Build this" CTA → existing booking modal (`/public/book/:id`). "Refine later" → prefilled builder / dismiss.
- Everything bilingual; content follows the teaser `lang`.

---

## 5. THE PLAN COPILOT (conversational co-design)

A ChatGPT/Claude-style chat that reads the **client-safe plan + original request** as its only context (so it structurally cannot leak internal data). Text input + optional **voice input** (reuse on-device Web Speech dictation).

**Structured response modes** (model returns one of):
- `answer` — read-only Q&A / summary / explanation. Plan unchanged.
- `edit` — a **patch** to the working plan (add/remove/change a scope item, roadmap phase, timeline, metric, consideration). Server validates the patch against the plan schema (edits confined to client-plan fields only), applies it, recomputes derived fields (timeline/investment/feasibility note), re-caches, returns the new plan + a human-readable **diff** ("Added: mobile app → Phase 2").
- `clarify` — Copilot asks a question when the request is ambiguous.

**Canvas mechanics (the artifact experience):**
- On `edit`, the left-pane Plan **re-renders in place**; a transient banner names what changed; changed blocks briefly highlight.
- **Version history**: every applied edit is a version; the user can **undo**, jump to any version, or **reset to original**. Stored on the teaser row.
- The working plan is a **living draft** (`client_plan_json`); the final draft + chat transcript are what flow into the build + booking when "Build this" is clicked (the *refined* scope, not the original one-liner).

**Guardrails:** rate-limited per `CF-Connecting-IP` **and** per token; per-session turn cap + per-day cap (reuse `CHAT_DAILY_CAP_PER_USER` pattern); input length capped; edits can never touch price/verdict/internal fields; "reset" always available. No key → canned help + read-only plan (labeled), never a fake chat.

**Model:** Haiku for answers + light edits (`ORBUP_PLAN_CHAT_MODEL`, default Haiku). Optional Sonnet for full plan-rewrites when an edit is large.

---

## 6. LIVE PLAN = CANVAS (how edits render)

- `client_plan_json` is the single source of truth for the left pane; the renderer is a pure function of it. An `edit` mutates the JSON → re-render. No page reload.
- Derived fields recompute deterministically where possible (timeline sums the roadmap; investment scales with scope band) so numbers stay consistent; the model supplies prose, code supplies numbers (same "model writes prose, engines write numbers" rule as the triage/premortem).
- Diffs are computed server-side (old vs new plan) and shown as "Added / Removed / Changed" chips.

---

## 7. SIMULATOR SYNC (Level 2 — the ultimate "see what it will do")

Optional, on-demand (not every message — cost): a **"Update the preview"** button appears when the plan's scope has materially changed. Clicking it re-runs `appSimulatorGenerator` against the *current plan* so the clickable simulator reflects the edits (e.g., add a mobile app in chat → a mobile screen appears in the simulator). Gated by `ORBUP_SIM_SYNC` (default 0 for v1), triggered manually, ~a few cents/regeneration, rate-limited. Phase 3.

---

## 8. TIMING & ASYNC (the gotcha)

Triage runs ~15–20s **after** the teaser builds; premortem is a second call. So:
1. Never block teaser generation on triage/premortem.
2. "The Plan" renders a **loading state and polls** `/:token/plan` (~3s) until ready — same lazy pattern as the simulator.
3. **Auto-run premortem for self-serve** projects after triage (it's manual today) so the plan is complete — `ORBUP_AUTO_PREMORTEM` (default on with a key), +$0.10.
4. No key → deterministic heuristic plan, labeled `is_simulated:true`.
5. **Cache** the projected plan + each edit version on the teaser row (stable, instant re-opens).

---

## 9. DATA MODEL

Reuse `d2_projects.triage_structured` + `premortem_*`. On `d2_project_teasers` add:
- `client_plan_json` (JSONB) — current working plan (allowlisted).
- `client_plan_versions` (JSONB array) — version history for undo/reset.
- `client_plan_chat` (JSONB array) — transcript (capped).
- `client_plan_at` (timestamptz).
Idempotent migration (`ADD COLUMN IF NOT EXISTS`) + model update. Projection function `clientPlanFromTriage()` is pure + unit-tested; plan schema documented so patch validation is strict.

---

## 10. ENDPOINTS (contracts)

- `GET  /projects/api/v1/intake/public/teaser/:token/plan` — `{status:'pending'|'ready'|'unavailable', plan?}`. **May ONLY return the allowlisted object** — never `monetization_options`/verdict/conflict/raw premortem. SIT scans the response for internal tokens.
- `POST /projects/api/v1/intake/public/teaser/:token/plan/chat` — `{message, history}` → `{mode:'answer'|'edit'|'clarify', reply, plan?, diff?, version?}`. Rate-limited + capped.
- `POST /projects/api/v1/intake/public/teaser/:token/plan/version` — `{action:'undo'|'reset'|'goto', version?}` → `{plan, version}`.
- `POST /projects/api/v1/intake/public/teaser/:token/simulator/sync` (Phase 3) — regenerate the simulator from the current plan; rate-limited.
- Internal (auth): `GET /api/v1/teaser-admin/:token/plan/preview` — owner previews the exact client projection.
- Extend `POST /public/teaser/:projectId` to fire auto-premortem (fire-and-forget).
All token-scoped (IDOR-safe); a foreign/wrong token returns nothing.

---

## 11. END-TO-END FLOW

```
Input (voice orb | typing | attached doc)  →  identity gate (required)
   → POST /public/request  → d2_projects row
        +3s auto → inboxTriageAgent (triage_structured)         ~$0.08
             └auto(self-serve)→ premortemAgent (verdict+risks)   ~$0.10
   → POST /public/teaser/:id → teaser JSON + simulator → /projects/teaser/:token   (instant)
   → Studio page: Plan(loading→polls /:token/plan) | Simulator | Voice | Copilot chat
        clientPlanFromTriage() → allowlisted, scrubbed, bilingual plan (cached)
   → Copilot: answer / edit(patch→re-render+diff+version) / clarify           ~$0.005–0.01/msg
   → optional "Update preview" → simulator re-render (Phase 3)
   → "Build this" (refined plan + transcript) → booking (SMS-confirmed)   OR   "Refine later"
```

---

## 12. CONFIG / FEATURE FLAGS (default-safe)

```
ORBUP_PLAN_IN_TEASER        (1)  master switch for The Plan
ORBUP_AUTO_PREMORTEM        (1 w/ key)  auto-run premortem for self-serve
ORBUP_PLAN_CHAT             (1)  the Copilot
ORBUP_PLAN_CHAT_MODEL       (haiku)  answer+light-edit model
ORBUP_PLAN_REWRITE_MODEL    (sonnet)  optional large-rewrite model
ORBUP_PLAN_CHAT_TURN_CAP    (40)  per-session
ORBUP_PLAN_CHAT_DAILY_CAP        per-caller
ORBUP_PLAN_SHOW_INVESTMENT  (0 v1 → 1 once quote wiring lands)
ORBUP_PLAN_SHOW_COMPETITORS (0)
ORBUP_SIM_SYNC              (0)  Phase 3 simulator regeneration
# reuses: ANTHROPIC_API_KEY, triage/premortem/teaser/booking pipeline
```

---

## 13. HONESTY & SAFETY (in code, not prompts)

- **Allowlist projection** (primary) + **scrubber** (net) + **verdict gate** (no rosy plan for a no).
- Copilot context = client plan + request only → cannot leak internal data; edits confined to client-plan fields.
- No key → labeled heuristic, never fabricated.
- **Boundary SIT** (the important test): feed a triage with monetization + conflict-of-interest + DECLINE → the public `/plan` and `/plan/chat` responses contain none of them, and DECLINE yields "needs a conversation," not a build CTA.
- One human-review disclaimer on every plan: "Preliminary scope from our AI analysis — a human reviews before any build."

---

## 14. COST MODEL

| Item | Model | ~Cost |
|---|---|---|
| Triage (auto on submit) | Sonnet 4-6 | $0.08 |
| Premortem (auto self-serve) | Sonnet 4-6 | $0.10 |
| Projection + rendering | — | $0 (pure fn) |
| Copilot message (answer/light edit) | Haiku | $0.005–0.01 |
| Design session (10–20 turns) | Haiku | $0.10–0.30 |
| Large plan rewrites (optional) | Sonnet | ~$0.03 each |
| Simulator re-render (Phase 3) | — | a few ¢ each |
| **All-in per engaged prospect** | | **~$0.30–$0.70** (heavy ~$1) |

Hard-capped by per-session/day caps + rate limits regardless of abuse.

---

## 15. PHASING

- **Phase 1 (≈1 wk) — Read-only Plan:** projection (allowlist+scrubber+gate), `/:token/plan`, "The Plan" section with loading/poll, auto-premortem, bilingual, cache, **boundary SIT**.
- **Phase 2 (≈1–1.5 wk) — The Copilot / Canvas:** chat endpoint (answer/edit/clarify), live re-render + diffs, version history/undo/reset, voice input, caps, refined-scope-into-build. This is the "design studio" experience.
- **Phase 3 (≈0.5–1 wk) — Simulator sync + investment range:** on-demand simulator regen from the plan; investment band from the `quote` pipeline; owner preview console; polish + brand theming.

---

## 16. TESTING (required before "done")

- **Boundary SIT** (most important): internal secrets never surface via `/plan` or `/plan/chat`; DECLINE → conversation, not build CTA.
- Projection unit tests per policy row (show/reframe/hide).
- Copilot: `answer` leaves plan unchanged; `edit` patches + re-renders + diffs + versions; undo/reset restore correctly; patch validation rejects out-of-schema edits.
- Async: teaser opens before triage ready → loading → polls → renders.
- No-key: heuristic plan + canned chat, labeled, no crash.
- Bilingual EN/ES snapshots (plan + Copilot).
- IDOR/idempotency: token-only; cached/stable; caps enforced.

---

## 17. NON-GOALS / GUARDRAILS

- Never show raw triage, go/no-go, monetization, conflict-of-interest, or raw premortem base-rates to the prospect.
- Never block teaser generation on triage/premortem (async only).
- Never fabricate a plan when triage says no — route to a conversation.
- Never expose plan/chat by enumerable id — token only.
- Simulator sync is on-demand, not per message (cost).
- No emoji. Proper Spanish orthography. Weeks, not months. Human-review disclaimer on every plan.
