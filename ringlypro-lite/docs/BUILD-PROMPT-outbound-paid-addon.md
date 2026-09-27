# BUILD PROMPT — Outbound Caller: manually activated, wallet-funded, with a call report

**For:** `/ringlypro-architect`
**Target:** `ringlypro-lite` (separate Render service, `LITE_*` env, `lite_` tables)
**Requirement:** owner, 2026-09-27 (revised same day after review)
**Status:** agreed. One open question in §1, everything else is decided.

---

## 0. WHY THIS SHAPE, SO NOBODY "SIMPLIFIES" IT LATER

HighLevel has **no API to create a workflow** (verified twice: `ringlypro-lite`
and `verticals/supply`). An outbound Voice AI call is a *workflow enrollment*,
so every tenant needs a workflow only a human can build in HighLevel's UI.

The owner accepted that manual step rather than pay $497 for Agency Pro or move
outbound off HighLevel. Everything here exists to make one unavoidable manual
step **invisible to the client and paid for before it costs the owner time**:

- the client configures nothing;
- the client knows the price before committing;
- money arrives before the owner spends an hour;
- the owner is told the moment a client pays;
- the client is told the moment they can start;
- **the client sees what every call cost and what happened on it.**

**Outbound costs the owner per minute.** Nothing here may place a call that has
not been funded in advance.

---

## 1. PRICING — THE OWNER'S DECISION, RESOLVED

The client is charged **the owner's actual cost × 2**, and the owner's cost is
**per minute of connected call**, because that is how HighLevel bills.

```
LITE_OUTBOUND_COST_PER_MIN_USD   0.13    what GHL charges the owner
LITE_OUTBOUND_MARKUP             2       client pays double
```

So the client sees **$0.26 per minute**. Every screen computes it from these
two values. **No price may be hardcoded in HTML or copy** — change the env,
every surface changes, and the SIT asserts exactly that.

**Billing is per minute of actual connected time, rounded up to the next whole
minute.** Rounding up is stated to the client in those words; silently
charging 1.7 minutes as 2 without saying so is the kind of thing that ends in
a chargeback.

**STILL OPEN — the only one:** a call that is never answered. HighLevel's call
log has a `duration`, but whether an unanswered attempt arrives with
`duration: 0`, arrives at all, or is billed to the owner is **not verified**.
Build it as: **duration 0 or no matching log ⇒ the client is charged nothing
and the reserve is released in full.** If it turns out the owner *is* billed
for unanswered attempts, that becomes a per-attempt floor and is one env value
(`LITE_OUTBOUND_MIN_CHARGE_MIN`, default `0`). Do not guess it now; record it
in the report as `not_answered` so the owner can see the real ratio and decide
from evidence.

Other settled values:

```
LITE_OUTBOUND_SETUP_FEE_USD   20      one-off activation fee
LITE_OUTBOUND_SLA_HOURS       24      the promise shown to the client
LITE_OWNER_ALERT_EMAIL        mstagg@digit2ai.com     (CONFIRMED — not gmail)
LITE_OUTBOUND_RESERVE_MIN     5       minutes held per in-flight call (see §5)
LITE_OUTBOUND_MIN_TOPUP_USD   20      smallest wallet top-up
```

---

## 2. STATE MACHINE — ONE COLUMN, SIX STATES

`lite_tenants.outbound_state VARCHAR(20) NOT NULL DEFAULT 'off'`, added by an
idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `server.js`, with the
canonical migration kept in step.

```
off ──accepts price──▶ awaiting_setup_payment ──stripe webhook──▶ pending_setup
                                                                        │
                                                owner completes setup ──┘
                                                                        ▼
                                                                      active
                                                      owner suspends ───┤
                                                                        ▼
                                                                    suspended
```

`failed_setup` also exists: the owner could not provision this client. Without
it a paid client sits in `pending_setup` for ever with nobody accountable.

**Every transition is `UPDATE ... WHERE outbound_state = <from>`** plus an audit
row — the pattern already used by `su_jobs` and `lite_appointments`. A
read-then-write lets two Stripe webhook retries both "activate".

`outbound_enabled` + `outbound_workflow_id` remain the **dialer's** gate.
`outbound_state = 'active'` is the **commercial** gate. Both must be true to
dial, and they are deliberately separate: the first says the plumbing exists,
the second says it has been paid for.

---

## 3. WHAT THE CLIENT SEES

The Outbound tab is **always visible** — hiding it hides the product. What
changes is what it offers.

**`off`** — the pitch and the price, computed live:
> Your AI calls a list you upload.
> **$0.26 per minute**, charged from your account balance, rounded up to the
> next minute. You only pay for calls that connect.
> Numbers are **not** checked against the National Do Not Call registry.
> A one-off **$20 setup fee** activates it, ready within 24 hours.

One button: **Activate outbound — $20**. No upload UI at all in this state.

**`awaiting_setup_payment`** — "Waiting for your payment to clear." Re-opening
Stripe reuses the open session; never mints a second.

**`pending_setup`** — the promise as a real date and time in the tenant's own
timezone, never a floating "24 hours":
> Paid. Your outbound caller will be ready by **Sun 28 Sep, 3:40 PM**.
> We will email you the moment it is live.

If the deadline passes the wording changes to *"This is taking longer than
expected. We have been notified."* — never keep showing a deadline that has
gone.

**`active`** — the wallet balance, a **Add funds** button, the upload UI as it
exists today, and the call report (§6).

**`suspended` / `failed_setup`** — a plain statement and a contact route, never
a dead button.

---

## 4. THE $20 SETUP FEE

`POST /api/outbound/activate` → Stripe Checkout, `mode:'payment'`, amount read
**only from env**, never from the request body. Metadata
`{kind:'lite_outbound_setup', tenant_id}`.

**"PAID" IS WRITTEN ONLY BY THE WEBHOOK.** The Stripe return URL may say
"confirming" and nothing more — a house rule this estate has already been bitten
by (see the Planea quote module in the root `CLAUDE.md`). Verify the signature;
require `payment_status:'paid'`, the stored amount, the currency and the tenant
from metadata; apply each Stripe event id exactly once (unique index).

On confirmation, in ONE transaction: move `awaiting_setup_payment →
pending_setup`, record `setup_paid_at` and the computed `setup_due_at`, write
the owner-alert row, write the client's dashboard notification. **Then** send
the owner's email, outside the transaction, best effort — an email failure must
never roll back a payment Stripe has already taken.

---

## 5. THE WALLET — RESERVE AT DIAL, SETTLE ON THE CALL LOG

This is the heart of the change and the part most likely to be got wrong.

The cost of a call is **not known when it is placed.** It is known when
HighLevel reports the duration, minutes later. So:

**Top up.** `POST /api/outbound/topup {amount_cents}` → Stripe Checkout,
minimum `LITE_OUTBOUND_MIN_TOPUP_USD`. Webhook confirms → `balance_cents +=`.
Same webhook discipline as §4.

**Reserve, at dial time.** Before enrolling, atomically move
`LITE_OUTBOUND_RESERVE_MIN × rate × markup` from `balance_cents` to
`reserved_cents`:

```sql
UPDATE lite_outbound_credit
   SET balance_cents = balance_cents - :hold, reserved_cents = reserved_cents + :hold
 WHERE tenant_id = :t AND balance_cents >= :hold
 RETURNING balance_cents
```

No row returned ⇒ refuse with `insufficient_credit` and **do not enroll**.

**Why reserve rather than charge:** the balance can never go negative, and
concurrent dials cannot both spend the last dollar. The reserve is deliberately
generous (5 minutes) so a long call is covered; the unused part comes straight
back on settlement. A client with $10 can therefore have only ~7 calls in
flight at once — acceptable, because the dialer paces at 5 per tenant per tick.

**Order matters: reserve BEFORE the HighLevel enrollment.** If the enrollment
then throws, release the reserve. A reserve with no enrollment is money briefly
held and returned; an enrollment with no reserve is a free call the owner pays
for. The first is recoverable.

**Settle, when the call log arrives.** `services/ghlCallLogs.js` already polls
`GET /voice-ai/dashboard/call-logs` every couple of minutes. Extend it:

1. Match the log to a `lite_outbound_calls` row. **Match on `contactId`**, which
   `dial()` already stores as `lite_outbound_contacts.ghl_contact_id`, within a
   time window after `enrolled_at`. Do **not** match on phone number: a call log
   carries `fromNumber` (the caller) and it is **unverified** what that holds for
   an outbound call. Matching on an unverified field silently bills the wrong
   tenant, and in a shared sub-account that is another client's money.
2. Charge `ceil(duration_minutes) × rate × markup`, capped at the reserve.
3. Release the remainder to `balance_cents`.
4. Store `duration_sec`, `charged_cents`, `outcome`, `summary` on the call row.
5. **Idempotent on HighLevel's own call id** — a re-poll must settle once. This
   is the same rule `callMirror.js` already follows.

**Unsettled reserves must not leak.** A call whose log never arrives holds its
reserve for ever. A sweep releases any reserve older than
`LITE_OUTBOUND_RESERVE_TTL_MIN` (default 60) and marks the call
`no_log` — the client gets their money back and the row says honestly that
nothing is known about that call.

**Unused balance** stays as credit, never expires, always visible. No automatic
refund; a refund is the owner's decision, by hand, in Stripe.

---

## 6. THE CALL REPORT — WHAT THE CLIENT GETS BACK

A new section on the Outbound tab, and `GET /api/outbound/calls`, listing per
call: when, who (name + number from their own list), **duration**, **what it
cost them**, outcome, and HighLevel's summary of the conversation where there
is one.

Plus a per-list roll-up: attempted, connected, total minutes, total spent.

Three honesty rules:

- **A call with no log reads "no result recorded", never "not answered".** They
  are different facts and only one of them is known.
- **The transcript is shown only if HighLevel returned one.** Never
  reconstructed, never summarised by a model into something the agent did not
  say.
- **`charged_cents` is what was actually taken**, copied from the settlement,
  never recomputed for display. A figure recomputed at render time drifts from
  the figure that moved the money.

**WATCH FOR THIS:** the existing call-log poller mirrors calls into the client's
**Messages** tab as missed-call messages. It is **unverified** whether an
outbound call appears in the same feed. If it does, every outbound call becomes
a fake "someone called you" message in the client's inbox. The poller must
identify outbound calls (by the `contactId` match above) and route them to the
report **only**. Test this explicitly.

---

## 7. NOTIFICATIONS

**Lite has NO mail transport today.** This is a dependency, not a detail:
create `services/notify.js` on SendGrid, reusing the estate's existing
`SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL`. **With no key set, every email is
recorded as `skipped:'no_transport'` and the state machine still works** — the
dashboard notification is written first, always, because it is the one channel
that cannot fail.

| Event | To | Contains |
|---|---|---|
| Setup fee confirmed | `mstagg@digit2ai.com` | tenant id, business name, their number, GHL location id, agent id, the deadline — **enough to do the job without opening a dashboard** |
| Owner marks setup complete | client | "Your outbound caller is ready" + link |
| Deadline passed, still `pending_setup` | owner, once | how overdue, tenant id |
| Balance below one call | client | "Top up to keep calling" |

New table `lite_notifications` (tenant_id, kind, title, body, created_at,
read_at) feeds the **Alerts** item already in the header. Reuse it; do not add
a second notification concept.

**No email may contain a caller's phone number or contact details.** Owner
alerts carry tenant-level facts only — the estate rule everywhere else.

---

## 8. THE OWNER'S SIDE

Extend the existing `GET|POST /internal/security/outbound`:

- `GET` gains `state`, `setup_paid_at`, `setup_due_at`, `balance_cents`,
  `reserved_cents`, `overdue`, and the live pricing, so the owner can see what
  clients are actually charged.
- `POST {confirm, tenant, workflow_id}` already verifies the workflow against
  HighLevel and refuses a draft or a missing one. **On success, if the tenant is
  `pending_setup`, move it to `active` and send the client's email.** One action,
  not two — two is how a client stays uninformed for a day.
- `POST {confirm, tenant, state:'failed_setup', reason}` for the case the owner
  cannot provision, which tells the client honestly.

---

## 9. WHAT MUST NOT HAPPEN — TEST THESE, NOT THE HAPPY PATH

Each is a test in `test/ghl-sit.js`, each mutation-tested (break the guard,
prove a test fails).

1. A tenant not `active` cannot dial, even with `outbound_enabled` and a workflow set.
2. A tenant with a balance below the reserve cannot dial.
3. The reserve is **atomic** — two concurrent dials against a one-call balance produce exactly one enrollment.
4. A failed enrollment **releases** the reserve.
5. Settlement charges `ceil(minutes) × rate × markup`, **capped at the reserve**, and releases the rest.
6. Re-polling the same call log settles **once**.
7. A call log that never arrives has its reserve **released** by the sweep and reads `no_log`, not `not_answered`.
8. A zero-duration call charges **nothing**.
9. An outbound call **never appears in the Messages tab** as a missed call.
10. Settlement matches on `contactId`, never on `fromNumber` — mutate it to match on number and a test must fail.
11. `pending_setup → active` only through the admin endpoint, never a client request.
12. A replayed Stripe webhook credits once; a session naming another tenant credits nobody; the return URL alone marks nothing paid.
13. An email failure never rolls back a payment or blocks a state change.
14. With no `SENDGRID_API_KEY`, activation completes and the dashboard notification appears.
15. Prices on every surface are computed from env — change the env, the page changes.
16. An overdue `pending_setup` stops showing a deadline that has passed.
17. The National DNC statement appears on every outbound surface including the new paywall.

Keep green: `security-sit.js`, `call-sim.js`, `theme-sit.js` (new screens must
pass the contrast and 44px tap-target audit at 390px).

---

## 10. OUT OF SCOPE, STATED SO IT IS NOT ASSUMED

- **National DNC scrubbing.** Needs an FTC Subscription Account Number the owner does not hold. The product says so and must keep saying so.
- **Automatic refunds** of unused balance.
- **Removing the manual step.** Needs the agent field in HighLevel's "Voice AI Outbound Call" action to accept a variable — unverified.
- **Charging for unanswered attempts.** See §1; decided from evidence once the report shows the real ratio.
