# BUILD BRIEF v2 — Lawn Co-Pilot: the multi-tenant AI office for landscaping companies

> Supersedes v1 (single-tenant, 4 employees — see git history at commit `03c7a0eb`).
> Handoff: paste this file into `/architect-run`, or run `/ringlypro-architect` with it
> as the build specification. Everything under "Hard Constraints" and "Acceptance
> Criteria" is non-negotiable.

---

## 0. The command

"Build Lawn Co-Pilot as a **multi-tenant AI office for small landscaping companies**. A landscaper signs up, and minutes later has (a) a branded page their customers actually use — `lawncopilot.com/lawn_moster` — where homeowners get an automatic measured quote, book service, pay, and log in to see their schedule and billing; and (b) their **entire back office run by a crew of AI employees orchestrated by one MCP Brain**: answering service, customer service, booking, quoting, accounting, job scheduling, route optimization, cost control, marketing, crew management, employee management, and payroll. The owner does the landscaping. The system does everything else."

### The distribution model — this is Vagaro, not Squarespace

**Small landscapers do not have websites and are not going to buy domains.** They have a truck, a phone number, and a Google Business Profile. Follow the model Vagaro, Booksy and StyleSeat use for salons:

- **The link IS the web presence.** `lawncopilot.com/lawn_moster` is the address they hand out. Not a preview of a real site somewhere else — it is the real thing.
- **Google Business Profile is the front door.** That is where their customers already find them. Our page is what the "Website" and "Book" buttons on that listing point to. Winning means the handoff from the listing to a booked job is seamless.
- **No custom domains.** No DNS, no domain verification, no per-tenant SSL. Explicitly out of scope. Do not build the seam, do not build the table.
- **The link must travel:** QR code for the truck, trailer and yard signs, a short link, and a link-in-bio that works from Facebook and Instagram.

This is a simplification, not a limitation. It removes an entire category of work and it matches how the target customer actually operates.

### The success test

Not "does it match Jobber." Jobber is a reference point, not a spec. The tests are:

1. **Is there any administrative task the owner still has to do himself?** If yes, there is a hole.
2. **Does he need any other subscription to run the company?** If yes, there is a hole.
3. **Does the system hand work back to him, or do it?** A dashboard that organizes work he must still perform is a failure. Approving is not operating.

### What changes from v1

v1 shipped a working single-tenant instance: 31 tables all scoped by `tenant_id`, an MCP Brain with 37 tools, four AI employees, a measured-quote engine, customer portal and admin portal. **That foundation is correct and must be reused, not rebuilt.** v2 adds:

- Tenancy at the front door (slug routing, signup, provisioning, per-tenant branding)
- Four more AI employees (Marketer, Crew Manager, Payroll Officer, Controller)
- The platform layer above the tenants (super-admin, landscaper subscriptions, Stripe Connect)
- The remaining office functions: time tracking, job costing, payroll, marketing, reviews, referrals

---

## 1. Identity

| Field | Value |
|---|---|
| Product | Lawn Co-Pilot |
| Positioning | The AI office for landscaping companies. All-in-one. |
| Vertical folder | `verticals/lawncopilot/` (existing) |
| Mount | `/lawncopilot` |
| Platform site | `/lawncopilot/` — sells to landscapers, carries signup |
| Tenant page | `/lawncopilot/:slug` — e.g. `/lawncopilot/lawn_moster`. Their web presence. No custom domains. |
| Tenant portal | `/lawncopilot/:slug/portal` — the landscaper's customers |
| Tenant admin | `/lawncopilot/:slug/admin` — the landscaper's office |
| Platform admin | `/lawncopilot/platform` — Digit2AI only, above all tenants |
| Brain | `/lawncopilot/mcp/*` |
| Table prefix | `lc_` |
| Language | English (ES seam preserved, not built) |
| Tone | Emoji-free. Plain language. |
| Phase 1 market | Florida |

---

## 2. Hard constraints

1. **Reuse v1.** Do not rebuild the models, Brain, measurement engine, pricing engine, scheduling service, accounting service, portal, or admin. Extend them. Rebuilding working, SIT-covered code is a build failure.
2. **Tenancy is resolved at the edge, never hardcoded.** v1 resolves tenant from `LAWNCOPILOT_TENANT_ID` in 7 files. That is replaced by middleware that resolves the tenant from the URL slug, attaches it to the request, and makes it the ONLY source. No route may read a tenant from an env var or from a request body.
3. **The Brain still owns authorization.** `tenant_id` is injected from session context and ignored from tool arguments. Cross-tenant reads must be impossible at the Brain layer, not just the route layer. SIT asserts this per employee.
4. **One brain per tenant, every channel.** The tenant's web orb, typed chat, phone line, portal assistant and admin copilot all call the same tools with the same tenant context. Duplicating booking, pricing, payroll or billing logic inside a channel is a build failure.
5. **Identity before anything.** Name, phone and email captured before any request on any public entry point, per tenant, written to that tenant's `lc_leads` before the address. Already built — preserve it exactly.
6. **Never fabricate.** No invented measurements, prices, availability, balances, hours, or payroll figures. Everything is labeled with source and confidence, and an inference is never presented as a measurement. Agents never confirm an outcome a tool did not return.
7. **Human sign-off on anything irreversible.** Refunds, payroll runs, terminations, price-rule changes, and outbound marketing blasts park in the approval queue. The AI says a person is approving it because one is.
8. **Payroll is orchestrated, never self-filed.** Tax withholding, remittance and filing go through a licensed embedded-payroll provider (Check, Gusto Embedded, or equivalent). Lawn Co-Pilot computes, presents and triggers; the provider is the filer of record. Building our own tax engine is prohibited.
9. **Marketing is consent-gated.** No outbound marketing to a contact without a recorded opt-in and timestamp. STOP/HELP honored immediately. Review requests follow platform rules (no gating, no incentivizing).
10. **No card data at rest.** Stripe holds it. We store ids, brand, last4, expiry.
11. **Tenant data never leaks into the platform view in raw form.** The super-admin sees usage, health and billing — not customer PII — unless acting under an explicit, audited impersonation session.
12. **Zero-key degradation.** The whole system boots and passes SIT with no external keys. Measurement falls back to labeled heuristics, payments to a disabled mode, payroll to draft-only, marketing to queued, voice to typed chat.
13. **Mobile first.** Both the homeowner surfaces and the crew surfaces are used on phones, outdoors, in sunlight. 44px targets, high contrast, offline-tolerant.
14. **No emojis** anywhere.

---

## 3. THE AI CREW — eight employees, one Brain

The org chart is the product. Each employee is a declarative profile in `src/mcp/employees/` with a role, system prompt, tool set, allowed channels, model, and supervisor role. Adding a ninth is a file, not a refactor.

| # | Employee | Replaces | Owns |
|---|---|---|---|
| 1 | **The Receptionist** | Answering service, front desk, every call missed after 5pm | Every inbound call, web conversation, text and email. Answering service, customer service, client service, booking. Identity capture, FAQs, status, messages, escalation. **Built in v1 — extend.** |
| 2 | **The Estimator** | The truck roll, windshield time, the 3-day quote | Address to defensible price with nobody driving. Measurement, rate-card pricing, line-itemized quotes, confidence and review flags, quote follow-up. **Built in v1 — extend.** |
| 3 | **The Dispatcher** | The whiteboard, the group text, the double-drive | Calendar, capacity, crew assignment, **true route optimization**, day-of coordination, weather holds, on-the-way notices. **Partially built — routing is a stub to replace.** |
| 4 | **The Bookkeeper** | The bookkeeper and the invoice chase | Invoicing on completion, payments, autopay, dunning, AR aging, the ledger, expenses, tax-ready export, provider sync. **Built in v1 as "Administrator" — rename and extend.** |
| 5 | **The Crew Manager** | The clipboard, the group chat, the HR folder | Employees and crews, hiring and onboarding, certifications and expiries, availability, time tracking (clock in/out, geofence), job checklists, performance. **New.** |
| 6 | **The Payroll Officer** | The payroll clerk and the shoebox | Hours to gross to net, pay runs, overtime rules, contractor 1099s, reimbursements, filings via the licensed provider. **New.** |
| 7 | **The Marketer** | The marketing agency they can't afford | The tenant's public site and SEO, review requests, referrals, seasonal campaigns, win-backs, upsells, lead-source attribution, local listings. **New.** |
| 8 | **The Controller** | The advisor they never hired | Administrative cost saving. Job costing, margin per job/customer/crew, underpriced-work detection, route and overtime waste, unbilled work, price-rule recommendations, cash forecast. **New.** |

**Framing rule:** every employee has a visible human supervisor. The tenant admin shows what each did today, what it cost, what it escalated, and what awaits approval, with a per-employee on/off switch. The pitch is "a full office that never sleeps, and you still sign off" — never "the AI runs your company."

**Tool namespaces:**

```
receptionist.*   answer_faq, capture_lead, identify_caller, get_service_status,
                 take_message, create_ticket, send_payment_link, transfer_to_human,
                 handle_complaint, send_followup
estimator.*      verify_address, measure_property, price_quote, explain_price,
                 issue_quote, flag_for_review, chase_stale_quote, recommend_upsell
dispatcher.*     check_availability, book/reschedule/cancel, skip_visit, pause/resume,
                 assign_crew, optimize_route, balance_workload, notify_on_the_way,
                 weather_hold, reassign_on_callout
bookkeeper.*     get_balance, get/issue_invoice, take_payment, enroll/disable_autopay,
                 retry_failed_payment, issue_refund, record_expense, ar_aging,
                 revenue_report, run_dunning, export_books, sync_accounting
crew.*           add_employee, onboard, set_availability, clock_in, clock_out,
                 timesheet, assign_certification, expiring_certifications,
                 job_checklist, performance_summary
payroll.*        compute_pay_run, preview_pay_run, submit_pay_run, overtime_report,
                 contractor_payment, reimbursement, payroll_calendar, filing_status
marketing.*      request_review, send_campaign, referral_link, winback_list,
                 seasonal_offer, lead_source_report, publish_site_change,
                 sync_google_profile, generate_qr, get_share_kit, page_health
controller.*     job_costing, margin_report, underpriced_jobs, route_waste,
                 overtime_waste, unbilled_work, price_recommendations, cash_forecast,
                 savings_summary
```

---

## 4. The Brain (MCP) — multi-tenant

Extend `src/mcp/brain.js`. What it must now enforce:

- **Tenant context is mandatory and injected.** Every `callTool` receives `tenant_id` from resolved request context. A tool call with no tenant is rejected. A `tenant_id` in arguments is discarded (already true — keep and test per employee).
- **Trust levels** as v1: `public_web` → `identified` → `phone` → `customer` → `staff` → `platform`. Add `platform` above staff for super-admin operations, and make `listTools` compute effective trust from the session's verified identity (v1 bug: it computed trust from channel alone and silently withheld every gated tool from the agent — do not regress this).
- **Per-tenant employee enablement.** A tenant on a lower plan may not have the Payroll Officer. Enablement is a tenant setting, checked in the Brain, not the UI.
- **Per-tenant cost metering and caps.** AI spend attributed per tenant per employee; cap degrades to typed-only, never to silent failure.
- **Approval queue is per tenant**, with the tenant's own approvers.
- **Full audit** in `lc_agent_calls` with tenant, employee, tool, channel, actor, redacted args, latency, cost.

Endpoints: `GET /mcp/tools/list`, `POST /mcp/tools/call`, `GET /mcp/employees`, `GET /mcp/health`, plus `GET /mcp/employees/:id/profile` for the admin's AI Staff screen.

---

## 5. Tenancy

### 5.1 Resolution

Middleware, first in the chain:

1. `/:slug/*` where slug matches a live tenant → that tenant.
2. Platform routes (`/`, `/signup`, `/platform`, `/mcp`) → no tenant, or platform context.
3. Unknown slug → 404 with a "no such company" page, never a silent fallback to tenant 1.

The slug is the whole addressing scheme. There is no domain layer.

Reserved slugs: `platform`, `admin`, `portal`, `api`, `mcp`, `signup`, `login`, `health`, `webhooks`, `voice`, `assets`, `static`, `quote`, `www`, plus profanity and impersonation of known brands. Slug rules: lowercase alphanumeric, dash and underscore, 3–40 chars, immutable after launch. The slug is printed on trucks and linked from Google — changing it breaks their entire presence. Support an alias table for redirects if a change is ever unavoidable.

### 5.2 Signup and provisioning

Public form at `/lawncopilot/signup`: company name, desired slug (live availability check), owner name, email, phone, service state and counties, crew count, current tools. On submit, provision in one transaction:

- `lc_tenants` row (name, slug, status `trialing`, brand defaults, business hours, timezone)
- Owner `lc_users` row with role `owner`
- Florida default pricing rules and service plans (`seedDefaultRules` / `seedDefaultPlans` already accept a tenant id — reuse)
- One default crew
- Their public site, live immediately at `/lawncopilot/:slug`
- A welcome email with their link, and their admin dashboard opened

Target: **under 3 minutes from form to a working, quotable site.** Provisioning must be idempotent and must roll back cleanly on failure.

### 5.3 Isolation

Every query scoped by resolved tenant. SIT proves, for each of the eight employees and every REST surface, that tenant B cannot read or mutate tenant A. Add a test that iterates the whole tool registry rather than spot-checking.

### 5.4 Branding

`lc_tenants.brand` JSONB drives the tenant site: company name, logo, accent color, phone, email, service areas, hours, services offered, about copy, hero headline, photos, social links, and license/insurance text. Sensible defaults so an owner who uploads nothing still has a credible site. Logo upload with automatic favicon/PWA icon derivation (v1 already does this from a source image).

---

## 6. The tenant's page — their entire web presence

This is not a portal skin and not a preview of a site hosted elsewhere. `lawncopilot.com/:slug` **is** their web presence, the way `vagaro.com/:salon` is a salon's. Most of these businesses have no website at all today — a Google listing and a phone number is the whole footprint.

### 6.1 The Google Business Profile handoff is the primary funnel

Design for the customer who is standing in their driveway, has just tapped "Website" or "Book" on a Google listing, and is on 4G in sunlight.

- **One screen to value.** The address field and the orb are above the fold. No hero carousel, no "learn more" detour.
- **Sub-2-second load on mobile.** No web fonts blocking render, no third-party scripts, images lazy and sized. This is a hard budget, not an aspiration.
- **Click-to-call is a first-class action**, because half of them will call instead of type.
- **Google Business Profile integration** (Marketer-owned): push the booking link and short link into the listing, pull reviews in, publish posts. When the API is not configured, generate exact copy-paste instructions and the correct URLs so the owner can wire it in two minutes.

### 6.2 The link has to travel

The slug is printed and shared, so ship the tools that carry it:

- **QR code** generated per tenant, downloadable at print resolution for truck doors, trailers, yard signs and door hangers
- **Short link** (`lawncopilot.com/l/xxxx`) for texts and business cards
- **Link-in-bio** behavior that works when opened inside the Facebook and Instagram in-app browsers — test this explicitly, those webviews break things
- **Open Graph card** so the link previews properly when pasted into Facebook, Nextdoor and text messages
- A **share sheet** in the admin: "text me my link", "email me my QR", "copy for Google"

### 6.3 Pages and content

`/lawncopilot/:slug` plus: services, service areas, about, reviews, contact, FAQ, privacy, terms.

**Must include:**
- Their branded talking orb — speak or type, same conversation, gated on name/phone/email first (v1 behavior, preserved per tenant)
- Instant measured quote with the scaled property diagram (v1, preserved)
- Book, create account, pay, enable autopay
- Customer login to the client hub
- Click-to-call their AI receptionist number
- Real reviews pulled from the review system, never invented
- JSON-LD `LocalBusiness` with their real name, address and phone, consistent with their Google listing (NAP consistency is the one SEO factor that actually matters here)
- Mobile sticky CTA; Lighthouse mobile performance >= 90, accessibility >= 95

**SEO expectations, honestly scoped.** These tenants are not going to outrank anyone on a shared path URL, and the brief should not pretend otherwise. The realistic wins are: the Google listing ranks and converts, NAP is consistent, the page loads fast and converts, and reviews accumulate. Do not build per-city doorway pages — they are low value on a shared domain and risk looking spammy. A platform-level directory of live tenants is worth building for internal linking and as a lead source.

**Marketer-editable:** the owner changes headline, services, photos and copy from the admin, or asks the Marketer in conversation. Changes publish immediately; every publish is versioned and revertible.

---

## 7. Answering, customer and client service (Receptionist)

24/7 across phone, web orb, typed chat, SMS and email. Per-tenant phone number provisioned at signup (or ported). `/voice/incoming` resolves the tenant from the **dialed number**, not an env var.

Handles: service explanation, FAQs, quoting handoff, booking, reschedule, cancel, status, arrival windows, billing questions, payment links, complaints, escalation to the owner. Knows the caller by number and greets returning customers by name.

Complaint path is explicit: acknowledge, capture, open a ticket, notify the owner, offer a concrete next step, never argue, never promise a refund without approval.

Every conversation logged with intent, outcome, tools used, transcript, and escalation flag, reviewable in the tenant admin.

---

## 8. Quote services (Estimator)

v1 engine preserved: address → parcel and footprint data → subtract driveway/patio/walks → serviceable area → rate card → line-itemized price per frequency, with confidence, sources, `is_estimate`, and a review flag for outliers. Providers: `heuristic` (zero-key, always labeled) → `parcel` (Regrid/ATTOM) → `imagery_ai`. Cached per address for 180 days.

**Add:** quote follow-up (the Estimator chases quotes that go quiet on a cadence, then hands to the Marketer for the win-back list), optional add-on recommendation based on property attributes, and multi-service quoting (mow, fert, hedges, cleanup, irrigation) rather than mowing only.

---

## 9. Booking and job scheduling (Dispatcher)

Real availability only, from real crew capacity. Recurring plans, skips, pauses, reschedules, cancellation policy, weather holds, arrival windows, on-the-way notices, callout reassignment.

**Add over v1:** capacity modeled from crew size, skills and working hours rather than a flat number; job duration estimated from serviceable area and service type; workload balancing across crews; and a recurring-visit generator that respects seasonality (Florida growing season).

---

## 10. Route optimization (Dispatcher)

v1 ships a west-to-east sweep placeholder. **Replace with real optimization:** per-crew daily route minimizing drive time under constraints — time windows, crew skills, job durations, vehicle/trailer capacity, and depot start/end. Solve with a proper heuristic (nearest-neighbor plus 2-opt/or-opt improvement is sufficient; a solver library is acceptable). Distances from a routing provider when configured, straight-line fallback when not, clearly labeled.

Output: ordered stops, drive time, drive distance, and **the savings versus the unoptimized order** — that number feeds the Controller and is the proof the tenant sees.

---

## 11. Accounting (Bookkeeper)

v1: per-visit invoicing on completion, Stripe payments, autopay with advance notice, dunning ladder that flags for a human rather than cancelling service, AR aging, revenue reporting, tax-ready CSV.

**Add:** expense capture (receipt photo, category, vendor, job allocation), supplier bills, chart of accounts mapping, profit and loss, sales tax handling by jurisdiction, and one-way sync to QuickBooks Online or Xero when connected. Reconciliation view so the owner can see the books are right without opening a spreadsheet.

---

## 12. Crew and employee management (Crew Manager)

Employees with roles, pay rate, employment type (W2/1099), hire date, documents, emergency contact. Certifications and licenses with expiry alerts (pesticide applicator, CDL, insurance). Availability and time-off requests. Crews as assignable teams with skills.

**Time tracking:** clock in/out from the crew's phone, per job, with optional geofence and photo verification. Breaks, overtime accrual, and an approval step for the owner. Timesheets feed payroll directly — no re-entry, ever.

**Job execution:** the crew app shows today's route, job details, property notes, gate codes, hazards, checklists, and before/after photo capture. Completing a job triggers the invoice automatically.

---

## 13. Payroll (Payroll Officer)

Approved timesheets → gross → overtime → deductions → net → pay run. Contractor payments and 1099s. Reimbursements. Pay calendar and reminders.

**Boundary, non-negotiable:** an embedded-payroll provider is the filer of record for withholding, remittance and filings. Lawn Co-Pilot computes, presents for approval, and triggers. Without a provider configured, payroll operates in **draft-only** mode: it produces the numbers and the register, clearly marked as not filed, and refuses to represent anything as remitted.

Every pay run requires explicit owner approval through the queue. No pay run ever executes autonomously.

---

## 14. Marketing (Marketer)

- **Review generation:** automatic request after a completed job, timed and consent-aware, routed to the tenant's chosen platform. No gating, no incentives, no fake reviews. Ever.
- **Referrals:** per-customer referral codes and rewards, tracked to conversion.
- **Campaigns:** seasonal offers, service upsells, dormant win-backs, new-neighbor targeting around existing routes (a real advantage — density lowers drive time).
- **Their Google Business Profile:** the front door. Keep the booking link and short link on the listing, sync reviews in, publish posts, watch for NAP drift. When the API is unavailable, hand the owner exact copy-paste values.
- **Their page:** content updates, photos, service list, load-speed health, and the QR/short-link/share tooling.
- **Attribution:** every lead carries source and campaign through to revenue, so the owner sees what actually works.

All sends consent-gated, rate-limited, and quiet-hours-aware. Campaigns above a size threshold require owner approval.

---

## 15. Administrative cost saving (Controller)

The employee that finds money. Weekly digest plus on-demand answers:

- **Job costing:** labor (from real clocked hours), drive time, materials, overhead → true margin per job, per customer, per crew, per service.
- **Underpriced work:** jobs consistently below target margin, with a specific recommended price change and the revenue impact.
- **Route waste:** drive time versus optimal, cost of the gap, and the clustering that would fix it.
- **Overtime waste:** where overtime is structural rather than exceptional.
- **Unbilled work:** completed jobs with no invoice, add-ons performed but not charged, recurring plans that stopped billing.
- **Cash forecast:** expected collections against known costs and payroll dates.
- **Savings summary:** what the system saved this month — captured after-hours calls, quotes issued without a truck roll, drive time avoided, invoices collected without chasing. This is the renewal argument, and every figure must be traceable to real records. No invented savings.

---

## 16. The platform layer (Digit2AI)

**Super-admin** at `/lawncopilot/platform`, separate credentials, above all tenants: tenant list with health and usage, signups and churn, AI spend per tenant and per employee, error and escalation rates, subscription status, feature-flag and plan management, audited impersonation for support.

**Landscaper subscriptions:** plans with limits (crews, employees, AI actions, whether Payroll and Marketer are enabled), trial handling, upgrade/downgrade, dunning for the tenant's own bill, and suspension that degrades gracefully rather than deleting data.

**Homeowner payments via Stripe Connect:** money flows to the landscaper's own connected account; the platform takes an application fee. Onboarding is part of signup, and until it completes the tenant runs in quote-and-schedule mode with payments clearly marked unavailable.

---

## 17. Data model additions

Extend the existing 31 `lc_` tables. New, all tenant-scoped:

```
lc_employees              staff records, pay rate, type, documents, status
lc_certifications         license/cert with expiry and reminder state
lc_availability           working hours, time off
lc_time_entries           clock in/out, job, geo, break, approval state
lc_job_checklists         per service type, completion records
lc_pay_runs               period, totals, status, provider reference
lc_pay_items              per employee: hours, gross, deductions, net
lc_expenses               receipt, vendor, category, job allocation
lc_supplier_bills         payables
lc_job_costs              computed labor/drive/material/overhead per job
lc_routes                 optimized route per crew per day, savings vs baseline
lc_campaigns              marketing campaign definition and audience
lc_campaign_sends         per-recipient send, consent snapshot, outcome
lc_reviews                request, platform, status, resulting rating
lc_referrals              code, referrer, referee, reward, conversion
lc_site_content           per-tenant page content, versioned, revertible
lc_short_links            short code -> tenant, scan/click counts, source tag
lc_subscriptions_platform the landscaper's own plan and billing
lc_platform_users         Digit2AI super-admins
lc_tenant_settings        feature flags, enabled employees, plan limits
```

Also: add `slug`, `status`, `plan`, `stripe_account_id`, `trial_ends_at` to `lc_tenants`; add `tenant_id` scoping to customer auth so the same email can exist at two companies.

---

## 18. Delivery phases (weeks, not months)

**Week 1 — Tenancy.** Resolution middleware replacing all 7 hardcoded env reads, signup and provisioning, slug rules and reserved words, per-tenant branding, templated tenant page, share kit (QR + short link + OG card), tenant-scoped customer auth, per-tenant phone routing. Existing SIT must still pass, extended for multi-tenant isolation across the whole tool registry.

**Week 2 — The office deepens.** Crew Manager and time tracking, crew mobile job surface, real route optimization with measured savings, expenses and job costing, Bookkeeper extensions.

**Week 3 — Money and growth.** Payroll Officer with provider integration and draft-only fallback, Stripe Connect onboarding, platform subscriptions, Marketer with reviews/referrals/campaigns, Controller with the savings digest.

**Week 4 — Platform and hardening.** Super-admin, plan limits and feature flags, per-tenant cost metering, link distribution (QR, short link, GBP handoff), SEO pass, load and security review, and the production cutover plan for lawncopilot.com.

---

## 19. Environment variables

Existing v1 vars are preserved. New:

| Var | Purpose | Unset behavior |
|---|---|---|
| `LAWNCOPILOT_PLATFORM_SECRET` | Signs platform super-admin sessions | Must be set on prod |
| `LAWNCOPILOT_BASE_DOMAIN` | Canonical host used to build shareable tenant links and QR codes | Falls back to request host |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe Connect onboarding | Payments run platform-collect, flagged in UI |
| `STRIPE_PLATFORM_FEE_BPS` | Application fee in basis points | `0` |
| `PAYROLL_PROVIDER` | `check` / `gusto` / unset | Unset = payroll draft-only, never represented as filed |
| `PAYROLL_PROVIDER_KEY` | Provider credential | Draft-only |
| `ROUTING_PROVIDER_KEY` | Real drive-time matrix | Straight-line distance, labeled as an estimate |
| `GOOGLE_BUSINESS_PROFILE_KEY` | GBP sync: booking link, reviews, posts | Owner is given copy-paste instructions instead |
| `REVIEW_PLATFORM_KEYS` | Google/Facebook review routing | Review requests queue with a manual link |
| `QBO_CLIENT_ID` / `XERO_CLIENT_ID` | Accounting sync | Export CSV only |
| `LAWNCOPILOT_SIGNUP_OPEN` | Gate public signup | `1` |
| `LAWNCOPILOT_TRIAL_DAYS` | Trial length | `14` |

---

## 20. Acceptance criteria

All curl- or SIT-verifiable, with zero external keys unless stated.

1. `GET /lawncopilot/health` and `/lawncopilot/mcp/health` return 200 with `db: ok`.
2. Signup provisions a working tenant in one transaction; `/lawncopilot/:slug` is live and quotable immediately; rollback is clean on induced failure.
3. Two tenants provisioned in SIT, each with different rate cards, produce **different prices for the same address**, proving pricing isolation.
4. **No route resolves a tenant from an env var.** SIT greps the source and fails on any `LAWNCOPILOT_TENANT_ID` read outside a migration or seed script.
5. Unknown slug returns 404, never tenant 1.
6. Reserved and malformed slugs are rejected at signup.
7. **Full-registry isolation:** SIT iterates every tool in the registry as tenant B against tenant A's records and asserts every one fails.
8. A homeowner with the same email at two tenants gets two independent accounts and cannot see the other's data.
9. The identity gate remains unbypassable per tenant across every entry point, with the lead written before the address.
10. A tenant's typed conversation completes a full measured estimate with zero voice keys, and the price matches the wizard and the orb tool bridge to the cent.
11. Line items reconcile to the total for every frequency, every tenant.
12. Inbound call to tenant A's number is answered in tenant A's context, with tenant A's data and voice.
13. Route optimization returns an ordered route with drive time and **measured savings versus baseline**; savings are never negative or invented.
14. Clock in/out produces a timesheet that flows into a pay run with no re-entry.
15. **Payroll never self-files.** With no provider configured, a pay run is produced, marked draft, and every surface says it is not filed. SIT asserts the wording.
16. Every pay run requires explicit approval and cannot execute autonomously.
17. Refunds, large campaigns and price-rule changes park in the approval queue and execute only after an authorized approval.
18. Marketing send to a contact without recorded consent is refused, and STOP updates consent immediately.
19. Review requests are never gated or incentivized; SIT asserts no conditional logic on predicted rating.
20. Controller figures trace to real records; SIT asserts no savings figure is produced without underlying rows.
21. Stripe webhook handling is idempotent per tenant on event id.
22. No PAN/CVV column exists anywhere; card details posted to any endpoint are refused.
23. Platform super-admin cannot read tenant customer PII without an audited impersonation session.
24. Per-tenant AI cost is metered and the cap degrades to typed-only with a clear message.
25. PWA and app-shell assets serve before the auth gate; pages still redirect when signed out.
26. Tenant page mobile Lighthouse: performance >= 90, accessibility >= 95, SEO >= 95, and **first contentful paint under 2s on a simulated 4G mobile profile**.
27. Every tenant has a working QR code, a short link that resolves to their page, and an Open Graph card that renders correctly when the link is pasted.
28. The tenant page functions inside the Facebook and Instagram in-app browsers, including the orb's typed path.
29. No custom-domain code, table, or DNS logic exists anywhere in the vertical.
30. `node verticals/lawncopilot/sit.js` passes 100% with no external keys. The existing 108 assertions must continue to pass.

---

## 21. Decisions the operator still owns

Build with the stated defaults; do not block. Flag these in the final report.

- **Stripe Connect vs platform-collect.** Brief assumes Connect with an application fee.
- **Subscription pricing.** Assume tiered flat monthly with crew/employee limits and Payroll + Marketer as higher-tier features. Real numbers needed.
- **Payroll provider.** Assume Check or Gusto Embedded. Commercial agreement needed before it can go live.
- **White-label depth.** Assume "Powered by Lawn Co-Pilot" in the tenant site footer, removable on higher tiers.
- **Florida rate card.** Current defaults ($0.0042/sq ft, $45 minimum) are placeholders pending real numbers.
- **Cancellation, refund and no-show policy text** for the tenant terms.

---

## 22. Reporting requirement

On completion report: platform URL, a live demo tenant URL and its QR/short link, super-admin URL, the commit and deploy, which of the twelve service areas shipped complete versus seam-only, SIT output, the external keys still required (parcel provider, Maps, Stripe Connect, payroll provider, routing provider, review platforms), and every operator decision still outstanding. Do not stop for those — build with the stated defaults, mark unconfirmed figures as `TODO: client-confirmed`, and list them.
