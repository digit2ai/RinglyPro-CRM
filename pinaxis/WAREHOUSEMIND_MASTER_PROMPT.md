# WarehouseMind AI — Master Architecture Prompt

> **Activation Command**: `/ringlypro-architect WAREHOUSEMIND`
> **Product URL**: `https://aiagent.ringlypro.com/pinaxis/`
> **MCP Server**: `https://aiagent.ringlypro.com/pinaxis/mcp/`
> **Business Model**: SaaS (tiered) + Treatment as consulting/license upsell
> **First Customer**: Pinaxis (existing warehouse analytics vertical)

---

## 1. VISION

WarehouseMind AI is an **AI-native warehouse operating system** — not a traditional WMS with AI bolted on.
Every warehouse function is handled by a specialized AI agent, orchestrated by an MCP Server.
Humans **supervise**, they don't operate. The warehouse runs itself.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         WarehouseMind AI                                     │
│                    "Your warehouse runs itself."                              │
│                                                                              │
│   NOT a WMS.  NOT a dashboard with charts.                                   │
│   An AI BRAIN that operates your warehouse 24/7.                             │
│                                                                              │
│   8 AI Agents → 90+ MCP Tools → 4 Tiers → Neural Intelligence               │
│   Voice AI (Rachel/Ana) → Inbound & Outbound Calls                          │
│   Treatment Module → Consulting/License Upsell                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. WHAT WAREHOUSEMIND AI IS NOT

- NOT a screen-heavy WMS where humans click through forms
- NOT a BI dashboard that shows charts and waits for humans to act
- NOT a rule-based automation system with if/then workflows
- NOT a single AI chatbot bolted onto existing software

## 3. WHAT WAREHOUSEMIND AI IS

- An **autonomous AI operating system** where agents make decisions
- A **tiered SaaS product** where clients buy the tiers they need
- A **Neural Intelligence layer** that diagnoses and prescribes (but does NOT treat — that's consulting)
- A **voice-first interface** where warehouse managers talk to Rachel instead of clicking screens
- An **MCP-orchestrated mesh** where agents communicate and trigger each other

---

## 4. ARCHITECTURE — MCP SERVER ORCHESTRATOR

The MCP Server is the central nervous system. Every agent registers its tools. Every request routes through the MCP Server, which checks tier access before executing.

```
                         MCP SERVER ORCHESTRATOR
                        /pinaxis/mcp/tools/call
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
     TIER CHECK           TOOL ROUTER          EVENT BUS
     "Does this          "Which agent          "Notify other
      tenant have         handles this          agents of
      access to           tool?"                this event"
      Tier 2?"
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────────────────────────────────────────────┐
   │                    AGENT MESH                        │
   │                                                      │
   │  Tier 1: Warehouse Ops + OEE/Machine (core)         │
   │  Tier 2: Inventory + Labor (optimization)            │
   │  Tier 3: Quality + Financial/ROI (intelligence)      │
   │  Tier 4: Neural (diagnostic + prescription)          │
   │  Voice: Rachel/Ana (inbound + outbound calls)        │
   │  Treatment: Auto-execution (consulting upsell)       │
   └─────────────────────────────────────────────────────┘
```

### MCP Server Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/pinaxis/mcp/tools/list` | List all tools (filtered by tenant tier) |
| POST | `/pinaxis/mcp/tools/call` | Execute a tool |
| POST | `/pinaxis/mcp/events` | Publish cross-tier events |
| GET | `/pinaxis/mcp/status` | System status (agents, tools, tiers) |
| GET | `/pinaxis/mcp/tiers` | Tier definitions and pricing |
| POST | `/pinaxis/mcp/tenants` | Onboard a new tenant |
| GET | `/pinaxis/mcp/tenants/:id` | Get tenant config & tier |

### MCP Server Data Model

```sql
CREATE TABLE IF NOT EXISTS wm_tenants (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  tier INTEGER DEFAULT 1 CHECK (tier BETWEEN 1 AND 4),
  treatment_enabled BOOLEAN DEFAULT false,
  voice_minutes_included INTEGER DEFAULT 100,
  voice_minutes_used INTEGER DEFAULT 0,
  api_key VARCHAR(255) UNIQUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wm_agent_logs (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  agent_name VARCHAR(100) NOT NULL,
  tool_name VARCHAR(200) NOT NULL,
  input JSONB,
  output JSONB,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error TEXT,
  triggered_by VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wm_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(200) NOT NULL,
  source_agent VARCHAR(100),
  payload JSONB,
  consumed_by JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wm_neural_findings (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  scan_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('critical','warning','advisory','info')),
  category VARCHAR(100),
  diagnostic TEXT NOT NULL,
  prescription TEXT,
  treatment_available BOOLEAN DEFAULT false,
  treatment_executed BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
```

---

## 5. THE 8 AI AGENTS

### AGENT 1: Warehouse Operations Agent (Tier 1)

**Purpose**: Continuous warehouse analytics — replaces manual data uploads and batch analysis runs.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 1 | `run_full_analysis` | Run complete warehouse analysis (ABC, throughput, patterns) |
| 2 | `get_warehouse_kpis` | Current KPIs: orders/day, lines/day, throughput, error rate |
| 3 | `get_abc_classification` | ABC/Pareto analysis of SKU velocity |
| 4 | `get_throughput_trends` | Hourly/daily/weekly throughput with trend lines |
| 5 | `get_order_structure` | Order profile: lines/order, units/line, peak patterns |
| 6 | `detect_anomalies` | Flag deviations from normal patterns |
| 7 | `get_peak_analysis` | Identify peak hours, days, seasons |
| 8 | `get_zone_performance` | Performance by warehouse zone/area |
| 9 | `compare_periods` | Compare current vs. prior period metrics |
| 10 | `get_dock_utilization` | Inbound/outbound dock scheduling & usage |
| 11 | `forecast_volume` | Predict next 7/30/90 day order volume |
| 12 | `get_returns_analysis` | Returns rate, reasons, cost impact |

### AGENT 2: OEE & Machine Intelligence Agent (Tier 1)

**Purpose**: Real-time shop floor monitoring. Machine health, OEE calculation, predictive maintenance.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 13 | `get_oee_report` | Full OEE breakdown (Availability × Performance × Quality) |
| 14 | `get_machine_status` | Live status of one or all machines |
| 15 | `get_floor_summary` | Shop floor snapshot with rolling OEE |
| 16 | `log_machine_event` | Log status change (running/stopped/idle/fault) |
| 17 | `get_downtime_summary` | Ranked downtime reasons with total minutes |
| 18 | `predict_failure` | ML-based failure prediction from event patterns |
| 19 | `schedule_maintenance` | Auto-schedule PM based on usage/hours |
| 20 | `get_machine_utilization` | Utilization % by machine over time |
| 21 | `get_conveyor_health` | Conveyor-specific metrics (jams, micro-stops, speed) |
| 22 | `get_energy_consumption` | Energy usage per machine/zone |

### AGENT 3: Inventory & Space Optimization Agent (Tier 2)

**Purpose**: Intelligent inventory management. Slotting, reorder, dead stock detection, space utilization.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 23 | `get_inventory_health` | Overall inventory health score |
| 24 | `detect_overstock` | SKUs with excess inventory vs. demand |
| 25 | `detect_understock` | SKUs at risk of stockout |
| 26 | `get_dead_stock` | Items with zero movement in N days |
| 27 | `optimize_slotting` | Recommend slot reassignments for pick efficiency |
| 28 | `predict_reorder_points` | Calculate optimal reorder points per SKU |
| 29 | `get_space_utilization` | Cube utilization by zone/rack/level |
| 30 | `get_inventory_turns` | Inventory turnover ratio by category |
| 31 | `get_aging_report` | Inventory aging (FIFO compliance, expiry risk) |
| 32 | `simulate_layout_change` | What-if analysis for layout modifications |
| 33 | `get_seasonal_patterns` | Demand seasonality by SKU/category |
| 34 | `get_supplier_lead_times` | Average lead time by supplier for reorder planning |

### AGENT 4: Labor & Workforce Agent (Tier 2)

**Purpose**: Workforce optimization. Staffing, productivity, shift planning, cost per pick.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 35 | `get_labor_efficiency` | Picks/hour, lines/hour by worker/team/shift |
| 36 | `optimize_shifts` | Recommend shift schedules based on volume forecast |
| 37 | `predict_staffing_needs` | How many workers needed for forecasted volume |
| 38 | `get_cost_per_pick` | Labor cost per pick/line/order |
| 39 | `get_worker_scorecard` | Individual productivity metrics |
| 40 | `detect_bottlenecks` | Identify labor bottlenecks by zone/process |
| 41 | `get_overtime_analysis` | Overtime hours, cost, and avoidability |
| 42 | `plan_wave_releases` | Optimize wave release timing for labor balance |
| 43 | `get_training_gaps` | Identify workers needing cross-training |
| 44 | `compare_shifts` | Head-to-head shift performance comparison |

### AGENT 5: Quality & Compliance Agent (Tier 3)

**Purpose**: Error tracking, regulatory compliance, quality trend monitoring, audit trails.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 45 | `get_error_rate` | Pick/pack/ship error rates over time |
| 46 | `track_compliance` | Regulatory compliance status (food safety, pharma, OSHA) |
| 47 | `detect_quality_drift` | Spot trends before they become violations |
| 48 | `get_audit_trail` | Full audit log for any entity |
| 49 | `get_damage_report` | Product damage rates by handler/zone/carrier |
| 50 | `get_temperature_compliance` | Cold chain monitoring (if applicable) |
| 51 | `get_lot_traceability` | Track lot/batch from receipt to shipment |
| 52 | `get_cycle_count_accuracy` | Inventory accuracy from cycle counts |
| 53 | `flag_safety_incident` | Log and escalate safety events |
| 54 | `get_sla_performance` | Order accuracy, on-time ship rate vs. SLA |

### AGENT 6: Financial & ROI Agent (Tier 3)

**Purpose**: Cost analysis, revenue leakage detection, ROI projections, contract/pricing support.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 55 | `get_cost_per_order` | Fully loaded cost per order (labor + space + overhead) |
| 56 | `calculate_roi` | ROI projection for proposed improvements |
| 57 | `detect_revenue_leakage` | Find where money is lost (mispicks, returns, damage) |
| 58 | `project_savings` | Forecast savings from optimization recommendations |
| 59 | `get_cost_breakdown` | Cost breakdown by category (labor, space, equipment, packaging) |
| 60 | `benchmark_costs` | Compare costs to industry benchmarks |
| 61 | `get_billing_summary` | Client billing based on activity (3PL model) |
| 62 | `get_profitability_by_client` | Margin analysis per client (for 3PLs) |
| 63 | `generate_contract_terms` | Auto-generate pricing for Contract Builder |
| 64 | `get_capex_analysis` | Capital expenditure analysis for equipment/automation |

### AGENT 7: Neural Intelligence Agent (Tier 4)

**Purpose**: The brain. Runs scheduled scans across all tiers. Produces Diagnostics (what happened & why) and Prescriptions (what to do). Does NOT execute Treatment — that's a consulting/license upsell.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 65 | `run_neural_scan` | Full diagnostic scan across all active tiers |
| 66 | `run_operations_scan` | Scan Tier 1 agents for issues |
| 67 | `run_optimization_scan` | Scan Tier 2 agents for opportunities |
| 68 | `run_financial_scan` | Scan Tier 3 agents for cost/revenue issues |
| 69 | `get_findings` | List all findings (filtered by severity, category, tier) |
| 70 | `get_finding_detail` | Deep dive into a specific finding |
| 71 | `resolve_finding` | Mark a finding as resolved |
| 72 | `get_scan_schedule` | View/modify scan schedule |
| 73 | `get_trend_analysis` | Long-term trend of findings by category |

**Scan Schedule**:
| Scan | Frequency | Time |
|------|-----------|------|
| Operations (Tier 1) | Daily | 6:00 AM |
| Optimization (Tier 2) | Daily | 7:00 AM |
| Financial (Tier 3) | Daily | 8:00 AM |
| Full Diagnostic | Weekly | Monday 5:00 AM |
| Market Intelligence | Every 4 hours | — |

**Finding Severity Levels**:
| Level | Color | Meaning | Example |
|-------|-------|---------|---------|
| critical | Red | Immediate action needed | OEE dropped below 50%, stockout imminent |
| warning | Orange | Attention within 24h | Error rate trending up 3 days straight |
| advisory | Yellow | Optimization opportunity | Slotting change could save 12% pick time |
| info | Blue | FYI, no action needed | Throughput up 8% vs. last month |

**Diagnostic vs Prescription vs Treatment**:
```
DIAGNOSTIC (included in Tier 4):
  "Your pick error rate increased 340% on the night shift this week.
   Root cause: 3 new hires in Zone C with no barcode scanner training."

PRESCRIPTION (included in Tier 4):
  "1. Pair each new hire with a veteran for 2 shifts
   2. Enable scan-verify mode in Zone C (forces double-scan)
   3. Schedule 30-min refresher training before Thursday shift"

TREATMENT (NOT included — consulting upsell):
  "Auto-enable scan-verify mode → Auto-schedule training session →
   Auto-assign mentor pairings → Auto-notify shift supervisors →
   Auto-track improvement over 7 days → Auto-close finding if resolved"
```

### AGENT 8: Dock & Receiving Agent (Tier 1)

**Purpose**: Dock door scheduling, receiving workflows, appointment management, yard visibility.

**MCP Tools**:
| # | Tool | Description |
|---|------|-------------|
| 74 | `get_dock_schedule` | Today's dock appointments by door |
| 75 | `schedule_appointment` | Book a dock door appointment |
| 76 | `get_yard_status` | Trailers in yard, doors occupied, wait times |
| 77 | `check_in_truck` | Log truck arrival, assign dock door |
| 78 | `get_receiving_queue` | Inbound POs waiting to be received |
| 79 | `log_receipt` | Record goods received against PO |
| 80 | `get_unloading_time` | Average unload time by carrier/product type |
| 81 | `detect_detention` | Flag trucks waiting beyond free time |
| 82 | `get_carrier_scorecard` | Rate carriers on on-time, damage, dwell time |

---

## 6. VOICE AI INTEGRATION

Rachel/Ana is the voice interface to every agent. Warehouse managers and clients call in — Rachel answers, classifies intent, routes to the right agent, speaks the answer.

### Inbound Calls (People Call the Warehouse)

| Caller | Intent | Routes To |
|--------|--------|-----------|
| Client | "What's my order status?" | Warehouse Ops Agent |
| Client | "When will my shipment arrive?" | Dock Agent |
| Manager | "What's our OEE right now?" | OEE Agent |
| Manager | "How many picks did night shift do?" | Labor Agent |
| Manager | "Any quality issues today?" | Quality Agent |
| Supervisor | "Machine 3 is down, what do we do?" | OEE Agent → Neural |
| Finance | "What's our cost per order this month?" | Financial Agent |
| Supplier | "I'm arriving at dock 4 in 20 minutes" | Dock Agent |

### Outbound Calls (Agents Call People)

| Trigger | Agent | Calls | Says |
|---------|-------|-------|------|
| OEE drops below 60% | OEE Agent | Plant manager | "OEE on Line 2 dropped to 54%. Conveyor micro-stops detected." |
| Stockout imminent | Inventory Agent | Purchasing | "SKU-4421 will stock out in 18 hours. Reorder 500 units." |
| Error spike | Quality Agent | Shift supervisor | "Pick errors up 3x in Zone C last 2 hours. 3 new hires flagged." |
| Invoice past due | Financial Agent | Client AP | "Invoice #2847 for $12,400 is 15 days past due." |
| Truck arriving | Dock Agent | Receiving team | "Truck from Sysco arriving dock 7 in 15 minutes. 24 pallets." |
| Safety incident | Quality Agent | Safety officer | "Forklift incident reported in Aisle 14. No injuries. Log #847." |
| Neural finding critical | Neural Agent | Operations director | "Critical finding: throughput will miss SLA by Thursday at current rate." |

### Voice AI Minutes by Tier

| Tier | Minutes/Month | Overage |
|------|---------------|---------|
| Tier 1 | 100 inbound + outbound | $0.15/min |
| Tier 2 | 300 inbound + outbound | $0.12/min |
| Tier 3 | 500 inbound + outbound | $0.10/min |
| Tier 4 | Unlimited | — |

---

## 7. CROSS-TIER EVENT AUTOMATION

Events flow between agents automatically. When something happens in one tier, it triggers actions in others.

### Event Flow Map

```
MACHINE STOPS (OEE Agent)
  → Neural diagnoses root cause
  → Labor Agent adjusts staffing for affected zone
  → Financial Agent calculates downtime cost
  → Voice alerts plant manager
  → Dock Agent delays inbound if receiving affected

ERROR SPIKE (Quality Agent)
  → Neural analyzes pattern (new hires? specific SKU? equipment?)
  → Labor Agent identifies workers involved
  → Financial Agent estimates cost of errors
  → Voice alerts shift supervisor

STOCKOUT IMMINENT (Inventory Agent)
  → Financial Agent calculates expedite cost vs. stockout cost
  → Neural prescribes best reorder strategy
  → Voice calls purchasing team
  → Warehouse Ops adjusts pick waves to conserve remaining stock

VOLUME SURGE DETECTED (Warehouse Ops Agent)
  → Labor Agent recommends additional staffing
  → Inventory Agent checks stock levels for surge SKUs
  → Dock Agent opens additional dock doors
  → Neural checks if surge matches seasonal pattern or is anomaly

NEW TRUCK ARRIVES (Dock Agent)
  → Warehouse Ops updates inbound queue
  → Labor Agent assigns receiving crew
  → Inventory Agent prepares putaway plan
  → Quality Agent flags if carrier has high damage rate
```

### Event Schema

```javascript
{
  event_type: 'machine_stopped',
  source_agent: 'oee_machine',
  tenant_id: 'warehouse_alpha',
  payload: {
    machine_id: 'CONV-003',
    reason: 'micro_stop',
    zone: 'B',
    duration_seconds: 45,
    oee_impact: -2.3
  },
  listeners: ['neural', 'labor', 'financial', 'voice']
}
```

---

## 8. NEURAL INTELLIGENCE — DEEP DIVE

### Diagnostic Categories

| Category | What It Analyzes | Example Finding |
|----------|------------------|-----------------|
| throughput_health | Orders/lines vs. capacity | "Throughput at 78% of capacity — 22% headroom" |
| oee_health | Machine availability × performance × quality | "OEE on Line 2 dropped from 82% to 61% this week" |
| inventory_health | Stock levels, dead stock, turns | "142 SKUs with zero movement in 90+ days ($234K tied up)" |
| labor_efficiency | Picks/hr, cost/pick, utilization | "Night shift picks 34% fewer per hour than day shift" |
| quality_health | Error rates, compliance, damage | "Pick accuracy dropped from 99.7% to 98.1% (3x errors)" |
| financial_health | Cost/order, margins, leakage | "Cost per order up 18% due to overtime in weeks 11-12" |
| dock_efficiency | Truck wait times, door utilization | "Average truck wait time: 2.4 hours (industry avg: 1.1)" |
| space_utilization | Cube usage, zone balance | "Zone A at 94% capacity, Zone D at 31% — rebalance opportunity" |

### Prescription Templates

Each prescription follows this format:
```
FINDING: [What the diagnostic found]
ROOT CAUSE: [Why it happened — the diagnostic explains]
PRESCRIPTION:
  1. [Immediate action — within 24 hours]
  2. [Short-term fix — within 1 week]
  3. [Structural improvement — within 1 month]
EXPECTED IMPACT: [Quantified improvement]
CONFIDENCE: [High/Medium/Low based on data quality]
```

### Treatment Module (Consulting Upsell)

Treatment = auto-execution of prescriptions. This is NOT included in any SaaS tier.
It is sold as:
- **Project-based consulting**: $250/hour, Digit2AI implements the automation
- **Treatment license**: $2,000/month add-on, auto-execution enabled
- **Full managed service**: $5,000/month, Digit2AI operates the Treatment layer

Treatment examples:
- Auto-adjust wave releases based on labor availability
- Auto-reorder inventory when reorder point hit
- Auto-reassign workers to bottleneck zones
- Auto-enable quality controls when error rate spikes
- Auto-schedule PM when machine hours threshold hit
- Auto-notify suppliers of delivery window changes

---

## 9. TIERED PRICING — SaaS MODEL

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  TIER 1: OPERATIONS — $149/zone/month (min 1 zone)             │
│  ──────────────────────────────────────────                      │
│  • Warehouse Operations Agent (12 tools)                        │
│  • OEE & Machine Intelligence Agent (10 tools)                  │
│  • Dock & Receiving Agent (9 tools)                             │
│  • Voice AI: 100 minutes/month                                  │
│  • Command Center dashboard (operations panels)                 │
│  • Email support                                                 │
│                                                                  │
│  TIER 2: OPTIMIZATION — $299/zone/month (min 1 zone)           │
│  ────────────────────────────────────────────                    │
│  • Everything in Tier 1                                          │
│  • Inventory & Space Optimization Agent (12 tools)              │
│  • Labor & Workforce Agent (10 tools)                           │
│  • Voice AI: 300 minutes/month                                  │
│  • Cross-tier event automation                                   │
│  • Priority support                                              │
│                                                                  │
│  TIER 3: INTELLIGENCE — $449/zone/month (min 1 zone)           │
│  ──────────────────────────────────────────                      │
│  • Everything in Tier 2                                          │
│  • Quality & Compliance Agent (10 tools)                        │
│  • Financial & ROI Agent (10 tools)                             │
│  • Voice AI: 500 minutes/month                                  │
│  • Contract Builder integration                                  │
│  • Dedicated account manager                                     │
│                                                                  │
│  TIER 4: NEURAL — $599/zone/month (min 1 zone)                 │
│  ────────────────────────────────────────────                    │
│  • Everything in Tier 3                                          │
│  • Neural Intelligence Agent (9 tools)                          │
│  • Diagnostics + Prescriptions                                  │
│  • Scheduled scans (daily operations, weekly full)              │
│  • Voice AI: Unlimited                                           │
│  • Custom neural scan configurations                            │
│  • SLA guarantee (99.9% uptime)                                 │
│  • API access for custom integrations                           │
│                                                                  │
│  TREATMENT ADD-ON — Consulting/License                           │
│  ─────────────────────────────────────                           │
│  • Auto-execution of prescriptions                              │
│  • Option A: $250/hour consulting (project-based)               │
│  • Option B: $2,000/month license (self-service)                │
│  • Option C: $5,000/month managed service                       │
│                                                                  │
│  ─────────────────────────────────────────────                   │
│  REVENUE EXAMPLE:                                                │
│  3-zone warehouse on Tier 4 = $1,797/month                     │
│  + Treatment license = $3,797/month                             │
│  10 warehouses = $37,970/month = ~$455K ARR                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. DATABASE SCHEMA

### Core Tables (MCP Server)

```sql
-- Tenant management
CREATE TABLE IF NOT EXISTS wm_tenants (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  tier INTEGER DEFAULT 1 CHECK (tier BETWEEN 1 AND 4),
  treatment_enabled BOOLEAN DEFAULT false,
  voice_minutes_included INTEGER DEFAULT 100,
  voice_minutes_used INTEGER DEFAULT 0,
  zones INTEGER DEFAULT 1,
  api_key VARCHAR(255) UNIQUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent execution logs
CREATE TABLE IF NOT EXISTS wm_agent_logs (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  agent_name VARCHAR(100) NOT NULL,
  tool_name VARCHAR(200) NOT NULL,
  input JSONB,
  output JSONB,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error TEXT,
  triggered_by VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cross-tier events
CREATE TABLE IF NOT EXISTS wm_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(200) NOT NULL,
  source_agent VARCHAR(100),
  payload JSONB,
  consumed_by JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Neural findings
CREATE TABLE IF NOT EXISTS wm_neural_findings (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  scan_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('critical','warning','advisory','info')),
  category VARCHAR(100),
  diagnostic TEXT NOT NULL,
  prescription TEXT,
  treatment_available BOOLEAN DEFAULT false,
  treatment_executed BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
```

### Tier 1 Tables (Operations)

```sql
-- Warehouse zones
CREATE TABLE IF NOT EXISTS wm_zones (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  zone_code VARCHAR(50) NOT NULL,
  zone_name VARCHAR(255),
  zone_type VARCHAR(50) CHECK (zone_type IN ('pick','bulk','cold','staging','dock','returns')),
  capacity_sqft NUMERIC,
  current_utilization NUMERIC DEFAULT 0,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Machines (OEE)
CREATE TABLE IF NOT EXISTS wm_machines (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  machine_code VARCHAR(50) NOT NULL,
  machine_name VARCHAR(255),
  machine_type VARCHAR(100),
  zone_id INTEGER REFERENCES wm_zones(id),
  status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('running','stopped','idle','fault','maintenance')),
  ideal_cycle_time NUMERIC,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Machine events
CREATE TABLE IF NOT EXISTS wm_machine_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  machine_id INTEGER REFERENCES wm_machines(id),
  status VARCHAR(20) NOT NULL,
  reason VARCHAR(255),
  operator VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Dock doors
CREATE TABLE IF NOT EXISTS wm_dock_doors (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  door_number VARCHAR(20) NOT NULL,
  door_type VARCHAR(20) CHECK (door_type IN ('inbound','outbound','both')),
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','maintenance')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Dock appointments
CREATE TABLE IF NOT EXISTS wm_dock_appointments (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  door_id INTEGER REFERENCES wm_dock_doors(id),
  carrier_name VARCHAR(255),
  direction VARCHAR(10) CHECK (direction IN ('inbound','outbound')),
  scheduled_at TIMESTAMP NOT NULL,
  arrived_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','arrived','in_progress','completed','cancelled','no_show')),
  po_numbers JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Warehouse KPI snapshots
CREATE TABLE IF NOT EXISTS wm_kpi_snapshots (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  snapshot_date DATE NOT NULL,
  shift VARCHAR(20),
  orders_processed INTEGER DEFAULT 0,
  lines_processed INTEGER DEFAULT 0,
  units_processed INTEGER DEFAULT 0,
  picks_per_hour NUMERIC DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_rate NUMERIC DEFAULT 0,
  on_time_ship_pct NUMERIC DEFAULT 0,
  avg_oee NUMERIC DEFAULT 0,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tier 2 Tables (Optimization)

```sql
-- Inventory items
CREATE TABLE IF NOT EXISTS wm_inventory (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  category VARCHAR(100),
  abc_class CHAR(1) CHECK (abc_class IN ('A','B','C')),
  zone_id INTEGER REFERENCES wm_zones(id),
  slot_location VARCHAR(100),
  qty_on_hand INTEGER DEFAULT 0,
  qty_reserved INTEGER DEFAULT 0,
  qty_available INTEGER GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
  reorder_point INTEGER,
  reorder_qty INTEGER,
  unit_cost NUMERIC,
  last_movement_at TIMESTAMP,
  turns_per_year NUMERIC,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Labor / workers
CREATE TABLE IF NOT EXISTS wm_workers (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  worker_code VARCHAR(50) NOT NULL,
  worker_name VARCHAR(255),
  role VARCHAR(100),
  shift VARCHAR(20),
  zone_id INTEGER REFERENCES wm_zones(id),
  hourly_rate NUMERIC,
  hire_date DATE,
  certifications JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Labor activity logs
CREATE TABLE IF NOT EXISTS wm_labor_activity (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  worker_id INTEGER REFERENCES wm_workers(id),
  activity_type VARCHAR(50) CHECK (activity_type IN ('pick','pack','putaway','receive','count','idle','break')),
  zone_id INTEGER REFERENCES wm_zones(id),
  units_processed INTEGER DEFAULT 0,
  lines_processed INTEGER DEFAULT 0,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_minutes NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tier 3 Tables (Intelligence)

```sql
-- Quality events
CREATE TABLE IF NOT EXISTS wm_quality_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) CHECK (event_type IN ('mispick','damage','short_ship','wrong_item','label_error','safety_incident')),
  severity VARCHAR(20) CHECK (severity IN ('minor','major','critical')),
  zone_id INTEGER REFERENCES wm_zones(id),
  worker_id INTEGER REFERENCES wm_workers(id),
  order_ref VARCHAR(100),
  sku VARCHAR(100),
  description TEXT,
  root_cause VARCHAR(255),
  cost_impact NUMERIC DEFAULT 0,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Financial metrics
CREATE TABLE IF NOT EXISTS wm_financial_metrics (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  labor_cost NUMERIC DEFAULT 0,
  equipment_cost NUMERIC DEFAULT 0,
  space_cost NUMERIC DEFAULT 0,
  overhead_cost NUMERIC DEFAULT 0,
  cost_per_order NUMERIC DEFAULT 0,
  cost_per_pick NUMERIC DEFAULT 0,
  margin_pct NUMERIC DEFAULT 0,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 11. COMMAND CENTER DASHBOARD

The Command Center is the single UI where humans supervise WarehouseMind AI. Same architecture as FreightMind: dark theme, real-time panels, auto-refresh.

### Panels

| Panel | Shows | Refresh |
|-------|-------|---------|
| **KPI Cards** | Orders/day, picks/hr, OEE, error rate, cost/order | 30s |
| **Agent Activity Feed** | Live tool executions, color-coded by agent | 10s |
| **Floor Map** | Zones with utilization heat map, machine status | 15s |
| **OEE Dashboard** | Machine-by-machine OEE bars + trend lines | 15s |
| **Inventory Health** | ABC chart, stockout risks, dead stock count | 60s |
| **Labor Tracker** | Picks/hr by shift, staffing vs. forecast | 30s |
| **Neural Findings** | Severity-coded cards, scan status, run scan button | 30s |
| **Dock Status** | Door status, appointments, wait times | 15s |
| **Tier Status** | 4 tiers with active/inactive, agent/tool counts | 30s |
| **MCP Playground** | Execute any tool, see raw JSON response | On-demand |

---

## 12. TECHNOLOGY STACK

| Layer | Technology |
|-------|-----------|
| **MCP Server** | Node.js + Express (same as FreightMind pattern) |
| **AI Models** | Claude Opus (orchestrator), Sonnet (agents), Haiku (tracking/events) |
| **Database** | PostgreSQL on Render (shared with RinglyPro CRM) |
| **Frontend** | Single-file HTML+CSS+JS (no build step, like FreightMind) |
| **Voice AI** | ElevenLabs WebRTC + Rachel/Ana system prompts |
| **Webhooks** | Inbound from WMS, ELD, IoT sensors, supplier EDI |
| **Cron** | Node-cron for scheduled Neural scans |
| **Deployment** | Render auto-deploy on push to main |

---

## 13. BUILD ORDER

| Phase | What | Priority |
|-------|------|----------|
| 1 | MCP Server Orchestrator + tier gating + tenant management | **NOW** |
| 2 | Agent 1: Warehouse Operations (enhance existing analytics) | **NOW** |
| 3 | Agent 2: OEE & Machine (enhance existing OEE module) | **NOW** |
| 4 | Agent 8: Dock & Receiving (new) | NEXT |
| 5 | Database migration (all new tables) | NEXT |
| 6 | Demo data seeder | NEXT |
| 7 | Agent 3: Inventory & Space | THEN |
| 8 | Agent 4: Labor & Workforce | THEN |
| 9 | Cross-tier event handlers | THEN |
| 10 | Agent 5: Quality & Compliance | THEN |
| 11 | Agent 6: Financial & ROI | THEN |
| 12 | Agent 7: Neural Intelligence | THEN |
| 13 | Voice AI integration | THEN |
| 14 | Command Center dashboard | THEN |
| 15 | Auth & onboarding flow | LATER |

---

## 14. INTEGRATION POINTS

### Inbound Data Sources

| Source | Protocol | Data |
|--------|----------|------|
| WMS (SAP, Manhattan, Blue Yonder) | REST API / EDI | Orders, inventory, shipments |
| ERP (NetSuite, Oracle) | REST API | Financials, POs, costs |
| IoT Sensors | MQTT / Webhooks | Machine status, temperature, energy |
| ELD / Telematics (Samsara) | Webhooks | Truck arrivals, GPS |
| Supplier EDI | AS2 / SFTP | ASN, PO confirmations |
| Barcode Scanners | REST API | Pick/pack confirmations |
| Labor Clock System | REST API | Clock in/out, time cards |

### Outbound Integrations

| Target | Protocol | Data |
|--------|----------|------|
| WMS | REST API | Wave releases, slot assignments |
| ERP | REST API | Cost updates, billing data |
| Email / SMS | API | Alerts, reports, invoices |
| Voice (Rachel/Ana) | ElevenLabs | Inbound/outbound calls |
| Slack / Teams | Webhooks | Notifications |
| BI Tools (Tableau, PowerBI) | REST API / CSV | Data exports |

---

## 15. COMPETITIVE ADVANTAGES

### What WarehouseMind AI Does That Others Don't

| Feature | Traditional WMS | BI Dashboards | WarehouseMind AI |
|---------|----------------|---------------|------------------|
| Makes decisions | No — humans decide | No — shows data | **Yes — agents decide** |
| Calls your team | No | No | **Yes — Rachel calls** |
| Predicts problems | No | Limited charts | **Yes — Neural scans** |
| Cross-function intelligence | Siloed modules | Separate reports | **Agents communicate** |
| Prescribes solutions | No | No | **Yes — with root cause** |
| Auto-executes fixes | No | No | **Treatment module** |
| Sells by tier | Buy entire WMS | Buy entire license | **Buy what you need** |
| Self-improving | Static rules | Static dashboards | **Learns from patterns** |

---

## 16. EXISTING ASSETS TO ENHANCE (NOT REBUILD)

These already exist in the Pinaxis codebase and should be ENHANCED, not rebuilt:

| Existing | Path | Enhancement |
|----------|------|-------------|
| Analytics engine | `logistics/src/services/analytics.js` | Wrap as MCP tools for Warehouse Ops Agent |
| Product matcher | `logistics/src/services/product-matcher.js` | Feed into Financial Agent for recommendations |
| Report generator | `logistics/src/services/report-generator.js` | Neural findings → auto-generate reports |
| OEE models | `logistics/models/OEE*.js` | Wrap as MCP tools for OEE Agent |
| Telemetry route | `logistics/src/routes/telemetry.js` | Feed into Observability → Neural |
| Upload pipeline | `logistics/src/routes/upload.js` | Auto-ingest from WMS integrations |
| Benefit projections | `logistics/src/services/benefit-projections.js` | Feed into Financial Agent ROI calculations |
| Voice agent route | `logistics/src/routes/voice-agent.js` | Enhance with MCP tool routing |

---

## 17. ACTIVATION

When `/ringlypro-architect WAREHOUSEMIND` is called:

1. Run database migration (all tables in Section 10)
2. Create MCP Server at `/pinaxis/mcp/`
3. Register all 8 agents with their tools
4. Wire tier gating (check tenant tier before tool execution)
5. Create event bus for cross-tier automation
6. Seed demo data (zones, machines, inventory, workers, dock doors)
7. Build Command Center dashboard
8. Wire existing analytics/OEE as MCP tools
9. Deploy and verify all endpoints
10. Report status

---

---

## 18. COMPETITIVE INTELLIGENCE — FEATURES FROM MARKET RESEARCH

Based on analysis of top AI warehouse platforms (AutoStore, Locus Robotics, 6 River Systems, Körber, Manhattan Associates, Blue Yonder, Deposco, Logiwa, ShipHero, Fulfil.io), these are additional capabilities to integrate:

### Phase 2 Features (Add After Core Build)

| # | Feature | Agent | Value |
|---|---------|-------|-------|
| 1 | **AI Copilot / Natural Language Interface** | Orchestrator | "Show me Zone B throughput vs last week" — spoken or typed, returns data |
| 2 | **Demand Sensing & Forecasting** | Warehouse Ops | Predict order volume 7/30/90 days out using historical + external signals |
| 3 | **Digital Twin / 3D Visualization** | Command Center | Real-time 3D view of warehouse with live inventory, worker, machine positions |
| 4 | **Multi-Warehouse Orchestration** | Orchestrator | Route orders to optimal warehouse based on inventory, proximity, capacity |
| 5 | **Returns Triage AI** | Quality Agent | Auto-classify returns (restock, refurbish, dispose), route to correct process |
| 6 | **Dynamic Slotting** | Inventory Agent | Auto-reassign slot locations based on velocity changes (proven 15-25% pick gains) |
| 7 | **Smart Task Interleaving** | Labor Agent | Combine pick, putaway, replenishment into single travel paths (20-30% labor gain) |
| 8 | **Carbon Footprint per Order** | Financial Agent | ESG compliance — calculate CO2 per order (mandatory in EU/CA) |
| 9 | **Supplier Reliability Scoring** | Dock Agent | Rate suppliers on on-time, quality, completeness — feed into receiving planning |
| 10 | **Packaging Optimization** | Warehouse Ops | Recommend box size to minimize DIM weight and waste |
| 11 | **Voice-Directed Picking (Multilingual)** | Rachel/Ana | Workers hear pick instructions via Rachel in English/Spanish, confirm by voice |
| 12 | **Worker Productivity Coaching** | Labor Agent | Real-time suggestions to workers via mobile: "Switch to Zone A, 3x faster path" |
| 13 | **Autonomous Exception Resolution** | Neural Agent | Auto-resolve common exceptions (short ship, mispick) without human intervention |
| 14 | **What-If Scenario Simulation** | Inventory Agent | Model layout changes, volume surges, staffing cuts before committing |
| 15 | **Recall Management** | Quality Agent | Instant identification and isolation of recalled items by lot/batch |
| 16 | **Dynamic 3PL Pricing** | Financial Agent | AI-adjusted storage/fulfillment pricing based on demand, complexity, season |
| 17 | **Warehouse Network Design AI** | Neural Agent | Recommend optimal number and locations of warehouses given demand patterns |
| 18 | **Real-Time Heat Map** | Command Center | Zone-level heat map showing activity density, congestion, idle areas |
| 19 | **Generative AI for SOP Creation** | Neural Agent | Auto-generate standard operating procedures from observed workflows |
| 20 | **Predictive MHE Maintenance** | OEE Agent | Predict forklift, conveyor, sorter failures from usage patterns |

### Competitive Positioning

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  WHY WAREHOUSEMIND AI WINS                                           │
│                                                                      │
│  1. AI COPILOT IS THE PRIMARY INTERFACE                              │
│     Others bolt AI onto traditional UIs.                             │
│     We make conversational AI the MAIN interface.                    │
│     Managers talk to Rachel, not click through screens.              │
│                                                                      │
│  2. MCP-NATIVE ARCHITECTURE                                         │
│     No competitor offers MCP-based warehouse tools.                  │
│     Any AI agent (Claude, GPT, Gemini) can call our tools.          │
│     Open protocol = ecosystem play, not lock-in.                     │
│                                                                      │
│  3. TIERED — BUY WHAT YOU NEED                                      │
│     Traditional WMS: buy everything or nothing ($100K+).             │
│     WarehouseMind: start at $149/zone, add tiers as you grow.       │
│                                                                      │
│  4. NEURAL DIAGNOSTIC + PRESCRIPTION (NOT JUST DASHBOARDS)          │
│     Others show charts and let humans figure it out.                 │
│     We tell you what's wrong, why, and exactly what to do.           │
│     Treatment (auto-fix) = premium upsell.                           │
│                                                                      │
│  5. MULTI-TENANT BY DESIGN (3PL NATIVE)                             │
│     Most WMS struggles with true multi-tenancy.                      │
│     We built multi-tenant from day 1.                                │
│                                                                      │
│  6. VOICE-FIRST FOR DIVERSE WORKFORCE                               │
│     Warehouse workers speak 20+ languages.                           │
│     Rachel/Ana handles English + Spanish natively.                   │
│     No typing, no screens on the floor — just talk.                  │
│                                                                      │
│  7. RETURNS-FIRST INTELLIGENCE                                       │
│     Returns growing 20%+ YoY, most WMS ignores this.                │
│     We auto-triage, route, and track returns profitably.             │
│                                                                      │
│  8. CROSS-TIER INTELLIGENCE                                          │
│     Machine stops → Neural diagnoses → Labor adjusts →               │
│     Financial calculates cost → Voice alerts manager.                │
│     No competitor has agents that talk to each other.                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Target Verticals (Vertical-Specific AI Models)

| Vertical | Specific Features |
|----------|-------------------|
| **E-Commerce / DTC** | Peak season scaling, returns triage, multi-carrier rate shopping |
| **Cold Chain / Food** | Temperature monitoring, FEFO enforcement, FSMA compliance |
| **Pharma / Healthcare** | GDP compliance, lot traceability, serialization, DEA reporting |
| **Manufacturing** | OEE focus, WIP tracking, line-side delivery, kanban replenishment |
| **3PL** | Multi-client billing, shared space optimization, client portals |
| **Retail** | Store replenishment, cross-docking, seasonal demand sensing |

---

## 19. RELATIONSHIP TO FREIGHTMIND AI

WarehouseMind AI and FreightMind AI are **sister products** in the Digit2AI logistics ecosystem:

```
┌──────────────────────────────────────────────────────────────────┐
│                    DIGIT2AI LOGISTICS SUITE                       │
│                                                                  │
│  ┌─────────────────────┐        ┌─────────────────────┐         │
│  │  WAREHOUSEMIND AI   │◄──────▶│  FREIGHTMIND AI     │         │
│  │  /pinaxis/          │        │  /freight_broker/    │         │
│  │                     │        │                      │         │
│  │  Inside the         │        │  Outside the         │         │
│  │  warehouse          │        │  warehouse           │         │
│  │                     │        │                      │         │
│  │  • Operations       │        │  • Freight Finder    │         │
│  │  • OEE/Machines     │  DOCK  │  • Rate Engine       │         │
│  │  • Inventory        │◄─────▶│  • Dispatch AI       │         │
│  │  • Labor            │ DOOR   │  • Tracking          │         │
│  │  • Quality          │ IS THE │  • Billing           │         │
│  │  • Financial        │ BRIDGE │  • Compliance        │         │
│  │  • Neural           │        │  • Maintenance       │         │
│  │  • Dock/Receiving   │        │  • Neural            │         │
│  └─────────────────────┘        └─────────────────────┘         │
│                                                                  │
│  SHARED: MCP Protocol, Neural Architecture, Voice AI,            │
│          Multi-tenant, Tier model, Command Center pattern        │
│                                                                  │
│  BRIDGE: When a truck arrives at the dock, FreightMind's         │
│  Tracking Agent notifies WarehouseMind's Dock Agent.             │
│  When a load is ready to ship, WarehouseMind's Dock Agent        │
│  notifies FreightMind's Dispatch AI to find a truck.             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Cross-Product Events

| Event | Source | Target | Action |
|-------|--------|--------|--------|
| Truck arriving at dock | FreightMind Tracking | WarehouseMind Dock | Assign door, alert receiving |
| Load ready to ship | WarehouseMind Dock | FreightMind Dispatch | Find available truck |
| Receiving complete | WarehouseMind Dock | FreightMind Billing | Confirm POD, trigger invoice |
| Stockout imminent | WarehouseMind Inventory | FreightMind Freight Finder | Find inbound load for replenishment |

---

*Last updated: 2026-03-22*
*Version: 1.1*
*Codename: WAREHOUSEMIND*