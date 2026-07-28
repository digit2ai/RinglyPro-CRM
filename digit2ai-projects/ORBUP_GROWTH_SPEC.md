# OrbUp Growth Enhancement — Build Brief / Dev Prompt

**Status:** SPEC ONLY — no implementation in this document. Hand this to the builder (`/ringlypro-architect` or a senior Node dev) as the complete requirements.
**Owner:** Digit2AI / OrbUp (client 15)
**Scope:** Turn the one-way booking SMS into a two-way, no-show-resistant, revenue-capturing loop.
**Target timeline:** ~2–3 weeks total (Phase 1 ≈ 1–1.5 wks, Phase 2 ≈ 1 wk). Never scope in months.

---

## 0. SYSTEM CONTEXT (everything the builder needs before writing a line)

**What OrbUp is.** A hybrid funnel: a prospect describes a project (voice orb or typing) on `orbup.app` → a required identity gate captures name+email+phone(E.164)+language → an AI teaser + interactive simulator is generated → the prospect books a kickoff appointment → we confirm by SMS. OrbUp is served from the `RinglyPro-CRM` repo; `orbup.app` is a custom domain on the same Render service as `aiagent.ringlypro.com`.

**Where the code lives (reuse these, do not re-invent):**
- Backend (Express sub-app mounted at `/projects`): `digit2ai-projects/src/routes/intake.js`
- Teaser render + booking modal markup: `digit2ai-projects/src/routes/teasers.js`
- Frontend funnel pages: repo-root `orbup.html` (EN) + `orbup-es.html` (ES)
- Booking-modal SMS/phone lives in the teaser page too (`teasers.js` renders `#ts-book-modal`)
- DB: Sequelize via `PROJECTS_DATABASE_URL || CRM_DATABASE_URL || DATABASE_URL` (`digit2ai-projects/src/config/database.js`). Migrations in `digit2ai-projects/migrations/`. `sync({alter:false})` — **new columns/tables need explicit migration + model**, never rely on alter.

**Existing primitives to build on (already live & working):**
- `sendOrbUpSms(to, body)` — helper in `intake.js`. Sends from `ORBUP_SMS_FROM` (default toll-free `+18886103810`), reuses `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`. Fire-and-forget, never throws into the request path. **All outbound OrbUp SMS must go through this helper.**
- Booking endpoint: `POST /projects/api/v1/intake/public/book/:projectId` → creates a `CalendarEvent` (project-scoped: `workspace_id`, `project_id`, `title`, `start_time`, `end_time`, `user_email`, `description`), sets `project.kickoff_event_id` + `project.kickoff_scheduled_at`, then sends the confirmation SMS via `sendOrbUpSms`. Body carries `{ start_time, end_time, name, email, phone (E.164), lang }`.
- Slots endpoint: `GET /projects/api/v1/intake/public/slots?count=N` (America/Bogota business hours).
- Rate limiting: `_triageRateLimit(clientIp(req))` — `clientIp()` keys on Cloudflare `CF-Connecting-IP` (NOT forgeable XFF). Reuse for any new public endpoint.
- Language: every generated artifact + the confirmation SMS already flow a `lang` (`'en'|'es'`). Keep this end-to-end.
- Teaser magic link: `GET /projects/teaser/:token` (token = unguessable `crypto.randomUUID()`).

**Hard constraints & house conventions (MUST follow):**
1. **Bilingual EN/ES** for every user-facing string (SMS bodies, pages, buttons). Proper Spanish orthography (tildes, ñ). **Emoji-free.**
2. **Degrade gracefully with no keys.** No Twilio creds → log-and-skip (never crash). No Stripe key → deposit feature disabled, booking still works. This mirrors the existing `EMAIL_AUTOSEND_DISABLED` / stub-provider philosophy across the repo.
3. **Cloudflare ~100s ceiling.** No long synchronous endpoints; anything slow = background job + poll (relevant to nothing here except: never block the booking response on SMS/Stripe network calls).
4. **Twilio toll-free A2P compliance.** The number is a verified toll-free line. Transactional reminders + confirmations are compliant; **STOP/HELP must be honored** (Twilio auto-handles STOP at carrier level, but we must not re-message opted-out numbers and should surface opt-out language). Keep message volume reasonable (2 reminders max per booking).
5. **PII discipline** (from the recent security review): validate E.164 server-side before any send; never send SMS to an unvalidated/arbitrary number; mask phone/email in logs (last-4); never expose PII or tokens on an unauthenticated GET.
6. **Feature-flag everything**, default-safe. New behaviors gated by env vars so they can be rolled out/back without a code change.
7. **Multi-instance safety.** Render may run >1 instance. Any scheduler/poller must claim work atomically (DB row lock / `SELECT … FOR UPDATE SKIP LOCKED`) so a reminder is never double-sent.
8. **Idempotency.** Every send path must be safe to retry (no duplicate texts, no duplicate charges).

**Security posture (already fixed, do not regress):** `/public/book` and `/public/request` are now rate-limited, E.164-validated, and length-capped. Rate limiting keys on `CF-Connecting-IP`. Keep new endpoints consistent with this.

---

## PHASE 1 — Two-way, no-show-resistant SMS loop (no new vendors; all on existing Twilio)

### FEATURE A — Reminder SMS (24h + 1h before the kickoff)

**Goal.** Cut no-shows by texting the booked prospect a reminder ~24 hours and ~1 hour before their appointment, from the same branded toll-free number, in their chosen language.

**Behavior.**
- On a successful booking, schedule two reminders: `T-24h` and `T-1h` relative to `start_time`.
- If the booking is made <24h out, skip the 24h reminder (only schedule the 1h). If <1h out, skip both.
- Each reminder is sent once, idempotently, even across app restarts / multiple instances.
- Reminder text (bilingual), branded, includes the local time (America/Bogota display) and an **add-to-calendar link** (Feature C) and the reply invitation. Example EN: `"OrbUp: reminder — your kickoff is tomorrow at 10:00 AM (Colombia time). Add it to your calendar: <link>. Reply here with any questions. — OrbUp"`. Spanish equivalent with correct orthography.
- Never send to a number that opted out (Feature B opt-out table) or to an invalid E.164.

**Data model (new table `d2_sms_reminders`).** Fields: `id`, `project_id`, `event_id` (the CalendarEvent), `phone` (E.164), `lang`, `kind` (`'24h'|'1h'`), `send_at` (timestamptz), `sent_at` (nullable), `status` (`'pending'|'sent'|'skipped'|'failed'|'canceled'`), `attempts` (int), `last_error` (nullable), `created_at`, `updated_at`. Unique constraint on (`event_id`,`kind`) to guarantee no duplicate scheduling.

**Scheduler.** A DB-backed poller inside the projects app, run every 60s on boot (guarded so only one timer per process). Each tick: claim due rows (`status='pending' AND send_at <= now()`) with `FOR UPDATE SKIP LOCKED`, mark `sent`/`failed`, send via `sendOrbUpSms`. Cap attempts (e.g. 3) then `failed`. **Do NOT** keep schedule state in memory (the review flagged the in-memory rate-limit map as a memory/multi-instance hazard — reminders must be DB-durable). Provide an alternative note: a Render Cron hitting an internal `POST /internal/reminders/tick` (key-gated) is acceptable if preferred over an in-process timer.

**Cancellation.** If a booking is canceled/rescheduled (future feature), mark its pending reminders `canceled` / reschedule. For v1, at least cancel on cancel.

**Env vars.** `ORBUP_REMINDERS_ENABLED` (default `1` when Twilio configured; `0` disables). Reuses Twilio creds + `ORBUP_SMS_FROM`.

**Acceptance criteria.**
- Booking >24h out → exactly one 24h and one 1h reminder land at the right times, once each.
- App restart between scheduling and send → reminder still fires (durable).
- Two app instances → reminder sent exactly once (atomic claim).
- Opted-out or invalid number → no send, row `skipped`.
- `ORBUP_REMINDERS_ENABLED=0` → nothing scheduled/sent; booking unaffected.
- Bilingual body correct; time shown in America/Bogota.

---

### FEATURE B — Inbound SMS webhook ("reply anytime" made real)

**Goal.** Replies to the toll-free number currently go nowhere. Capture them, thread them to the originating project/prospect, and notify the owner so a human can respond — turning a dead promise into the warmest lead channel.

**Behavior.**
- Twilio Messaging webhook (inbound) hits a new endpoint. Validate `X-Twilio-Signature` (HMAC using `TWILIO_AUTH_TOKEN`) — reject unsigned/forged requests.
- Persist the message; best-effort match `From` number to a `project`/prospect (by the phone on the booking / `d2_projects.submitter_phone`).
- Handle keywords: `STOP`/`UNSUBSCRIBE` → record opt-out (Feature-B opt-out table) and stop all future sends to that number; `HELP` → auto-reply with a brief bilingual help line. (Twilio also enforces STOP at the carrier level; we mirror it so reminders respect it.)
- Notify the owner of a real reply: route into the existing Projects Hub **Messages** inbox if feasible (the hub already has a `messages` table + `/api/projects-bridge` inbox UI), OR email the owner (respecting `EMAIL_AUTOSEND_DISABLED` — for an inbound-reply alert, an internal owner notification is acceptable like the existing `notifyTeamOfLead`).
- Respond to Twilio with valid TwiML (empty `<Response/>` unless auto-replying to HELP).

**Data model (new tables).**
- `d2_sms_inbound`: `id`, `message_sid` (unique), `from_number`, `to_number`, `body`, `project_id` (nullable, matched), `received_at`, `read_at` (nullable).
- `d2_sms_optout`: `phone` (unique), `reason` (`'stop'|'manual'`), `created_at`. Checked by `sendOrbUpSms` (or a wrapper) before every send.

**Endpoint.** `POST /projects/api/v1/intake/webhooks/sms` — unauthenticated to Twilio but **signature-validated**; not rate-limited by IP (Twilio's IPs), but reject on bad signature. Content-type `application/x-www-form-urlencoded` (Twilio default).

**Env vars.** `ORBUP_INBOUND_NOTIFY` (owner email/number for reply alerts; falls back to existing lead-notify recipient). Signature validation reuses `TWILIO_AUTH_TOKEN`.

**Twilio console step (document, not code).** Point the toll-free number's **Messaging → "A message comes in"** webhook at `https://aiagent.ringlypro.com/projects/api/v1/intake/webhooks/sms` (POST). Include this in the deliverable's runbook.

**Acceptance criteria.**
- Forged request (bad/no signature) → 403, nothing stored.
- Valid inbound reply → stored, matched to project when possible, owner notified, empty TwiML returned.
- `STOP` → opt-out recorded; subsequent reminders/confirmations to that number are suppressed (verified).
- `HELP` → bilingual help auto-reply.
- Duplicate `message_sid` (Twilio retry) → no duplicate row (idempotent).

---

### FEATURE C — Add-to-calendar (ICS) link in the confirmation

**Goal.** People who put the kickoff on their calendar show up far more. Give them one-tap add-to-calendar in the confirmation SMS, the booking success screen, and (optionally) an email.

**Behavior.**
- Generate a valid iCalendar (`.ics`, `VEVENT`) for the booked kickoff: title, start/end (with correct `TZID`/UTC), description, organizer, a stable `UID` (tie to the CalendarEvent id).
- Serve it at a tokenized public endpoint (unguessable token tied to the event — same UUID discipline as teasers; **never** an enumerable integer event id, to avoid the IDOR class the review flagged).
- Provide three affordances: a direct `.ics` download link, a Google Calendar template URL, and an Outlook/Office template URL. On the **booking success panel** (the `#ts-done` / `d2b` confirmation UI) show "Add to calendar" buttons. In the **confirmation + reminder SMS**, include the short add-to-calendar link (a small landing page that offers the 3 options, since SMS can't attach files).
- Timezone: America/Bogota display; ICS carries proper timezone data so it lands correctly in any client.

**Endpoint(s).**
- `GET /projects/api/v1/intake/public/calendar/:token.ics` → the ICS file (Content-Type `text/calendar`).
- `GET /projects/teaser/cal/:token` (or similar) → a tiny bilingual "Add to your calendar" page with Google/Outlook/ICS buttons. Linked from SMS.
- Token stored on the CalendarEvent (new column `cal_token`) or a lookup table.

**Env vars.** none.

**Acceptance criteria.**
- ICS imports cleanly into Apple Calendar, Google Calendar, and Outlook at the correct local time.
- Add-to-calendar link appears in the confirmation SMS + booking success screen, bilingual.
- Token is unguessable; endpoint exposes only event time/title/description, no other PII, no other project's data.

---

## PHASE 2 — Capitalization

### FEATURE D — Deposit-to-book ($99, refundable & credited)

**Goal.** Insert a small refundable deposit between "pick a slot" and "confirmed," to qualify serious buyers, kill no-shows, and activate payment rails. Framed as **"$99 to reserve your build slot — 100% refundable, credited to your project."** (Configurable amount; see prior product decision.)

**Behavior / flow.**
1. Prospect picks a slot + completes the identity gate (already required).
2. Instead of instantly creating the CalendarEvent, create a Stripe **Checkout Session** (mode `payment`, amount from config) with metadata `{ project_id, start_time, end_time, name, email, phone, lang }`. Redirect to Checkout.
3. On success, Stripe redirects back to a booking-confirm page; the **source of truth is the Stripe webhook** (`checkout.session.completed`) — the webhook creates the CalendarEvent, records the deposit, sets `project.kickoff_*`, and fires the confirmation SMS + reminders + ICS (i.e. the existing post-book pipeline runs from the webhook, not the redirect).
4. Idempotent: a given `checkout.session.id` books at most one event (unique constraint) even if the webhook retries.
5. Refund path: an owner action (or auto on cancel) issues a Stripe refund and records it.
6. Framing copy is prominent and bilingual: refundable + credited. Non-scary $99 default.

**Data model (new table `d2_deposits`).** `id`, `project_id`, `event_id` (nullable until booked), `amount_cents`, `currency`, `stripe_session_id` (unique), `stripe_payment_intent`, `status` (`'pending'|'paid'|'refunded'|'failed'`), `refunded_at`, `created_at`, `updated_at`.

**Endpoints.**
- `POST /projects/api/v1/intake/public/deposit/:projectId` → creates the Checkout Session, returns its URL. Rate-limited via `clientIp`. Validates slot + E.164 like `/public/book`.
- `POST /projects/api/v1/intake/webhooks/stripe` → **signature-validated** (`STRIPE_WEBHOOK_SECRET`), handles `checkout.session.completed` (book + charge-record + confirmation pipeline) and `charge.refunded`.
- Success/cancel return pages (bilingual): `.../book/success`, `.../book/cancel`.

**Env vars.** `ORBUP_DEPOSIT_ENABLED` (default `0` — off until you flip it), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ORBUP_DEPOSIT_AMOUNT` (cents, default `9900`), `ORBUP_DEPOSIT_CURRENCY` (default `usd`), `ORBUP_DEPOSIT_LABEL` (display, default "Reserve your build slot — refundable & credited").

**Feature-flag interplay.** When `ORBUP_DEPOSIT_ENABLED=0`, the booking flow is exactly today's (free book → confirm). When `1`, the frontend "Book" button routes through Checkout. This lets you A/B free-book vs deposit and roll back instantly (per the earlier product plan: launch free-but-qualified first, then test the deposit).

**Acceptance criteria.**
- Deposit off → identical to current free booking.
- Deposit on → slot pick → Checkout → on paid, event created once, confirmation SMS + reminders + ICS all fire; on abandon/cancel, no event, no charge.
- Webhook is signature-validated; replay/retry does not double-book or double-charge.
- Refund records correctly and (if on cancel) frees the slot.
- No Stripe key present → feature auto-disabled, booking unaffected.

---

## CROSS-CUTTING REQUIREMENTS

**Migrations.** One migration per new table (`d2_sms_reminders`, `d2_sms_inbound`, `d2_sms_optout`, `d2_deposits`) + column adds (`cal_token` on the calendar event, optional). Idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. Add matching Sequelize models. Follow the repo's existing migration naming (`YYYYMMDD_*.sql`).

**`sendOrbUpSms` wrapper.** Extend (or wrap) the existing helper so EVERY send: (a) re-checks E.164, (b) checks `d2_sms_optout`, (c) masks the number in logs. Reminders, confirmations, and HELP replies all funnel through it. Single choke point = single place to enforce compliance.

**Env var summary (new).**
```
ORBUP_REMINDERS_ENABLED   (default 1 when Twilio set)
ORBUP_INBOUND_NOTIFY      (owner email/number for reply alerts)
ORBUP_DEPOSIT_ENABLED     (default 0)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
ORBUP_DEPOSIT_AMOUNT      (default 9900)
ORBUP_DEPOSIT_CURRENCY    (default usd)
ORBUP_DEPOSIT_LABEL
# reuses: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ORBUP_SMS_FROM
```

**Compliance runbook (deliverable doc, not code).** (1) Point the toll-free Messaging inbound webhook at the new endpoint. (2) Confirm STOP/HELP behavior. (3) Add the Stripe webhook endpoint + secret in the Stripe dashboard. (4) Note that reminders/confirmations are transactional and within toll-free A2P policy; keep ≤2 reminders/booking.

**Observability.** Structured logs for every scheduled/sent/failed reminder, inbound message, and deposit state transition (PII masked). A lightweight owner-facing count (e.g. reminders sent today, replies pending) is a nice-to-have, not required for v1.

---

## SEQUENCING & EFFORT

- **Phase 1 (≈1–1.5 weeks)** — ship in this order, each independently valuable:
  1. **ICS / add-to-calendar** (Feature C) — zero external deps, immediate lift, and the link is reused by reminders.
  2. **Reminder SMS** (Feature A) — biggest no-show lever; depends on the reminders table + poller.
  3. **Inbound webhook + opt-out** (Feature B) — makes "reply anytime" real and enforces STOP for A) & the confirmation.
- **Phase 2 (≈1 week)** — **Deposit-to-book** (Feature D), behind `ORBUP_DEPOSIT_ENABLED=0` until you decide to flip it; A/B against free-book.

**Rollout.** Everything flag-gated and default-safe. Land Phase 1 with reminders ON, deposit OFF. Watch show-up rate + reply volume for ~2 weeks, then enable the deposit.

---

## TESTING (required before "done")

- **SIT script** (in the `verticals/*/sit.js` style) exercising, with NO external keys (stubbed Twilio/Stripe): book → 2 reminders scheduled → poller marks them sent → inbound STOP suppresses future sends → ICS generates + validates → deposit-disabled path books free → deposit-enabled path creates a (mock) session and books only on (mock) webhook.
- **Idempotency tests:** duplicate reminder tick, duplicate inbound `message_sid`, duplicate Stripe webhook — no dupes.
- **Multi-instance:** simulate two pollers — reminder sent once.
- **Graceful degradation:** unset Twilio → no crash, logs skip; unset Stripe → deposit auto-off.
- **Bilingual:** snapshot EN + ES bodies for confirmation, both reminders, HELP reply, deposit framing.

---

## EXPLICIT NON-GOALS / GUARDRAILS

- No new SMS/calendar/payment vendors beyond Twilio (already in use) and Stripe (Phase 2 only).
- Do not block the booking HTTP response on any network send (SMS/Stripe) — background/fire-and-forget or webhook-driven.
- Do not store schedule state in memory.
- Do not send to unvalidated/opted-out numbers.
- Do not expose PII or other projects' data on any public GET (respect the IDOR findings from the security review).
- No emoji. Proper Spanish orthography. Weeks, not months.
