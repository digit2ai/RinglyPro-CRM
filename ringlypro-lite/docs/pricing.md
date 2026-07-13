# RinglyPro Lite — Pricing (US)

US-only for launch. All figures USD. COGS traces to `docs/telephony-costs.md`.

## Plan
| Item | Price |
|---|---|
| **Setup (one-time)** | **$0 (removed)** |
| **Monthly subscription** | **$49/mo** |
| **Included** | **150 answered minutes/mo** (~100 calls @ 90s) |
| **Overage** | **$0.40 / minute** beyond 150 |
| Trial | 7 days |

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
