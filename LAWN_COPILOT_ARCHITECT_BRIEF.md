# BUILD BRIEF — Lawn Co-Pilot AI Lawn Care Ecosystem

> Handoff format: paste this entire file into `/architect-run`, or run
> `/ringlypro-architect` with this file as the build specification.
> Treat every line under "Hard Constraints" and "Acceptance Criteria" as non-negotiable.

---

## 0. One-line command (what the operator says)

"Build the Lawn Co-Pilot ecosystem: a redesigned site whose landing page is a **talking orb** — a visitor speaks or types and gets a real lawn-care estimate in conversation — positioned as **the next-generation AI office for landscaping companies**, staffed by a crew of AI employees (Receptionist, Estimator, Dispatcher, Administrator/Accounting). Behind it: an automated property-measurement + pricing engine that turns an address into an instant quote with no truck roll, a secure customer portal with scheduling / service history / billing / autopay, and an admin portal where staff review measurements, set regional pricing, and run operations. Phase 1 market is Florida. Mount it at `/lawncopilot` as a self-contained vertical."

### The two audiences (both served by one site)

| Audience | What they need to feel in 5 seconds | Their path |
|---|---|---|
| **Landscaping company owner** (the buyer) | "This is the AI office my company has been missing — a full staff that never sleeps, starting with the phones." | AI-workforce story -> see the orb quote a property live -> book a demo / start onboarding |
| **Homeowner** (the proof) | "I can just tell it my address and get a real price right now." | Orb or typed chat -> identity -> address -> measured area -> price -> book -> pay |

The homeowner flow is not a separate site — it **is** the demo. A landscaper watching the orb quote a real property is watching the product sell itself.

---

## 1. Project identity

| Field | Value |
|---|---|
| Product name | Lawn Co-Pilot |
| Client site (to replace) | https://lawncopilot.com/ |
| Vertical folder | `verticals/lawncopilot/` |
| Mount path | `/lawncopilot` |
| Public marketing site | `/lawncopilot/` (served from `verticals/lawncopilot/public/`) |
| Customer portal | `/lawncopilot/portal` |
| Admin portal | `/lawncopilot/admin` |
| Health | `GET /lawncopilot/health` |
| Debug | `GET /debug/lawncopilot-error` |
| Table prefix | `lc_` |
| Language | English only (Phase 1). Architecture must not block a later ES pass. |
| Tone | Emoji-free. Professional, "technology-powered lawn care company", not a landscaping brochure. |
| Phase 1 geography | Florida |

---

## 2. Hard constraints (do not deviate)

1. **Self-contained vertical.** Follow the existing `verticals/veritas` + `verticals/speakup` pattern exactly: own Express Router, own Sequelize instance in `verticals/lawncopilot/src/db.js` using `CRM_DATABASE_URL || DATABASE_URL`, tables auto-created on boot via `sync({ alter: false })`, canonical SQL migration checked in at `verticals/lawncopilot/migrations/20260723_lawncopilot_tables.sql`. New columns added later go through idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init — `sync({alter:false})` never adds columns.
2. **Multi-tenant from day one.** Every table carries `tenant_id NOT NULL` with an index; every query is scoped by `req.user.tenant_id` (or the resolved tenant for public quote requests). Lawn Co-Pilot is tenant 1; the schema must support franchise / multi-location operators later with zero migration.
3. **Never store raw card data.** All card handling goes through Stripe (Elements / SetupIntent / Customer + PaymentMethod). Our DB stores only Stripe ids, brand, last4, exp. PCI scope stays with the processor.
4. **No fabricated measurements.** If parcel data or footprint data is unavailable for an address, the response must be explicitly labeled `is_estimate: true` with `confidence: low|medium|high` and a stated `source`. Never present a synthesized number as a verified measurement. Every quote surface must show the "preliminary, subject to final property verification" disclaimer when confidence is not `high`.
5. **Human override on every automated decision.** Admin can edit serviceable square footage, override price, approve/reject an estimate, and every override is written to an audit row (who, when, old value, new value, reason).
6. **Zero-key degradation.** The build must boot and pass SIT with no external keys set: measurement falls back to a labeled heuristic estimator, Stripe falls back to a disabled-payments mode, the AI receptionist falls back to the existing ConversationRelay stack, SendGrid/Twilio sends are logged not transmitted. No feature may crash the router because a key is missing.
7. **Respect `EMAIL_AUTOSEND_DISABLED`** (default ON in this repo). Server-initiated emails must be drafted and queued, not blasted, unless the flag is explicitly `0`. User-clicked sends (customer pays invoice, admin clicks "send invoice") are allowed through.
8. **Reuse, do not rebuild.** Phone voice = the existing ConversationRelay stack (`src/services/conversationRelayAgent.js` + `src/routes/voice-relay.js`) with a Lawn Co-Pilot tool set, NOT a new telephony integration. Web orb voice = a dedicated ElevenLabs convai agent (4.1.1). SMS = existing Twilio wiring. Email = existing SendGrid service. Auth = the JWT + HttpOnly cookie pattern used by the other verticals. Portal/admin app shell = the Planea pattern (4.0.2).
9. **One brain, every channel.** All AI capability is exposed as tools on the Brain MCP Server (4.0.1) and every channel — orb, phone, typed chat, admin copilot — calls the same tools. Duplicating booking, pricing, or billing logic inside a channel is a build failure.
10. **Identity before anything.** Name, phone, and email are captured before any request is processed on any public entry point — orb click, text input focus, prompt chip, submit, upload. No side doors. (4.1.1)
11. **Mobile first.** Portal and quote flow must be fully usable on a phone; 44px touch targets, safe-area insets. The quote flow is the conversion path — it must work one-handed.
12. **Voice is an enhancement, never a requirement.** Every single thing the orb can do must be completable by typing, with no keys configured. If the SDK fails, the mic is denied, or the browser is unsupported, the visitor still gets a full estimate.
13. **No emojis anywhere** in UI copy, code comments, commit messages, or generated documents.

---

## 3. Requirement extraction (ANALYZE output — pre-filled)

```yaml
feature_name: lawncopilot
type: full_vertical   # marketing_site + voice_agent + quote_engine + customer_portal + admin_portal + billing

brain:
  type: mcp_server                     # ONE brain, all channels — see 4.0.1
  location: verticals/lawncopilot/src/mcp/
  endpoints: [tools/list, tools/call, employees, health]
  registry: src/mcp/employees/*.js     # declarative employee profiles
  enforces: [role_auth, channel_auth, tenant_scoping, audit_log, cost_guard, approval_queue]

agents_needed:                          # four AI employees, one shared brain
  - name: Receptionist
    channels: [inbound_call, web_orb, web_chat]
    engines:
      phone: twilio_conversation_relay  # Twilio CR + Claude Haiku + Amazon Polly
      web: elevenlabs_convai            # dedicated agent, EN (+ES seam)
      fallback: webspeech + claude + /api/tts/edge
    purpose: 24/7 reception, FAQs, lead capture, status, messages, escalation
    tools: receptionist.*
  - name: Estimator
    channels: [web_orb, web_chat, inbound_call, admin]
    purpose: address -> measured serviceable area -> line-itemized price, no truck roll
    tools: estimator.*
  - name: Dispatcher
    channels: [web_orb, web_chat, inbound_call, portal, admin]
    purpose: availability, booking, reschedule/skip/pause, crew assignment, routing, weather holds
    tools: dispatcher.*
  - name: Administrator
    channels: [portal, inbound_call, admin]
    purpose: invoicing, payments, autopay, dunning, AR aging, reports, the books
    tools: administrator.*

data_requirements:
  new_tables:
    - lc_tenants           # operator/franchise record, brand config, service region defaults
    - lc_users             # staff + admin accounts (role: owner|admin|dispatcher|csr|tech)
    - lc_customers         # homeowner account (email, phone, name, status, stripe_customer_id)
    - lc_properties        # address + geocode + parcel data + measured areas + access notes
    - lc_property_geometry # JSONB GeoJSON: parcel polygon, building footprint, excluded polygons
    - lc_measurements      # every measurement attempt: source, raw payload, computed areas, confidence, is_estimate
    - lc_measurement_overrides # admin edits to serviceable sqft (audit trail)
    - lc_pricing_rules     # regional + tier + frequency + surcharge rules (JSONB conditions)
    - lc_service_plans     # weekly / biweekly / monthly / one-time + included services
    - lc_addon_services    # optional services attached to a plan or a single visit
    - lc_quotes            # a priced offer: property + plan + line items + status + expiry
    - lc_quote_line_items
    - lc_leads             # pre-account capture from web + phone (name, phone, email, address, source)
    - lc_subscriptions     # active recurring service agreement (plan, frequency, price, next_service_date)
    - lc_appointments      # scheduled visits (date, window, crew, status)
    - lc_service_records   # completed visit history + photos + notes + weather + charges
    - lc_service_photos
    - lc_crews             # service teams / technicians
    - lc_invoices
    - lc_invoice_line_items
    - lc_payments          # attempts + results, stripe payment_intent ids
    - lc_payment_methods   # stripe payment_method ids + brand/last4/exp only
    - lc_autopay_enrollments
    - lc_tickets           # support requests / service issues / measurement disputes
    - lc_messages          # threaded customer <-> staff messages + portal notifications
    - lc_notifications     # outbound comms log (channel, template, status, provider id)
    - lc_call_logs         # AI receptionist call summaries + transcript ref + outcome
    - lc_agent_sessions    # one row per orb/chat/phone conversation: channel, identity, outcome
    - lc_agent_calls       # every MCP tool call: employee, tool, args (redacted), result, latency, cost
    - lc_agent_approvals   # tool calls parked for human approval
    - lc_audit_log         # every admin override / status change
  existing_tables_modified: []   # zero changes to the shared CRM schema

api_endpoints:
  # brain (MCP) — every channel routes through here
  - GET  /lawncopilot/mcp/tools/list
  - POST /lawncopilot/mcp/tools/call
  - GET  /lawncopilot/mcp/employees
  - GET  /lawncopilot/mcp/health
  # orb / conversational entry
  - POST /lawncopilot/api/v1/orb/identity        # REQUIRED gate: name + phone + email -> lc_leads
  - POST /lawncopilot/api/v1/orb/session         # start a voice or typed session
  - POST /lawncopilot/api/v1/orb/message         # typed turn (same brain as voice)
  - POST /lawncopilot/api/v1/orb/tool            # convai client-tool bridge -> MCP brain
  - GET  /lawncopilot/api/v1/orb/config          # agent ids / fallback mode, no secrets
  - POST /lawncopilot/api/v1/orb/transcript/email
  # public / unauthenticated
  - POST /lawncopilot/api/v1/quote/address-verify
  - POST /lawncopilot/api/v1/quote/measure
  - POST /lawncopilot/api/v1/quote/price
  - POST /lawncopilot/api/v1/quote/accept
  - GET  /lawncopilot/api/v1/quote/:token
  - POST /lawncopilot/api/v1/leads
  # customer portal (cookie: lawncopilot_token)
  - POST /lawncopilot/api/v1/auth/register|login|logout|magic-link|verify
  - GET  /lawncopilot/api/v1/me/dashboard
  - GET|PATCH /lawncopilot/api/v1/me/property
  - POST /lawncopilot/api/v1/me/property/dispute
  - GET  /lawncopilot/api/v1/me/schedule
  - POST /lawncopilot/api/v1/me/schedule/:id/reschedule|skip|cancel
  - POST /lawncopilot/api/v1/me/schedule/pause|resume
  - POST /lawncopilot/api/v1/me/service-request
  - GET  /lawncopilot/api/v1/me/history
  - GET  /lawncopilot/api/v1/me/invoices
  - GET  /lawncopilot/api/v1/me/invoices/:id/pdf
  - POST /lawncopilot/api/v1/me/invoices/:id/pay
  - GET|POST|DELETE /lawncopilot/api/v1/me/payment-methods
  - POST /lawncopilot/api/v1/me/autopay/enroll|update|disable
  - GET|POST /lawncopilot/api/v1/me/messages
  # admin portal (role-gated)
  - GET|PATCH /lawncopilot/api/v1/admin/leads
  - GET|PATCH /lawncopilot/api/v1/admin/customers
  - GET|PATCH /lawncopilot/api/v1/admin/measurements/:id     # override serviceable sqft
  - POST /lawncopilot/api/v1/admin/quotes/:id/approve|modify|reject
  - GET|POST|PATCH|DELETE /lawncopilot/api/v1/admin/pricing-rules
  - GET|POST|PATCH /lawncopilot/api/v1/admin/service-plans
  - GET|POST|PATCH /lawncopilot/api/v1/admin/schedule
  - POST /lawncopilot/api/v1/admin/schedule/:id/assign-crew|status
  - POST /lawncopilot/api/v1/admin/service-records/:id/photos
  - GET|POST /lawncopilot/api/v1/admin/invoices
  - GET  /lawncopilot/api/v1/admin/payments
  - GET|PATCH /lawncopilot/api/v1/admin/tickets
  - GET  /lawncopilot/api/v1/admin/calls          # AI receptionist summaries
  - GET  /lawncopilot/api/v1/admin/ai-staff       # roster, live status, per-employee activity + cost
  - PATCH /lawncopilot/api/v1/admin/ai-staff/:id  # enable/disable an employee, edit escalation policy
  - GET|POST /lawncopilot/api/v1/admin/ai-staff/approvals   # human-in-the-loop queue
  - GET  /lawncopilot/api/v1/admin/reports/:kind  # revenue, jobs, conversion, AR aging
  # webhooks
  - POST /lawncopilot/webhooks/stripe
  - POST /lawncopilot/webhooks/twilio-sms
  - POST /lawncopilot/voice/incoming              # delegates to the ConversationRelay TwiML entry

integrations:
  - service: twilio_conversation_relay   # voice reception (reuse src/services/conversationRelayAgent.js)
  - service: anthropic                   # Claude Haiku brain (reuse ANTHROPIC_API_KEY)
  - service: amazon_polly                # TTS via ConversationRelay (no new key)
  - service: twilio_sms                  # confirmations, reminders, payment links
  - service: sendgrid                    # transactional email (honors EMAIL_AUTOSEND_DISABLED)
  - service: stripe                      # cards, wallets, ACH, autopay via subscriptions/invoices
  - service: google_maps                 # geocode + address autocomplete + static satellite imagery
  - service: parcel_data_provider        # Regrid (primary) / ATTOM (alt) / county open data (FL fallback)
  - service: building_footprint          # Microsoft/Google Open Buildings, OSM, or Google Solar API
  - service: openweather                 # weather-delay automation (Phase 3)

frontend_components:
  - marketing site (static HTML/CSS/JS, no build step) — orb-led hero + AI Crew block
  - talking orb + typed chat + required identity gate (name/phone/email)
  - instant quote wizard (4 steps, also drivable entirely by conversation)
  - service-area visualization map (satellite tile + polygon overlays)
  - customer portal — Planea-shaped app (per-module HTML, bottom tabs, PWA, resident assistant)
  - admin portal — same app shell + AI Staff screen, measurement polygon editor, pricing rule builder

success_criteria:
  - A visitor can complete a full estimate BY VOICE and BY TYPING, both gated on name/phone/email first
  - An address entered on the public site returns a measured serviceable area and a price in under 8 seconds
  - The full path visit -> quote -> account -> schedule -> card on file -> autopay works end to end with no human touch
  - An inbound call to the Lawn Co-Pilot number is answered by the AI, which can quote, book, and text a payment link
  - Orb, phone, and admin copilot all produce the identical price for the same address (one brain, verified)
  - The admin AI Staff screen shows what each of the four employees did today, with cost and escalations
  - Admin can override any measurement or price and the change is audited
  - GET /lawncopilot/health and GET /lawncopilot/mcp/health both return 200 with db:ok
  - node verticals/lawncopilot/sit.js passes with zero external keys set
```

---

## 4. Module specifications

### 4.0 THE AI CREW — the product's organizing idea

Lawn Co-Pilot is not "a website with a chatbot." It is **an AI office for a landscaping company**: a staffed org chart where each role is an AI employee with a name, a job description, a defined tool set, and a human supervisor who can override it. The site, the portal, and the admin app are all just windows into that office.

Every surface — marketing copy, admin nav, call logs, reports — refers to these four by role, consistently. This is the spine of the brand.

| # | AI employee | Replaces | Owns | Tools / scope |
|---|---|---|---|---|
| 1 | **The Receptionist** | Front desk, answering service, missed calls after 5pm | Every inbound call and web conversation, 24/7 | Answers the phone, speaks naturally, explains services, answers FAQs, captures name / phone / email / address, pulls or generates a preliminary estimate, books, reschedules, cancels, takes messages, reports appointment and service status, answers basic billing questions, sends the payment link, opens support tickets, escalates to a human. Detailed in 4.2. |
| 2 | **The Estimator** | The owner's truck, the windshield time, the "I'll come out Tuesday" delay | Turning an address into a defensible price without anyone driving anywhere | Verifies the address, pulls parcel + footprint data, computes serviceable area, applies the regional rate card and every surcharge/discount rule, produces a line-itemized quote with a confidence level, flags low-confidence jobs for human review. Detailed in 4.3 - 4.5. |
| 3 | **The Dispatcher** | The whiteboard, the group text, the crew that drives across the county twice | Scheduling, routing, and crew assignment | Holds the calendar, offers real availability, assigns crews, sequences the day geographically, handles reschedules / skips / pauses, reacts to weather delays, sends the on-the-way notification, keeps arrival windows honest. Phase 1 = manual-order dispatch with the route-optimization seam built; Phase 2 = true optimization. Detailed in 4.7 and 4.10. |
| 4 | **The Administrator** | The bookkeeper, the invoice chase, the shoebox of receipts | Back office and money | Invoices on service completion, runs autopay, chases failed payments on a dunning schedule, tracks the balance and AR aging, files receipts and service records, handles billing questions, produces the operational and financial reports the owner actually looks at. Detailed in 4.8 and 4.10. |

**Accounting sits inside the Administrator** as its own named sub-function ("the books"): invoice ledger, payments received, refunds, AR aging, revenue by period and by crew, tax-ready CSV/QuickBooks-shaped export. Build it as a distinct module (`services/accounting.js`) under the Administrator rather than scattering money logic across routes.

Non-negotiable framing rule: **every AI employee has a visible human supervisor.** Each one's work surfaces in the admin portal for review, override, and audit. The pitch is "a full crew that never sleeps, and you still sign off" — never "the AI runs your company."

Extensibility: adding a fifth employee later (a Sales/Upsell rep, a Retention agent, a Field Tech assistant) must be a matter of registering a new agent profile + tool set, not re-architecting. Structure the agent layer as a registry from day one — that registry is the Brain MCP Server below.

### 4.0.1 The Brain — MCP server that runs the AI employees

There is **one brain**, not four. Build a central **MCP server** at `verticals/lawncopilot/src/mcp/` that owns every AI employee's capabilities as tools, and route **all** agent traffic through it — the landing-page orb, the phone Receptionist, the typed chat, the admin copilot, and any future channel. No channel gets its own private copy of the booking logic or the pricing logic. Repo precedent for the shape: `src/routes/mcp-oee.js` (tools/list + tools/call over HTTP).

**Endpoints**
- `GET  /lawncopilot/mcp/tools/list` — the full tool catalog, filterable by employee and by caller role
- `POST /lawncopilot/mcp/tools/call` — `{ tool, arguments, context: { tenant_id, channel, actor, session_id } }`
- `GET  /lawncopilot/mcp/employees` — the roster, each with role, status, tool set, and current supervisor
- `GET  /lawncopilot/mcp/health`

**Tool namespacing — one namespace per employee**

```
receptionist.*   answer_faq, capture_lead, identify_caller, get_service_status,
                 take_message, create_ticket, transfer_to_human, send_payment_link
estimator.*      verify_address, measure_property, price_quote, explain_price,
                 issue_quote, flag_for_review
dispatcher.*     check_availability, book_appointment, reschedule_appointment,
                 cancel_appointment, skip_visit, pause_service, assign_crew,
                 sequence_route, notify_on_the_way, weather_hold
administrator.*  get_balance, get_invoice, issue_invoice, take_payment,
                 enroll_autopay, retry_failed_payment, ar_aging, revenue_report,
                 export_books
```

**Rules the Brain enforces centrally, so no channel can violate them:**
- **Single source of truth.** A tool is implemented once, in the service layer, and exposed once. The orb, the phone, and the admin copilot calling `estimator.price_quote` get byte-identical arithmetic.
- **Role + channel authorization on every call.** A public web orb session cannot call `administrator.issue_invoice`. An unauthenticated caller cannot call `administrator.get_balance` until the Receptionist's identity check passes. Authorization lives in the Brain, not in prompts — a jailbroken prompt still cannot reach a tool it is not authorized for.
- **Tenant scoping.** `tenant_id` is injected from the session context, never accepted from the model's arguments.
- **Truthful results.** Tools return `{ success, data, error, is_estimate?, confidence? }`. Agents are instructed — and evaluated in SIT — never to assert an outcome the tool did not return.
- **Full audit trail.** Every call logged to `lc_agent_calls`: employee, tool, arguments (PII-redacted), result, latency, channel, session, actor, cost. This is what powers the admin's "what did my AI staff do today" view.
- **Rate + cost guards** per session and per tenant, so a runaway loop or an abusive visitor cannot run up a provider bill.
- **Human-in-the-loop flags.** A tool may return `requires_approval: true` (e.g. a quote below the minimum, a refund, a low-confidence measurement); the Brain parks it in the admin approval queue instead of executing.

**Employee registry.** Each AI employee is a declarative profile — `{ id, name, role, system_prompt, tools[], channels[], model, voice, escalation_policy, supervisor_role }` — loaded from `src/mcp/employees/`. Adding an employee = adding a profile file. Changing what the Receptionist can do = editing its `tools[]` array, with zero route changes.

**Admin-facing consequence:** the admin portal gets an **AI Staff** screen driven entirely by the Brain — the roster with live status, per-employee activity feed, tools each one used today, escalations raised, approvals pending, cost per employee, and a per-employee on/off switch. That screen is the visible proof of the "AI office" pitch.

### 4.0.2 App shape — build it like Planea (planead.vip)

The customer portal and the admin portal are **apps, not web pages**. Use the Planea build in this repo (`verticals/planea/portal/`) as the reference implementation for structure and feel:

- **One HTML file per module**, sharing a single stylesheet and a single data layer — Planea's `inicio / cuentas / gastos / metas / patrimonio / deuda / diagnostico / configuracion` + `planea-app.css` + `planea-data.js`. Lawn Co-Pilot's equivalents: `inicio / mi-propiedad / calendario / historial / facturacion / pagos / mensajes / configuracion`.
- **Native app chrome**: fixed bottom tab bar, per-screen headers, no desktop-website scaffolding inside the app. It should feel like something installed, not browsed.
- **Installable PWA** exactly as Planea does it: `manifest.webmanifest`, service worker (network-first navigations, never cache `/api/`), `apple-touch-icon`, icons 192/512, theme color, safe-area insets, in-app install prompt.
- **A resident AI assistant inside the app**, the way Planea carries Maya (`maya-chat.js`) — here it is the same crew: a persistent assistant button on every screen that opens the orb, already authenticated, already knowing the customer's property, schedule, and balance, routed through the Brain MCP Server. The customer never re-explains who they are.
- **A real data layer, never mock data.** Planea's lesson (`project_planea_portal_data` memory): the dashboard shipped static and had to be rewired to live data. Build `lawncopilot-data.js` against the live API from the first commit. No hardcoded demo numbers in the portal, at any point.
- **Service-worker cache discipline:** bump the SW cache version on every portal JS/CSS change or users get stale screens.
- Mobile-first, 44px touch targets, offline shell, fast transitions.

The marketing site stays a separate, SEO-optimized static site (4.1). The apps behind login follow this Planea shape.

### 4.1 Marketing site redesign

Replace the current lawncopilot.com presentation with a conversion-focused site. Static files, no build step, served from `verticals/lawncopilot/public/`. **The landing page's primary interaction is the talking orb (4.1.1), not a form.**

Pages: Home (orb-led), The AI Crew, How It Works, Services, Pricing, Service Areas (FL), For Landscaping Companies, About, Contact, FAQ, Terms, Privacy.

**Positioning — say it plainly, above the fold:** Lawn Co-Pilot is the AI office for the next generation of landscaping companies. Not a lawn service with a website; a lawn company that runs on an AI staff. The hero must communicate, without jargon, that a landscaper gets an entire crew of employees — starting with a receptionist who answers every call — and that a homeowner can get a real price right now by just talking.

Required elements:
- **The orb, front and center in the hero.** Speak or type, both equally supported, both gated identically (4.1.1).
- **The AI Crew block** — the four employees from 4.0 as four cards: role, what they replace, what they do, and a one-tap "meet this employee" that puts the orb into a demo of that role (Receptionist demo answers a call-style question; Estimator demo quotes an address; Dispatcher demo offers real availability; Administrator demo explains an invoice).
- **The no-truck-roll proof point** — an explicit before/after: "Old way: drive 40 minutes, walk the yard, quote 3 days later. Lawn Co-Pilot: address in, measured area and price out, in seconds." Show the measured-property map as the visual.
- Persistent CTAs: **Talk to Lawn Co-Pilot** (activates the orb), **Get My Instant Quote**, **Check My Property**, **Schedule Lawn Service**, **Call Lawn Co-Pilot** (tel: link to the AI Receptionist number — the phone number IS a live demo), **Customer Login**.
- A dedicated **For Landscaping Companies** page: the AI office pitch, the org chart, ROI framing (missed calls captured, estimates without windshield time, invoices that collect themselves), and a "Book a demo" CTA that the orb itself can complete.
- Services with per-service detail (mowing, edging, blowing, trimming; fertilization / pest / irrigation / tree-and-shrub marked "coming soon" so nothing is sold before it exists).
- Trust block: measured-not-guessed pricing, no-contract options, secure online payment, 24/7 AI reception, human review on every quote.
- SEO: per-page title/meta/OG, JSON-LD `LocalBusiness` + `Service` + `FAQPage`, XML sitemap, robots.txt, city landing pages generated from the configured FL service regions.
- Lighthouse targets: performance >= 90 mobile, accessibility >= 95. Inline critical CSS, lazy-load imagery, orb voice SDK **lazy-loaded on first interaction intent** so visitors who never talk never pay the JS cost.

#### 4.1.0 Visual reference — build it to Jobber's standard

**Design target: https://www.getjobber.com/.** That is the bar for polish, structure, and credibility — a real B2B SaaS site for field-service companies, not a local-contractor template. Match the *caliber and layout language*, do not clone the brand.

What to take from Jobber:
- **Sticky top nav** with clear product / features / pricing / resources grouping, a phone number, and two differentiated CTAs — one low-commitment ("See it work"), one high-intent ("Book a demo" / "Start free"). CTA colors are consistent site-wide.
- **Big, plain-language hero headline** aimed at the business owner's outcome, not at technology. One sentence of subhead, one primary CTA, one secondary. No jargon, no acronyms.
- **Product shown, not described** — clean device-framed screenshots and short looping UI clips of the actual app: the measured-property map, the schedule board, the invoice, the AI Staff screen. Real interface, never stock illustration standing in for the product.
- **Trust bar immediately below the fold** — review-platform ratings, customer count, "trusted by" logos, testimonial quotes with a real name, company, and city. Include a short video testimonial slot in the layout even if it ships empty at launch.
- **Feature sections in alternating image/text bands**, each with an icon, a benefit-led heading, two lines of copy, and a deep link. One idea per band.
- **Quantified outcome stats** presented as large numerals with a source note (e.g. hours saved per week, calls captured after hours, days faster to payment). Never publish a number the operator has not confirmed — placeholders must be visibly marked in the code as `TODO: client-confirmed metric`.
- **Pricing presented openly** in comparable tiers with a feature matrix and an FAQ underneath.
- **Segment landing pages** — Jobber's "for lawn care / for cleaning / for HVAC" pattern. Ours: for lawn care, for landscaping, for irrigation, for pest control, plus the FL city pages.
- **Generous whitespace, rounded cards, soft shadows, one accent color used sparingly, photography of real crews and real yards.** Bright and confident, not dark-mode tech.
- Sticky bottom CTA bar on mobile, footer with full sitemap, resources/blog seam, and legal.

Where we deliberately diverge from Jobber: **our hero's primary interaction is the talking orb, not a signup form.** Jobber tells you what the software does; Lawn Co-Pilot lets you talk to an AI employee within five seconds of landing. Keep Jobber's structural discipline and visual polish, replace its hero form with the orb, and add the AI Crew block (4.1) that Jobber has no equivalent of — that block is our differentiation and should be the most designed section on the page.

Brand: carry Lawn Co-Pilot's own identity (green/growth palette is natural for the category — choose a distinct one, not Jobber's). Build a small design system first — type scale, spacing scale, color tokens, button and card components — and hold every page to it.

#### 4.1.1 The talking orb — conversational estimate on the landing page

An animated voice orb is the landing page's main interaction. A visitor can **speak to it or type to it** — the two are the same conversation, same brain, same state, same transcript. Neither path is second-class: everything sayable is typable.

**IDENTITY GATE — the first thing collected, always.** Before any request is processed on either path, a required modal captures:

1. **Full name**
2. **Phone number** (E.164, country-prefilled)
3. **Email address**

None optional. Nothing proceeds without all three. Follow the pattern already proven in this repo on `orbup.html` (commits `4bea226e`, `fe8cc37a`): the gate locks **every** entry point identically — clicking the orb, focusing the text input, tapping a sample-prompt chip, pressing submit, attaching a file. A visitor cannot slip past it through a side door. Identity persists in `localStorage` so it survives reloads and language switches, and it is written to `lc_leads` the moment it is captured — **before** the address, before the measurement, before the quote. That row is the lead, even if the person leaves immediately after.

Do not duplicate these fields inline anywhere else on the page; the gate is the single collection point (repo precedent: commit `9eab2e97` removed exactly that redundancy).

**Conversation design.** After the gate, the orb runs the estimate as a conversation, not a form:
1. Greets by name, states plainly what it can do and that it is an AI.
2. Asks for the service address; accepts it spoken or typed, confirms the normalized version back.
3. Narrates the measurement while it runs ("pulling the parcel record, measuring the lawn area") instead of showing a dead spinner.
4. Reads back the result in plain language — lot size, house footprint, driveway and other excluded areas, serviceable lawn area — with the map rendering alongside as it speaks.
5. Gives the price for each frequency, explains what drives it, and states clearly when it is preliminary and subject to verification.
6. Books the first service against real availability, then hands off to account creation and card entry.
7. Answers interruptions and objections at any point ("why is it that much", "can you do just once", "do you do fertilizer", "who actually shows up") without losing the thread.

**Non-negotiable behaviors:**
- Never quotes a number the pricing engine did not return. No improvised math, ever.
- Never confirms a booking or a price unless the underlying tool returned `success: true`.
- States it is an AI when asked, without hedging, and hands off to a human on request.
- The full transcript is visible on screen while it talks (live, color-coded user vs. agent), with Copy / Email-to-me / Start-over controls, and it stays visible after the orb returns to idle so the visitor can keep the estimate.
- Barge-in supported: the visitor can interrupt mid-sentence.
- Full keyboard + screen-reader path. Mic denial, unsupported browser, or SDK failure degrades silently to typed chat with an explanatory line — **the typed path is always fully functional on its own.**
- Mobile: full-screen voice mode, wake-lock while a session is live, transcript in a bottom sheet.

**Engine.** Primary = a dedicated ElevenLabs convai agent per language (`ELEVENLABS_CONVAI_LAWNCOPILOT_EN` / `_ES`), per the standing rule that every product gets its own agent and never shares one across products. The agent's client tools bridge to the same quote / availability / booking services the web wizard and the phone Receptionist use — one brain, three doors (web voice, web typing, phone). Zero-key fallback = browser Web Speech for input + Claude for the brain + the existing free `/api/tts/edge` route for speech out. Typed chat needs no keys at all and must work in every configuration.

**Consent + compliance:** the gate discloses that the number and email will be used to contact them about the estimate, with separate opt-in for marketing. Voice sessions disclose recording/transcription before the mic opens. Both are logged with a timestamp.

### 4.2 AI receptionist

Build on the existing ConversationRelay stack. Do **not** introduce a new telephony vendor.

- TwiML entry: `POST /lawncopilot/voice/incoming` returns `<Connect><ConversationRelay>` pointed at the shared `/voice-relay/ws` socket, with a Lawn Co-Pilot session profile (system prompt + tool set + `tenant_id`).
- Brain: Claude Haiku via `ANTHROPIC_API_KEY`, model overridable by `LAWNCOPILOT_VOICE_MODEL`.
- Voice: Amazon Polly Neural, `LAWNCOPILOT_POLLY_VOICE` (default `Joanna-Neural`).
- Caller ID: match inbound number against `lc_customers.phone`; greet returning customers by name, preload next appointment + balance.
- Tools: exactly the list in section 3. Every tool call hits the same service layer the web uses — one quote engine, one scheduler, one billing service.
- **Truthfulness rule (carry over from the existing relay agent):** never confirm a booking, cancellation, price, or payment unless the tool returned `success: true`. Never invent availability. Never read back card details. Never quote a final price when confidence is not `high` — say "preliminary estimate, subject to verification".
- Authentication gate: account-specific data (balance, history, address on file) is released only after the caller is matched by inbound ANI **and** confirms one additional factor (service address or email on file). Otherwise the agent stays in prospect mode.
- Escalation: `transfer_to_human` REST-redirects the live call to the operator's number (`LAWNCOPILOT_TRANSFER_NUMBER`); if unset or after hours, take a message into `lc_tickets` and text the operator.
- Every call writes `lc_call_logs`: caller, matched customer, intent, outcome, tool calls made, transcript reference, whether a human transfer occurred. Admin portal renders these as reviewable summaries.

### 4.3 Quote and property-analysis engine

Service module: `verticals/lawncopilot/src/services/measurement.js`, provider-agnostic behind one contract:

```js
async function measureProperty({ address, lat, lng, tenant_id }) -> {
  normalized_address, lat, lng, parcel_id,
  lot_sqft, building_footprint_sqft, building_sqft,
  excluded_sqft, excluded_breakdown: [{ type, sqft, source }],
  serviceable_sqft,
  geometry: { parcel: GeoJSON, building: GeoJSON, excluded: [GeoJSON] },
  imagery_url,
  confidence: 'high'|'medium'|'low',
  is_estimate: boolean,
  sources: [{ field, provider, retrieved_at }]
}
```

Provider chain, selected by `LAWNCOPILOT_MEASURE_PROVIDER`:

| Provider | What it gives | Cost posture |
|---|---|---|
| `heuristic` (default, zero-key) | Geocode-only; lot size inferred from zoning/typical FL lot size by ZIP, footprint inferred from a ratio. Always `is_estimate: true`, `confidence: low`. Honest placeholder, never presented as measured. | $0 |
| `parcel` (recommended prod) | Regrid or ATTOM parcel API: real lot sqft, parcel polygon, building sqft, land use. Footprint polygon from Open Buildings / OSM. Non-lawn surfaces detected from parcel attributes + impervious-surface ratios. `confidence: high` when parcel polygon + footprint both resolve. | ~$0.02-0.15 / lookup |
| `imagery_ai` (Phase 3) | Segmentation over satellite tiles to detect driveway / pool / patio polygons. Feeds `excluded_breakdown` with real geometry. | GPU/API, gated |

Calculation (exactly as specified by the client):

```
serviceable_sqft = lot_sqft - building_footprint_sqft - sum(excluded_sqft)
```

with a floor of 0 and a sanity guard: if `serviceable_sqft` is <5% or >100% of `lot_sqft`, flag `needs_review: true` and route the quote to admin approval instead of auto-issuing.

Caching: one measurement per `(tenant_id, normalized_address)` for 180 days in `lc_measurements`; repeat quotes for the same address never re-bill the provider. Every raw provider payload is stored for auditability.

Intake fields on the public wizard: full name, email, phone, property address (Google Places autocomplete, then verified server-side). A `lc_leads` row is written the moment the address is submitted, before the measurement completes — capture the lead even if the quote path is abandoned.

### 4.4 Service-area visualization

Rendered on the quote result page and in the portal property profile:

- Satellite tile background (Google Static Maps or Mapbox static), centered and zoomed to the parcel bounding box.
- Overlays: parcel boundary (solid outline), building footprint (filled, excluded), other excluded polygons (hatched), remaining lawn area (semi-transparent green fill).
- Legend with each area's square footage and the total serviceable figure.
- Confidence badge and, when `is_estimate`, the disclaimer.
- Admin editor on the same component: draggable/editable polygons, add-exclusion tool, numeric sqft override field, required "reason" note, Approve button. Approving writes `lc_measurement_overrides` + `lc_audit_log` and stamps the property's approved area, which becomes the source of truth for all future scheduling and pricing.
- Customer-facing "Request a correction" button creates a `lc_tickets` row of type `measurement_dispute` and flags the property for re-review.

### 4.5 Pricing engine

Service module: `verticals/lawncopilot/src/services/pricing.js`. Deterministic, rule-driven, fully admin-configurable — no LLM in the pricing path.

```
base = serviceable_sqft * rate_per_sqft(region, property_type, frequency)
price = max(base, minimum_charge(region))
price = apply_tier_adjustment(price, serviceable_sqft)
price = apply_frequency_modifier(price, frequency)        # weekly | biweekly | monthly | one_time
price = apply_surcharges(price, flags)                    # access difficulty, overgrown, corner lot, gated
price = apply_addons(price, selected_addons)
price = apply_discounts(price, recurring_discount, promo_code, seasonal)
total = price + taxes_and_fees(region)
```

`lc_pricing_rules` is a JSONB rule table: `{ scope: {state, county, city, zip, region_id, property_type, frequency}, rule_type, params, priority, active_from, active_to }`. Most specific scope wins; ties broken by priority then most recent. Seed Phase 1 with a Florida default rule set plus per-county overrides for the operator's actual service counties, with values the admin can edit — do not hardcode prices in code.

Every quote persists a full price breakdown (`lc_quote_line_items`) so the customer, the AI receptionist, and the admin all see the identical arithmetic. Quotes expire (`LAWNCOPILOT_QUOTE_TTL_DAYS`, default 30) and expired quotes must be re-priced, never silently honored.

### 4.6 Instant estimate and conversion flow

Single wizard, four steps, resumable via a signed quote token in the URL (so the AI receptionist and email/SMS can hand a customer back into the exact same quote):

1. **Address + contact** -> lead captured, measurement runs with a progress state.
2. **Your property** -> map visualization, serviceable sqft, confidence, "this looks wrong" link.
3. **Your plan** -> price for weekly / biweekly / monthly / one-time side by side, recurring discount shown, add-ons togglable, "request manual review" as an alternative to accepting.
4. **Confirm** -> create account (email + password or magic link), pick first service date from real availability, Stripe card entry, autopay opt-in (default on, clearly disclosed and reversible), accept terms, done.

On completion: create `lc_customers` + `lc_properties` + `lc_subscriptions` + first `lc_appointments` + Stripe customer/payment method, then fire the quote-confirmation and appointment-confirmation comms (email + SMS). Show a confirmation screen with the portal link.

Abandonment: if the customer leaves after step 2, the lead carries `stage: quoted` and the admin sees it in the leads board with the priced quote attached for follow-up.

### 4.7 Customer portal

Auth: email + password **or** emailed magic link. JWT in an HttpOnly, Secure, SameSite cookie `lawncopilot_token`, 30 days. Password reset by emailed token. Rate-limited login.

Dashboard tiles: customer name, service address, account status, current plan, frequency, next scheduled service (date + arrival window + crew when assigned), last completed service, outstanding balance, autopay status, unread notifications.

Sections:
- **Schedule** — upcoming, completed, rescheduled, canceled, missed/weather-delayed, arrival windows, crew, status. Actions: request schedule change, pause service (date range), skip next visit, request additional service, cancel (policy-gated, shows the applicable notice period rather than silently blocking).
- **My property** — address, satellite map with the approved service area, boundaries, excluded areas, total serviceable sqft, special instructions, access instructions, gate code (optional, encrypted at rest with `LAWNCOPILOT_SECRET`), pet/hazard warnings, photos and documents. Correction-request button.
- **Service history** — one card per completed visit: date, time, service type, area serviced, crew, completion status, before/after photos, technician notes, customer instructions, weather, add-ons performed, charges for that visit.
- **Billing** — balance, upcoming charges, invoice list with PDF download, receipts, payment history, pay-now, add/update/remove payment method, failed/declined payments with a retry action, billing notifications, "ask about this bill" -> ticket.
- **Autopay** — enroll, choose default method, review terms, next scheduled charge date and amount, advance notification preference, disable.
- **Messages** — threaded with staff; portal notifications inbox.

PWA: manifest, service worker (network-first navigations, never cache `/api/`), installable, icons generated from the Lawn Co-Pilot mark.

### 4.8 Billing, payments, autopay

- Stripe is the system of record for money movement. `lc_invoices` mirrors Stripe invoices for portal display and reporting.
- Methods: cards, debit, Apple Pay / Google Pay via Payment Request, ACH where enabled on the account.
- Recurring: a Stripe subscription per active service agreement, or scheduled invoices per completed visit — implement **per-visit invoicing** as the default (lawn care bills on service delivery, not calendar), with an admin toggle for prepaid monthly plans.
- Autopay: charge on invoice issue + N days (`LAWNCOPILOT_AUTOPAY_DELAY_DAYS`, default 1), advance notice email/SMS before the charge.
- Dunning: on failed payment, notify immediately, retry on a 3/5/7-day schedule, flag the account after the final failure, surface it on the admin AR board, and expose a one-tap retry in the portal. Never auto-cancel service silently — flag for human decision.
- Webhook `POST /lawncopilot/webhooks/stripe` with signature verification (`STRIPE_WEBHOOK_SECRET`), idempotent handling keyed on the Stripe event id.

### 4.9 Customer communications

Template-driven (`verticals/lawncopilot/src/services/notify.js`), channel-aware (email / SMS / portal notification / AI call), consent-aware, all logged to `lc_notifications`.

Templates required: quote confirmation, account registration, appointment confirmation, upcoming-service reminder (24h), technician-on-the-way, weather delay, service completed (with photos), invoice issued, payment receipt, failed payment, autopay advance notice, service renewal, feedback request, seasonal/promotional offer (consent-gated only).

Consent: separate opt-in flags for transactional SMS, marketing SMS, and marketing email. Marketing sends check consent at send time, not at template time. STOP/HELP handling on the Twilio inbound webhook updates consent immediately.

### 4.10 Admin portal

Role-based access: `owner` (everything incl. pricing + reports), `admin` (operations + billing), `dispatcher` (schedule + crews), `csr` (customers, tickets, messages, no pricing), `tech` (own assigned jobs + photo upload only).

Screens:
- **Leads board** — stage columns (new / measured / quoted / accepted / lost), source, quote value, follow-up actions, convert-to-customer.
- **Customers** — search, account detail, properties, subscriptions, balance, notes, impersonate-view (read-only).
- **Measurement review queue** — everything with `needs_review` or `confidence != high`, with the polygon editor and approve/modify flow from 4.4.
- **Pricing** — regional rate table, rule builder (scope + type + params + priority), plans and add-ons, promo codes, live "test an address" preview so a rule change can be sanity-checked before saving.
- **Schedule / dispatch** — day and week views, unassigned jobs, crew assignment, drag-to-reschedule, status updates, route order (manual in Phase 1, optimizer later).
- **Service records** — mark complete, upload before/after photos, notes, add-ons performed, charges.
- **Billing** — invoice list, create/adjust invoice, payment log, AR aging, refunds (Stripe-backed), dunning queue.
- **Tickets and messages** — assignment, status, SLA age, reply.
- **AI receptionist** — call log with summaries, intent, outcome, transcript, escalation flag, and a "this answer was wrong" report button that files a prompt-improvement ticket.
- **Reports** — revenue by period, jobs completed, average ticket, quote-to-customer conversion, measurement override rate, churn, AR aging, crew productivity. CSV export on every report.

Every mutating admin action writes `lc_audit_log`.

### 4.11 Future-capability seams (build the seam, not the feature)

Do not implement these in Phase 1, but the schema and service boundaries must not block them: technician mobile app (`lc_crews` + job-scoped auth already present), GPS tracking (`lc_appointments.tracking` JSONB), route optimization (job ordering field), crew dispatching, weather-based scheduling (weather service hook already called on the reminder job), equipment/inventory, referral and loyalty programs (`lc_customers.referral_code`), automated review requests, seasonal upsell, fertilization / pest / irrigation / tree-and-shrub as additional `lc_service_plans` rows, multi-property commercial accounts (`lc_properties` is already 1:N per customer), HOA accounts, franchise/multi-location (`tenant_id` already everywhere), AI property-condition analysis, predictive maintenance.

---

## 5. Delivery phases (weeks, not months)

**Week 1 — Foundation + Brain + Estimator**
Vertical scaffold, migration + models, tenant/auth, **Brain MCP server + employee registry**, measurement service with `heuristic` + `parcel` providers, pricing service + rule engine + FL seed, quote API exposed as `estimator.*` tools, SIT harness. Deployed and health-green by end of week.

**Week 2 — Orb landing page + conversion + portal core**
Marketing site with the orb-led hero and AI Crew block, **required identity gate**, voice + typed conversational estimate wired to the Brain, map visualization, account creation, Stripe onboarding + card on file + autopay, Planea-shaped portal shell (PWA + bottom tabs + resident assistant), dashboard, schedule, property profile, transactional comms.

**Week 3 — Admin portal + phone Receptionist + Dispatcher**
Admin app on the same shell: leads, customers, measurement review + polygon editor, pricing rules, schedule/dispatch, billing, tickets, reports, audit log, role gates, and the **AI Staff screen** (roster, activity, cost, approvals). ConversationRelay Lawn Co-Pilot profile calling the same Brain tools, call logging, transfer + message capture.

**Week 4 — Billing depth, automation, hardening**
Per-visit invoicing, dunning, refunds, the full notification template set with consent handling, weather-delay hooks, reminder cron jobs, SEO/Lighthouse pass, load and security review, production cutover plan for lawncopilot.com.

---

## 6. Environment variables (document all of these in CLAUDE.md when done)

| Var | Purpose | Default / unset behavior |
|---|---|---|
| `LAWNCOPILOT_JWT_SECRET` | Signs `lawncopilot_token`. Falls back to `JWT_SECRET`. | Must be set on prod |
| `LAWNCOPILOT_SECRET` | AES-256-GCM key material for gate codes / access notes. Falls back to `JWT_SECRET`. | Must be set on prod |
| `LAWNCOPILOT_MEASURE_PROVIDER` | `heuristic` \| `parcel` \| `imagery_ai` | `heuristic` (labeled estimates only) |
| `REGRID_API_KEY` / `ATTOM_API_KEY` | Parcel data for the `parcel` provider | Unset = fall back to heuristic, confidence low |
| `GOOGLE_MAPS_API_KEY` | Geocoding, Places autocomplete, Static Maps satellite tiles | Unset = manual address entry, no map render, quote still works with a disclaimer |
| `MAPBOX_TOKEN` | Alternate static imagery provider | Optional |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | Payments, autopay, invoices | Unset = payments disabled mode; quotes and scheduling still work, billing UI shows "payments not configured" |
| `ELEVENLABS_CONVAI_LAWNCOPILOT_EN` | Dedicated convai agent for the landing-page orb (EN). Agent ids are public by design; the API key never reaches the browser. | Unset = orb falls back to Web Speech + Claude + `/api/tts/edge`, then to typed chat |
| `ELEVENLABS_CONVAI_LAWNCOPILOT_ES` | Same, Spanish. Must be its own agent — never share across products. | Optional (Phase 2) |
| `LAWNCOPILOT_ORB_ENABLED` | Kill switch for the web orb without a redeploy | `1` |
| `LAWNCOPILOT_MCP_KEY` | Shared secret for external/server-to-server calls into the Brain MCP server. Browser sessions authenticate by session cookie, not this key. | Unset = external MCP callers rejected, internal channels unaffected |
| `LAWNCOPILOT_AGENT_COST_CAP_USD` | Per-tenant daily cap on AI employee spend before the Brain degrades to typed-only | `25` |
| `LAWNCOPILOT_VOICE_NUMBER` | The E.164 number wired to the AI receptionist | Unset = voice module inert |
| `LAWNCOPILOT_VOICE_MODEL` | Anthropic model for the receptionist brain | `claude-haiku-4-5-20251001` |
| `LAWNCOPILOT_POLLY_VOICE` | ConversationRelay TTS voice | `Joanna-Neural` |
| `LAWNCOPILOT_TRANSFER_NUMBER` | Human escalation target | Unset = agent takes a message instead |
| `LAWNCOPILOT_QUOTE_TTL_DAYS` | Quote expiry | `30` |
| `LAWNCOPILOT_AUTOPAY_DELAY_DAYS` | Days after invoice issue before autopay charges | `1` |
| `LAWNCOPILOT_MIN_CHARGE_USD` | Fallback minimum service charge when no rule matches | `45` |
| `LAWNCOPILOT_SEED_DEMO` | `1` seeds one demo tenant with sample property, quote, schedule, invoice | unset = clean |
| Reused | `ANTHROPIC_API_KEY`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `TWILIO_*`, `EMAIL_AUTOSEND_DISABLED`, `CRM_DATABASE_URL`/`DATABASE_URL` | as configured repo-wide |

---

## 7. Acceptance criteria (must be curl- or SIT-verifiable)

1. `GET https://aiagent.ringlypro.com/lawncopilot/health` and `GET /lawncopilot/mcp/health` both return 200 with `{ status: 'ok', db: 'ok', version }`.
2. `POST /lawncopilot/api/v1/quote/measure` with a real Florida address returns `serviceable_sqft`, `confidence`, `sources[]`, and geometry; with an unresolvable address it returns a labeled `is_estimate: true` result and never a 500.
3. `POST /lawncopilot/api/v1/quote/price` returns a line-itemized breakdown whose sum equals the quoted total to the cent.
4. Full conversion path executes end to end in SIT: lead -> measure -> price -> accept -> account -> appointment -> payment method -> autopay enrolled.
5. Tenant isolation: a request authenticated as tenant B cannot read or mutate any tenant A row. SIT asserts this explicitly on customers, properties, invoices, and appointments.
6. Admin override on a measurement changes the price on re-quote and writes both `lc_measurement_overrides` and `lc_audit_log`.
7. Role gates enforced: a `csr` token gets 403 on pricing-rule writes and on reports.
8. Stripe webhook handler is idempotent — replaying the same event id twice produces one payment row.
9. `POST /lawncopilot/voice/incoming` returns valid `<Connect><ConversationRelay>` TwiML; a simulated relay session can call `get_quote_estimate` and `book_appointment` and the appointment lands in `lc_appointments`.
10. The AI receptionist never confirms an action whose tool returned an error — SIT asserts this against a forced tool failure.
11. With `EMAIL_AUTOSEND_DISABLED` at its default, no server-initiated SendGrid transmission occurs; notifications are recorded as `queued`.
12. `node verticals/lawncopilot/sit.js` from the repo root passes 100% with no external keys set.
13. No card PAN, CVV, or full expiry ever appears in our database or logs — SIT greps the schema and the log writer.
14. Public quote endpoints are rate-limited per IP and per address; abuse returns 429, not a provider bill.
15. Mobile Lighthouse on `/lawncopilot/`: performance >= 90, accessibility >= 95, SEO >= 95.
16. **Identity gate is unbypassable.** SIT drives every public entry point — orb click, text-input focus, prompt chip, submit, file attach — and asserts each one opens the gate and that `POST /api/v1/quote/measure` rejects a session with no captured identity. A `lc_leads` row exists with name, phone, and email before any measurement is billed.
17. **Both paths reach the same answer.** SIT completes a full estimate by typed conversation with zero voice keys set, and asserts the resulting quote is identical to the one produced by the wizard and by a simulated orb tool session for the same address.
18. **One brain, enforced.** `GET /lawncopilot/mcp/tools/list` returns all four employee namespaces; a public-web session calling `administrator.issue_invoice` gets 403 from the Brain, not from a prompt; `tenant_id` supplied in tool arguments is ignored in favor of session context; every call lands in `lc_agent_calls`.
19. **Approval queue works.** A tool returning `requires_approval: true` does not execute, appears in `GET /admin/ai-staff/approvals`, and executes only after an authorized approval — verified end to end in SIT.
20. **Cost guard works.** With `LAWNCOPILOT_AGENT_COST_CAP_USD` set low, the Brain degrades to typed-only and returns a clear message instead of continuing to spend.
21. **Portal is app-shaped, not page-shaped.** Manifest + service worker present, installable, bottom tab nav on every module screen, resident assistant reachable from every screen, and no hardcoded demo values anywhere in the portal data layer (SIT greps for them).
22. **Landing page hits the Jobber bar:** sticky nav with two CTAs, orb hero, AI Crew block, trust bar, alternating feature bands with real product imagery, open pricing, segment pages, mobile sticky CTA, and a documented design-token file that every page consumes.

---

## 8. Reporting requirement

On completion, report: production URLs (site, portal, admin, MCP brain), the commit and deploy, which of the 15 client sections shipped complete vs. seam-only, health-check and SIT output, the exact list of external keys still needed to reach full production behavior (parcel provider, Google Maps, Stripe live, Twilio number, ElevenLabs convai agent ids), and any client decision still outstanding (cancellation policy text, refund policy, actual Florida rate card, service counties, business hours, human escalation number, confirmed outcome stats for the landing page). Do not stop for those — build with configurable defaults, mark unconfirmed marketing numbers as `TODO: client-confirmed metric`, and list them.

---

## 9. Open assumption flagged for the operator

The brief for the fourth AI employee ended mid-sentence ("...and within that, there is an account"). It is written here as **Accounting living inside the Administrator** — invoice ledger, payments, refunds, AR aging, revenue reporting, and a tax-ready export (4.0, 4.8, 4.10). If the intent was instead a separate **Account Manager / customer-success** employee — retention, upsell, review requests, win-backs — say so and it becomes employee #5 in the registry, which is a profile file, not a rebuild.
