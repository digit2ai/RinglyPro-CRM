# ImprintIQ — Master Prompt
## Intelligence for Every Impression

### Vision
ImprintIQ is a fully AI-automated ecosystem for the **promotional products industry** ($26.6B US market). It replaces manual operations with 11 autonomous AI agents monitored by Neural Intelligence — a 3-layer diagnostic-prescriptive-treatment architecture.

### Target Market
- **Tier 1**: Top 5 suppliers ($500M-$3.8B revenue) — $2-5M/yr deal size
- **Tier 2**: Top 6-40 suppliers ($50M-$500M) — $500K-2M/yr
- **Tier 3**: Mid-market ($10M-$50M) — $150K-500K/yr
- **Tier 4**: Large distributors ($50M-$1.3B) — $500K-3M/yr

### Reference Client Profile: Hit Promotional Products
- **Revenue**: $655.1M (2024) — ASI #5 Supplier
- **CEO**: CJ Schmidt (ASI Person of the Year 2024)
- **HQ**: Largo, FL | Founded: 1952 | ~500-950 employees
- **Growth**: 100% over 8 years ($319M → $655M)
- **New facility**: 800,000 sq ft in Fairfield, OH
- **Strategic focus**: "2025-2026 = efficiency on all levels"
- **Already investing in**: GenAI, robotics, TMS, WMS, print-on-demand

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     IMPRINTIQ AI ECOSYSTEM                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    NEURAL INTELLIGENCE                          │   │
│  │  6 Health Panels | 15 Analyzers | Prescriptions | Treatment    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ▲ metrics                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     11 AI AGENTS                                │   │
│  │                                                                 │   │
│  │  Catalog | Quote Engine | Art Director | Production | Supply    │   │
│  │  QC Vision | Fulfillment | Customer Voice | Sales Intel        │   │
│  │  Finance | Compliance                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ▲ orchestration                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    DATA LAYER                                   │   │
│  │  20 PostgreSQL tables (iq_ prefix) | Multi-tenant              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Neural Intelligence (6 Health Panels)

| Panel | Key Metrics |
|-------|-------------|
| **Revenue Health** | Quote conversion %, pipeline value, monthly revenue |
| **Production Health** | On-time rate, defect rate, throughput, OEE |
| **Supply Chain** | Stock-out rate, supplier quality, reorder accuracy |
| **Customer Health** | 90d retention rate, dormant accounts, avg LTV |
| **Art & Proof** | First-pass approval %, avg revision cycles, pending proofs |
| **Financial Health** | Collection rate, overdue AR, avg margin %, DSO |

## 15 Diagnostic Analyzers

1. Quote Conversion Leak Detector
2. Artwork Bottleneck Analyzer
3. Production Defect Rate Monitor
4. Dormant Customer Revenue Tracker
5. Inventory Stockout Risk Scanner
6. Overdue Invoice Detector
7. Reorder Opportunity Predictor
8. Missed Call Revenue Calculator
9. Margin Erosion Tracker
10. Stale Quote Pipeline Monitor
11. Supplier Quality Analyzer
12. Rush Order Impact Calculator
13. Seasonal Demand Forecaster
14. Customer Lifetime Value Predictor
15. Competitive Loss Analyzer

## 10 Treatment Templates (Paywall — Consulting/License Fee)

1. **Lost Quote Recovery** — AI calls back with revised offer
2. **Artwork Acceleration** — Auto pre-flight + virtual proof
3. **QC Automation** — Vision compares output to proof
4. **Dormant Reactivation** — Voice agent reorder outreach
5. **Auto Reorder** — PO generated when stock drops
6. **Collections Automation** — Escalating reminder sequence
7. **Proactive Reorder** — Predicted reorder outreach
8. **Missed Call Recovery** — Auto-SMS + AI callback
9. **Margin Protection** — Flag low-margin quotes
10. **Stale Quote Follow-Up** — Voice agent checks in

---

## 11 AI Agents

| Agent | Purpose | Key Capabilities |
|-------|---------|-----------------|
| **Catalog Intelligence** | Product management | SKU tagging, trend prediction, seasonal curation |
| **Quote Engine** | Quote generation | NL→quote, pricing, volume breaks, multi-option |
| **Art Director** | Artwork workflow | Preflight, virtual proofs, color matching, revision loop |
| **Production Orchestrator** | Shop floor | Job routing, scheduling, bottleneck detection, OEE |
| **Supply Chain** | Inventory & sourcing | Auto-reorder, overseas pipeline, supplier scoring |
| **QC Vision** | Quality control | Visual inspection, color delta, defect detection |
| **Fulfillment** | Shipping & logistics | Carrier selection, tracking, kitting, split shipments |
| **Customer Voice** | Rachel/Ana/Lina | Inbound/outbound calls, reorders, status checks |
| **Sales Intelligence** | Pipeline & analytics | Lead scoring, win/loss, rep performance, territory |
| **Finance & Billing** | AR & invoicing | Auto-invoice, collections, margin analysis, tax |
| **Compliance** | Regulatory | CPSIA, Prop 65, import compliance, recall monitoring |

---

## Database Schema (20 Tables, `iq_` prefix)

| Table | Purpose |
|-------|---------|
| `iq_users` | Auth & user management |
| `iq_customers` | B2B customer accounts |
| `iq_products` | Product catalog |
| `iq_suppliers` | Upstream vendors |
| `iq_quotes` | Quote proposals |
| `iq_quote_items` | Quote line items |
| `iq_orders` | Converted orders |
| `iq_order_items` | Order line items |
| `iq_artwork` | Art files & proofing workflow |
| `iq_production_jobs` | Decoration/manufacturing jobs |
| `iq_inventory` | Blank goods stock |
| `iq_calls` | Voice AI call logs |
| `iq_invoices` | Billing records |
| `iq_shipments` | Fulfillment tracking |
| `iq_neural_insights` | Diagnostic findings |
| `iq_neural_treatments` | Activated automation workflows |
| `iq_treatment_log` | Treatment execution history |
| `iq_agent_sessions` | AI agent activity log |
| `iq_reorder_predictions` | AI-generated reorder forecasts |
| `iq_compliance` | Product compliance records |

---

## Pricing Model (Hybrid AIaaS)

| Tier | Description | Year 1 | Year 2+ |
|------|-------------|--------|---------|
| **Platform License** | Neural + Agents in advisory mode | $250K | $185K/yr |
| **Agent Execution** | Per-agent base + usage fees | $556K | $1.08M |
| **Treatment Activation** | Per-workflow monthly fee | $120K | $450K |
| **Integrations** | ASI, ERP, EDI, IoT | $140K + $72K maint | $246K |
| **Managed AI** | Digit2AI operates & tunes | $180K | $240K |
| **Total** | | **$1.32M** | **$2.17M** |

---

## URLs

| Resource | URL |
|----------|-----|
| **Landing** | https://aiagent.ringlypro.com/imprint_iq/ |
| **Dashboard** | https://aiagent.ringlypro.com/imprint_iq/dashboard |
| **Neural Intelligence** | https://aiagent.ringlypro.com/imprint_iq/neural |
| **Health Check** | https://aiagent.ringlypro.com/imprint_iq/health |
| **API Base** | https://aiagent.ringlypro.com/imprint_iq/api/ |

## Credentials
- **Email**: admin@imprintiq.com
- **Password**: ImprintIQ2026!
