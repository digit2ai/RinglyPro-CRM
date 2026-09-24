# RinglyPro Lite — Pricing (US)

> **CORRECTION 2026-09-24.** This document said $49/mo while `src/routes/billing.js`
> has shipped **$26/mo** (`LITE_PRICE_US_CENTS`, 2600) and **$69/mo** for Colombia.
> The code is what customers were charged, so the code is what is recorded here.
> A published figure that disagrees with the billing code is the worst kind of
> pricing bug, which is why `/internal/economics/platform` now derives the
> numbers instead of restating them.

## THE COST SHAPE INVERTED WHEN WE MOVED TO GOHIGHLEVEL

Twilio's cost was almost entirely VARIABLE — about $0.084 per answered minute
and ~$2.50/mo fixed per tenant. HighLevel's is mostly **FIXED and MONTHLY**:

| Line | Monthly |
|---|---|
| HighLevel agency plan | $97 Starter · $297 Unlimited · **$497 Agency Pro** |
| AI Employee Unlimited (per enabled location, optional) | $97 |
| Our own infrastructure share | ~$25 |
| LC Phone number, per client | $1.15 |
| Voice AI, pay-per-use | ~$0.13 / min |
| LC Phone telephony only, when AI Employee covers the agent | ~$0.012 / min |

So **cost per minute stops being the deciding number and BREAK-EVEN CLIENT
COUNT starts.** `platformEconomics()` in `src/utils/cost.js` computes it, and
`GET /internal/economics/platform` reports it against the live client count.

### What the model actually says (300 min/client, $497 + AI Employee = $619 fixed)

| Price per client | Break-even |
|---|---|
| $199 / mo | 4 clients |
| **$249 / mo** | **3 clients** |
| $299 / mo | 3 clients |
| $349 / mo | 2 clients |

And on the CURRENT self-serve price, with the same fixed stack:

| Price per client | Break-even |
|---|---|
| $26 / mo (US, today) | 23 clients |
| $49 / mo | 14 clients |

**Read that plainly: the $26 self-serve plan does not carry a $497 platform on
its own.** It is a volume product and it needs volume. That is why the landing
page now shows a second, managed tier at **$249** — the lowest round figure that
breaks even at three clients — and why the pilot is expected to run at a loss.
A pilot below break-even is a deliberate investment, not a margin, and the
endpoint says so in those words rather than averaging it away.

**The $497 plan is what makes any of this sellable**, not because of the
sub-account creation but because it is the only tier that can **rebill usage
with a markup**. $297 rebills at cost, which earns nothing.

## Plan as shipped
| Item | Price |
|---|---|
| **Monthly subscription (US)** | **$26/mo** (`LITE_PRICE_US_CENTS`) |
| **Monthly subscription (CO)** | **$69/mo** (`LITE_PRICE_CO_CENTS`) |
| **Managed tier (US)** | **$249/mo** — derived, see above |
| **Included** | 150 answered minutes/mo (300 on managed) |
| **Overage** | $0.40 / minute |
| Setup | $0 |
| Trial | 7 days |

---

## HISTORY — the Twilio-era model, kept for reference

## Unit economics (why it works)
- Cost per answered call (~90s): **~$0.14** (ConversationRelay $0.07/min + inbound $0.0085/min + Haiku + 1–2 SMS via toll-free).
- Fixed cost per tenant: **~$2.5/mo** (US DID $1.15 + hosting/SMS share).

| Calls/mo | COGS | Revenue ($49) | Gross margin |
|---|---|---|---|
| 30 | ~$7 | $49 | ~86% |
| 60 | ~$11 | $49 | ~78% |
| 100 | ~$16.5 | $49 | ~66% |
| 200 | ~$30.5 | $49 + overage | protected by $0.40/min overage |

Overage covers heavy users: at 150 min included, a 200-call month (~300 min)
bills $49 + 150 overage min × $0.40 = **$109**, keeping margin healthy.

## Future margin lever
ConversationRelay ($0.07/min) is ~75% of call cost. Unbundling to Media Streams
+ Deepgram + Polly drops US cost/call to ~$0.06 → margin on the $49 plan rises
above 90%. Pricing already leaves room for this.

## How it's wired
- `src/routes/billing.js` — plan config, Checkout (subscription + one-time setup
  fee on the first invoice), `GET /usage` (metered minutes + projected overage),
  `POST /overage/bill` (admin-gated; adds a Stripe invoice item for overage).
- Metering source: `lite_calls.duration` for the current billing period
  (Stripe subscription period, else calendar month).
- Dashboard → Settings → Billing shows plan + live usage (minutes used/included,
  overage, estimated total).
- Enable with `LITE_BILLING_ENABLED=1`; amounts overridable via env
  (`LITE_PRICE_US_CENTS`, `LITE_SETUP_US_CENTS`, `LITE_INCLUDED_MIN_US`,
  `LITE_OVERAGE_US_CENTS`).

## Overage billing operations
`POST /internal/economics`-style flow: near each period end, call
`POST /api/billing/overage/bill` (header `x-admin-key: <LITE_ADMIN_KEY>`, body
`{tenant_id}`) to add the period's overage as a Stripe invoice item; it lands on
the customer's next invoice. Wire a Render cron for this once live (TODO).

## Promo levers
- Waive setup fee for launch campaigns (mirror the `WAIVE_SIGNUP_FEES_SLUGS`
  pattern from the main CRM).
- Annual: pay 10, get 12 (retention + cashflow).
