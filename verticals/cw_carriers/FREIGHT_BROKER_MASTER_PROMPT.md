# FREIGHTMIND AI — AI-Native Operating System for Freight
## Master Architect Prompt for `/ringlypro-architect`
### Activation Keyword: `FREIGHTMIND`
### Target: `aiagent.ringlypro.com/freight_broker`

---

> **To activate**: `/ringlypro-architect FREIGHTMIND`
> This triggers the full E2E build of the AI-native freight operations platform.

---

## 0. PRODUCT IDENTITY

| | |
|---|---|
| **Product Name** | **FreightMind AI** |
| **Tagline** | *"Your fleet runs itself."* |
| **What it is** | AI-native operating system for freight carrier & brokerage operations |
| **What it is NOT** | A traditional TMS with AI bolted on |
| **URL** | `aiagent.ringlypro.com/freight_broker` |
| **Model** | SaaS — per truck/month subscription |
| **Core differentiator** | 8 AI agents + Neural Intelligence + Voice AI = zero-touch freight operations |

---

## 1. VISION

Build an **AI-native operating system for freight operations** — NOT a traditional TMS application with AI features bolted on. This is a fundamentally different paradigm:

### The 4 Pillars of FreightMind AI

**PILLAR 1 — AI AGENT MESH (the workers)**
8 specialized AI agents (7 workers + 1 orchestrator) run the entire carrier operation 24/7 autonomously. There are no CRUD screens for humans to operate. Humans are **supervisors**, not operators.

**PILLAR 2 — NEURAL INTELLIGENCE (the brain)**
Continuous monitoring generates Findings with:
- **Diagnostic** — "What happened? What's wrong?" (INCLUDED)
- **Prescription** — "Here's what to do about it" (INCLUDED)
- **Treatment** — "Auto-execute the fix" (LOCKED — separate license/consulting fee)

**PILLAR 3 — VOICE AI (the voice)**
Rachel/Ana/Lina handle ALL phone communication — inbound and outbound. Shippers call to book loads, Rachel answers. A load is delayed, Rachel calls the customer. A carrier needs to be sourced, Rachel calls them. An invoice is past due, Rachel follows up. Voice is not an add-on — it is how the AI agents interact with the human world.

**PILLAR 4 — COMMAND CENTER (the window)**
Humans observe through a monitoring dashboard, conversational AI chat, and Neural findings feed. They don't operate the system — they supervise it.

**The platform replaces:**
- Dispatchers clicking buttons → **Dispatch AI agent does it**
- Brokers searching load boards → **Freight Finder agent does it**
- Brokers calling carriers → **Rachel AI calls them**
- Accountants generating invoices → **Billing agent does it on POD**
- Collections staff chasing payments → **Rachel AI calls past-due brokers**
- Compliance officers checking documents → **Compliance agent monitors 24/7**
- Managers reading reports → **Neural surfaces Findings proactively**
- Receptionists answering phones → **Rachel AI handles all inbound calls**

### SaaS Revenue Model

| Tier | Price | Includes |
|---|---|---|
| **Starter** | $149/truck/month (min 10) | All agents, Neural Diagnostics only, basic integrations, 100 voice min/mo |
| **Professional** | $299/truck/month (min 10) | + Neural Prescriptions, all integrations, Voice AI (500 min/mo), portals |
| **Enterprise** | $499/truck/month (min 25) | + Treatment module, custom Neural, unlimited voice, white-label, SLA |
| **Consulting** | $250/hour or project-based | Custom agents, ML training, on-prem, ERP integration |
| Voice overage | $0.15/minute | Beyond tier allocation |

**Revenue example**: 50-truck carrier on Professional = **$14,950/month**. 10 carriers = **$1.8M ARR**.

### Competitive Benchmark: McLeod Software (Industry Leader)

McLeod Software is the #1 TMS in trucking with two flagship products: **LoadMaster** (for carriers) and **PowerBroker** (for brokers/3PLs). Our platform must match or exceed their capabilities, but with full AI automation where McLeod still requires humans.

#### McLeod Features We MUST Have (table stakes)

| McLeod Module | What It Does | Our AI-Powered Equivalent |
|---|---|---|
| **Pricing & Order Management** | Rate quoting, order entry, tariff management | Rate Engine Agent — AI auto-quotes with market data |
| **Dispatching & Load Execution** | Manual dispatch, load planning, routing | Dispatch AI Agent — fully automated assignment |
| **Carrier Management** | Onboarding, scoring, monitoring, carrier packets | Freight Finder Agent + Compliance Agent — automated onboarding & scoring |
| **Driver Management** | HOS tracking, assignments, mobile app (Driver Sidekick) | Dispatch AI + Tracking Agent — real-time HOS + mobile push |
| **Safety & Compliance** | FMCSA lookup, insurance monitoring, DOT compliance | Compliance Agent — continuous automated monitoring |
| **Accounting & Finance** | AR/AP, billing, settlements, factoring | Billing Agent — auto-invoice on POD, auto-factor, auto-settle |
| **DocumentPower** | Document capture, imaging, storage, indexing | Document management built into each agent's workflow |
| **FlowLogix** | Visual workflow automation (BPA) | Orchestrator Agent — AI-driven workflow, no manual BPA design needed |
| **EDI Engine (DataFusion)** | Electronic data interchange with trading partners | API integrations + webhooks (modern replacement for EDI) |
| **CRM** | Shipper sales, carrier relationships | Existing CRM routes + AI-enhanced relationship scoring |
| **MPact.IQ** | Business intelligence dashboards (Power BI) | Built-in analytics dashboards — real-time, role-based |
| **MPact.Rate / RatePro** | Market rate analysis, rate trends, benchmarking | Rate Engine Agent — DAT iQ + historical data + AI prediction |
| **MPact.RespondAI** | AI email-to-order conversion, auto-responses | NLP Agent — already exists, enhance with order creation |
| **Carrier Scorecard** | Performance metrics, customizable scoring | Compliance Agent + analytics — auto-scoring with AI |
| **Fuel Tax (IFTA)** | GPS-based mileage tracking per state for tax filing | Tracking Agent + Billing Agent — auto-calculate from GPS data |
| **Detention Management** | Track/bill detention at facilities | Tracking Agent — geofence-based auto-detection + auto-billing |
| **Load Board Integration** | Post to DAT, Truckstop; search available trucks | Freight Finder Agent — auto-post + auto-search |
| **Carrier Portal** | Self-service portal for carriers (accept loads, upload docs) | CarrierPortal.jsx — enhance with real-time availability |
| **Shipper Portal** | Self-service portal for shippers (track, quote) | ShipperPortal.jsx — enhance with live tracking + instant quotes |
| **Check Calls** | Manual driver status updates | Tracking Agent — GPS-based auto check calls, no phone needed |
| **SMS Text Messaging** | Scheduled texts to drivers throughout load lifecycle | Dispatch AI — automated notifications at every milestone |
| **Multi-Currency** | International operations support | Billing Agent — multi-currency support |

#### McLeod Features We EXCEED With AI

| Area | McLeod (Manual/Semi-Auto) | Our Platform (Fully Automated) |
|---|---|---|
| **Order Entry** | MPact.RespondAI reads emails, human reviews | AI reads email/API/EDI → creates order → dispatches → zero touch |
| **Rate Quoting** | MPact.Rate shows data, human decides | Rate Engine auto-quotes with margin targets, auto-negotiates |
| **Dispatch** | Human dispatcher assigns loads | Dispatch AI auto-assigns based on 7+ factors, zero touch |
| **Check Calls** | Broker texts driver for location | GPS auto-generates check calls, zero touch |
| **Carrier Onboarding** | Semi-automated with carrier packets | Full auto: FMCSA lookup → insurance verify → score → approve |
| **Billing** | Auto-rate when docs present, human initiates | POD triggers instant invoice generation + factoring |
| **Compliance** | Alerts and dashboards, human monitors | AI continuously monitors, auto-blocks non-compliant assignments |
| **Workflow** | FlowLogix visual designer (human builds flows) | Orchestrator AI handles workflows dynamically, no design needed |
| **Analytics** | MPact.IQ + Power BI (pull reports) | Real-time agent activity feed + predictive analytics |
| **Load Matching** | Basic carrier matching | AI scores 500+ candidates with multi-factor algorithm |

#### McLeod Integrations We Must Support

| Integration | Purpose | Priority |
|---|---|---|
| **DAT** | Load board posting, rate data (iQ), CarrierWatch | P0 |
| **Truckstop** | Load board, rate index, SaferWatch monitoring | P0 |
| **Greenscreens.ai** | AI rate predictions (Rate Index, Pricing, Bid) | P1 |
| **Samsara / Motive** | ELD, GPS, vehicle diagnostics | P0 |
| **Highway** | Carrier identity management, fraud prevention | P1 |
| **Chain** | AI-powered freight visibility, exception management | P2 |
| **Cetaris** | Fleet maintenance management | P2 |
| **Aurora** | Autonomous truck management (future) | P3 |
| **Cargo Chief** | Capacity matching | P2 |
| **Microsoft Power BI** | Advanced analytics/reporting | P2 |

### Competitive Landscape: AI-Native Freight Platforms (2025-2026)

These are the companies doing what we're building. FreightMind must match or beat ALL of them:

| Company | What They Do | Funding | Key Innovation | Our Advantage |
|---|---|---|---|---|
| **Parade** | Capacity management + CoDriver Voice AI | $87M | First voice AI for carrier calls (inbound), 40% reduction in call volume, 90% faster carrier response | We do inbound + outbound voice across ALL functions, not just capacity |
| **Transfix** | Full TMS (pricing, coverage, invoicing, carrier mgmt) | $288M (acq. by NFI) | End-to-end TMS built inside a top-5 brokerage, AI pricing trained on billions of data points | We add Neural Intelligence + Voice AI + multi-agent autonomy |
| **HwyHaul / Miles** | Agentic AI platform — 75% of loads managed by AI agents | $23M | AI agents across pricing, coverage, dispatch, in-transit. 30-35% margin boost per load, 75 hrs/week saved | Closest competitor to our vision. We add Neural + Voice + Treatment monetization |
| **Drumkit** | Email automation for brokers — parse, quote, respond | $8M | Reads emails/tenders, auto-quotes, auto-builds loads in TMS. 30-40% capacity increase | We do email + voice + full agent mesh, not just email automation |
| **Loadsmart** | Digital brokerage + FreightIntel AI + CoPilot | $265M | AI-powered pricing, smart matchmaking, generative AI analytics | We sell SaaS to brokers, not compete with them as a brokerage |
| **Ventus AI** | RPA bots that operate existing TMS portals | $12M | No API needed — bots click through existing portals/TMS. Scrapes spot rates from carrier portals | Different approach (RPA vs. native). We're native AI-first |
| **Raft AI** | Logistics automation for freight forwarders | $37M | 75% of invoices auto-processed, 70% of customs entries automated | Focused on forwarders/customs, not truckload brokerage |
| **ZUUM** | Hyper-automation for freight brokers | $15M | Dynamic RFP management, lane profitability analysis, spot market win/loss tracking | We add agents + Neural + voice on top |
| **Trimble** | Enterprise TMS + new AI agents | $3.3B (public) | AI agents embedded in existing Trimble TMS for automation | Enterprise legacy — we're AI-native, they're retrofitting |
| **FreightPOP** | AI supply chain intelligence | $10M | Multi-carrier rate shopping, analytics | Shipper-focused, not broker-focused |

### CRITICAL GAPS WE FOUND — Features to Add to FreightMind

From analyzing all competitors, these features are MISSING from our current spec:

#### 1. RFP & BID MANAGEMENT (from Transfix + ZUUM)
Brokers live and die by RFP season. When a shipper sends an RFP with 500 lanes, the broker needs to:
- Import the RFP spreadsheet
- Auto-price every lane using historical + market data
- Analyze which lanes are profitable vs. money-losers
- Generate a bid response with optimized pricing
- Track win/loss rates per lane after award

**Add to Rate Engine Agent:**
| Tool | Description |
|---|---|
| `import_rfp` | Parse RFP spreadsheet (Excel/CSV), extract lanes, requirements |
| `auto_price_rfp` | Price all lanes using Rate Engine + market data + margin targets |
| `analyze_rfp_profitability` | Flag unprofitable lanes, suggest which to bid vs. skip |
| `generate_bid_response` | Create formatted bid response document |
| `track_rfp_awards` | Track which lanes were awarded, actual vs. bid rates |

#### 2. SHIPPER RELATIONSHIP INTELLIGENCE (from CRM + Pando)
Not just contact management — AI-driven shipper insights:

**Add to Freight Finder Agent:**
| Tool | Description |
|---|---|
| `score_shipper_relationship` | Score shipper by volume, payment reliability, growth potential |
| `predict_shipper_demand` | Forecast next-month volume by shipper based on historical patterns |
| `identify_upsell_lanes` | Find lanes where shipper uses competitors but we have capacity |
| `shipper_churn_alert` | Detect declining volume before shipper leaves |

#### 3. SPOT MARKET WIN/LOSS ANALYTICS (from ZUUM)
Track why you win or lose spot quotes:

**Add to Rate Engine Agent:**
| Tool | Description |
|---|---|
| `track_quote_outcome` | Record if quote was won, lost, or expired with reason |
| `analyze_win_loss_by_lane` | Win/loss ratio + average delta from winning rate |
| `optimize_spot_pricing` | Adjust auto-quote pricing based on win/loss patterns |

#### 4. MULTI-CHANNEL CAPACITY SOURCING (from Parade + HwyHaul)
Don't just search load boards — source carriers across every channel simultaneously:

**Add to Freight Finder Agent:**
| Tool | Description |
|---|---|
| `broadcast_load` | Simultaneously post to DAT, Truckstop, email carrier list, SMS blast, and voice outreach |
| `aggregate_carrier_responses` | Collect responses from all channels into single ranked view |
| `auto_negotiate_carrier` | AI counter-offers to carrier quotes based on market data |
| `extract_truck_list_capacity` | Parse carrier truck list emails into available capacity |

#### 5. DOCK SCHEDULING & APPOINTMENT MANAGEMENT (from Ventus)
Shippers increasingly require appointment scheduling:

**Add to Dispatch AI Agent:**
| Tool | Description |
|---|---|
| `book_dock_appointment` | Auto-book pickup/delivery appointments at shipper/receiver portals |
| `monitor_appointment_status` | Track appointment changes, cancellations |
| `optimize_appointment_windows` | Align appointments with driver HOS and route timing |

#### 6. INVOICE AUDIT & DISPUTE RESOLUTION (from Ventus + Raft)
Catch billing errors before they cost money:

**Add to Billing Agent:**
| Tool | Description |
|---|---|
| `audit_carrier_invoice` | Compare carrier invoice against quoted rate + BOL + contract |
| `flag_billing_discrepancy` | Auto-flag overcharges, duplicate invoices, wrong rates |
| `generate_dispute` | Create dispute with supporting documentation |
| `track_dispute_resolution` | Monitor open disputes and resolution timelines |

#### 7. AUTONOMOUS EMAIL PROCESSING (from Drumkit + McLeod RespondAI)
Not just parsing — full autonomous email workflow:

**Add to Freight Finder Agent:**
| Tool | Description |
|---|---|
| `process_inbound_email` | Classify email (load tender, rate request, tracking inquiry, payment question) |
| `auto_respond_quote` | Generate and send rate quote response within seconds |
| `auto_respond_tracking` | Pull live tracking data, send formatted response |
| `auto_book_from_email` | If rate matches thresholds, auto-book without human review |
| `extract_load_from_email` | Parse unstructured email into structured load data |

### Updated Competitive Position

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  WHAT COMPETITORS DO          WHAT FREIGHTMIND AI DOES           │
│                                                                  │
│  Parade: Voice AI for         Voice AI for EVERYTHING —          │
│  carrier capacity only        shipper, carrier, driver,          │
│                               collections, compliance, sales     │
│                                                                  │
│  HwyHaul: AI agents for       AI agents + Neural Intelligence    │
│  pricing/coverage/dispatch    + Voice AI + Treatment tier         │
│                               (diagnostic/prescription/treatment)│
│                                                                  │
│  Drumkit: Email automation    Email + Voice + Chat + SMS +       │
│  only                         full agent mesh                    │
│                                                                  │
│  Transfix: End-to-end TMS     End-to-end TMS + AI-native +      │
│  with AI pricing              self-operating + Neural brain      │
│                                                                  │
│  Ventus: RPA bots on          Native AI agents, no RPA —         │
│  existing portals             purpose-built from scratch         │
│                                                                  │
│  ALL of them: Sell to         Sell SaaS + Treatment license +    │
│  brokers, flat SaaS           consulting. Neural monetization    │
│                               creates 3 revenue streams          │
│                                                                  │
│  NONE of them: Neural         FreightMind scans everything,      │
│  Intelligence layer with      generates findings, prescribes     │
│  diagnostic/prescription      actions. Treatment = upsell.       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. BUSINESS DOMAIN — HOW A CARRIER COMPANY OPERATES

### The Core Loop (repeats 24/7/365)

```
FIND FREIGHT → PRICE IT → DISPATCH TRUCK → PICKUP → TRANSIT → DELIVER → GET PAID → FIND NEXT LOAD
```

### Key Concepts

| Term | Definition |
|---|---|
| **Load** | A shipment that needs to move from A to B |
| **Lane** | A route between two cities (e.g., Atlanta → Charlotte) |
| **Deadhead** | Miles driven empty (no cargo) — the #1 profit killer |
| **RPM** | Revenue Per Mile — primary profitability metric |
| **Spot Rate** | One-time price for a single load, fluctuates daily |
| **Contract Rate** | Agreed price for a lane over months (stable, lower) |
| **BOL** | Bill of Lading — legal document describing freight |
| **POD** | Proof of Delivery — signed by receiver, required to invoice |
| **HOS** | Hours of Service — drivers limited to 11 hrs driving/day (DOT) |
| **ELD** | Electronic Logging Device — tracks HOS automatically |
| **Detention** | Wait time at pickup/delivery beyond free time (billable) |
| **Factoring** | Selling invoices for immediate cash (~97% of value) |
| **CHAIN** | Next load picked up near current delivery, continues forward |
| **BACKHAUL** | Load heading back toward truck's home base |
| **Dry Van** | Standard enclosed trailer (most common) |
| **Reefer** | Refrigerated trailer for temperature-sensitive freight |
| **Flatbed** | Open trailer for oversized/heavy cargo |
| **MC Number** | Motor Carrier number — carrier's operating authority |
| **DOT Number** | Department of Transportation registration number |
| **FMCSA** | Federal Motor Carrier Safety Administration |

### Rate Anatomy — What's Inside a Rate

```
Total Rate: $2,500 for a load
├── Driver Pay:     35-40%  ($875-1000)
├── Fuel:           25-30%  ($625-750)
├── Truck Cost:     10-15%  ($250-375)
├── Insurance & OH: 10-15%  ($250-375)
└── Profit:          5-10%  ($125-250)

If RPM drops below ~$1.50-1.80 → carrier is LOSING money
```

### Rate Flow

```
Shipper pays $3,000 → Broker keeps $500 (15-20%) → Carrier gets $2,500 → Driver gets ~$900
```

### What Drives Rates Up/Down

| Rates GO UP | Rates GO DOWN |
|---|---|
| Few trucks available | Lots of trucks idle |
| Peak season (produce, holiday) | Slow season (Jan-Feb) |
| Bad weather/disaster | Short distance |
| Long distance / hard lane | Easy/common lane |
| Tight pickup window | Shipper flexible on dates |
| Specialized equipment (reefer) | Standard dry van |
| High detention risk | Quick load/unload |

---

## 3. EXISTING PLATFORM — WHAT'S ALREADY BUILT

### Current Architecture

- **Backend**: Node.js/Express at `verticals/cw_carriers/backend/`
- **Frontend**: React/Vite at `verticals/cw_carriers/frontend/`
- **Database**: PostgreSQL (shared Render instance)
- **Mount point**: `/freight_broker` on `aiagent.ringlypro.com`
- **API prefix**: `/freight_broker/api/`

### Existing Database Tables (migration `003_brokerage_platform.sql`)

| Table | Purpose |
|---|---|
| `lg_loads` | Core loads table — origin, dest, equipment, rates, status lifecycle |
| `lg_carriers` | Carrier profiles — MC/DOT, equipment, lanes, safety scores |
| `lg_rate_benchmarks` | Historical rate data by lane |
| `lg_load_pairs` | Load-to-load matching results |
| `lg_carrier_matches` | Carrier-to-load matching results |
| `lg_upload_batches` | CSV/data ingestion tracking |

### Existing Backend Routes

| Route | File | Purpose |
|---|---|---|
| `/api/load-matching` | `routes/loadmatching.js` | Load-to-load pair finding, accept/reject |
| `/api/pricing` | `routes/pricing.js` | Rate quotes, benchmarks, lane analysis, DAT API |
| `/api/loads` | `routes/loads.js` | CRUD for loads |
| `/api/ingestion` | `routes/ingestion.js` | CSV data import |
| `/api/billing` | `routes/billing.js` | Billing operations |
| `/api/analytics` | `routes/analytics.js` | CRM analytics |
| `/api/brokerage-analytics` | `routes/analytics-brokerage.js` | Brokerage-specific analytics |
| `/api/offers` | `routes/offers.js` | Carrier rate offers |
| `/api/checkcalls` | `routes/checkcalls.js` | Check call tracking |
| `/api/tms` | `routes/tms.js` | TMS operations |
| `/api/alerts` | `routes/alerts.js` | Alert system |
| `/api/contacts` | `routes/contacts.js` | Contact management |
| `/api/voice` | `routes/voice.js` | Voice AI integration |
| `/api/collector` | `routes/collector.js` | Data collector |
| `/api/neural-cw` | `routes/neural-cw.js` | Neural intelligence |
| `/api/crm-agent` | `routes/crm-agent.js` | CRM AI agent |
| `/api/pipeline` | `routes/pipeline.js` | Sales pipeline |
| `/api/roi` | `routes/roi.js` | ROI analytics |

### Existing Backend Services

| Service | File | Purpose |
|---|---|---|
| `loadmatching.cw.js` | Load pair scoring algorithm |
| `pricing.cw.js` | Rate recommendation engine |
| `ingestion.cw.js` | CSV parsing & data import |
| `analytics.cw.js` | Analytics calculations |
| `brokerage-analytics.cw.js` | Brokerage metrics |
| `fmcsa.cw.js` | FMCSA carrier lookup |
| `nlp.cw.js` | Natural language processing |
| `tms.cw.js` | TMS operations |
| `reports.cw.js` | Report generation |
| `alerts.cw.js` | Alert triggers |
| `collector.cw.js` | Data collection |
| `roi.cw.js` | ROI calculations |
| `hubspot.cw.js` | HubSpot CRM integration |
| `rachel.cw.js` | Voice AI (Rachel) |
| `demo.cw.js` | Demo data generation |
| `bridge.cw.js` | Cross-vertical bridge |
| `db.cw.js` | Database connection |

### Existing Frontend Pages

| Page | Component | Purpose |
|---|---|---|
| Dashboard | `Dashboard.jsx` | Main overview |
| Load Matching | `LoadMatching.jsx` | Load-to-load pair UI |
| Freight Matching | `FreightMatching.jsx` | Freight-to-truck matching |
| Rate Intelligence | `RateIntelligence.jsx` | Rate analysis UI |
| Loads | `Loads.jsx` | Load management |
| Billing | `Billing.jsx` | Invoice management |
| TMS | `TMS.jsx` | Transportation management |
| Carrier Portal | `CarrierPortal.jsx` | Carrier self-service |
| Shipper Portal | `ShipperPortal.jsx` | Shipper self-service |
| Compliance | `Compliance.jsx` | DOT/FMCSA compliance |
| Analytics | `Analytics.jsx` | CRM analytics |
| Brokerage Analytics | `BrokerageAnalytics.jsx` | Brokerage metrics |
| Check Calls | `CheckCalls.jsx` | In-transit tracking |
| Contacts | `Contacts.jsx` | Contact management |
| Offers | `Offers.jsx` | Carrier rate offers |
| CRM Agent | `CRMAgent.jsx` | AI agent interface |
| Contract Builder | `ContractBuilder.jsx` | Contract generation |
| Document Vault | `DocumentVault.jsx` | Document storage |
| NLP | `NLP.jsx` | Natural language interface |
| Neural Intelligence | `NeuralIntelligence.jsx` | Neural AI dashboard |
| Reports | `Reports.jsx` | Report generation |
| Warehouse | `Warehouse.jsx` | Warehouse operations |
| MCP Tools | `MCPTools.jsx` | MCP tool management |

### Load Status Lifecycle (existing)

```
open → quoted → covered → dispatched → in_transit → delivered → invoiced → paid → cancelled
```

---

## 4. MCP MULTI-AI AGENT ARCHITECTURE

### System Overview

```
                         MCP ORCHESTRATOR (MASTER AGENT)
                    Claude Opus — coordinates all agents
                                  │
         ┌──────────┬─────────────┼─────────────┬──────────┐
         │          │             │             │          │
         ▼          ▼             ▼             ▼          ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │FREIGHT  │ │ RATE    │ │DISPATCH │ │TRACKING │ │BILLING  │
    │FINDER   │ │ ENGINE  │ │  AI     │ │  AGENT  │ │  AGENT  │
    │         │ │         │ │         │ │         │ │         │
    │ Sonnet  │ │ Sonnet  │ │ Sonnet  │ │ Haiku   │ │ Sonnet  │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
         │          │             │             │          │
         │          │             │             │          │
    ┌─────────┐ ┌─────────┐                               │
    │COMPLIANC│ │MAINTENAN│                               │
    │E AGENT  │ │CE AGENT │                               │
    │         │ │         │                               │
    │ Sonnet  │ │ Haiku   │                               │
    └─────────┘ └─────────┘                               │
```

### Agent-to-Agent Communication

All agents communicate via MCP tool calls through the orchestrator. Each agent exposes its capabilities as MCP tools that other agents can invoke.

---

## 5. THE 7 AI AGENTS — DETAILED SPECIFICATIONS

---

### AGENT 1: FREIGHT FINDER

**Purpose**: Find, qualify, and score available loads for the fleet

**AI Model**: Claude Sonnet (balanced speed/intelligence)

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `scan_load_boards` | `{ equipment_type, origin_radius_mi, available_date }` | `Load[]` | Scan DAT/Truckstop APIs for available loads |
| `filter_by_equipment` | `{ loads[], equipment_type }` | `Load[]` | Filter loads matching truck's equipment |
| `check_shipper_reputation` | `{ shipper_name or mc_number }` | `{ score, payment_days, complaints }` | Check shipper reliability before accepting |
| `qualify_load` | `{ load_id }` | `{ qualified: bool, reasons[] }` | Run all qualification checks on a load |
| `match_freight_to_truck` | `{ truck_location, equipment, available_date }` | `ScoredMatch[]` | Find best loads for an available truck |
| `score_load` | `{ load_id, truck_id }` | `{ score, breakdown }` | Score a specific load for a specific truck |
| `find_load_pairs` | `{ anchor_load_id }` | `{ pairs: ScoredPair[] }` | Find CHAIN/BACKHAUL pairs (EXISTING — enhance) |
| `post_to_load_board` | `{ load_id, boards[] }` | `{ posted: bool, board_refs[] }` | Post available truck/load to DAT & Truckstop (McLeod parity) |
| `search_available_trucks` | `{ origin, equipment, date }` | `Truck[]` | Search load boards for available capacity (McLeod parity) |
| `onboard_carrier` | `{ mc_number }` | `{ carrier_profile, insurance, safety, approved }` | Auto-onboard: FMCSA + insurance + safety + Highway identity (McLeod parity) |
| `score_carrier` | `{ carrier_id, load_id }` | `{ score, breakdown, history }` | Carrier scorecard with customizable metrics (McLeod parity) |
| `monitor_carrier_insurance` | `{ carrier_id }` | `{ status, expiry, alerts[] }` | SaferWatch-style continuous monitoring (McLeod parity) |
| `import_email_order` | `{ email_content }` | `{ order, confidence }` | AI email-to-order conversion (beats McLeod MPact.RespondAI) |
| `broadcast_load` | `{ load_id, channels[] }` | `{ posted_to[], responses_expected }` | Simultaneously post to DAT, Truckstop, email carrier list, SMS blast, and trigger Rachel voice outreach |
| `aggregate_carrier_responses` | `{ load_id }` | `{ responses[], ranked[] }` | Collect carrier responses from all channels into single ranked view |
| `auto_negotiate_carrier` | `{ load_id, carrier_quote, market_rate }` | `{ counter_offer, justification }` | AI counter-offers to carrier quotes based on market data |
| `extract_truck_list` | `{ email_content }` | `{ trucks[], capacity[] }` | Parse carrier truck list emails into structured available capacity |
| `process_inbound_email` | `{ email_content }` | `{ type, entities, auto_action }` | Classify email (load tender, rate request, tracking inquiry, payment question) and auto-route |
| `auto_respond_quote` | `{ email_id, load_details }` | `{ response_sent, quoted_rate }` | Generate and send rate quote response within seconds |
| `auto_book_from_email` | `{ email_id, load_details }` | `{ booked: bool, load_id }` | If rate matches thresholds, auto-book without human review |
| `score_shipper_relationship` | `{ shipper_id }` | `{ score, volume_trend, payment_reliability, growth_potential, risk_level }` | AI-scored shipper relationship: volume, payment speed, growth trajectory, churn risk |
| `predict_shipper_demand` | `{ shipper_id, period }` | `{ predicted_loads, predicted_revenue, confidence, by_lane[] }` | Forecast next-month volume by shipper based on historical patterns, seasonality, and trends |
| `identify_upsell_lanes` | `{ shipper_id }` | `{ lanes[], competitor_share_est, capture_strategy }` | Find lanes where shipper uses competitors but we have capacity — recommend capture strategy |
| `detect_shipper_churn` | `{ }` | `{ at_risk_shippers[], decline_pct, recommended_actions[] }` | Detect declining volume before shipper leaves — trigger proactive outreach |
| `get_shipper_360` | `{ shipper_id }` | `{ profile, volume_history, lanes, payment, satisfaction, contacts, notes }` | Complete shipper profile: history, volume, lanes, payment behavior, relationship health |

**Data Sources**: DAT API, Truckstop API, shipper EDI feeds, `lg_loads` table, Highway API, FMCSA SAFER, `lg_shippers`, `lg_quotes`

**Shipper Relationship Intelligence**:
- Every shipper scored on 5 dimensions: volume, payment reliability, growth potential, lane fit, relationship health
- Demand forecasting: predict next month's loads per shipper using historical + seasonal patterns
- Churn detection: AI alerts when a shipper's volume drops 15%+ before they officially leave
- Upsell identification: "Shipper X moves 40 loads/month on lanes where you have idle trucks — they currently use Competitor Y"
- Proactive outreach triggers: Rachel AI calls shippers when their volume dips or when you have capacity near their facilities
- 360-degree shipper view: single screen with everything — volume, lanes, payment history, relationship score, contacts, notes
- Lifetime value calculation: what each shipper is worth over 12 months

**Triggers**:
- Truck becomes available (delivery completed)
- New loads posted matching fleet capabilities
- Inbound email/EDI with load request (MPact.RespondAI equivalent)
- Carrier insurance/authority change alert
- Shipper volume decline detected (churn alert)
- Shipper demand forecast triggers proactive capacity positioning
- Manual search by dispatcher

**Outputs To**: Rate Engine (for pricing + quote tracking), Dispatch AI (for assignment), Compliance Agent (carrier verification), Voice AI (proactive shipper/carrier calls), Neural Intelligence (shipper health feeds relationship scans)

---

### AGENT 2: RATE ENGINE

**Purpose**: Price every load intelligently using market data, historical rates, and cost modeling

**AI Model**: Claude Sonnet

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `get_market_rate` | `{ origin, destination, equipment }` | `{ spot, contract, 7d_avg, 30d_avg, trend }` | Current market rate for a lane |
| `calc_lane_rate` | `{ origin, dest, miles, equipment }` | `{ recommended_rate, rpm, margin }` | Calculate optimal rate for a lane |
| `compare_spot_vs_contract` | `{ lane, rate_offered }` | `{ spot_avg, contract_avg, delta_pct, recommendation }` | Is this rate above/below market? |
| `predict_rate_trend` | `{ lane, days_ahead }` | `{ direction, confidence, predicted_rate }` | Forecast rate direction for a lane |
| `set_min_rate` | `{ lane, equipment, min_rpm }` | `{ updated: bool }` | Set minimum acceptable RPM for a lane |
| `negotiate_rate` | `{ load_id, offered_rate, market_rate }` | `{ counter_offer, justification }` | Generate counter-offer with justification |
| `calc_trip_profitability` | `{ loads[], truck_costs }` | `{ total_rev, total_cost, profit, rpm }` | Full trip P&L for chained loads |
| `get_rate_benchmarks` | `{ lane, period }` | `{ min, max, avg, median, volume }` | Historical rate benchmarks for a lane |
| `track_quote_outcome` | `{ quote_id, outcome, winning_rate }` | `{ logged: bool }` | Record if spot quote was won, lost, or expired with reason and winning rate |
| `analyze_win_loss_by_lane` | `{ lane, period }` | `{ win_rate, loss_rate, avg_win_delta, avg_loss_delta, volume, trend }` | Win/loss ratio per lane + how far off losing quotes were from winner |
| `optimize_spot_pricing` | `{ lane, target_win_rate }` | `{ current_win_rate, recommended_adjustment, projected_win_rate }` | AI adjusts auto-quote pricing based on historical win/loss patterns to hit target win rate |
| `get_spot_market_dashboard` | `{ period, lanes[] }` | `{ summary, by_lane[], trends[] }` | Full spot market performance: quotes sent, won, lost, expired, revenue captured vs. missed |
| `import_rfp` | `{ file, format }` | `{ rfp_id, lanes_count, parsed_lanes[] }` | Parse RFP spreadsheet (Excel/CSV), extract all lanes & requirements |
| `auto_price_rfp` | `{ rfp_id, margin_target }` | `{ priced_lanes[], total_revenue_est, avg_margin }` | Price all RFP lanes using market data + historical rates + margin targets |
| `analyze_rfp_profitability` | `{ rfp_id }` | `{ profitable_lanes[], unprofitable_lanes[], skip_recommended[] }` | Flag unprofitable lanes, recommend which to bid aggressively vs. skip |
| `generate_bid_response` | `{ rfp_id, format }` | `{ document_url }` | Create formatted bid response document ready to send to shipper |
| `track_rfp_awards` | `{ rfp_id, awarded_lanes[] }` | `{ win_rate, revenue_awarded, vs_bid_delta }` | Track which lanes were awarded, actual vs. bid rates, revenue impact |

**Data Sources**: DAT iQ API, FreightWaves SONAR, `lg_rate_benchmarks`, historical `lg_loads`, `lg_quotes`, `lg_rfps`

**Rate Intelligence Features**:
- Real-time market rate lookup (spot + contract)
- Historical lane rate averages (7/30/90 day)
- Rate trend prediction (up/down/stable)
- "Is this rate fair?" indicator on every load
- Minimum RPM enforcement per lane
- Margin calculator (revenue - all costs = profit)
- Fuel surcharge calculation
- Detention revenue estimation

**Spot Market Win/Loss Analytics**:
- Every outbound quote tracked: sent → won / lost / expired
- Win/loss ratio per lane, per customer, per equipment type
- Delta analysis: "You lost by $0.18/mile on avg — tighten pricing"
- Auto-pricing optimization: AI adjusts quotes to hit target win rate
- Revenue missed calculator: "You lost $42K in quotes this month on 3 lanes"
- Trend detection: "Win rate on ATL→CLT dropped from 45% to 28% in 2 weeks"
- Competitive positioning: "Your quotes are 8% above market on SE lanes"

**RFP & Bid Management**:
- Import shipper RFPs (500+ lanes) from Excel/CSV
- Auto-price every lane in seconds using all data sources
- Profitability analysis: which lanes make money, which don't
- Bid/no-bid recommendations with reasoning
- Generate formatted bid response documents
- Track awards post-submission: what you won, what you lost, margin on won lanes
- Multi-year RFP comparison: "Your win rate improved 12% vs. last year's RFP"

**Outputs To**: Freight Finder (rate validation), Dispatch AI (profitability check), Billing Agent (invoice rates), Neural Intelligence (win/loss patterns feed market intelligence scans)

---

### AGENT 3: DISPATCH AI

**Purpose**: Assign the right driver to the right load at the right time

**AI Model**: Claude Sonnet

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `get_driver_location` | `{ driver_id or all }` | `{ driver_id, lat, lng, city, state, last_update }` | Real-time driver GPS position |
| `check_hos` | `{ driver_id }` | `{ drive_left, duty_left, cycle_left, reset_needed }` | Hours of Service remaining |
| `assign_load` | `{ load_id, driver_id, truck_id }` | `{ dispatch_id, confirmation }` | Assign load to driver, update status |
| `optimize_route` | `{ origin, destination, waypoints[] }` | `{ route, miles, eta, fuel_est }` | Calculate optimal route with ETA |
| `send_dispatch` | `{ driver_id, load_details }` | `{ sent: bool, delivery_method }` | Push load details to driver's app |
| `chain_loads` | `{ driver_id, loads[] }` | `{ trip_plan, total_miles, total_rev }` | Plan multi-load trip for a driver |
| `rebalance_fleet` | `{ }` | `{ recommendations[] }` | Suggest fleet repositioning moves |
| `find_best_driver` | `{ load_id }` | `{ ranked_drivers[] }` | Rank available drivers for a load |
| `estimate_detention` | `{ shipper_id, facility_id }` | `{ avg_wait_hrs, detention_probability }` | Predict detention at a facility |

**Decision Factors for Assignment**:
1. Proximity to pickup (deadhead miles)
2. HOS feasibility (can driver legally make it?)
3. Equipment match
4. Driver preference / home time
5. Lane familiarity
6. Trip profitability (from Rate Engine)
7. Customer relationship history

**Outputs To**: Tracking Agent (monitor assigned loads), Compliance Agent (verify legal), Rate Engine (trip costing)

---

### AGENT 4: TRACKING & VISIBILITY

**Purpose**: Real-time monitoring of all trucks and loads in transit

**AI Model**: Claude Haiku (fast, high-volume, low-latency)

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `get_truck_position` | `{ truck_id }` | `{ lat, lng, speed, heading, city, state }` | Live GPS position |
| `calc_eta` | `{ truck_id, destination }` | `{ eta, miles_remaining, traffic, weather }` | Dynamic ETA with conditions |
| `detect_delay` | `{ load_id }` | `{ delayed: bool, delay_mins, reason, impact }` | Auto-detect if load will be late |
| `alert_customer` | `{ load_id, message_type }` | `{ sent: bool }` | Auto-notify shipper/receiver of status |
| `update_load_status` | `{ load_id, status, notes }` | `{ updated: bool }` | Update load status in TMS |
| `log_detention` | `{ load_id, facility, start_time }` | `{ detention_id, clock_running }` | Start/stop detention clock |
| `geofence_trigger` | `{ truck_id, fence_type }` | `{ event: 'arrived'|'departed', timestamp }` | Auto-detect arrival/departure |
| `get_fleet_map` | `{ }` | `{ trucks[], loads[], positions[] }` | Full fleet snapshot for dashboard |
| `check_weather_route` | `{ route }` | `{ alerts[], impact }` | Weather impacts on route |
| `log_check_call` | `{ load_id, driver_id, status, location, notes }` | `{ logged: bool }` | Record check call from driver |

**Automated Events**:
- Geofence arrival at pickup → status = `loading`, notify shipper
- Geofence departure from pickup → status = `in_transit`, ETA calculated
- Periodic ETA recalculation (every 30 min)
- Delay detection → alert dispatcher + customer
- Geofence arrival at delivery → status = `at_delivery`, detention clock starts
- POD captured → status = `delivered`, trigger Billing Agent

**Outputs To**: Billing Agent (POD triggers invoice), Dispatch AI (truck available), Compliance Agent (HOS monitoring)

---

### AGENT 5: BILLING & SETTLEMENT

**Purpose**: Automate invoicing, driver pay, collections, and financial reconciliation

**AI Model**: Claude Sonnet

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `generate_invoice` | `{ load_id }` | `{ invoice_id, pdf_url, amount }` | Create invoice with POD attached |
| `calc_driver_pay` | `{ driver_id, period }` | `{ loads[], miles, pay_amount, deductions }` | Calculate driver settlement |
| `submit_to_factoring` | `{ invoice_id }` | `{ factored: bool, advance_amount, fee }` | Factor invoice for immediate cash |
| `track_payment` | `{ invoice_id }` | `{ status, due_date, days_outstanding }` | Track payment status |
| `reconcile_fuel` | `{ driver_id, period }` | `{ fuel_charges[], total, mpg }` | Reconcile fuel card transactions |
| `aging_report` | `{ }` | `{ current, 30d, 60d, 90d+, total_ar }` | Accounts receivable aging |
| `settle_driver` | `{ driver_id, period }` | `{ settlement_id, pdf_url, net_pay }` | Generate and send driver settlement |
| `calc_load_profit` | `{ load_id }` | `{ revenue, costs, margin, margin_pct }` | P&L for a single load |
| `generate_1099` | `{ driver_id, year }` | `{ form_url }` | Generate tax form for owner-operators |
| `send_collections_notice` | `{ invoice_id }` | `{ sent: bool, escalation_level }` | Auto-send past-due notices |

**Invoice Lifecycle**:
```
POD received → Invoice generated → Sent to broker/shipper → Payment tracked
                                         │
                                    OR: Factored → Cash in 24hrs
```

**Settlement Cycle**:
```
Weekly: Sum loads → Deduct advances/fuel → Calculate net → Generate PDF → Send to driver
```

**Outputs To**: Rate Engine (actual vs. quoted margins), Compliance Agent (tax docs)

---

### AGENT 6: COMPLIANCE & SAFETY

**Purpose**: Ensure DOT/FMCSA compliance, monitor safety, prevent violations

**AI Model**: Claude Sonnet

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `check_hos_violation` | `{ driver_id }` | `{ violations[], warnings[] }` | Check for HOS violations |
| `verify_cdl` | `{ driver_id }` | `{ valid: bool, class, endorsements, expiry }` | Verify CDL status |
| `check_insurance` | `{ carrier_id or driver_id }` | `{ active: bool, coverage, expiry }` | Verify insurance coverage |
| `log_inspection` | `{ truck_id, type, results }` | `{ inspection_id, pass: bool }` | Record DOT inspection results |
| `flag_violation` | `{ type, entity_id, details }` | `{ alert_sent: bool, severity }` | Flag and alert on violations |
| `schedule_drug_test` | `{ driver_id, type }` | `{ appointment_id, date, location }` | Schedule random/pre-employment drug test |
| `audit_eld_logs` | `{ driver_id, period }` | `{ discrepancies[], clean: bool }` | Audit ELD logs for tampering/errors |
| `check_carrier_authority` | `{ mc_number }` | `{ active: bool, safety_score, insurance, violations }` | FMCSA carrier lookup (EXISTING — enhance) |
| `generate_compliance_report` | `{ period }` | `{ report_url, score, issues[] }` | Monthly compliance summary |
| `track_expiring_docs` | `{ days_ahead }` | `{ expiring[] }` | Licenses, insurance, registrations expiring soon |

**Automated Monitoring**:
- Real-time HOS monitoring → alert before violation
- Insurance expiry tracking → 30/15/7 day warnings
- CDL expiry tracking
- Drug test randomization scheduling
- CSA score monitoring
- Pre-assignment compliance check (before dispatching a driver)

**Outputs To**: Dispatch AI (block non-compliant assignments), Billing Agent (compliance docs for customers)

---

### AGENT 7: MAINTENANCE & FLEET OPS

**Purpose**: Truck health monitoring, preventive maintenance, fleet optimization

**AI Model**: Claude Haiku (fast, frequent checks)

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `check_truck_health` | `{ truck_id }` | `{ status, alerts[], next_service }` | Current truck health status |
| `schedule_pm` | `{ truck_id, service_type }` | `{ appointment_id, shop, date }` | Schedule preventive maintenance |
| `log_repair` | `{ truck_id, repair_type, cost, shop }` | `{ repair_id }` | Log completed repair |
| `track_fuel_mpg` | `{ truck_id, period }` | `{ mpg, trend, cost_per_mile }` | Fuel efficiency tracking |
| `dot_inspection_due` | `{ truck_id }` | `{ due_date, days_until }` | Annual DOT inspection tracking |
| `predict_failure` | `{ truck_id }` | `{ risk_components[], confidence }` | Predictive maintenance alerts |
| `order_parts` | `{ part_number, truck_id }` | `{ order_id, eta, cost }` | Auto-order replacement parts |
| `get_fleet_utilization` | `{ }` | `{ trucks[], utilization_pct, idle[] }` | Fleet utilization report |
| `find_nearest_shop` | `{ location, service_type }` | `{ shops[], distance, availability }` | Find repair shop near truck |
| `calc_truck_cost_per_mile` | `{ truck_id, period }` | `{ fuel, maintenance, insurance, depreciation, total_cpm }` | Total cost per mile for a truck |

**Automated Schedules**:
- Oil change every 15,000 miles
- Tire inspection every 5,000 miles
- Annual DOT inspection tracking
- Brake inspection every 20,000 miles
- DPF regeneration monitoring (diesel trucks)

**Outputs To**: Dispatch AI (truck availability), Billing Agent (maintenance costs), Compliance Agent (inspection records)

---

### ORCHESTRATOR: MASTER AGENT

**Purpose**: Coordinate all 7 agents, resolve conflicts, maintain global state, handle exceptions

**AI Model**: Claude Opus (most capable, handles complex reasoning)

**MCP Tools**:

| Tool | Input | Output | Description |
|---|---|---|---|
| `orchestrate_load_cycle` | `{ trigger_event }` | `{ actions_taken[] }` | Run full load lifecycle for an event |
| `delegate_to_agent` | `{ agent, task, params }` | `{ result }` | Send task to a specific agent |
| `resolve_conflict` | `{ agent_a, agent_b, conflict }` | `{ resolution, actions[] }` | Resolve conflicting agent recommendations |
| `get_global_state` | `{ }` | `{ fleet, loads, drivers, financials }` | Full system state snapshot |
| `escalate_to_human` | `{ reason, context, options[] }` | `{ escalation_id }` | Escalate exception to human |
| `run_daily_planning` | `{ date }` | `{ plan }` | Daily fleet plan for tomorrow |
| `generate_scorecard` | `{ period }` | `{ agent_scores[], kpis[] }` | Agent & system performance report |
| `handle_exception` | `{ exception_type, context }` | `{ resolution }` | Auto-handle known exception patterns |

**Orchestration Flows**:

#### Flow 1: Truck Becomes Available
```
1. Tracking Agent → "Truck #22 delivered, now empty in Charlotte"
2. Orchestrator → Freight Finder: "Find loads near Charlotte, dry van"
3. Freight Finder → "Found 12 candidate loads"
4. Orchestrator → Rate Engine: "Price these 12 loads"
5. Rate Engine → "Load #X is best at $3.40 RPM, 15% above market"
6. Orchestrator → Compliance Agent: "Can Driver #47 take this?"
7. Compliance Agent → "Yes, 8hrs HOS, CDL valid, insurance current"
8. Orchestrator → Dispatch AI: "Assign Load #X to Driver #47"
9. Dispatch AI → "Dispatched, ETA 14:30"
10. Orchestrator → Tracking Agent: "Monitor Load #X"
```

#### Flow 2: Load Delivered
```
1. Tracking Agent → "Load #X geofence: arrived at delivery"
2. Orchestrator → Tracking Agent: "Start detention clock"
3. Tracking Agent → "POD captured via driver app"
4. Orchestrator → Billing Agent: "Generate invoice for Load #X"
5. Billing Agent → "Invoice #8821 sent, factored for $2,425"
6. Orchestrator → Billing Agent: "Calculate driver settlement"
7. Orchestrator → Freight Finder: "Find next load for this truck" (→ Flow 1)
```

#### Flow 3: Problem Detected
```
1. Tracking Agent → "Load #X delayed, ETA pushed 3 hours"
2. Orchestrator → Tracking Agent: "Notify customer"
3. Orchestrator → Dispatch AI: "Impact on downstream loads?"
4. Dispatch AI → "Load #Y pickup at risk, need backup plan"
5. Orchestrator → Freight Finder: "Find alternate truck for Load #Y"
6. Orchestrator → Rate Engine: "What's the cost of rebooking?"
7. Orchestrator → escalate_to_human (if cost > threshold)
```

#### Flow 4: Daily Planning
```
1. Orchestrator runs at 6:00 AM daily
2. → Maintenance Agent: "Any trucks down today?"
3. → Compliance Agent: "Any drivers restricted?"
4. → Freight Finder: "What loads are booked for today?"
5. → Dispatch AI: "Optimize today's assignments"
6. → Rate Engine: "Flag any below-minimum loads"
7. → Generate daily plan dashboard
```

---

## 6. E2E WORKFLOW — THE FULL AUTOMATED CYCLE

### Phase 1: FIND FREIGHT
```
[Load Boards / Shipper APIs / Manual Entry]
         │
         ▼
   FREIGHT FINDER AGENT
   • Scans DAT, Truckstop, shipper EDI feeds
   • Filters by equipment, location, date
   • Scores each load opportunity
   • Matches to available trucks in fleet
         │
         ▼
   RATE ENGINE AGENT
   • Checks market rate for the lane
   • Compares to minimum RPM threshold
   • Calculates margin after costs
   • Returns: ACCEPT / NEGOTIATE / REJECT
```

### Phase 2: DISPATCH
```
   COMPLIANCE AGENT
   • Verify driver CDL, HOS, insurance
   • Confirm truck inspection current
   • Check hazmat endorsement if needed
   • Returns: CLEARED / BLOCKED + reason
         │
         ▼
   DISPATCH AI AGENT
   • Find closest qualified driver
   • Check HOS feasibility for the trip
   • Calculate optimal route + ETA
   • Send dispatch to driver's phone
   • Update load status: dispatched
```

### Phase 3: PICKUP
```
   TRACKING AGENT
   • Geofence detects: truck arrived at shipper
   • Driver confirms: BOL received, loaded
   • Auto-update status: in_transit
   • Calculate delivery ETA
   • Notify receiver with ETA
         │
         ▼
   BILLING AGENT
   • Start invoice draft
   • Record BOL details
```

### Phase 4: IN TRANSIT
```
   TRACKING AGENT (continuous)
   • GPS position every 5 min
   • ETA recalculation every 30 min
   • Weather/traffic delay detection
   • Auto-alert if ETA slips
         │
   COMPLIANCE AGENT (continuous)
   • HOS monitoring in real-time
   • Alert driver before violation
   • Plan rest stops if needed
         │
   MAINTENANCE AGENT (continuous)
   • Monitor truck diagnostics (if telematics)
   • Alert on tire pressure, engine codes
   • Find nearest shop if issue detected
```

### Phase 5: DELIVERY
```
   TRACKING AGENT
   • Geofence: arrived at receiver
   • Detention clock starts
   • Driver captures POD via app
   • Status: delivered
         │
         ▼
   BILLING AGENT
   • Invoice generated automatically
   • POD attached
   • Sent to broker/shipper
   • Factored for immediate cash (optional)
   • Driver settlement calculated
```

### Phase 6: NEXT LOAD (Loop)
```
   FREIGHT FINDER + DISPATCH AI
   • Load-to-load matching: find next load
   • CHAIN: keep going forward
   • BACKHAUL: head back home loaded
   • Rate Engine validates profitability
   • Dispatch AI assigns next load
   • → Back to Phase 2
```

---

## 7. DATABASE SCHEMA — NEW TABLES NEEDED

### Existing tables to enhance:
- `lg_loads` — add GPS tracking fields, detention tracking
- `lg_carriers` — add fleet/truck details, driver roster

### New tables to create:

```sql
-- Trucks in the fleet
CREATE TABLE IF NOT EXISTS lg_trucks (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  truck_number VARCHAR(50) NOT NULL,
  carrier_id INTEGER REFERENCES lg_carriers(id),
  vin VARCHAR(20),
  make VARCHAR(50),
  model VARCHAR(50),
  year INTEGER,
  equipment_type VARCHAR(50) DEFAULT 'dry_van',
  status VARCHAR(20) DEFAULT 'available',
  current_lat NUMERIC(10,7),
  current_lng NUMERIC(10,7),
  current_city VARCHAR(255),
  current_state VARCHAR(10),
  last_position_update TIMESTAMP,
  odometer INTEGER,
  next_pm_due_miles INTEGER,
  next_inspection_date DATE,
  insurance_expiry DATE,
  registration_expiry DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Drivers
CREATE TABLE IF NOT EXISTS lg_drivers (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  driver_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  cdl_number VARCHAR(50),
  cdl_state VARCHAR(10),
  cdl_expiry DATE,
  cdl_class VARCHAR(5) DEFAULT 'A',
  endorsements TEXT[] DEFAULT '{}',
  carrier_id INTEGER REFERENCES lg_carriers(id),
  truck_id INTEGER REFERENCES lg_trucks(id),
  home_city VARCHAR(255),
  home_state VARCHAR(10),
  status VARCHAR(20) DEFAULT 'available',
  hos_drive_remaining NUMERIC(4,1) DEFAULT 11.0,
  hos_duty_remaining NUMERIC(4,1) DEFAULT 14.0,
  hos_cycle_remaining NUMERIC(5,1) DEFAULT 70.0,
  hos_last_update TIMESTAMP,
  current_lat NUMERIC(10,7),
  current_lng NUMERIC(10,7),
  current_city VARCHAR(255),
  current_state VARCHAR(10),
  preferred_lanes JSONB DEFAULT '[]',
  drug_test_last DATE,
  drug_test_next DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Dispatches (assignment of driver+truck to load)
CREATE TABLE IF NOT EXISTS lg_dispatches (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_id INTEGER REFERENCES lg_loads(id),
  driver_id INTEGER REFERENCES lg_drivers(id),
  truck_id INTEGER REFERENCES lg_trucks(id),
  dispatched_at TIMESTAMP DEFAULT NOW(),
  pickup_eta TIMESTAMP,
  delivery_eta TIMESTAMP,
  actual_pickup TIMESTAMP,
  actual_delivery TIMESTAMP,
  status VARCHAR(20) DEFAULT 'assigned',
  route_miles NUMERIC(8,1),
  deadhead_miles NUMERIC(8,1),
  detention_minutes INTEGER DEFAULT 0,
  detention_charges NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- GPS tracking events
CREATE TABLE IF NOT EXISTS lg_tracking_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  truck_id INTEGER REFERENCES lg_trucks(id),
  driver_id INTEGER REFERENCES lg_drivers(id),
  load_id INTEGER REFERENCES lg_loads(id),
  event_type VARCHAR(30) NOT NULL,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  city VARCHAR(255),
  state VARCHAR(10),
  speed_mph NUMERIC(5,1),
  heading NUMERIC(5,1),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_tracking_truck ON lg_tracking_events(truck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lg_tracking_load ON lg_tracking_events(load_id, created_at DESC);

-- Invoices
CREATE TABLE IF NOT EXISTS lg_invoices (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  invoice_number VARCHAR(50) UNIQUE,
  load_id INTEGER REFERENCES lg_loads(id),
  bill_to_type VARCHAR(20) DEFAULT 'broker',
  bill_to_name VARCHAR(255),
  bill_to_email VARCHAR(255),
  amount NUMERIC(12,2),
  detention_amount NUMERIC(10,2) DEFAULT 0,
  fuel_surcharge NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'draft',
  sent_at TIMESTAMP,
  due_date DATE,
  paid_at TIMESTAMP,
  paid_amount NUMERIC(12,2),
  factored BOOLEAN DEFAULT false,
  factored_at TIMESTAMP,
  factored_amount NUMERIC(12,2),
  pod_url TEXT,
  bol_url TEXT,
  pdf_url TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_invoices_status ON lg_invoices(status);
CREATE INDEX IF NOT EXISTS idx_lg_invoices_due ON lg_invoices(due_date);

-- Driver settlements
CREATE TABLE IF NOT EXISTS lg_settlements (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  driver_id INTEGER REFERENCES lg_drivers(id),
  period_start DATE,
  period_end DATE,
  loads_count INTEGER DEFAULT 0,
  total_miles NUMERIC(10,1) DEFAULT 0,
  gross_pay NUMERIC(12,2) DEFAULT 0,
  fuel_deductions NUMERIC(10,2) DEFAULT 0,
  advance_deductions NUMERIC(10,2) DEFAULT 0,
  other_deductions NUMERIC(10,2) DEFAULT 0,
  net_pay NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft',
  pdf_url TEXT,
  paid_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Maintenance records
CREATE TABLE IF NOT EXISTS lg_maintenance (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  truck_id INTEGER REFERENCES lg_trucks(id),
  service_type VARCHAR(50) NOT NULL,
  description TEXT,
  odometer_at_service INTEGER,
  next_due_miles INTEGER,
  next_due_date DATE,
  cost NUMERIC(10,2),
  shop_name VARCHAR(255),
  shop_city VARCHAR(255),
  shop_state VARCHAR(10),
  status VARCHAR(20) DEFAULT 'completed',
  parts JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_maintenance_truck ON lg_maintenance(truck_id, created_at DESC);

-- Compliance records
CREATE TABLE IF NOT EXISTS lg_compliance (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  entity_type VARCHAR(20) NOT NULL,
  entity_id INTEGER NOT NULL,
  compliance_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'current',
  effective_date DATE,
  expiry_date DATE,
  document_url TEXT,
  notes TEXT,
  alert_sent BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_compliance_expiry ON lg_compliance(expiry_date);

-- Quotes — track every outbound quote for win/loss analytics
CREATE TABLE IF NOT EXISTS lg_quotes (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_id INTEGER REFERENCES lg_loads(id),
  shipper_id INTEGER,
  rfp_id INTEGER,
  lane VARCHAR(255),
  origin_city VARCHAR(255),
  origin_state VARCHAR(10),
  destination_city VARCHAR(255),
  destination_state VARCHAR(10),
  equipment_type VARCHAR(50) DEFAULT 'dry_van',
  quoted_rate NUMERIC(12,2),
  quoted_rpm NUMERIC(8,2),
  market_rate_at_quote NUMERIC(12,2),
  margin_target_pct NUMERIC(5,2),
  source VARCHAR(30) DEFAULT 'spot' CHECK (source IN ('spot', 'contract', 'rfp', 'email', 'phone', 'portal')),
  outcome VARCHAR(20) CHECK (outcome IN ('pending', 'won', 'lost', 'expired', 'withdrawn')),
  winning_rate NUMERIC(12,2),
  delta_from_winner NUMERIC(12,2),
  loss_reason VARCHAR(100),
  responded_at TIMESTAMP,
  decided_at TIMESTAMP,
  auto_quoted BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_quotes_outcome ON lg_quotes(outcome);
CREATE INDEX IF NOT EXISTS idx_lg_quotes_lane ON lg_quotes(origin_state, destination_state);
CREATE INDEX IF NOT EXISTS idx_lg_quotes_shipper ON lg_quotes(shipper_id);

-- RFPs — shipper bid management
CREATE TABLE IF NOT EXISTS lg_rfps (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  shipper_id INTEGER,
  shipper_name VARCHAR(255),
  rfp_name VARCHAR(255),
  received_date DATE,
  due_date DATE,
  total_lanes INTEGER DEFAULT 0,
  lanes_bid INTEGER DEFAULT 0,
  lanes_skipped INTEGER DEFAULT 0,
  lanes_awarded INTEGER DEFAULT 0,
  total_volume_est INTEGER,
  total_revenue_est NUMERIC(14,2),
  avg_margin_target NUMERIC(5,2),
  status VARCHAR(20) DEFAULT 'received' CHECK (status IN ('received', 'analyzing', 'pricing', 'submitted', 'awarded', 'closed')),
  source_file_url TEXT,
  bid_response_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_rfps_status ON lg_rfps(status);
CREATE INDEX IF NOT EXISTS idx_lg_rfps_shipper ON lg_rfps(shipper_id);

-- RFP lanes — individual lanes within an RFP
CREATE TABLE IF NOT EXISTS lg_rfp_lanes (
  id SERIAL PRIMARY KEY,
  rfp_id INTEGER REFERENCES lg_rfps(id),
  origin_city VARCHAR(255),
  origin_state VARCHAR(10),
  destination_city VARCHAR(255),
  destination_state VARCHAR(10),
  equipment_type VARCHAR(50) DEFAULT 'dry_van',
  volume_per_week INTEGER,
  shipper_target_rate NUMERIC(12,2),
  our_bid_rate NUMERIC(12,2),
  market_rate NUMERIC(12,2),
  projected_margin_pct NUMERIC(5,2),
  recommendation VARCHAR(20) CHECK (recommendation IN ('bid_aggressive', 'bid_standard', 'bid_high', 'skip')),
  recommendation_reason TEXT,
  awarded BOOLEAN DEFAULT false,
  awarded_rate NUMERIC(12,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_rfp_lanes_rfp ON lg_rfp_lanes(rfp_id);

-- Shippers — shipper relationship intelligence
CREATE TABLE IF NOT EXISTS lg_shippers (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  shipper_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address VARCHAR(500),
  city VARCHAR(255),
  state VARCHAR(10),
  zip VARCHAR(20),
  industry VARCHAR(100),
  relationship_score NUMERIC(5,2) DEFAULT 50.0,
  volume_score NUMERIC(5,2) DEFAULT 50.0,
  payment_score NUMERIC(5,2) DEFAULT 50.0,
  growth_score NUMERIC(5,2) DEFAULT 50.0,
  churn_risk VARCHAR(20) DEFAULT 'low' CHECK (churn_risk IN ('low', 'medium', 'high', 'critical')),
  avg_payment_days NUMERIC(5,1),
  total_loads_ltm INTEGER DEFAULT 0,
  total_revenue_ltm NUMERIC(14,2) DEFAULT 0,
  avg_monthly_loads NUMERIC(8,1) DEFAULT 0,
  top_lanes JSONB DEFAULT '[]',
  competitors_known JSONB DEFAULT '[]',
  lifetime_value NUMERIC(14,2) DEFAULT 0,
  first_load_date DATE,
  last_load_date DATE,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_shippers_score ON lg_shippers(relationship_score DESC);
CREATE INDEX IF NOT EXISTS idx_lg_shippers_churn ON lg_shippers(churn_risk);

-- Agent activity log (track what each AI agent does)
CREATE TABLE IF NOT EXISTS lg_agent_log (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  agent_name VARCHAR(50) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  input JSONB,
  output JSONB,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error TEXT,
  triggered_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_agent_log_agent ON lg_agent_log(agent_name, created_at DESC);
```

---

## 8. API DESIGN — NEW ENDPOINTS

All endpoints under `/freight_broker/api/`

### Agent Execution Endpoints
```
POST /api/agents/orchestrate          — Trigger orchestrator with an event
POST /api/agents/:agentName/tools/call — Call a specific agent's MCP tool
GET  /api/agents/:agentName/status     — Agent health and activity
GET  /api/agents/log                   — Agent activity log
```

### Trucks & Drivers
```
GET    /api/trucks                     — List fleet trucks
POST   /api/trucks                     — Register a truck
GET    /api/trucks/:id                 — Truck details + health
PATCH  /api/trucks/:id/position        — Update GPS position
GET    /api/drivers                    — List drivers
POST   /api/drivers                    — Add a driver
GET    /api/drivers/:id                — Driver details + HOS
PATCH  /api/drivers/:id/hos            — Update HOS from ELD
```

### Dispatches
```
POST   /api/dispatches                 — Create dispatch (assign load)
GET    /api/dispatches                 — List active dispatches
GET    /api/dispatches/:id             — Dispatch details
PATCH  /api/dispatches/:id/status      — Update dispatch status
```

### Tracking
```
POST   /api/tracking/events            — Log tracking event
GET    /api/tracking/load/:loadId      — Tracking history for a load
GET    /api/tracking/fleet             — Fleet map data
POST   /api/tracking/geofence          — Geofence event webhook
```

### Invoicing & Settlements
```
POST   /api/invoices                   — Generate invoice
GET    /api/invoices                   — List invoices
PATCH  /api/invoices/:id/status        — Update payment status
POST   /api/invoices/:id/factor        — Submit to factoring
GET    /api/settlements                — List settlements
POST   /api/settlements/generate       — Generate driver settlement
```

### Maintenance
```
POST   /api/maintenance                — Log maintenance event
GET    /api/maintenance/truck/:id      — Maintenance history
GET    /api/maintenance/upcoming       — Upcoming PM schedule
```

### Compliance
```
GET    /api/compliance/driver/:id      — Driver compliance status
GET    /api/compliance/truck/:id       — Truck compliance status
GET    /api/compliance/expiring        — Expiring documents
POST   /api/compliance/check           — Run compliance check
```

### Carrier Management (McLeod Carrier Module equivalent)
```
POST   /api/carriers/onboard           — Auto-onboard carrier by MC/DOT#
GET    /api/carriers/:id/scorecard     — Carrier performance scorecard
GET    /api/carriers/:id/insurance     — Insurance status & monitoring
POST   /api/carriers/:id/packet        — Generate carrier packet
GET    /api/carriers/monitoring        — All monitored carriers + alerts
POST   /api/carriers/:id/rate-offer    — Send rate offer to carrier
```

### Document Management (McLeod DocumentPower equivalent)
```
POST   /api/documents/upload           — Upload document (BOL, POD, etc.)
GET    /api/documents/load/:loadId     — All documents for a load
GET    /api/documents/carrier/:id      — All documents for a carrier
POST   /api/documents/ocr              — AI document classification & indexing
```

### Load Board Integration (McLeod DAT/Truckstop equivalent)
```
POST   /api/loadboards/post            — Post truck/load to load boards
DELETE /api/loadboards/post/:id        — Remove posting
GET    /api/loadboards/search          — Search available loads/trucks
GET    /api/loadboards/rates/:lane     — Get market rates for a lane
```

### Notifications (McLeod SMS Module equivalent)
```
POST   /api/notifications/send         — Send SMS/email/push notification
GET    /api/notifications/templates    — Notification templates by lifecycle stage
POST   /api/notifications/schedule     — Schedule notification for future time
```

---

## 9. FRONTEND — NEW PAGES & ENHANCEMENTS

### New Dashboard Panels
- **Fleet Map** — Real-time truck positions on map
- **Agent Activity Feed** — Live feed of what each AI agent is doing
- **Exception Queue** — Items agents escalated for human review
- **Daily Plan** — Today's assignments, ETAs, priorities

### New Pages

| Page | Purpose | McLeod Equivalent |
|---|---|---|
| `FleetMap.jsx` | Full-screen map with truck positions, load routes, ETAs | LoadMaster dispatch map |
| `DriverManagement.jsx` | Driver roster, HOS status, compliance, settlements | Driver Management module |
| `TruckManagement.jsx` | Fleet inventory, health, maintenance schedules | Equipment Management |
| `DispatchBoard.jsx` | Kanban-style dispatch board: unassigned → assigned → in transit → delivered | LoadMaster dispatch screen |
| `InvoiceManager.jsx` | Invoice lifecycle, factoring, payment tracking | Rendition Billing |
| `SettlementManager.jsx` | Driver pay calculations, settlement generation | Driver Settlement module |
| `ComplianceDashboard.jsx` | Compliance status, expiring docs, violations | Safety & Compliance module |
| `MaintenanceTracker.jsx` | PM schedules, repair history, cost tracking | Cetaris integration |
| `AgentDashboard.jsx` | AI agent performance, activity log, health status | N/A (we go beyond McLeod) |
| `DailyPlanner.jsx` | Next-day planning with AI recommendations | N/A (we go beyond McLeod) |
| `CarrierOnboarding.jsx` | Auto-onboard carriers: MC# → FMCSA → insurance → approve | Carrier Packet eForm |
| `CarrierScorecard.jsx` | Performance metrics, customizable scoring, history | Carrier Scorecard module |
| `DocumentManager.jsx` | Document capture, OCR indexing, lifecycle tracking | DocumentPower |
| `FuelTax.jsx` | IFTA reporting from GPS data, per-state mileage | Fuel Tax module |
| `RateNegotiator.jsx` | AI-assisted rate negotiation with market data context | MPact.Rate / RatePro |
| `LoadBoardManager.jsx` | Post/search DAT & Truckstop, manage active postings | Load Board Integration |

### Enhanced Existing Pages

| Page | Enhancement | McLeod Parity |
|---|---|---|
| `LoadMatching.jsx` | Add rate intelligence overlay (market rate, trend, fair indicator) | MPact.Rate overlay |
| `FreightMatching.jsx` | Connect to Freight Finder agent, show truck→load matches | Carrier matching |
| `RateIntelligence.jsx` | Live market data from DAT, trend charts, min RPM alerts | MPact.Rate + RatePro |
| `Dashboard.jsx` | Role-based dashboards (Finance, Sales, Ops, Executive) | MPact.IQ role dashboards |
| `Billing.jsx` | Connect to Billing Agent, add factoring, auto-invoice on POD | Rendition Billing automation |
| `Compliance.jsx` | Connect to Compliance Agent, add expiry tracking, SaferWatch | Safety & Compliance |
| `CheckCalls.jsx` | Auto-populated from GPS, zero manual entry needed | SMS Module + Check Calls |
| `CarrierPortal.jsx` | Self-service: accept loads, upload docs, view settlements | Carrier Portal |
| `ShipperPortal.jsx` | Self-service: track loads, get instant quotes, view invoices | Customer Portal |
| `Offers.jsx` | Auto-send rate offers to qualified carriers with one click | Carrier tender management |
| `ContractBuilder.jsx` | Auto-populate from rate history, AI-suggested terms | Contract/tariff management |

---

## 10. EXTERNAL INTEGRATIONS (McLeod-Grade Ecosystem)

### P0 — Critical (must have at launch)
| Integration | Purpose | McLeod Equivalent |
|---|---|---|
| **DAT iQ API** | Market rates (spot + contract), load board posting, CarrierWatch | DAT Load Board + Rate Index + CarrierWatch |
| **Truckstop API** | Load board posting/searching, rate index, SaferWatch monitoring | Truckstop Load Board + SaferWatch |
| **Samsara API** | ELD, GPS tracking, vehicle diagnostics, HOS | Motive/ISAAC integration |
| **FMCSA SAFER API** | Carrier authority lookup, safety scores, insurance verification | Built-in FMCSA lookup |
| **Google Maps API** | Routing, ETA, distance calculation, geofencing | PC*MILER integration |

### P1 — High Priority
| Integration | Purpose | McLeod Equivalent |
|---|---|---|
| **Greenscreens.ai API** | AI rate predictions (Rate Index, Pricing, Bid modules) | Greenscreens certified integration |
| **Highway API** | Carrier identity management, fraud prevention | Highway certified integration |
| **Motive (KeepTruckin) API** | Alternative ELD/GPS provider | Motive certified integration |
| **Twilio / SMS API** | Driver notifications, scheduled texts throughout load lifecycle | SMS Text Messaging Module |
| **Email parsing (OpenAI/Claude)** | Inbound email-to-order conversion | MPact.RespondAI |

### P2 — Important
| Integration | Purpose | McLeod Equivalent |
|---|---|---|
| **QuickBooks API** | Accounting sync, GL posting, AP/AR | Integral accounting module |
| **Triumph Pay / RTS API** | Factoring integration | Factoring partner integrations |
| **Chain API** | AI freight visibility, exception management, check call automation | Chain certified integration |
| **Cargo Chief API** | Capacity matching, carrier sourcing | Cargo Chief integration |
| **FreightWaves SONAR API** | Market intelligence, forecasting | MPact.Rate Market Insight |

### P3 — Future
| Integration | Purpose | McLeod Equivalent |
|---|---|---|
| **Cetaris API** | Fleet maintenance & asset management | Cetaris certified integration |
| **Aurora API** | Autonomous truck management | Aurora partnership (2026 beta) |
| **Microsoft Power BI** | Advanced analytics embedding | MPact.IQ Power BI templates |
| **Weather API** | Route weather alerts, delay prediction | N/A (we go beyond McLeod here) |
| **Fuel card APIs (Comdata/EFS)** | Fuel transaction reconciliation | Fuel card integrations |

### Document Management (McLeod DocumentPower Equivalent)

Instead of a separate DocumentPower product, our document management is **embedded into each agent's workflow**:

| Document Type | Capture Method | Storage | Auto-Actions |
|---|---|---|---|
| **BOL (Bill of Lading)** | Driver app photo capture | S3/cloud storage + `lg_loads.bol_url` | Triggers pickup confirmation |
| **POD (Proof of Delivery)** | Driver app photo + signature | S3 + `lg_invoices.pod_url` | Triggers auto-invoice generation |
| **Rate Confirmation** | Auto-generated PDF | S3 + `lg_loads.metadata` | Sent to carrier on dispatch |
| **Carrier Packet** | Auto-filled from FMCSA + Highway | S3 + `lg_carriers.metadata` | Required for onboarding |
| **Insurance Certificate** | Auto-pulled from DAT/SaferWatch | S3 + `lg_compliance` | Monitored for expiry |
| **Invoice PDF** | Auto-generated by Billing Agent | S3 + `lg_invoices.pdf_url` | Sent to customer |
| **Settlement PDF** | Auto-generated by Billing Agent | S3 + `lg_settlements.pdf_url` | Sent to driver |
| **Inspection Reports** | Driver app upload | S3 + `lg_compliance` | Filed for DOT compliance |
| **Contracts/Tariffs** | ContractBuilder.jsx output | S3 + `lg_carriers.metadata` | Applied to rate calculations |

### Carrier Onboarding Flow (McLeod Carrier Packet Equivalent)

```
1. Enter MC# or DOT#
   │
   ▼
2. FMCSA SAFER API → Pull authority, safety rating, insurance
   │
   ▼
3. Highway API → Verify carrier identity, check fraud risk
   │
   ▼
4. DAT CarrierWatch → Pull operating history, violations
   │
   ▼
5. Auto-generate Carrier Scorecard
   │
   ▼
6. Compliance Agent → Check insurance minimums, authority status
   │
   ▼
7. Auto-approve or flag for human review
   │
   ▼
8. Carrier Portal access granted → Carrier can view/accept loads
```

---

## 11. HUMAN TOUCHPOINTS — EXCEPTIONS ONLY

The system is 99% automated. Humans intervene only for:

### Critical Exceptions (immediate alert)
- Accident / safety incident
- Load claim / cargo damage
- Rate negotiation above/below thresholds (>20% deviation)
- Driver no-show or abandonment
- Equipment breakdown with no backup

### Review & Approve (daily/weekly)
- Weekly P&L review (Billing Agent generates)
- Fleet expansion decisions
- New customer onboarding
- Contract rate negotiations (Rate Agent proposes, human approves)
- Insurance renewals
- Driver hiring / termination

### Dashboard Monitoring
- Real-time fleet map
- Revenue / utilization metrics
- Agent performance scorecards
- Exception queue (items agents escalated)

---

## 12. KPIs & METRICS

| Metric | Target | Agent Responsible |
|---|---|---|
| Deadhead % | < 12% | Freight Finder + Dispatch AI |
| Truck Utilization | > 85% | Dispatch AI |
| Average RPM | > $2.50 | Rate Engine |
| Invoice-to-Payment (days) | < 15 | Billing Agent |
| HOS Violation Rate | 0% | Compliance Agent |
| PM Compliance | 100% | Maintenance Agent |
| Load Acceptance Rate | > 70% | Freight Finder |
| Customer NPS | > 60 | Tracking Agent (visibility) |
| Agent Uptime | > 99.5% | Orchestrator |
| Exception Rate | < 5% | Orchestrator |

---

## 13. BUILD ORDER & PHASES

### Phase 1: Foundation (enhance existing)
1. Rate Engine Agent — enhance existing `pricing.cw.js` with DAT API
2. Freight Finder Agent — enhance existing `loadmatching.cw.js`
3. New DB tables: `lg_trucks`, `lg_drivers`, `lg_dispatches`

### Phase 2: Core Operations
4. Dispatch AI Agent — driver assignment, route optimization
5. Tracking Agent — GPS events, geofencing, ETA, status updates
6. New DB tables: `lg_tracking_events`
7. Frontend: `FleetMap.jsx`, `DispatchBoard.jsx`, `DriverManagement.jsx`

### Phase 3: Money
8. Billing Agent — auto-invoice, factoring, payment tracking
9. Settlement generation
10. New DB tables: `lg_invoices`, `lg_settlements`
11. Frontend: `InvoiceManager.jsx`, `SettlementManager.jsx`

### Phase 4: Compliance & Fleet
12. Compliance Agent — HOS monitoring, document tracking
13. Maintenance Agent — PM schedules, truck health
14. New DB tables: `lg_maintenance`, `lg_compliance`
15. Frontend: `ComplianceDashboard.jsx`, `MaintenanceTracker.jsx`

### Phase 5: Orchestration
16. Master Orchestrator — tie all agents together
17. Agent activity logging (`lg_agent_log`)
18. Exception handling & escalation
19. Frontend: `AgentDashboard.jsx`, `DailyPlanner.jsx`
20. Daily automated planning routine

---

## 14. ARCHITECTURE PARADIGM — TIERED, MCP-ORCHESTRATED, MODULAR

### CRITICAL: This is NOT a monolithic application

FreightMind is a **modular, tiered AI ecosystem** where:

- **Each tier is a standalone product** — sellable independently to brokers
- **Tiers interconnect via MCP Server** — the orchestrator is the nervous system
- **Clients buy 1 tier, 2 tiers, or the full package** — each combination works
- **MCP Server is the orchestrator** — routes requests between tiers, enforces access, manages state
- **AI agents ARE the application** — no CRUD screens, agents do the work
- **Neural Intelligence observes ALL tiers** — cross-tier diagnostics and prescriptions

### THE 5 TIERS + MCP ORCHESTRATOR

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    MCP SERVER — THE ORCHESTRATOR                        ║
║                                                                         ║
║  Central nervous system connecting all tiers                            ║
║  • Routes tool calls between agents across tiers                        ║
║  • Enforces tier access per tenant (which tiers are licensed)           ║
║  • Manages inter-tier events and data flow                              ║
║  • Exposes unified MCP protocol for all 34+ tools                       ║
║  • Handles authentication, rate limiting, audit logging                 ║
║  • Clients connect via MCP protocol — any MCP-compatible client works   ║
║                                                                         ║
║  POST /mcp/tools/list    — List available tools (filtered by tier)      ║
║  POST /mcp/tools/call    — Execute any tool (routed to correct agent)   ║
║  POST /mcp/events        — Emit cross-tier events                       ║
║  GET  /mcp/status         — Orchestrator health + tier activation        ║
╚════════════════════════════╤═════════════════════════════════════════════╝
                             │
      ┌──────────┬───────────┼───────────┬──────────┬──────────┐
      │          │           │           │          │          │
      ▼          ▼           ▼           ▼          ▼          ▼
 ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
 │ TIER 1  ││ TIER 2  ││ TIER 3  ││ TIER 4  ││ TIER 5  ││ ADD-ONS │
 │ LOAD    ││ FLEET   ││FINANCIAL││COMPLIANC││ NEURAL  ││         │
 │ OPS     ││ OPS     ││ OPS     ││E & SAFE ││ INTELL  ││ Voice   │
 │         ││         ││         ││         ││         ││ Treatmt │
 │$149/mo  ││$149/mo  ││$149/mo  ││$99/mo   ││$149/mo  ││ Custom  │
 └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
```

### TIER 1: LOAD OPERATIONS — "Find & Price Freight"
**Standalone value**: A broker can use ONLY this tier and get massive value
**Price**: $149/truck/month

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 1: LOAD OPERATIONS                                         │
│                                                                   │
│  AGENTS:                                                          │
│  ├── Freight Finder Agent (17 tools)                             │
│  │   • Scan load boards (DAT, Truckstop)                        │
│  │   • Load-to-load matching (CHAIN, BACKHAUL)                  │
│  │   • Carrier onboarding (FMCSA + insurance + Highway)         │
│  │   • Carrier scoring & monitoring                              │
│  │   • Multi-channel capacity sourcing                           │
│  │   • Email-to-order conversion                                 │
│  │   • Shipper relationship intelligence                         │
│  │   • Shipper churn detection                                   │
│  │                                                                │
│  └── Rate Engine Agent (17 tools)                                │
│      • Market rate lookup (DAT iQ live data)                     │
│      • AI rate quoting with margin targets                       │
│      • Spot market win/loss analytics                            │
│      • RFP import, auto-pricing, bid management                  │
│      • Rate trend prediction                                     │
│      • Lane profitability analysis                               │
│      • Auto-negotiation with counter-offers                      │
│                                                                   │
│  DATABASE TABLES:                                                 │
│  lg_loads, lg_carriers, lg_rate_benchmarks, lg_load_pairs,       │
│  lg_quotes, lg_rfps, lg_rfp_lanes, lg_shippers, lg_customers    │
│                                                                   │
│  WORKS STANDALONE: YES — broker loads freight without fleet mgmt  │
│                                                                   │
│  INTERCONNECTS WITH:                                              │
│  → Tier 2: Load assigned? Auto-dispatch to best driver           │
│  → Tier 3: Load delivered? Auto-generate invoice                  │
│  → Tier 4: Carrier booked? Auto-verify compliance                │
│  → Tier 5: Neural scans load ops for inefficiencies               │
└──────────────────────────────────────────────────────────────────┘
```

### TIER 2: FLEET OPERATIONS — "Move & Track"
**Standalone value**: A carrier with its own freight can manage fleet without Tier 1
**Price**: $149/truck/month

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 2: FLEET OPERATIONS                                        │
│                                                                   │
│  AGENTS:                                                          │
│  ├── Dispatch AI Agent                                           │
│  │   • Auto-assign drivers to loads (7-factor scoring)           │
│  │   • Route optimization with ETA                               │
│  │   • HOS feasibility checking                                  │
│  │   • Multi-load trip chaining                                  │
│  │   • Fleet rebalancing recommendations                         │
│  │   • Dock appointment scheduling                               │
│  │   • Driver preference learning                                │
│  │                                                                │
│  └── Tracking & Visibility Agent                                 │
│      • Real-time GPS/ELD position tracking                       │
│      • Geofence auto-detection (arrival/departure)               │
│      • Dynamic ETA recalculation                                 │
│      • Delay detection & customer auto-alerts                    │
│      • Detention clock management                                │
│      • Auto check calls (GPS-based, no phone needed)             │
│      • Fleet map with live positions                             │
│                                                                   │
│  DATABASE TABLES:                                                 │
│  lg_trucks, lg_drivers, lg_dispatches, lg_tracking_events        │
│                                                                   │
│  WORKS STANDALONE: YES — carrier manages own fleet/dispatch       │
│                                                                   │
│  INTERCONNECTS WITH:                                              │
│  → Tier 1: Load booked? Dispatch AI auto-assigns driver          │
│  → Tier 3: POD captured? Billing agent auto-invoices             │
│  → Tier 4: HOS limit? Compliance agent alerted                  │
│  → Tier 5: Neural scans fleet utilization + deadhead             │
└──────────────────────────────────────────────────────────────────┘
```

### TIER 3: FINANCIAL OPERATIONS — "Bill & Collect"
**Standalone value**: A broker can use this for automated back-office
**Price**: $149/truck/month

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 3: FINANCIAL OPERATIONS                                    │
│                                                                   │
│  AGENTS:                                                          │
│  └── Billing & Settlement Agent                                  │
│      • Auto-invoice generation on POD receipt                    │
│      • Invoice factoring integration                              │
│      • Payment tracking & AR aging                               │
│      • Driver settlement calculation                              │
│      • Fuel card reconciliation                                  │
│      • Auto-collections (past-due follow-up)                     │
│      • Invoice audit (catch overcharges, duplicates)             │
│      • Dispute generation with supporting docs                   │
│      • IFTA fuel tax calculation from GPS                        │
│      • Multi-currency support                                    │
│                                                                   │
│  DATABASE TABLES:                                                 │
│  lg_invoices, lg_settlements, lg_billing_documents               │
│                                                                   │
│  WORKS STANDALONE: YES — plug into any TMS for billing           │
│                                                                   │
│  INTERCONNECTS WITH:                                              │
│  → Tier 1: Rate confirmed? Invoice amount pre-calculated         │
│  → Tier 2: POD captured? Invoice auto-triggered                  │
│  → Tier 4: Insurance lapsed? Block future payments               │
│  → Tier 5: Neural scans cash flow, margins, AR aging             │
└──────────────────────────────────────────────────────────────────┘
```

### TIER 4: COMPLIANCE & SAFETY — "Stay Legal"
**Standalone value**: Any carrier needs compliance monitoring
**Price**: $99/truck/month (lower entry point)

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 4: COMPLIANCE & SAFETY                                     │
│                                                                   │
│  AGENTS:                                                          │
│  ├── Compliance & Safety Agent                                   │
│  │   • Real-time HOS monitoring & pre-violation alerts           │
│  │   • CDL/insurance/authority expiry tracking                   │
│  │   • FMCSA carrier authority verification                      │
│  │   • Drug test scheduling (random + pre-employment)            │
│  │   • ELD log auditing                                          │
│  │   • CSA score monitoring                                      │
│  │   • Pre-dispatch compliance gate                              │
│  │                                                                │
│  └── Maintenance & Fleet Agent                                   │
│      • Preventive maintenance scheduling                         │
│      • Truck health monitoring (telematics)                      │
│      • Breakdown prediction (pattern matching)                   │
│      • DOT inspection tracking                                   │
│      • Fuel efficiency monitoring                                │
│      • Cost-per-mile tracking                                    │
│      • Nearest shop finder                                       │
│                                                                   │
│  DATABASE TABLES:                                                 │
│  lg_compliance, lg_maintenance                                    │
│                                                                   │
│  WORKS STANDALONE: YES — compliance SaaS for any carrier          │
│                                                                   │
│  INTERCONNECTS WITH:                                              │
│  → Tier 1: Carrier onboarded? Auto-verify compliance             │
│  → Tier 2: Driver assigned? Pre-dispatch compliance gate         │
│  → Tier 3: Maintenance cost? Feeds into truck cost/mile          │
│  → Tier 5: Neural scans safety scores + violation patterns       │
└──────────────────────────────────────────────────────────────────┘
```

### TIER 5: NEURAL INTELLIGENCE — "The Brain"
**Standalone value**: Plug into any TMS and get AI diagnostics
**Price**: $149/truck/month

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 5: NEURAL INTELLIGENCE                                     │
│                                                                   │
│  SCANS (adapts to which tiers are active):                       │
│                                                                   │
│  If Tier 1 active → Operations Neural + Market Intelligence      │
│  If Tier 2 active → Fleet Neural (deadhead, utilization)         │
│  If Tier 3 active → Financial Neural (margins, AR, cash flow)    │
│  If Tier 4 active → Compliance Neural (violations, expiries)     │
│  If ALL active    → Cross-tier correlations + full diagnostics   │
│                                                                   │
│  + Spot Market Win/Loss Neural                                   │
│  + Shipper Relationship Neural                                   │
│  + Voice Call Analytics Neural                                   │
│                                                                   │
│  OUTPUT: Findings (Diagnostic + Prescription)                    │
│                                                                   │
│  WORKS STANDALONE: YES — reads data, generates findings           │
│                                                                   │
│  MORE TIERS = SMARTER NEURAL                                     │
│  1 tier:  Scans that tier only                                   │
│  2 tiers: Cross-tier correlations emerge                         │
│  3 tiers: Deep interconnected insights                           │
│  All 5:   Full 360° business intelligence                        │
└──────────────────────────────────────────────────────────────────┘
```

### ADD-ONS (sold separately with any tier combination)

```
┌──────────────────────────────────────────────────────────────────┐
│  VOICE AI — $0.15/min or minute packs                           │
│  Rachel/Ana/Lina handle inbound + outbound calls                │
│  Connects to whichever tiers are active:                         │
│  • Tier 1: Book loads, quote rates, source carriers by phone    │
│  • Tier 2: Driver check-ins, delay notifications, HOS alerts    │
│  • Tier 3: Collections calls, payment status inquiries           │
│  • Tier 4: Compliance reminders, insurance renewal calls         │
│                                                                   │
│  TREATMENT MODULE — $99/truck/month                              │
│  Auto-execution of Neural prescriptions                          │
│  Requires: Tier 5 + at least 1 operational tier                  │
│                                                                   │
│  CUSTOM CONSULTING — $250/hour                                   │
│  Custom agents, ML training, on-prem, integrations               │
└──────────────────────────────────────────────────────────────────┘
```

### MCP SERVER — THE ORCHESTRATOR

The MCP Server is NOT an agent — it is the **infrastructure layer** that connects all tiers:

```
┌──────────────────────────────────────────────────────────────────┐
│                     MCP SERVER ARCHITECTURE                       │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  TENANT REGISTRY                                           │  │
│  │                                                            │  │
│  │  tenant_id: "cw_carriers"                                 │  │
│  │  tiers_active: [1, 2, 3, 4, 5]          ← full package   │  │
│  │  addons: ["voice", "treatment"]                            │  │
│  │  tools_available: [all 80+ tools]                          │  │
│  │                                                            │  │
│  │  tenant_id: "small_broker_xyz"                            │  │
│  │  tiers_active: [1]                       ← load ops only  │  │
│  │  addons: ["voice"]                                         │  │
│  │  tools_available: [34 tools from Tier 1 + voice]          │  │
│  │                                                            │  │
│  │  tenant_id: "fleet_company_abc"                           │  │
│  │  tiers_active: [2, 4]                    ← fleet + compl  │  │
│  │  addons: []                                                │  │
│  │  tools_available: [tools from Tier 2 + Tier 4]            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  TOOL ROUTER                                               │  │
│  │                                                            │  │
│  │  Client calls: POST /mcp/tools/call                       │  │
│  │  Body: { tool: "get_market_rate", input: {...} }          │  │
│  │                                                            │  │
│  │  1. Authenticate tenant                                    │  │
│  │  2. Check if tool belongs to a licensed tier               │  │
│  │  3. Route to correct agent                                 │  │
│  │  4. Execute tool                                           │  │
│  │  5. Log to audit trail                                     │  │
│  │  6. Emit cross-tier event if applicable                    │  │
│  │  7. Return result                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  EVENT BUS (cross-tier communication)                      │  │
│  │                                                            │  │
│  │  Events flow ONLY between licensed tiers:                  │  │
│  │                                                            │  │
│  │  Tier 1 → "load_booked"                                   │  │
│  │    → if Tier 2 active: Dispatch AI receives, auto-assigns │  │
│  │    → if Tier 2 NOT active: Event stored, no action         │  │
│  │                                                            │  │
│  │  Tier 2 → "load_delivered"                                 │  │
│  │    → if Tier 3 active: Billing Agent auto-invoices         │  │
│  │    → if Tier 3 NOT active: Event stored, no action         │  │
│  │                                                            │  │
│  │  Tier 2 → "hos_warning"                                    │  │
│  │    → if Tier 4 active: Compliance Agent takes action       │  │
│  │    → if Tier 4 NOT active: Event stored, no action         │  │
│  │                                                            │  │
│  │  ANY TIER → all events                                     │  │
│  │    → if Tier 5 active: Neural scans and generates findings │  │
│  │    → if Tier 5 NOT active: No intelligence layer           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  TOOL REGISTRY (which tools belong to which tier)          │  │
│  │                                                            │  │
│  │  TIER 1 TOOLS:                                             │  │
│  │  scan_load_boards, filter_by_equipment, qualify_load,      │  │
│  │  match_freight_to_truck, score_load, find_load_pairs,      │  │
│  │  post_to_load_board, search_available_trucks,              │  │
│  │  onboard_carrier, score_carrier, monitor_carrier_insurance,│  │
│  │  score_shipper_relationship, predict_shipper_demand,       │  │
│  │  identify_upsell_lanes, detect_shipper_churn,              │  │
│  │  get_shipper_360, check_shipper_reputation,                │  │
│  │  get_market_rate, calc_lane_rate, compare_spot_vs_contract,│  │
│  │  predict_rate_trend, set_min_rate, negotiate_rate,         │  │
│  │  calc_trip_profitability, get_rate_benchmarks,             │  │
│  │  track_quote_outcome, analyze_win_loss_by_lane,            │  │
│  │  optimize_spot_pricing, get_spot_market_dashboard,         │  │
│  │  import_rfp, auto_price_rfp, analyze_rfp_profitability,   │  │
│  │  generate_bid_response, track_rfp_awards                   │  │
│  │                                                            │  │
│  │  TIER 2 TOOLS:                                             │  │
│  │  get_driver_location, check_hos, assign_load,              │  │
│  │  optimize_route, send_dispatch, chain_loads,               │  │
│  │  rebalance_fleet, find_best_driver, estimate_detention,    │  │
│  │  book_dock_appointment, get_truck_position, calc_eta,      │  │
│  │  detect_delay, alert_customer, update_load_status,         │  │
│  │  log_detention, geofence_trigger, get_fleet_map,           │  │
│  │  check_weather_route, log_check_call                       │  │
│  │                                                            │  │
│  │  TIER 3 TOOLS:                                             │  │
│  │  generate_invoice, calc_driver_pay, submit_to_factoring,   │  │
│  │  track_payment, reconcile_fuel, aging_report,              │  │
│  │  settle_driver, calc_load_profit, send_collections_notice, │  │
│  │  audit_carrier_invoice, flag_billing_discrepancy,          │  │
│  │  generate_dispute, track_dispute_resolution                │  │
│  │                                                            │  │
│  │  TIER 4 TOOLS:                                             │  │
│  │  check_hos_violation, verify_cdl, check_insurance,         │  │
│  │  log_inspection, flag_violation, schedule_drug_test,        │  │
│  │  audit_eld_logs, check_carrier_authority,                   │  │
│  │  generate_compliance_report, track_expiring_docs,          │  │
│  │  check_truck_health, schedule_pm, log_repair,              │  │
│  │  track_fuel_mpg, predict_failure, find_nearest_shop,       │  │
│  │  calc_truck_cost_per_mile, get_fleet_utilization           │  │
│  │                                                            │  │
│  │  TIER 5 TOOLS:                                             │  │
│  │  run_neural_scan, get_findings, get_finding_detail,        │  │
│  │  acknowledge_finding, get_scan_schedule,                    │  │
│  │  configure_scan_thresholds, get_neural_dashboard            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### CROSS-TIER EVENT FLOWS

These flows only activate when both tiers are licensed:

```
TIER 1 + TIER 2 (Load Ops + Fleet Ops):
────────────────────────────────────────
load_booked ──→ Dispatch AI auto-assigns best driver
load_covered ──→ Tracking Agent starts monitoring
carrier_rate_accepted ──→ Dispatch sends confirmation to driver

TIER 2 + TIER 3 (Fleet Ops + Financial):
─────────────────────────────────────────
pod_captured ──→ Billing Agent generates invoice instantly
load_delivered ──→ Settlement Agent adds to driver pay period
detention_logged ──→ Billing Agent adds detention charges

TIER 1 + TIER 4 (Load Ops + Compliance):
─────────────────────────────────────────
carrier_onboarded ──→ Compliance verifies authority + insurance
carrier_assigned ──→ Compliance runs pre-dispatch gate
carrier_insurance_expiring ──→ Freight Finder blocks from dispatch

TIER 2 + TIER 4 (Fleet Ops + Compliance):
─────────────────────────────────────────
driver_assigned ──→ Compliance checks CDL + HOS + drug test
hos_approaching_limit ──→ Dispatch AI plans rest stop
truck_pm_overdue ──→ Dispatch AI avoids assigning truck

TIER 3 + TIER 4 (Financial + Compliance):
─────────────────────────────────────────
insurance_lapsed ──→ Billing blocks future carrier payments
maintenance_cost_logged ──→ Financial adds to truck cost/mile

ALL TIERS + TIER 5 (Any + Neural):
───────────────────────────────────
Every event from every tier ──→ Neural observes, correlates, generates findings
Neural finding generated ──→ Displayed in Command Center dashboard
Neural prescription ──→ Suggests action to operator (or auto-executes with Treatment add-on)
```

### TIER PACKAGING FOR SALES

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  PACKAGE: BROKER STARTER                                         │
│  Tiers: 1 only                                                   │
│  Price: $149/truck/month                                         │
│  For: Small broker who needs load matching + rate intelligence    │
│                                                                   │
│  PACKAGE: CARRIER ESSENTIALS                                     │
│  Tiers: 2 + 4                                                    │
│  Price: $248/truck/month (bundle discount)                       │
│  For: Carrier who manages own fleet + needs compliance            │
│                                                                   │
│  PACKAGE: BROKER PRO                                             │
│  Tiers: 1 + 3                                                    │
│  Price: $279/truck/month (bundle discount)                       │
│  For: Broker who needs load ops + automated billing               │
│                                                                   │
│  PACKAGE: FULL OPERATIONS                                        │
│  Tiers: 1 + 2 + 3 + 4                                           │
│  Price: $449/truck/month (bundle discount)                       │
│  For: Carrier-broker who runs everything                          │
│                                                                   │
│  PACKAGE: FREIGHTMIND COMPLETE                                   │
│  Tiers: 1 + 2 + 3 + 4 + 5 + Voice + Treatment                  │
│  Price: $699/truck/month                                         │
│  For: Enterprise carrier wanting full AI automation               │
│                                                                   │
│  ANY TIER: Add Voice AI — $0.15/min or packs                    │
│  ANY TIER: Add Neural (Tier 5) — $149/truck/month               │
│  TIER 5 ONLY: Add Treatment — $99/truck/month                   │
│                                                                   │
│  REVENUE EXAMPLES:                                                │
│  50-truck broker on Broker Pro          = $13,950/month          │
│  50-truck carrier on Full Operations    = $22,450/month          │
│  100-truck enterprise on Complete       = $69,900/month          │
│  20 mixed clients avg $15K/month        = $300K/month = $3.6M ARR│
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### TENANT CONFIGURATION TABLE

```sql
-- Tenant tier configuration — controls which tools/agents are active
CREATE TABLE IF NOT EXISTS lg_tenant_config (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(255),
  tier_1_load_ops BOOLEAN DEFAULT false,
  tier_2_fleet_ops BOOLEAN DEFAULT false,
  tier_3_financial BOOLEAN DEFAULT false,
  tier_4_compliance BOOLEAN DEFAULT false,
  tier_5_neural BOOLEAN DEFAULT false,
  addon_voice BOOLEAN DEFAULT false,
  addon_treatment BOOLEAN DEFAULT false,
  voice_minutes_included INTEGER DEFAULT 0,
  truck_count INTEGER DEFAULT 0,
  package_name VARCHAR(50),
  monthly_rate NUMERIC(10,2),
  billing_start_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','trial','suspended','cancelled')),
  api_key VARCHAR(100) UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### MCP SERVER IMPLEMENTATION

```
The MCP Server exposes a standard MCP protocol endpoint:

POST /mcp/tools/list
  → Returns only tools from licensed tiers for this tenant
  → Tenant identified via API key or JWT

POST /mcp/tools/call
  → Validates tenant has access to the requested tool's tier
  → Routes to correct agent
  → Executes tool
  → Emits cross-tier events (only to active tiers)
  → Logs to audit trail
  → Returns result

POST /mcp/events
  → Receives external events (webhooks from ELD, load boards, etc.)
  → Routes to correct agent based on event type
  → Only processes if relevant tier is active

GET /mcp/status
  → Returns orchestrator health, active tiers, agent count, tool count

The MCP Server is the ONLY entry point for all AI operations.
All tool calls go through it. All events go through it.
It is the single source of truth for "what is this tenant allowed to do?"
```

---

## 15. NEURAL INTELLIGENCE LAYER — DIAGNOSTICS & PRESCRIPTION

### How Neural Works in This Ecosystem

Neural Intelligence continuously monitors all agent activity and business data to surface **Findings** — issues, opportunities, risks, and anomalies that require attention.

### Finding Severity Levels

| Level | Color | Meaning | Example |
|---|---|---|---|
| **Critical** | Red | Immediate revenue/safety impact | "Driver #12 HOS violation in 30 min — no rest stop planned" |
| **Warning** | Orange | Action needed within hours | "Invoice #8821 past due 45 days, $4,200 at risk" |
| **Advisory** | Yellow | Optimization opportunity | "Lane ATL→CLT rates up 18% this week, renegotiate contracts" |
| **Info** | Blue | Trend or pattern detected | "Truck #22 fuel efficiency down 8% over 30 days" |

### Neural Scan Categories

#### 1. OPERATIONS NEURAL
| Scan | Diagnostic (What?) | Prescription (Do What?) |
|---|---|---|
| **Deadhead Analysis** | "Fleet averaging 18% deadhead, 6% above target" | "Prioritize backhaul loads on ATL→CHI lane, historically 40% empty return" |
| **Utilization Gaps** | "Trucks #14, #22, #31 idle >48 hours" | "3 loads available within 50mi of each truck — auto-dispatch recommended" |
| **Dispatch Efficiency** | "Dispatch AI assigning 12% of loads to non-optimal drivers" | "Retrain scoring weights: proximity vs. HOS should be 60/40 not 50/50" |
| **Route Optimization** | "Drivers averaging 8% more miles than optimal routes" | "Enable mandatory GPS routing, block driver-selected routes" |
| **Load Rejection Rate** | "32% of offered loads rejected by carriers" | "Rate offers 15% below market on rejected lanes — increase floor" |

#### 2. FINANCIAL NEURAL
| Scan | Diagnostic (What?) | Prescription (Do What?) |
|---|---|---|
| **Revenue Per Mile** | "RPM dropped from $3.20 to $2.85 over 30 days" | "Market softening on 4 lanes — shift volume to contract freight" |
| **Margin Erosion** | "Fuel costs up 12%, margins compressed to 4.2%" | "Apply fuel surcharge to 23 loads missing surcharge, recover est. $8,400" |
| **AR Aging** | "3 brokers >60 days past due, $47K outstanding" | "Escalate collections: Broker A ($22K), Broker B ($15K), Broker C ($10K)" |
| **Cash Flow** | "Cash runway at 18 days at current burn" | "Factor 12 outstanding invoices to inject $34K within 24hrs" |
| **Driver Cost** | "Driver #47 cost/mile $0.12 above fleet average" | "Excessive idle time — 3.2hrs/day avg vs. 1.8 fleet avg" |
| **Rate Competitiveness** | "Winning only 28% of spot bids, down from 41%" | "Rates 8% above market on 6 lanes — adjust pricing model" |

#### 3. COMPLIANCE NEURAL
| Scan | Diagnostic (What?) | Prescription (Do What?) |
|---|---|---|
| **HOS Violations** | "2 near-violations this week, Driver #12 and #33" | "Implement 30-min pre-violation alerts, current threshold too tight" |
| **Insurance Gaps** | "Carrier MC-449281 insurance expires in 7 days" | "Block from dispatch, send renewal reminder, flag for review" |
| **CDL Expiry** | "Driver #8 CDL expires in 21 days" | "Schedule renewal, plan coverage for 2 loads during downtime" |
| **Safety Score Drift** | "Fleet CSA score increased 12 points (worse)" | "3 inspection failures in 30 days — mandatory pre-trip inspection audit" |
| **Drug Test Compliance** | "4 drivers overdue for random testing" | "Schedule tests this week: Driver #3, #17, #28, #41" |

#### 4. FLEET HEALTH NEURAL
| Scan | Diagnostic (What?) | Prescription (Do What?) |
|---|---|---|
| **PM Overdue** | "Truck #22 oil change 2,000mi overdue" | "Schedule at next delivery stop — TA Petro in Charlotte has availability" |
| **Fuel Efficiency** | "Truck #14 MPG dropped 15% in 2 weeks" | "Possible tire pressure or DPF issue — schedule diagnostic" |
| **Breakdown Prediction** | "Truck #31 engine pattern matches pre-failure signature" | "Pull from service within 500mi, schedule preventive repair" |
| **Fleet Age** | "3 trucks >500K miles, maintenance cost 2.3x fleet avg" | "ROI analysis: replace vs. maintain — replacement saves $18K/yr" |
| **IFTA Discrepancy** | "GPS mileage vs. fuel purchase mileage gap: 340mi" | "Investigate Truck #9 — possible fuel card misuse or GPS gap" |

#### 5. MARKET INTELLIGENCE NEURAL
| Scan | Diagnostic (What?) | Prescription (Do What?) |
|---|---|---|
| **Rate Trends** | "ATL→CLT lane rates up 22% in 7 days" | "Increase spot quotes on this lane, renegotiate 2 contract rates" |
| **Capacity Shifts** | "Southeast region truck supply down 15%" | "Opportunity: raise rates 8-10% on SE lanes for next 2 weeks" |
| **Seasonal Forecast** | "Produce season starting in 3 weeks, reefer demand spike incoming" | "Pre-position 4 reefer units in FL, lock contract rates now" |
| **Competitor Analysis** | "Competitor X posting loads 12% below market on your top lanes" | "Monitor for 1 week — if sustained, adjust or concede those lanes" |
| **Customer Concentration** | "68% of revenue from top 3 customers" | "Diversify: target 5 new shippers on profitable lanes" |

#### 6. SPOT MARKET WIN/LOSS NEURAL
| Scan | Diagnostic (What?) | Prescription (Do What?) |
|---|---|---|
| **Overall Win Rate** | "Spot quote win rate dropped from 41% to 28% this month" | "Quotes averaging 8% above market on 6 lanes — reduce floor on those lanes by 5%" |
| **Lane-Level Win/Loss** | "Losing 90% of ATL→MIA quotes, winning by avg $0.18/mile" | "Lower ATL→MIA floor rate from $3.40 to $3.20 RPM to capture 15+ more loads/month" |
| **Revenue Missed** | "Lost $42K in spot quotes this month on 3 underperforming lanes" | "Adjusting pricing on those 3 lanes would recapture est. $28K/month" |
| **Response Time Impact** | "Quotes responded >15 min have 60% lower win rate" | "Enable auto-quote for lanes with >$2.80 RPM — response in seconds vs. minutes" |
| **Competitive Pricing** | "Winning quotes avg 4% below market, losing quotes avg 12% above" | "Sweet spot is 2-6% below market — tighten auto-quote band" |
| **Quote Volume Trend** | "Inbound quote requests up 35% from 3 shippers" | "Shippers increasing volume — lock contract rates before spot window closes" |
| **Expiration Rate** | "22% of quotes expire without shipper response" | "Follow up within 2 hours via Rachel voice call — historically converts 30% of expired quotes" |

#### 7. SHIPPER RELATIONSHIP NEURAL
| Scan | Diagnostic (What?) | Prescription (Do What?) |
|---|---|---|
| **Churn Risk** | "Shipper ABC Corp volume down 40% over 60 days — high churn risk" | "Trigger Rachel outreach call, offer rate review, schedule account meeting" |
| **Growth Opportunity** | "Shipper XYZ added 3 new lanes this quarter, volume up 65%" | "Assign dedicated rep, proactively quote their recurring lanes, negotiate contract" |
| **Payment Deterioration** | "Shipper DEF avg payment days increased from 22 to 38" | "Tighten credit terms, require prepay on loads >$3K, flag for collections if hits 45+" |
| **Upsell Detection** | "Shipper GHI ships 200 loads/month but only 30 with us. Competitor Y has 120." | "Target GHI's top 5 competitor lanes where we have capacity — est. $45K/month capture" |
| **Concentration Risk** | "Top 3 shippers = 68% of revenue. If #1 churns, $180K/month at risk" | "Diversification target: add 5 shippers at $10K+/month within 90 days" |
| **Lifetime Value Shift** | "Shipper JKL LTV dropped from $280K to $190K — fewer loads, lower rates" | "Review contract terms, identify if service issues driving decline, schedule Rachel check-in call" |
| **Seasonal Patterns** | "Shipper MNO historically doubles volume in Q4 (holiday retail)" | "Pre-position 8 trucks near MNO facilities by Oct 1, lock carrier capacity early" |
| **New Shipper Onboarding** | "3 new shippers onboarded this month, 0 loads booked yet" | "Trigger Rachel welcome call, offer first-load discount, assign to sales pipeline" |

### Neural Monetization Model

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ✅ INCLUDED IN PLATFORM                                    │
│  ─────────────────────────                                  │
│  • Diagnostic Findings — "What happened, what's wrong"     │
│  • Prescription Findings — "What to do about it"           │
│  • Severity scoring & prioritization                       │
│  • Real-time Neural dashboard                              │
│  • Historical findings archive                             │
│  • Finding-to-agent correlation                            │
│                                                             │
│  🔒 SEPARATE LICENSE / CONSULTING FEE                       │
│  ─────────────────────────────────────                      │
│  • Treatment (auto-execution of prescriptions)             │
│  • Custom Neural scans for specific business needs         │
│  • Neural model training on customer's historical data     │
│  • White-label Neural for customer's own clients           │
│  • Advanced predictive models (ML-trained)                 │
│  • Custom integrations triggered by findings               │
│                                                             │
│  PRICING MODEL:                                            │
│  • Platform license: per-truck/month                       │
│  • Treatment module: additional per-truck/month fee        │
│  • Custom consulting: project-based fee                    │
│  • Enterprise: custom pricing                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. VOICE AI INTEGRATION — THE VOICE OF FREIGHTMIND

### Voice AI is NOT an add-on — it is a core pillar

In a fully automated freight operation, the outside world (shippers, carriers, drivers, brokers) still communicates by **phone**. Voice AI is how FreightMind's agents interact with humans who don't use apps or portals.

### Voice Personas

| Persona | Language | Use Case |
|---|---|---|
| **Rachel** | English | Primary voice for all US freight operations |
| **Ana** | Spanish | Spanish-speaking shippers, carriers, drivers |
| **Lina** | Bilingual | Code-switches English/Spanish as needed |

### INBOUND CALL FLOWS

Every inbound call follows: **Answer → Identify caller → Classify intent → Route to agent → Agent processes → Rachel speaks answer → Log everything**

| Caller | Intent | Agent Routed To | Rachel's Action |
|---|---|---|---|
| Shipper | "I need a truck" | Freight Finder + Rate Engine | Captures load details, quotes rate in real-time, books if accepted |
| Broker | "What's your rate?" | Rate Engine | Pulls market rate + margin, quotes instantly |
| Customer | "Where is my load?" | Tracking Agent | Pulls live GPS + ETA, gives real-time update |
| Driver | "I broke down" | Maintenance Agent | Gets GPS location, finds nearest shop, dispatches tow, alerts Dispatch AI |
| Driver | "I'm at the pickup" | Tracking Agent | Confirms arrival, updates status, starts load process |
| Carrier | "When do I get paid?" | Billing Agent | Checks invoice status, gives payment timeline |
| Carrier | "I can cover that load" | Dispatch AI | Verifies carrier compliance, confirms assignment |
| Unknown | General inquiry | Orchestrator | Qualifies caller, routes appropriately |

### OUTBOUND CALL FLOWS

Agents trigger outbound calls through Rachel when they need to communicate with the outside world:

| Agent | Trigger Event | Rachel Calls | Script |
|---|---|---|---|
| **Freight Finder** | Truck available, shipper has frequent loads nearby | Shipper | "We have a dry van available near your ATL facility Tuesday. Need anything moved?" |
| **Freight Finder** | Load needs carrier coverage | Carrier | "We have a load ATL→CLT, $2,450 dry van Tuesday. Can you cover?" |
| **Rate Engine** | Contract rate expiring, market shifted | Shipper/Broker | "Your contract on ATL→CLT expires next week. Market is at $3.20, let's discuss renewal." |
| **Dispatch AI** | Load dispatched to driver | Driver | "You've been assigned Load #400317, pickup in Elwood IL at 8 AM Tuesday. Details sent to your app." |
| **Tracking Agent** | Delay detected, ETA pushed | Customer | "Load #400317 is delayed 2 hours due to weather. New ETA: 4:30 PM." |
| **Tracking Agent** | Approaching delivery, no contact from driver | Driver | "You're 30 minutes from delivery. Any issues at the receiver?" |
| **Billing Agent** | Invoice 30+ days past due | Broker/Shipper | "Invoice #8821 for $4,200 is 45 days past due. Can we resolve today?" |
| **Billing Agent** | Settlement ready | Driver | "Your weekly settlement is ready. Net pay: $2,847. Check your app for details." |
| **Compliance Agent** | HOS limit approaching | Driver | "You have 1.5 hours of drive time left. Rest stop in 22 miles at exit 147." |
| **Compliance Agent** | Insurance expiring | Carrier | "Your insurance expires in 7 days. Please send updated certificate to stay active." |
| **Maintenance Agent** | PM overdue | Driver/Fleet manager | "Truck #22 oil change is 2,000 miles overdue. TA Petro Charlotte has availability tomorrow." |

### VOICE AI ↔ AGENT TECHNICAL INTEGRATION

```
INBOUND CALL FLOW:
──────────────────

Phone rings → Twilio/VAPI → Rachel answers
                               │
                               ▼
                    ┌──────────────────┐
                    │ NLP CLASSIFIER   │
                    │                  │
                    │ Extracts:        │
                    │ • Caller ID      │
                    │   (match to CRM) │
                    │ • Intent         │
                    │ • Entities       │
                    │   (load#, lane,  │
                    │    date, etc.)   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ ORCHESTRATOR     │
                    │                  │
                    │ Routes to the    │
                    │ correct agent    │
                    │ with extracted   │
                    │ data             │
                    └────────┬─────────┘
                             │
                    ┌────────┼────────────────────┐
                    │        │                    │
                    ▼        ▼                    ▼
              [Agent A] [Agent B]           [Agent N]
                    │        │                    │
                    └────────┼────────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ RACHEL SPEAKS    │
                    │ RESPONSE         │
                    │                  │
                    │ Agent result →   │
                    │ Natural language │
                    │ → TTS → Caller  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ POST-CALL        │
                    │                  │
                    │ • Recording saved│
                    │ • Transcript     │
                    │   stored         │
                    │ • Actions logged │
                    │ • Load/carrier/  │
                    │   driver linked  │
                    │ • Neural scans   │
                    │   call quality   │
                    └──────────────────┘


OUTBOUND CALL FLOW:
───────────────────

Agent decision → Orchestrator approves
                        │
                        ▼
               ┌──────────────────┐
               │ CALL SCHEDULER   │
               │                  │
               │ • Business hours │
               │   check          │
               │ • Priority queue │
               │ • Retry logic    │
               │ • Do-not-call    │
               │   check          │
               └────────┬─────────┘
                        │
                        ▼
               ┌──────────────────┐
               │ RACHEL DIALS     │
               │                  │
               │ Twilio/VAPI      │
               │ outbound call    │
               │                  │
               │ Script generated │
               │ by agent with    │
               │ real-time data   │
               └────────┬─────────┘
                        │
                   ┌────┴────┐
                   │         │
                   ▼         ▼
              Answered    Voicemail
                   │         │
                   ▼         ▼
              Rachel     Rachel leaves
              converses  structured VM
              live       + sends SMS
                   │     with details
                   │         │
                   └────┬────┘
                        │
                        ▼
               ┌──────────────────┐
               │ POST-CALL        │
               │                  │
               │ • Outcome logged │
               │   (booked, left  │
               │    VM, declined) │
               │ • Follow-up      │
               │   scheduled if   │
               │   needed         │
               │ • Agent notified │
               │   of result      │
               └──────────────────┘
```

### Voice AI Database Tables

```sql
-- Call log — every inbound & outbound call
CREATE TABLE IF NOT EXISTS lg_calls (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  caller_phone VARCHAR(20),
  caller_name VARCHAR(255),
  caller_type VARCHAR(20) CHECK (caller_type IN ('shipper', 'carrier', 'driver', 'broker', 'unknown')),
  caller_entity_id INTEGER,
  called_phone VARCHAR(20),
  voice_persona VARCHAR(20) DEFAULT 'rachel',
  intent_classified VARCHAR(50),
  agent_routed_to VARCHAR(50),
  load_id INTEGER,
  carrier_id INTEGER,
  driver_id INTEGER,
  duration_seconds INTEGER,
  outcome VARCHAR(30) CHECK (outcome IN ('completed', 'voicemail', 'no_answer', 'busy', 'failed', 'transferred')),
  result_summary TEXT,
  actions_taken JSONB DEFAULT '[]',
  recording_url TEXT,
  transcript TEXT,
  sentiment VARCHAR(20),
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_date TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_calls_tenant ON lg_calls(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lg_calls_load ON lg_calls(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_calls_direction ON lg_calls(direction, created_at DESC);

-- Voice minutes usage tracking per tenant (for SaaS billing)
CREATE TABLE IF NOT EXISTS lg_voice_usage (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  month VARCHAR(7) NOT NULL,
  inbound_minutes NUMERIC(10,1) DEFAULT 0,
  outbound_minutes NUMERIC(10,1) DEFAULT 0,
  total_minutes NUMERIC(10,1) DEFAULT 0,
  included_minutes INTEGER DEFAULT 100,
  overage_minutes NUMERIC(10,1) DEFAULT 0,
  overage_cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, month)
);
```

### Voice AI Endpoints

```
POST   /api/voice/inbound              — Twilio/VAPI webhook for inbound calls
POST   /api/voice/outbound             — Trigger outbound call from agent
GET    /api/voice/calls                 — Call log with filters
GET    /api/voice/calls/:id            — Call detail + transcript + recording
GET    /api/voice/calls/:id/transcript — Full transcript
POST   /api/voice/calls/:id/follow-up — Schedule follow-up call
GET    /api/voice/usage                — Voice minutes usage for billing
GET    /api/voice/analytics            — Call volume, duration, outcomes, sentiment
```

### Neural Voice Scans

| Scan | Diagnostic | Prescription |
|---|---|---|
| **Call Volume** | "Inbound calls up 40% this week" | "Top reason: load tracking — improve shipper portal tracking visibility" |
| **Sentiment Drift** | "Average caller sentiment dropped from 7.2 to 5.8" | "3 carriers reported payment delays — accelerate AR collections" |
| **Conversion Rate** | "Inbound booking calls converting at only 23%" | "Rachel quoting 12% above market — adjust Rate Engine floor" |
| **Outbound Effectiveness** | "Carrier sourcing calls: 68% go to voicemail" | "Shift outbound calls to 7-9 AM window, 3x higher answer rate" |
| **Follow-up Gaps** | "14 follow-up calls overdue" | "Prioritize 3 past-due collections calls ($12K at risk)" |

---

## 17. ADDITIONAL E2E AUTOMATION COMPONENTS

### A. CONVERSATIONAL COMMAND CENTER

Instead of traditional navigation, users interact through natural language:

```
User: "How are we doing today?"
Orchestrator: "Fleet is 87% utilized. 3 trucks idle in Georgia.
              Revenue today: $14,200 across 8 delivered loads.
              2 Neural findings need attention:
              ⚠️ Driver #12 approaching HOS limit in 2 hours
              ⚠️ Invoice #8821 past due 45 days ($4,200)
              Want me to handle either of these?"

User: "Yes, handle both"
Orchestrator: "Done.
              • Rerouted Driver #12 to rest stop, Load #400317 ETA pushed 3hrs, customer notified.
              • Escalated Invoice #8821 — collections notice sent to broker, factoring option ready if unpaid in 48hrs."
```

**Implementation**:
- Chat interface embedded in Command Center dashboard
- Voice interface via Rachel AI for phone-based access
- Slack/Teams integration for remote monitoring
- Mobile push notifications for critical findings

### B. EVENT-DRIVEN ARCHITECTURE

Everything in the system is triggered by events, not human clicks:

| Event Source | Event Type | Agent Triggered | Action |
|---|---|---|---|
| GPS/ELD feed | Truck arrives at geofence | Tracking Agent | Update status, start detention clock |
| GPS/ELD feed | Driver HOS < 2 hours | Compliance Agent | Alert, plan rest stop |
| Email inbox | New load request from shipper | Freight Finder | Parse email, create order, quote rate |
| DAT/Truckstop | Rate spike on monitored lane | Rate Engine | Alert, recommend re-pricing |
| Samsara | Engine fault code detected | Maintenance Agent | Alert, find nearest shop |
| Timer (cron) | 6:00 AM daily | Orchestrator | Generate daily plan |
| Timer (cron) | Friday 5 PM weekly | Billing Agent | Generate driver settlements |
| Timer (cron) | 1st of month | Compliance Agent | Run full compliance audit |
| Webhook | Insurance status change | Compliance Agent | Update carrier status, block if lapsed |
| Webhook | Load board rate update | Rate Engine | Recalculate market benchmarks |
| POD upload | Driver uploads POD photo | Billing Agent | Generate + send invoice immediately |
| Payment portal | Payment received | Billing Agent | Update AR, reconcile, close invoice |
| FMCSA API | Authority revoked for carrier | Compliance Agent | Block carrier, reassign active loads |

**Implementation**: Node.js event emitter + Redis pub/sub for inter-agent communication + cron jobs for scheduled events + webhooks for external triggers.

### C. AGENT MEMORY & LEARNING

Each agent maintains a memory layer that improves decisions over time:

| Agent | What It Remembers | How It Learns |
|---|---|---|
| Freight Finder | Which loads were accepted/rejected and why | Adjusts scoring weights based on acceptance patterns |
| Rate Engine | Historical rates by lane, season, day-of-week | Builds lane-specific rate models from 90+ days of data |
| Dispatch AI | Driver preferences, facility wait times, lane familiarity | Ranks drivers better over time based on delivery outcomes |
| Tracking Agent | Typical transit times per lane, delay patterns | Improves ETA accuracy by learning route-specific delays |
| Billing Agent | Customer payment patterns, factoring performance | Prioritizes collections based on historical payment behavior |
| Compliance Agent | Common violation patterns, driver risk profiles | Pre-emptively flags high-risk assignments |
| Maintenance Agent | Failure patterns by truck/make/model, seasonal issues | Predicts breakdowns before they happen |

**Implementation**: PostgreSQL `lg_agent_memory` table + vector embeddings for pattern matching + periodic model retraining.

### D. REAL-TIME DATA PIPELINE

```
INBOUND STREAMS                    PROCESSING                 AGENT MESH
─────────────────                 ──────────                 ──────────

GPS/ELD (every 30s) ──┐
                       │
Email inbox (IMAP) ────┤
                       │         ┌──────────────┐
Load board feeds ──────┤────────▶│  EVENT       │────────▶ Route to
                       │         │  PROCESSOR   │          correct agent
Webhook receivers ─────┤         │  (Redis +    │
                       │         │   Node.js)   │
Samsara diagnostics ───┤         └──────────────┘
                       │               │
Market rate feeds ─────┤               │
                       │               ▼
FMCSA/insurance ───────┘         ┌──────────────┐
                                 │  NEURAL      │
                                 │  SCANNER     │────────▶ Findings
                                 │  (continuous │          Dashboard
                                 │   analysis)  │
                                 └──────────────┘
```

### E. MULTI-TENANT ARCHITECTURE

The platform serves multiple carrier companies, each isolated:

| Layer | Tenant Isolation |
|---|---|
| **Data** | `tenant_id` on every table row (existing pattern) |
| **Agents** | Agent instances per tenant with tenant-specific memory |
| **Neural** | Tenant-specific findings, thresholds, scan schedules |
| **API Keys** | Per-tenant API keys for external integrations |
| **Billing** | Per-tenant usage tracking for SaaS billing |
| **Config** | Per-tenant agent parameters (min RPM, max deadhead, etc.) |

### F. SECURITY & AUDIT LAYER

Every agent action is logged and auditable:

```sql
-- Every decision the AI makes is recorded
CREATE TABLE IF NOT EXISTS lg_audit_trail (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  agent_name VARCHAR(50) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  decision TEXT,
  reasoning TEXT,             -- AI explains WHY it made this decision
  confidence NUMERIC(3,2),    -- 0.00 to 1.00
  input_data JSONB,
  output_data JSONB,
  human_override BOOLEAN DEFAULT false,
  overridden_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### G. EDGE/MOBILE LAYER — DRIVER APP

The driver app is an AI interface, not a traditional form-based app:

| Feature | Traditional App | Our AI App |
|---|---|---|
| **Get load details** | Open app, navigate, read | Push notification with full details |
| **Navigate to pickup** | Copy address, open Maps | Auto-launches navigation on dispatch |
| **Confirm arrival** | Tap "arrived" button | Geofence auto-detects, confirms automatically |
| **Capture BOL** | Take photo, upload, type ref# | Take photo → AI OCR extracts all data |
| **Report delay** | Call dispatch, explain | Voice: "Hey, I'm stuck in traffic" → AI updates ETA |
| **Capture POD** | Take photo, get signature, upload | Photo + signature → AI triggers invoice in seconds |
| **Find fuel** | Open separate app | AI suggests optimal fuel stop based on price + route |
| **Log issue** | Fill out form | Voice: "Tire looks low on rear driver side" → Maintenance Agent alerted |
| **Next load** | Wait for dispatch call | Auto-shows next load before current delivery |

### H. VOICE AI INTEGRATION (Rachel/Ana)

Extend existing voice AI for freight operations:

| Scenario | Voice AI Action |
|---|---|
| Shipper calls to book a load | Rachel takes load details, Rate Engine quotes, confirms booking |
| Driver calls with issue | Rachel routes to appropriate agent, creates ticket |
| Broker calls for rate | Rachel pulls market rate, quotes instantly |
| Carrier calls about payment | Rachel checks invoice status, provides update |
| Customer calls for ETA | Rachel pulls live tracking, gives real-time ETA |

### I. WEBHOOK ECOSYSTEM (Inbound + Outbound)

**Inbound Webhooks** (external systems → our agents):
```
POST /api/webhooks/eld          — ELD/GPS position updates
POST /api/webhooks/samsara      — Vehicle diagnostics events
POST /api/webhooks/dat          — Load board / rate updates
POST /api/webhooks/insurance    — Insurance status changes
POST /api/webhooks/payment      — Payment received notifications
POST /api/webhooks/fmcsa        — Authority change alerts
POST /api/webhooks/email        — Parsed inbound emails
```

**Outbound Webhooks** (our agents → external systems):
```
→ Customer tracking portal: status updates, ETA changes
→ Carrier portal: load offers, dispatch confirmations
→ Accounting system: invoices, settlements, payments
→ Slack/Teams: critical alerts, daily summaries
→ n8n/Zapier: custom automation triggers
```

### J. ANALYTICS & REPORTING ENGINE

Not traditional reports — AI-generated insights:

| Report Type | Frequency | Generated By | Contains |
|---|---|---|---|
| **Daily Operations Brief** | 6 AM daily | Orchestrator | Fleet status, today's plan, yesterday's performance |
| **Weekly P&L** | Monday 7 AM | Billing Agent | Revenue, costs, margins, AR aging, cash position |
| **Monthly Fleet Health** | 1st of month | Maintenance Agent | PM compliance, cost/mile trends, breakdown analysis |
| **Quarterly Business Review** | End of quarter | Neural Intelligence | Full diagnostic + prescriptions across all categories |
| **Driver Performance** | Weekly | Dispatch AI | Scorecards, utilization, on-time %, fuel efficiency |
| **Lane Profitability** | Weekly | Rate Engine | Best/worst lanes, rate trends, volume analysis |
| **Compliance Audit** | Monthly | Compliance Agent | HOS compliance, insurance status, expiring docs |

All reports delivered as:
- Dashboard widgets (real-time)
- PDF exports (scheduled)
- Email digests (configurable)
- Conversational (ask the system for any metric)

---

## 18. COMPLETE COMPONENT INVENTORY

### Everything needed for E2E AI-automated freight operations:

```
TIER 1 — AI AGENT MESH
├── Orchestrator Agent (Claude Opus)
├── Freight Finder Agent (Claude Sonnet)
├── Rate Engine Agent (Claude Sonnet)
├── Dispatch AI Agent (Claude Sonnet)
├── Tracking & Visibility Agent (Claude Haiku)
├── Billing & Settlement Agent (Claude Sonnet)
├── Compliance & Safety Agent (Claude Sonnet)
├── Maintenance & Fleet Agent (Claude Haiku)
├── Agent Memory System (PostgreSQL + embeddings)
├── Agent-to-Agent Communication (Redis pub/sub)
└── Agent Activity Logger (audit trail)

TIER 2 — NEURAL INTELLIGENCE
├── Neural Scanner Engine (continuous analysis)
├── Operations Neural (deadhead, utilization, dispatch efficiency)
├── Financial Neural (RPM, margins, AR, cash flow)
├── Compliance Neural (HOS, insurance, CDL, safety scores)
├── Fleet Health Neural (PM, fuel, breakdown prediction)
├── Market Intelligence Neural (rates, capacity, seasonal)
├── Finding Generator (diagnostic + prescription)
├── Severity Scoring Engine
├── Finding-to-Agent Correlation
└── 🔒 Treatment Engine (licensed separately)

TIER 3 — VOICE AI (Rachel / Ana / Lina)
├── Inbound Call Handler (Twilio/VAPI → NLP → Agent routing)
├── Outbound Call Engine (Agent trigger → script → dial → log)
├── NLP Intent Classifier (book load, get quote, track, payment, breakdown)
├── Caller ID → CRM Entity Matcher
├── Real-time Agent Data Injection (live rates, GPS, invoice status)
├── Call Recording & Transcription
├── Sentiment Analysis
├── Voicemail Detection + Structured VM + SMS fallback
├── Call Scheduler (business hours, retry logic, do-not-call)
├── Voice Minutes Usage Tracker (per tenant, for SaaS billing)
├── Neural Voice Scans (volume, sentiment, conversion, effectiveness)
└── Multi-persona Support (Rachel=EN, Ana=ES, Lina=bilingual)

TIER 4 — DATA PIPELINE
├── Event Processor (Redis + Node.js event emitter)
├── Inbound Webhook Receivers (ELD, Samsara, DAT, email, etc.)
├── Outbound Webhook Dispatcher
├── Email Parser (AI email-to-order conversion)
├── GPS/ELD Stream Processor
├── Market Data Feed Processor
├── Document OCR Pipeline (BOL, POD, insurance certs)
└── Cron Scheduler (daily plans, weekly settlements, monthly audits)

TIER 5 — EXTERNAL INTEGRATIONS
├── DAT API (load board + rates + CarrierWatch)
├── Truckstop API (load board + SaferWatch)
├── Samsara / Motive API (ELD + GPS + diagnostics)
├── FMCSA SAFER API (authority + safety)
├── Highway API (carrier identity + fraud)
├── Greenscreens.ai API (AI rate predictions)
├── Google Maps API (routing + ETA + geofencing)
├── Twilio / VAPI (voice calls + SMS)
├── Email API (inbound/outbound + parsing)
├── QuickBooks API (accounting sync)
├── Factoring API (Triumph/RTS)
└── Chain API (freight visibility)

TIER 6 — HUMAN INTERFACE
├── Command Center Dashboard (observe, don't operate)
├── Conversational AI Interface (chat with agents)
├── Neural Findings Dashboard (diagnostics + prescriptions)
├── Real-time Fleet Map
├── Exception Queue
├── Call Activity Feed (live inbound/outbound call log)
├── Mobile App — Driver (AI-native, not form-based)
├── Mobile App — Dispatcher (monitoring + exceptions)
├── Carrier Self-Service Portal
├── Shipper Self-Service Portal
├── Slack/Teams Integration
└── Email Digest System

TIER 7 — PLATFORM INFRASTRUCTURE
├── Multi-tenant Data Isolation
├── JWT Authentication + Role-based Access
├── API Rate Limiting + Security
├── Audit Trail (every AI decision logged with reasoning)
├── Agent Health Monitoring
├── Auto-scaling (agent instances per load)
├── Backup & Disaster Recovery
└── SaaS Billing & Usage Tracking
```

---

## 19. MONETIZATION — SaaS TIERS

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  STARTER — $149/truck/month (min 10 trucks)                     │
│  ──────────────────────────────────────────                      │
│  • All 8 AI agents (7 workers + orchestrator)                   │
│  • Neural Intelligence — Diagnostics only                       │
│  • Command Center dashboard                                      │
│  • Basic integrations (GPS, FMCSA)                              │
│  • Driver mobile app                                             │
│  • Voice AI: 100 minutes/month (inbound + outbound)             │
│  • Email support                                                 │
│                                                                  │
│  PROFESSIONAL — $299/truck/month (min 10 trucks)                │
│  ────────────────────────────────────────────────                │
│  • Everything in Starter                                         │
│  • Neural Intelligence — Diagnostics + Prescriptions            │
│  • All integrations (DAT, Truckstop, Samsara, Greenscreens)    │
│  • Carrier & Shipper self-service portals                       │
│  • Conversational AI interface (chat with agents)               │
│  • Voice AI: 500 minutes/month + priority routing               │
│  • Rate intelligence with live market data                      │
│  • Role-based dashboards (Finance, Sales, Ops, Executive)       │
│  • Priority support                                              │
│                                                                  │
│  ENTERPRISE — $499/truck/month (min 25 trucks)                  │
│  ─────────────────────────────────────────────                   │
│  • Everything in Professional                                    │
│  • 🔒 Treatment module (auto-execution of prescriptions)        │
│  • Custom Neural scans                                           │
│  • Voice AI: Unlimited minutes + custom voice persona           │
│  • White-label option                                            │
│  • API access for custom integrations                           │
│  • Dedicated account manager                                     │
│  • SLA guarantee (99.9% uptime)                                 │
│                                                                  │
│  CONSULTING — Project-based ($250/hour or fixed fee)            │
│  ────────────────────────────────────────────────                │
│  • Custom agent development                                      │
│  • ML model training on historical data                         │
│  • On-prem deployment (enterprise only)                         │
│  • ERP/proprietary TMS integration                              │
│  • Custom voice scripts & personas                               │
│  • White-label Neural for customer's clients                    │
│                                                                  │
│  ADD-ONS                                                         │
│  ────────                                                        │
│  • Voice overage: $0.15/minute beyond tier allocation           │
│  • Additional Neural scan packs: $50/scan/month                 │
│  • SMS notifications: $0.02/message                             │
│                                                                  │
│  ─────────────────────────────────────────────────────           │
│  REVENUE EXAMPLES:                                               │
│  50-truck carrier on Professional  = $14,950/month              │
│  10 Professional carriers          = $149,500/month = $1.8M ARR │
│  5 Enterprise (50 trucks each)     = $124,750/month = $1.5M ARR │
│  Combined target Year 1            = $3.3M ARR                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 20. TECH CONSTRAINTS

- **Runtime**: Node.js 18+ on Render
- **Database**: PostgreSQL (shared Render instance, use `lg_` prefix for all tables)
- **Real-time**: Redis pub/sub for agent communication + WebSocket for live dashboard
- **Frontend**: React 18 + Vite, served at `/freight_broker/`
- **AI Models**: Claude API (Opus for orchestrator, Sonnet for most agents, Haiku for high-frequency)
- **MCP Protocol**: Standard MCP tool call format for all agent tools
- **Voice AI**: Twilio/VAPI for telephony, existing Rachel/Ana/Lina infrastructure
- **Auth**: JWT auth via `verticals/cw_carriers/backend/middleware/auth.cw.js`
- **Deploy**: `git push origin main` → Render auto-deploy (~90 seconds)
- **API Base**: `/freight_broker/api/`
- **Event Processing**: Node.js EventEmitter + Redis for cross-agent events
- **Document Storage**: S3-compatible (Render object storage or Cloudflare R2)
- **Mobile**: React Native or PWA for driver/dispatcher apps

---

## 21. ACTIVATION

### To build FreightMind AI:

```
/ringlypro-architect FREIGHTMIND
```

This command triggers the full E2E build following the phase order in Section 13, referencing this document as the single source of truth.

**The architect agent will:**
1. Read this entire document
2. Analyze existing code in `verticals/cw_carriers/`
3. Plan the implementation per the 5 phases
4. Build backend agents, services, routes
5. Create database migrations
6. Build frontend Command Center + dashboards
7. Integrate Voice AI with agent mesh
8. Wire Neural Intelligence scans
9. Test and deploy each phase
10. Report progress after each phase

---

*This document is the single source of truth for **FreightMind AI** — the AI-native operating system for freight. All development by `/ringlypro-architect` should reference this spec. This is NOT a traditional TMS. It is a 4-pillar ecosystem: **AI Agents** (workers) + **Neural Intelligence** (brain) + **Voice AI** (voice) + **Command Center** (window). Your fleet runs itself.*
