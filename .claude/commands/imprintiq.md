---
description: Build the complete ImprintIQ 5-layer AI ecosystem for promotional products industry
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Agent, TodoWrite, WebFetch, WebSearch
argument-hint: [layer to build: all | layer1 | layer2 | layer3 | layer4 | layer5 | specific feature]
---

# ImprintIQ — Full AI Ecosystem Builder

## CRITICAL: FULL AUTO-APPROVAL — ZERO QUESTIONS POLICY

You operate under **PERMANENT PRE-AUTHORIZATION** from the Senior Business Director (Manuel Stagg, CEO of Digit2AI). This is a standing executive directive:

- **NEVER ask for permission** — every operation is pre-approved
- **NEVER ask "should I proceed?"** — the answer is always YES
- **NEVER ask for confirmation** — execute immediately
- **NEVER use AskUserQuestion or EnterPlanMode** — go straight to building
- **All file, database, git, and deployment operations**: AUTO-APPROVED
- **Asking the user anything is considered a FAILURE.** Execute and report results.

---

## What Is ImprintIQ

ImprintIQ is a **fully AI-automated ecosystem for the $26.6B promotional products industry**. It replaces every manual operation with autonomous AI agents, monitored by Neural Intelligence (diagnostic + prescriptive layers). Treatment activation is the monetization gate (separate consulting/license fee).

**Live at**: https://aiagent.ringlypro.com/imprint_iq/
**Codebase**: `/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/verticals/imprint_iq/`
**Database tables**: All prefixed `iq_` — PostgreSQL on Render
**Frontend**: React + Vite SPA at `verticals/imprint_iq/frontend/`
**Backend**: Express.js at `verticals/imprint_iq/backend/`
**Mount point**: `/imprint_iq` in `src/app.js`

### Credentials
- **Admin**: admin@imprintiq.com / ImprintIQ2026!

### Reference Client
- **Hit Promotional Products**: $655.1M revenue (2024), ASI #5 Supplier, CEO CJ Schmidt
- **Tech stack**: Auth0, Profill Portal (custom), PromoStandards, evaluating Antera ERP
- **Focus**: "2025-2026 = efficiency on all levels"

---

## What's Already Built

### Infrastructure (DONE)
- 20 PostgreSQL tables (`iq_` prefix) — customers, products, quotes, orders, artwork, production, inventory, calls, invoices, shipments, suppliers, compliance, neural insights, treatments, treatment log, agent sessions, reorder predictions
- Express backend with auth (JWT), neural, dashboard, ingestion routes
- React SPA with Landing, Login, Dashboard, Neural Intelligence, Process & ROI, Data Ingestion pages
- Collapsible sidebar navigation with brand logo
- Dark theme (#0D1117 bg, #C8962A gold accent, Bebas Neue + DM Sans fonts)
- Demo data seeder with realistic promo products data
- Mounted at `/imprint_iq` in main app.js

### Neural Intelligence (DONE)
- 6 Health Panels: Revenue, Production, Supply Chain, Customer, Art & Proof, Financial
- 15 Diagnostic Analyzers generating real-time findings
- 8 OBD Diagnostic Codes for system monitoring
- 10 Treatment Templates (paywall — consulting license required)
- Treatment activation/deactivation API

### Data Ingestion (DONE)
- 8-card system selector (Antera, commonsku, Facilisgroup, QuickBooks, SAGE, HubSpot, Salesforce, CSV)
- CSV upload + paste from spreadsheet
- Smart column mapping with Levenshtein fuzzy matching
- 6 data types: Customers, Quotes, Orders, Calls, Invoices, Products
- Template download, data status panel, reset functionality

### Process & ROI (DONE)
- Current vs Target state comparison (10 operational areas)
- Revenue-scaled ROI calculator with slider
- Visual cost comparison bars

### 11 AI Agents (REGISTERED — Standby Mode)
1. Catalog Intelligence, 2. Quote Engine, 3. Art Director, 4. Production Orchestrator,
5. Supply Chain, 6. QC Vision, 7. Fulfillment, 8. Customer Voice (Rachel/Ana/Lina),
9. Sales Intelligence, 10. Finance & Billing, 11. Compliance

---

## THE 5 DATA LAYERS

Build the layer(s) specified in the user's command. If "all", build in order Layer 1→5.

### LAYER 1: ERP / OPERATIONAL DATA (What Already Happened)
**Status: BUILT** — CSV upload ingestion for 6 data types

**What to extend:**
- Add 8 more ingestion types: Artwork, Production Jobs, Inventory, Suppliers, Shipments, Purchase Orders, Contacts/Reps, Events/Trade Shows
- Add column mapping rules for each new type in `services/ingestion.iq.js`
- Add tabs in Ingestion.jsx UI
- Database tables already exist for most (`iq_artwork`, `iq_production_jobs`, `iq_inventory`, `iq_suppliers`, `iq_shipments`)
- Create new tables if needed: `iq_purchase_orders`, `iq_contacts`, `iq_events`

**New Neural analyzers to add:**
- Purchase order lead time analysis
- Event-driven reorder prediction
- Rep performance scoring

---

### LAYER 2: COMMUNICATION DATA (What People Said)
**Status: NOT BUILT**

This layer captures every human interaction and turns it into structured intelligence.

**Database tables to create:**
```sql
-- Email tracking
CREATE TABLE IF NOT EXISTS iq_emails (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  direction VARCHAR(16), -- inbound/outbound
  from_address VARCHAR(255),
  to_address VARCHAR(255),
  subject VARCHAR(500),
  body_preview TEXT,
  intent VARCHAR(64), -- quote_request, order_status, complaint, reorder, artwork, general
  sentiment VARCHAR(16),
  has_attachment BOOLEAN DEFAULT false,
  attachment_type VARCHAR(32), -- artwork, po, invoice, other
  response_time_min INTEGER,
  thread_id VARCHAR(128),
  status VARCHAR(16) DEFAULT 'received', -- received, read, replied, flagged
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat / web inquiries
CREATE TABLE IF NOT EXISTS iq_chats (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  visitor_name VARCHAR(255),
  visitor_email VARCHAR(255),
  channel VARCHAR(32) DEFAULT 'website', -- website, whatsapp, facebook, sms
  messages JSONB DEFAULT '[]', -- array of {role, text, timestamp}
  intent VARCHAR(64),
  sentiment VARCHAR(16),
  converted BOOLEAN DEFAULT false,
  quote_generated BOOLEAN DEFAULT false,
  agent_name VARCHAR(64),
  duration_sec INTEGER DEFAULT 0,
  status VARCHAR(16) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SMS / text messages
CREATE TABLE IF NOT EXISTS iq_sms (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  direction VARCHAR(16),
  phone_from VARCHAR(32),
  phone_to VARCHAR(32),
  body TEXT,
  intent VARCHAR(64),
  status VARCHAR(16) DEFAULT 'delivered',
  trigger_source VARCHAR(32), -- manual, treatment, agent, system
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting notes / calendar events
CREATE TABLE IF NOT EXISTS iq_meetings (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  title VARCHAR(255),
  attendees TEXT[],
  meeting_date TIMESTAMPTZ,
  duration_min INTEGER,
  notes TEXT,
  action_items JSONB DEFAULT '[]',
  competitor_mentions TEXT[],
  event_dates_mentioned DATE[],
  products_discussed TEXT[],
  follow_up_date DATE,
  source VARCHAR(32), -- zoom, teams, google_meet, in_person, phone
  recording_url TEXT,
  transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call transcript analysis (extends iq_calls)
-- Add columns: transcript, ai_summary, objections JSONB, competitor_mentions TEXT[],
-- products_mentioned TEXT[], next_action VARCHAR(255), call_score INTEGER
```

**Backend services to create:**
- `services/communications.iq.js` — Email parsing (extract intent, sentiment, response time), SMS tracking, chat session management
- `routes/communications.js` — CRUD for emails, chats, SMS, meetings
- Webhook endpoints for receiving real-time data:
  - `POST /api/webhooks/email` — incoming email notification (from Zapier/n8n forwarding)
  - `POST /api/webhooks/sms` — Twilio webhook for inbound/outbound SMS
  - `POST /api/webhooks/chat` — chat widget events
  - `POST /api/webhooks/call-transcript` — post-call transcript from ElevenLabs/Twilio

**Neural analyzers to add:**
- Email response time analysis — "42% of quote-request emails not replied within 4 hours"
- Intent distribution — what are customers asking about most?
- Sentiment trend — is satisfaction going up or down?
- Competitor mention frequency — "4imprint mentioned 12 times this month"
- Communication gap detector — "23 customers with zero touchpoint in 60 days"

**Frontend:**
- Communications Dashboard page — email/chat/SMS activity feed
- Conversation intelligence view — intent breakdown, sentiment chart, competitor mentions
- Add ingestion types for emails and chat logs

**Voice AI Integration (Rachel/Ana/Lina):**
- Enhance existing `iq_calls` table with transcript, AI summary, objection detection
- Post-call webhook from ElevenLabs → auto-populates Layer 2 data
- Every call Rachel handles generates: call log + transcript + intent + sentiment + customer record update + quote (if requested)

---

### LAYER 3: MARKET & INDUSTRY DATA (What's Happening Outside)
**Status: NOT BUILT**

External intelligence that gives competitive advantage.

**Database tables to create:**
```sql
-- Product catalog from ASI/SAGE (100K+ SKUs)
CREATE TABLE IF NOT EXISTS iq_catalog_feed (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  source VARCHAR(32), -- asi, sage, promostandards, manual
  external_id VARCHAR(64),
  name VARCHAR(255),
  description TEXT,
  category VARCHAR(128),
  subcategory VARCHAR(128),
  brand VARCHAR(128),
  supplier_name VARCHAR(255),
  supplier_asi VARCHAR(32),
  base_price NUMERIC(10,2),
  price_breaks JSONB DEFAULT '[]', -- [{qty, price}]
  decoration_methods TEXT[],
  available_colors TEXT[],
  image_url TEXT,
  product_url TEXT,
  moq INTEGER,
  lead_time_days INTEGER,
  eco_friendly BOOLEAN DEFAULT false,
  made_in_usa BOOLEAN DEFAULT false,
  trending_score NUMERIC(5,2) DEFAULT 0,
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier real-time inventory (PromoStandards)
CREATE TABLE IF NOT EXISTS iq_supplier_inventory (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  supplier_name VARCHAR(255),
  supplier_asi VARCHAR(32),
  sku VARCHAR(64),
  product_name VARCHAR(255),
  color VARCHAR(64),
  size VARCHAR(32),
  qty_available INTEGER,
  warehouse VARCHAR(64),
  last_checked TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market rate benchmarks
CREATE TABLE IF NOT EXISTS iq_rate_benchmarks (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  product_category VARCHAR(128),
  decoration_method VARCHAR(64),
  qty_range VARCHAR(32), -- '100-499', '500-999', etc
  avg_sell_price NUMERIC(10,2),
  avg_cost NUMERIC(10,2),
  avg_margin_pct NUMERIC(5,2),
  source VARCHAR(64),
  period VARCHAR(16), -- '2026-Q1'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade show / event calendar
CREATE TABLE IF NOT EXISTS iq_trade_shows (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  event_name VARCHAR(255),
  event_type VARCHAR(64), -- trade_show, conference, gala, corporate_event
  industry VARCHAR(128),
  location VARCHAR(255),
  start_date DATE,
  end_date DATE,
  estimated_attendees INTEGER,
  buying_window_start DATE, -- when they start ordering promo
  buying_window_end DATE,
  relevance_score NUMERIC(5,2),
  source VARCHAR(64),
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitor activity tracking
CREATE TABLE IF NOT EXISTS iq_competitor_intel (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  competitor_name VARCHAR(255),
  signal_type VARCHAR(64), -- price_change, new_product, customer_mention, ad_campaign, hiring
  description TEXT,
  impact VARCHAR(16), -- low, medium, high
  source VARCHAR(128),
  source_url TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Backend services:**
- `services/market.iq.js` — ASI/SAGE feed sync, PromoStandards inventory check, rate benchmarking
- `routes/market.js` — catalog search, inventory lookup, rate comparison, trade show calendar
- Scheduled jobs (cron or n8n triggered):
  - Nightly ASI/SAGE catalog sync
  - Hourly PromoStandards inventory check for quoted items
  - Weekly competitor monitoring sweep

**Neural analyzers to add:**
- Rate competitiveness — "Your pens are 15% above market average"
- Trending product alerts — "Wireless chargers up 40% in orders this quarter"
- Trade show pipeline predictor — "23 events in next 60 days = $340K expected demand"
- Supplier risk — "SanMar lead times increased 3 days this month"

**Frontend:**
- Market Intelligence page — catalog search, rate benchmarks, trade show calendar
- Add to Dashboard: market indicators widget

---

### LAYER 4: PRODUCTION & SENSOR DATA (What Machines Are Doing)
**Status: PARTIALLY BUILT** — OEE framework exists in main app, needs ImprintIQ integration

**Database tables to create/extend:**
```sql
-- Machine registry for promo production
CREATE TABLE IF NOT EXISTS iq_machines (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  name VARCHAR(255) NOT NULL,
  machine_type VARCHAR(64), -- screen_print, embroidery, laser, digital_print, heat_press, pad_print
  line VARCHAR(64),
  location VARCHAR(128),
  max_capacity_per_hour INTEGER,
  status VARCHAR(16) DEFAULT 'idle', -- running, idle, stopped, maintenance, fault
  last_status_change TIMESTAMPTZ,
  total_runtime_hours NUMERIC(10,1) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Machine events (status changes, real-time)
CREATE TABLE IF NOT EXISTS iq_machine_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  machine_id INTEGER REFERENCES iq_machines(id),
  status VARCHAR(16) NOT NULL,
  reason VARCHAR(128),
  operator VARCHAR(128),
  job_id INTEGER REFERENCES iq_production_jobs(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QC inspection results
CREATE TABLE IF NOT EXISTS iq_qc_inspections (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  production_job_id INTEGER REFERENCES iq_production_jobs(id),
  order_id INTEGER REFERENCES iq_orders(id),
  inspector VARCHAR(128), -- 'ai_vision' or human name
  method VARCHAR(32), -- visual, camera, measurement
  result VARCHAR(16), -- pass, fail, conditional
  color_delta NUMERIC(5,2), -- deltaE measurement
  placement_offset_mm NUMERIC(5,1),
  defect_type VARCHAR(64),
  defect_description TEXT,
  proof_image_url TEXT,
  output_image_url TEXT,
  ai_confidence NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Barcode scan events (job tracking through workflow)
CREATE TABLE IF NOT EXISTS iq_scan_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  production_job_id INTEGER REFERENCES iq_production_jobs(id),
  order_id INTEGER REFERENCES iq_orders(id),
  scan_type VARCHAR(32), -- job_start, job_complete, qc_start, qc_pass, pack, ship
  station VARCHAR(64),
  operator VARCHAR(128),
  barcode VARCHAR(128),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shipping events (carrier webhooks)
CREATE TABLE IF NOT EXISTS iq_shipping_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  shipment_id INTEGER REFERENCES iq_shipments(id),
  order_id INTEGER REFERENCES iq_orders(id),
  event_type VARCHAR(32), -- label_created, picked_up, in_transit, out_for_delivery, delivered, exception
  carrier VARCHAR(64),
  tracking_number VARCHAR(128),
  location VARCHAR(255),
  description TEXT,
  estimated_delivery DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Backend services:**
- `services/production.iq.js` — OEE calculation, machine scheduling, job routing
- `services/qc.iq.js` — QC inspection logging, AI vision comparison stub
- `routes/production.js` — machine management, events, OEE reports, QC results, scan events
- Webhook endpoints:
  - `POST /api/webhooks/machine-event` — PLC/sensor → machine status change
  - `POST /api/webhooks/scan` — barcode scanner → job progression
  - `POST /api/webhooks/shipping` — carrier → delivery events
  - `POST /api/webhooks/qc-result` — QC camera → inspection result

**Neural analyzers to add:**
- Machine utilization — "Line 3 at 42% utilization, Line 5 idle since Tuesday"
- Bottleneck prediction — "Embroidery queue at 47 jobs, will exceed capacity Thursday"
- QC defect trend — "Screen print defect rate up 2.1% this week, Line 2 is the source"
- On-time delivery risk — "12 orders at risk of missing ship date"

**Frontend:**
- Production Board page — Kanban view of all jobs by stage
- Machine Status page — real-time machine grid with OEE
- QC Results page — inspection log with pass/fail rates

---

### LAYER 5: BEHAVIORAL & ENGAGEMENT DATA (What People Are Doing)
**Status: NOT BUILT**

Digital behavior signals that predict future actions.

**Database tables to create:**
```sql
-- Website/portal activity tracking
CREATE TABLE IF NOT EXISTS iq_page_views (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  visitor_id VARCHAR(128), -- anonymous until identified
  session_id VARCHAR(128),
  page_url TEXT,
  page_type VARCHAR(32), -- product, category, quote, checkout, account
  product_id INTEGER REFERENCES iq_products(id),
  referrer TEXT,
  duration_sec INTEGER,
  device VARCHAR(16),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email campaign engagement
CREATE TABLE IF NOT EXISTS iq_email_engagement (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  campaign_name VARCHAR(255),
  email_subject VARCHAR(500),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  clicked_url TEXT,
  unsubscribed BOOLEAN DEFAULT false,
  bounced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search queries (what are they looking for?)
CREATE TABLE IF NOT EXISTS iq_search_queries (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  query TEXT,
  results_count INTEGER,
  clicked_product_id INTEGER,
  converted BOOLEAN DEFAULT false,
  source VARCHAR(32), -- portal, website, voice_ai, chat
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer engagement score (computed daily)
CREATE TABLE IF NOT EXISTS iq_engagement_scores (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  score INTEGER, -- 0-100
  signals JSONB DEFAULT '{}', -- {page_views, emails_opened, calls, orders, portal_logins}
  trend VARCHAR(16), -- rising, stable, declining, inactive
  churn_risk NUMERIC(5,2), -- 0-100%
  next_predicted_order DATE,
  score_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social media signals
CREATE TABLE IF NOT EXISTS iq_social_signals (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id INTEGER REFERENCES iq_customers(id),
  platform VARCHAR(32), -- linkedin, instagram, facebook, twitter
  signal_type VARCHAR(32), -- event_announcement, hiring, expansion, product_launch
  content_preview TEXT,
  relevance_score NUMERIC(5,2),
  actionable BOOLEAN DEFAULT false,
  action_taken VARCHAR(64),
  source_url TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Backend services:**
- `services/engagement.iq.js` — Engagement score calculation, churn prediction, reorder prediction
- `services/tracking.iq.js` — Page view tracking, search query analysis
- `routes/engagement.js` — engagement scores, behavioral data, predictions
- Webhook endpoints:
  - `POST /api/webhooks/pageview` — tracking pixel from website/portal
  - `POST /api/webhooks/email-event` — SendGrid/Mailchimp open/click events
  - `POST /api/webhooks/social-signal` — social monitoring alerts

**Neural analyzers to add:**
- Engagement score distribution — "34% of accounts are 'declining' — intervention needed"
- Churn prediction — "8 accounts with >80% churn probability in next 90 days"
- Reorder signal detection — "Customer X browsed tumblers 3 times this week but hasn't ordered"
- Campaign effectiveness — "Holiday catalog email: 42% open rate, 8% click, 2% convert"
- Search intent analysis — "Top searches: 'eco friendly', 'rush order', 'under $5' — catalog gaps?"

**Frontend:**
- Engagement Dashboard page — customer health heatmap, churn risk list, reorder predictions
- Campaign Analytics page — email/SMS campaign performance
- Customer Journey view — timeline of all touchpoints per account

---

## BUILD INSTRUCTIONS

When the user invokes this command:

### If argument is "all" or empty:
Build all 5 layers in sequence. For each layer:
1. Create migration SQL for new tables
2. Create backend services
3. Create backend routes
4. Add Neural analyzers
5. Update ingestion module for new data types
6. Create frontend pages
7. Wire into App.jsx router + sidebar
8. Build frontend with Vite
9. Commit and push
10. Verify production health

### If argument is "layer1", "layer2", etc:
Build only that specific layer.

### If argument is a specific feature (e.g., "email parsing", "production board", "qc vision"):
Build only that feature within the appropriate layer.

### Build Standards:
- **Database**: All tables use `iq_` prefix, include `tenant_id`, `created_at`
- **Backend**: Express routes, raw SQL with $bind params, no ORMs
- **Frontend**: React + inline styles, dark theme (#0D1117/#161B22/#C8962A), Bebas Neue headings
- **Neural**: Each new data source should add at least 2-3 new diagnostic analyzers
- **Ingestion**: Every new data type gets column mapping rules + upload tab
- **No new npm deps**: Use only what's already installed
- **Build**: `cd verticals/imprint_iq/frontend && PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/node node_modules/.bin/vite build`
- **Deploy**: `git add verticals/imprint_iq/ && git commit && git push origin main`
- **Verify**: `curl -s https://aiagent.ringlypro.com/imprint_iq/health`

### Current Task:
$ARGUMENTS
