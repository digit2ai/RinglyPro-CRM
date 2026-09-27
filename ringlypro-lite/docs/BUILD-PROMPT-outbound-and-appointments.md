# /ringlypro-architect build — RinglyPro Lite: appointments, notifications, outbound calling

Seven owner requests (2026-09-27). **Research was done first; three of the seven are not
what they look like.** Read "WHAT IS ALREADY TRUE" before planning — it is measured, not
assumed, and it changes the scope.

---

## WHAT IS ALREADY TRUE (measured 2026-09-27, do not re-derive)

| | Finding | Consequence |
|---|---|---|
| 1 | `lite_appointments` has **no reason/notes column** | Item 1 is a migration + capture on both write paths, not a UI fix |
| 2 | The outbound **push** path already exists (`services/ghlCalendar.js`) | Manual booking is a UI + the existing push, not new sync |
| 2 | Calendars finally carry **open hours** (fixed 2026-09-26) | `LITE_GHL_APPT_VALIDATE_SLOT=1` is now *possible* — it was off because HighLevel had no hours and refused everything |
| 2 | Booking action is `daysOfOfferingDates:3, slotsPerDay:3, hoursBetweenSlots:3`. **5, 7, 10, 14 days and 4, 5 slots are REFUSED by HighLevel (422).** 2/2 is **untested** | Do not assume 2/2 works. Measure it before shipping copy that promises it |
| 3 | **Lite has NO email transport of any kind** (deps: no sendgrid, no nodemailer) | Item 3 is a new transport + tokenised public endpoints, the largest item here |
| 4 | `setAppBadge` **already works** in `sw.js` and `dashboard.html`, driven by unread count | The gap is a **closed** app — that needs Web Push, which Lite does not have |
| 5,6,7 | `verticals/supply` already implements campaigns, dialer, `compliance.js`, and `memory.js` context-on-contact | **Port these. Do not reinvent them.** |
| 6 | Supply's own note: **National DNC scrubbing is NOT built — it needs an FTC SAN** | Item 6 cannot be "done" without the owner obtaining a SAN. Say so; never imply scrubbing that is not happening |
| 5 | **HighLevel dials Voice AI outbound ONLY from the "Voice AI Outbound Call" workflow action, and a workflow CANNOT be created by API** | Item 5 has a hard owner-side dependency: the workflow ships in a GHL Snapshot loaded into the sub-account |

---

## THE RISK THAT GOVERNS ITEMS 5, 6 AND 7

**An open-signup product that accepts a spreadsheet of phone numbers and dials them is
the toll-fraud payout path, industrialised.** The 2026-08-06 incident was ten sequential
international calls costing real money; this feature invites a tenant to upload ten
thousand. Everything in `src/security/tollFraud.js` exists for exactly this, and it must
gate **import AND dial**, not one of them:

- Every imported number is normalised and checked against `LITE_ALLOWED_DIAL_COUNTRIES`
  (US,CO) **at import**, so a bad row is rejected while a human is looking at the screen —
  and **again at dial**, because a row can be edited in the database afterwards.
- A number with no country code belongs to the **owner's** country, never guessed.
- **HighLevel places these calls, not our provider, so the velocity breaker cannot see
  them.** `/internal/security` already reports `ghl_transfers_uncapped` rather than
  letting `outbound_guard` imply coverage it does not have. Outbound dialling must be
  reported the same way, and a per-tenant daily call cap must live somewhere we DO
  control (rows dialled per day, enforced by the dialer before enrollment).
- New tenants must not be able to dial at all until an operator enables it. Open signup
  plus outbound is not a default.

---

## ITEM 1 — An appointment must say what it is for

**Today:** the Calendar tab shows a time and a name. `lite_appointments` carries
`caller_name`, `callback_number`, `starts_at`, `ends_at`, `status`, `origin`,
`ghl_event_id` — and nothing about *why*.

**Build:**
- Add `reason TEXT` (idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, canonical
  migration updated in step).
- Populate it on **both** write paths or it will be half-empty:
  - `services/ghlAppointments.js` — from the event's `title`, and `appointmentMeta` if it
    carries anything usable. **Do not invent one**: an untitled event gets `null`, and the
    tab says "No reason given" rather than a guessed one.
  - `services/booking.js` — from what the caller actually said, and from the manual form.
- The call that produced the booking usually explains it. Where `call_id` is set, the tab
  should be able to reach that call's summary. Link, do not copy.
- Render it in the Calendar tab and in the owner's booking SMS.

---

## ITEM 2 — Manual booking, GHL as the source of truth, shorter offers

Three separate things. Keep them separate.

**2a. A "+" to book by hand.** The push already exists — `ghlCalendar.pushAppointment` —
and it already handles the three outcomes correctly (success / definite refusal deletes
the local row / **ambiguous keeps it as `sync_unknown`**). Wire a form, call
`booking.bookAppointment`, and surface all three outcomes honestly. A manual booking is
`origin:'ringlypro'` and therefore IS pushed.

**2b. GoHighLevel becomes the availability authority.** The owner's words: "GHL Calendar
is the SOR so Lina could book appointments on open slots only."
- Set `LITE_GHL_APPT_VALIDATE_SLOT=1`. This flips `ignoreFreeSlotValidation` to `false`,
  so HighLevel refuses a slot its own calendar considers taken.
- **This is only safe now.** It was off because `ensureCalendar` created calendars with
  no open hours, so HighLevel refused bookings our own calendar approved. Hours are set
  as of 2026-09-26 — verify per tenant before flipping, and flip it **per tenant**, not
  globally, if any tenant's calendar still has none.
- Our partial unique index stays as the local guard. Two authorities that disagree is
  worse than one that is occasionally slow.

**2c. Offer fewer times.** The owner wants two days and two times so the spoken list is
short. **Currently 3/3/3.** Measured: `daysOfOfferingDates` 5, 7, 10, 14 and `slotsPerDay`
4, 5 are all refused with 422. **2/2 has never been tried.**
- Probe it against the live sub-account first (the `action-shape-probe` pattern).
- If 2/2 is refused, say so and keep 3/3 — do not ship a prompt that promises two times
  while the action offers three.
- The agent prompt should also be told to read at most two options aloud.

---

## ITEM 3 — Email the caller, with reschedule and cancel

**The largest item, because Lite has no email at all.** Decide the sender first; do not
build both.

**Option A — we send it.** Add a transport (`services/notify.js`, one file, SIT greps
every other file to prove nothing else sends). Gives us tokenised
`/appointments/:token/reschedule|cancel` links we control.
**Option B — HighLevel's workflow sends it.** No new transport, but the links cannot
point at our endpoints, and reschedule/cancel then happen in HighLevel.

**Whichever is chosen, only ONE of them may send.** A confirmation from both of us is
worse than one from neither — this is already the stated rule for caller-facing messages
on this path.

If Option A:
- The token is a capability. Store only its **SHA-256**, single-purpose, scoped to one
  appointment, and expiring after the appointment.
- **Cancel must reach BOTH calendars**, using the existing `ghlCalendar.cancelAppointment`
  (which already reads the event first and refuses a foreign `calendarId` — do not
  bypass that). A local cancel that leaves HighLevel holding the slot is the mirror bug
  in reverse.
- Reschedule = cancel + book, through the same availability authority as 2b. It must not
  be able to book a slot the calendar does not offer.
- We have **no verified email address for most callers**. A phone caller gives a number,
  not an address. State plainly what happens when there is no email: nothing is sent, and
  that is not an error.
- Never send to an address a caller did not give.

---

## ITEM 4 — A count on the home-screen icon

**Half of this already works.** `setAppBadge` is wired in `sw.js` and `dashboard.html` and
is driven by the unread count — that is why the tab shows "Messages 2".

**The missing half is a CLOSED app.** An in-page badge cannot update an icon nobody is
looking at. That needs **Web Push**, which Lite does not have.

- Port the pattern from `verticals/jobup/services/admin-notify.js`: **VAPID keys generate
  themselves on first use and are stored**, because Web Push needs a keypair, not an
  account — requiring an env var before the badge works buys nothing.
- iOS drops silent pushes and eventually revokes permission, so the `push` handler must
  show a **notification**, not only set the badge. On iPhone the app must be installed to
  the home screen first; say so in the UI rather than letting it silently not work.
- **A push subscription is a capability URL** — anyone holding it can push to that device.
  It must never be returned by any read endpoint.
- The count is **derived from real rows**, never a stored counter, so deleting a message
  lowers it. Clear on read, not with a separate button.

---

## ITEM 5 — Outbound calling from an uploaded list

**Port `verticals/supply`. It already does this.** `campaigns.js`, `dialer.js`,
`contractors.js` (the import target), `calls.js`. What changes is the tenant model and
the UI, not the mechanism.

**The hard constraint, stated in supply and unchanged:** HighLevel dials Voice AI outbound
**only** from the "Voice AI Outbound Call" workflow action, so an outbound call is a
**workflow enrollment** (`POST /contacts/{id}/workflow/{wf}`) and **no call id exists**
until the call log returns one. Never invent one. **HighLevel has no API to create a
workflow**, so it ships in a GHL Snapshot the owner loads into the sub-account — an
owner-side step that must be in the setup checklist and reported by `/voice/health`.

**The upload:**
- CSV and Excel. Company name, phone, email optional.
- **Parse defensively**: a spreadsheet is untrusted input. Cap rows, cap cell length, and
  never evaluate a formula. A cell beginning `=`, `+`, `-` or `@` is CSV-injection bait
  and must be stored as text and never re-exported raw.
- Every row is normalised and allow-list checked **at import**, with a per-row result the
  uploader can see: accepted, or rejected with the reason. A silent drop is worse than a
  refusal.
- Dedupe within the file and against existing rows.
- Show what will happen **before** anything dials: how many rows, how many refused, and
  an explicit activate step. Approve and activate stay separate, as in supply.

---

## ITEM 6 — Cold-calling regulation

**Port `verticals/supply/src/services/compliance.js`.** It already checks, **at dial time**
(not at save time — a contact can opt out between the two): a suppression list with
reasons `do_not_call | opt_out | internal_block | national_dnc`, revoked consent, a
consent requirement the tenant can turn on, a valid phone, and **calling hours in the
contact's own timezone**.

**What is NOT built, and cannot be faked:**
- **National DNC scrubbing needs an FTC SAN** (Subscription Account Number). Supply says
  so in its own source. Until the owner obtains one, the product must **state on the
  screen that numbers are not scrubbed against the national registry** and rely on the
  tenant's own suppression list. Implying a scrub that is not happening is the one
  failure here with legal consequences.
- Add, because this is a US consumer-facing dialer:
  - **Identification**: the agent must state the business name and that the call is on
    its behalf, early and unprompted.
  - **Opt-out on the call**: a caller saying "take me off your list" must write a
    suppression row in that call, not a task for later. Verify this reaches
    `compliance.suppress()` — a spoken opt-out that only lands in a transcript is not an
    opt-out.
  - **Calling hours default 8am–9pm** in the *called party's* timezone, derived from the
    number, not the tenant's.
  - **Per-tenant daily call cap**, enforced before enrollment (see the toll-fraud note).
- Record the consent basis per row at import. A tenant asserting "these are my customers"
  is a claim to store with a timestamp, not a checkbox to ignore.

---

## ITEM 7 — Recognise a caller who rings back

**Port `verticals/supply/src/services/memory.js`.** It already builds a context string and
writes it onto the **GoHighLevel contact** (`rps_context`, `rps_rep`, `rps_campaign`)
after every call, precisely so the inbound agent knows a returning caller **even if a
webhook is late**. That is the mechanism; reuse it.

- On callback, the inbound agent greets by company and can state why the outbound call
  was made.
- **The greeting must be true.** It may only reference a call that actually happened and a
  reason actually recorded — never a campaign's marketing copy dressed up as history.
- Identity comes from the **dialled and calling numbers**, never from anything the caller
  asserts.
- A number matching **two** tenants' lists in the shared sub-account must resolve by the
  line that was dialled, exactly as the call mirror does. Do not guess.

---

## ACCEPTANCE

- `node ringlypro-lite/test/ghl-sit.js` extended and green, **attacking the invariants**:
  an imported Cameroon number refused at import *and* at dial; a spoken opt-out writing a
  suppression row; a dial outside calling hours refused in the *called party's* timezone;
  a reschedule unable to take a slot the calendar does not offer; a cancel reaching both
  calendars; an appointment with no title stored as `null` and never a guessed reason; a
  push subscription never returned by a read endpoint; one tenant's campaign failure not
  stopping another's.
- **Mutation-test every new guard** and report what fails when each is removed.
- **Measure, never assume, anything HighLevel returns.** Two date windows on this API have
  already turned out to be milliseconds where the docs implied otherwise, and both
  returned a clean empty list rather than an error. Any new read gets the same treatment,
  and the fake must refuse what the live API refuses.
- Report honestly what is **not** covered: the real HighLevel API, a real outbound call,
  a real email, and the FTC SAN.

## OWNER-SIDE BLOCKERS TO SURFACE, NOT WORK AROUND

1. The "Voice AI Outbound Call" workflow — Snapshot, loaded by hand.
2. An **FTC SAN** for National DNC scrubbing.
3. The **$49 vs $26** price contradiction between ringlypro.com and the source landing.
4. Whether the caller's confirmation email comes from us or from HighLevel.
