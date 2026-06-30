# Intelligent Investment & Execution Ecosystem — Technical Architecture

> Source: "Modelo Mejorado: Ecosistema Inteligente de Inversión y Ejecución"
> Infographic decomposition into a deployable systems architecture.

**Mission formula:** `DATA + AI + INSTITUTIONAL NETWORK + CAPITAL + EXECUTION = REAL ECONOMIC IMPACT`

---

## 1. Context & Goals

The ecosystem is a multi-sided platform that connects three actor classes through a pipeline orchestrated by AI:

| Actor | Role | Primary surface |
|---|---|---|
| **Investors** (funds, banks, family offices) | Provide capital, define investment thesis | Investor Portal + Capital Pool Manager |
| **Chambers of Commerce** (ICC + local affiliates) | Originate qualified deal flow from their member base | Chamber Admin Portal + Member Directory |
| **Companies** (founders, SMEs, growth-stage) | Submit projects, receive investment + execution support | Founder Portal + Project Workspace |

**Output:** Investment-Grade projects with structured documentation, matched to thematic capital pools, executed under PMO supervision, with measurable economic impact.

---

## 2. High-Level Architecture

```
                        ┌─────────────────────────────────────────────────────────┐
                        │            EDGE / API GATEWAY (Auth + RBAC)             │
                        └─────────────────────────────────────────────────────────┘
                                                  │
        ┌─────────────────┬───────────────────────┼───────────────────┬─────────────────┐
        │                 │                       │                   │                 │
   ┌────▼────┐     ┌──────▼──────┐         ┌──────▼──────┐     ┌──────▼──────┐   ┌──────▼──────┐
   │ Phase 1 │     │   Phase 2   │         │   Phase 3   │     │   Phase 4   │   │   Phase 5   │
   │Investor │     │  Chamber    │         │   AI IRS    │     │ Match &     │   │ Investment  │
   │Dialogue │     │  Federation │         │  Scoring    │     │ Allocation  │   │ Preparation │
   │         │     │  Integration│         │             │     │             │   │             │
   └────┬────┘     └──────┬──────┘         └──────┬──────┘     └──────┬──────┘   └──────┬──────┘
        │                 │                       │                   │                 │
        └─────────────────┴───────────────────────┴───────────────────┴─────────────────┘
                                                  │
        ┌─────────────────────────────────────────┼─────────────────────────────────────┐
        │                          CROSS-CUTTING SERVICE PLANE                          │
        ├─────────────┬───────────────────┬────────────────────────┬─────────────────────┤
        │ Compliance  │  Maturity Engine  │ AI Structuring Engine  │  Execution / PMO    │
        │ KYC/KYB/AML │ Idea → IG ladder  │ (IPE) doc generation   │  as a Service       │
        └─────────────┴───────────────────┴────────────────────────┴─────────────────────┘
                                                  │
        ┌─────────────────────────────────────────┼─────────────────────────────────────┐
        │                              DATA & PLATFORM PLANE                            │
        ├──────────────┬──────────┬───────────┬─────────┬───────────┬───────────────────┤
        │ PostgreSQL   │ Vector   │ Object    │ Event   │ Workflow  │ Observability     │
        │ (relational) │ DB (RAG) │ Storage   │ Bus     │ Engine    │ (logs/metrics)    │
        └──────────────┴──────────┴───────────┴─────────┴───────────┴───────────────────┘
```

---

## 3. Phase Decomposition

### Phase 1 — Strategic Dialogue with Investors

**Purpose:** Capture an investor's thesis and convert it into a machine-readable filter.

**Entities:**

```
investor (id, legal_name, type[fund|bank|family_office|individual], aum_usd,
          status, kyc_status, created_at)
investor_thesis (id, investor_id, sectors[], regions[], ticket_min_usd,
                 ticket_max_usd, horizon_months, esg_required, risk_tolerance,
                 available_capital_usd, deployment_pace, updated_at)
investor_thesis_history (snapshots for audit)
```

**Services:**
- `investor-onboarding-service` — KYC/KYB intake, thesis questionnaire, profile validation
- `thesis-translator` — NLP service that converts narrative input ("I want LATAM agri-tech with strong unit economics") into the structured `investor_thesis` row

**Outputs to downstream phases:** Structured thesis filter, used by Phase 4 matching.

---

### Phase 2 — Chamber Federation Integration (ICC + local chambers)

**Purpose:** Federate the affiliated company base across chambers, normalise it, and make it queryable.

**Entities:**

```
chamber (id, name, country, region, parent_federation_id, api_endpoint,
         api_credentials_vault_key)
chamber_member (id, chamber_id, company_id, joined_at, tier, governance_role)
company (id, legal_name, registration_id, registration_country, sector_taxonomy_id,
         founded_year, employee_count, hq_country, website_url, status)
```

**Services:**
- `federation-connector` — Pluggable adapter pattern; one adapter per chamber backend (REST, CSV pull, S3 drop, SCIM)
- `company-normalizer` — Deduplicates, resolves legal entities across chambers, enriches with public sources (registry lookups, web search, social signals)
- `taxonomy-mapper` — Maps each chamber's local sector codes to the canonical sector taxonomy used by the IRS engine

**Integration patterns:**
- Pull (most chambers): scheduled API/CSV ingest, hourly or daily
- Push (advanced chambers): webhook on member events
- Manual upload: admin UI for chambers without APIs

**Output:** Unified company graph queryable by sector, country, maturity, and chamber affiliation.

---

### Phase 3 — AI Filter & Investment Readiness Score (IRS)

**Purpose:** Score every project on a 0-100 scale across 8 dimensions; surface the top of funnel.

**IRS dimensions (each weighted 0-1, summing to total):**

| Dimension | Weight | Signals |
|---|---:|---|
| Financial Viability | 0.20 | Revenue, margin, runway, burn, financial model quality |
| Team & Experience | 0.15 | Founder background, sector tenure, prior exits, advisor depth |
| Market & Traction | 0.15 | TAM/SAM/SOM, customer count, growth rate, retention |
| Business Model | 0.10 | Pricing clarity, unit economics, scalability of model |
| Regulatory & Legal Risk | 0.10 | Permits in place, IP cleanliness, jurisdiction risk |
| ESG / Sustainable Impact | 0.10 | SDG alignment, emissions disclosure, social impact score |
| Scalability | 0.10 | Tech leverage, ops automation, geographic expansion path |
| Banking Match | 0.10 | Banked vs unbanked, credit history, debt service capacity |

**Services:**
- `irs-scorer` — Deterministic rule-based base score per dimension
- `irs-ai-synthesizer` — LLM pass (Claude / GPT) that adjusts ±10pts based on evidence cohesion across dimensions; outputs a one-line rationale per project
- `evidence-collector` — Async workers that probe project websites, search web for company mentions, fetch public filings, validate registration IDs

**Data model:**

```
project (id, company_id, submitted_by_member_id, title, vision_text,
         sector, sub_sector, target_countries[], stage_maturity,
         submitted_at, status)
project_irs (project_id, dimension_key, dimension_score, weight,
             contribution, detail_json, scored_at)
project_irs_total (project_id, total_score, ai_adjustment, ai_reason,
                   computed_at, expires_at)
```

**SLA target:** New project → IRS available within 60s for the deterministic pass, +20-40s for the AI synthesis pass.

**Output:** `Qualified projects shortlist` consumed by Phase 4.

---

### Phase 4 — AI Matching & Thematic Capital Pool Allocation

**Purpose:** Bipartite match between investor thesis (Phase 1) and qualified projects (Phase 3), routed through thematic capital pools.

**Capital pool model:**

```
capital_pool (id, name, thematic_focus, sector_filter[], region_filter[],
              ticket_min_usd, ticket_max_usd, total_capital_usd,
              deployed_capital_usd, status, fund_manager_id)
capital_pool_investor (pool_id, investor_id, commitment_usd,
                       commitment_date, drawn_usd)
project_pool_match (id, project_id, pool_id, fit_score, status,
                    matched_at, advanced_to_diligence_at, allocated_usd,
                    declined_at, decline_reason)
```

**Example seed pools (from infographic):**

| Pool | Thematic Focus | Sector | Capital Available |
|---|---|---|---:|
| Agroindustria LATAM | Agri / Food | Agro, Alimentos | $80M |
| Infraestructura Verde | Green Infrastructure | Infrastructure | $150M |
| HealthTech | Health Technology | Salud, Biotech | $40M |
| Food Security | Food Security | Alimentos | $60M |
| Industrial Automation | Industry 4.0 | Industria, Tech | $90M |
| **Total** | | | **$420M** |

**Matching algorithm:**

1. **Hard filters** — sector ∈ pool.sector_filter, target_country ∈ pool.region_filter, ticket_size fits min/max, IRS ≥ pool minimum threshold (typically 75)
2. **Fit score (0-100)** — weighted on:
   - Sector/sub-sector exactness (0.30)
   - Geographic alignment (0.20)
   - Stage of maturity vs pool target (0.20)
   - ESG alignment with pool mandate (0.15)
   - IRS dimension fit (financial viability for debt pools, scalability for growth pools, etc.) (0.15)
3. **Greedy allocation pass** — sort matches by fit_score desc, allocate while respecting pool capital limits and per-project max ticket
4. **AI shortlist refinement** — LLM pass reviews top N matches and writes the one-paragraph "why this fits" memo per project, shown to fund manager

**Service:** `matching-engine` — runs nightly + on-demand when new pools are added or significant IRS recomputes happen.

**Output:** Per-pool shortlist with fit scores + AI rationale, surfaced in the Fund Manager portal.

---

### Phase 5 — Investment-Grade Document Generation (IPE)

**Purpose:** Auto-generate the full investor package once a project + pool match is advanced to diligence.

**Deliverables per project:**

| Document | Generator | Storage |
|---|---|---|
| Business Plan | LLM with structured template + project data | PDF in S3, versioned |
| Financial Model | Code generation (XLSX) from project numbers + sector benchmarks | XLSX in S3 |
| Investor Deck | Slide template + LLM-generated copy + auto-generated charts | PPTX + PDF |
| Executive Summary | LLM, 1-2 pages | PDF |
| Market Analysis | LLM with RAG over sector reports + IRS dimension data | PDF |
| Legal Structure | Template per jurisdiction + AI-filled cap table | PDF |
| Risk & Mitigation | LLM synthesis of IRS regulatory/legal dimension + evidence | PDF |
| ESG Package | LLM with SDG alignment matrix + ESG score detail | PDF |
| Data Room | Aggregator that bundles all of the above + uploaded primary docs | S3 prefix, indexed |

**Service:** `investment-preparation-engine (IPE)`

```
package (id, project_id, pool_id, version, status[draft|review|investor_grade],
         generated_at, approved_by, expires_at)
package_artifact (id, package_id, kind, storage_url, sha256,
                  generated_by[ai|template|human])
```

**Workflow:**
1. Fund manager clicks "Advance to Diligence" on a matched project
2. IPE enqueues N parallel generators (one per artifact)
3. Each generator pulls project + company + IRS + evidence rows, runs its prompt/template, writes PDF/XLSX/PPTX to object storage
4. On all-complete, IPE assembles the data room index, sets `status = 'investor_grade'`, notifies the investor

**SLA target:** Full package in < 15 minutes from "Advance" click.

---

## 4. Cross-Cutting Service Plane

### 4.1 Compliance & Risk Service

```
┌──────────────────────────────────────────────────────────────┐
│  compliance-service                                          │
│  ────────────────                                            │
│  POST /compliance/kyc                  (individual)          │
│  POST /compliance/kyb                  (entity)              │
│  POST /compliance/aml-screen           (PEP, watchlists)     │
│  POST /compliance/sanctions-screen     (OFAC, EU, UN)        │
│  POST /compliance/ubo-verify           (beneficial owners)   │
│  POST /compliance/country-risk         (FATF, Basel)         │
│                                                              │
│  Adapters: Refinitiv, ComplyAdvantage, Onfido, Sumsub        │
└──────────────────────────────────────────────────────────────┘
```

Every investor + company + UBO is screened at onboarding and periodically (90-day refresh, or on news triggers). Failed screens block downstream allocation.

### 4.2 Business Maturity Engine

State machine for each company:

```
   ┌──────┐    ┌─────────────────┐    ┌─────┐    ┌────────────────┐
   │ Idea │ ── │ Validated Model │ ── │ MVP │ ── │ Initial Sales  │
   └──────┘    └─────────────────┘    └─────┘    └────────────────┘
                                                          │
                                                          ▼
                                            ┌─────────────────────┐
                                            │ Scalable            │
                                            └─────────────────────┘
                                                          │
                                                          ▼
                                            ┌─────────────────────┐
                                            │ Investment Grade    │
                                            └─────────────────────┘
```

Maturity is auto-computed from project signals (revenue band, team size, IRS dimensions) but admin-overridable. Pool eligibility usually requires `>= Initial Sales`.

### 4.3 AI Structuring Engine (Investment Preparation Engine)

Shared LLM-orchestration layer used by Phase 3 and Phase 5. Responsibilities:
- Prompt template registry, versioned
- Model routing (Claude Sonnet for synthesis, Haiku for cheap classification, embedding model for retrieval)
- Cost & token accounting per artifact
- Output validation (JSON schema enforcement, length caps)
- Caching (prompt + context hash → cached output, 24h TTL)

### 4.4 Execution / PMO-as-a-Service

After capital is allocated, this plane runs:

```
project_execution (project_id, plan_id, pmo_owner_id, status, milestone_count,
                   budget_total_usd, budget_spent_usd, kpi_target_json,
                   kpi_actual_json, last_review_at)
project_milestone (id, project_id, name, due_at, completed_at, status, owner_id)
project_disbursement (id, project_id, tranche_number, amount_usd, condition_text,
                      released_at, condition_verified_by)
vendor (id, name, kyb_status, default_payment_terms)
project_vendor (project_id, vendor_id, scope, contract_url, total_committed_usd)
```

Services: `pmo-planner`, `budget-controller`, `kpi-monitor`, `vendor-management`. The investor sees a real-time dashboard of KPI vs target + budget burn.

---

## 5. Data & Platform Plane

| Layer | Technology choice | Rationale |
|---|---|---|
| Relational store | PostgreSQL 16 | Strict schemas for entities, multi-tenant via row-level security per chamber |
| Vector store | pgvector (start) → Pinecone/Weaviate (scale) | Embeddings for project↔pool matching, RAG over sector reports |
| Object storage | S3-compatible (AWS S3 or R2) | Generated docs, data room contents, evidence files |
| Event bus | NATS or Redis Streams | Decoupled async workflows (IRS recompute, IPE generation, KPI ingest) |
| Workflow engine | Temporal | Multi-day workflows (compliance refresh, milestone disbursement, package generation) |
| Cache | Redis | Hot reads on capital pools, investor theses, leader boards |
| Observability | OpenTelemetry → Grafana + Loki + Tempo | Traces span the full pipeline; SLO dashboards per phase |

---

## 6. AI / ML Subsystem

| Workload | Model class | Notes |
|---|---|---|
| IRS deterministic scoring | Pure Node/Python rules | No LLM, runs in <1s, reproducible |
| IRS AI synthesis | Claude Sonnet 4.5 | ±10pt adjustment, structured JSON output |
| Thesis translation (Phase 1) | Claude Sonnet 4.5 | Free-text → structured `investor_thesis` row |
| Project↔Pool fit scoring | Embeddings (text-embedding-3-large) + cosine + reranker | Generates fit_score continuously |
| Document generation (IPE) | Claude Sonnet 4.5 with prompt caching | Sector benchmark cache hits keep cost low |
| Compliance entity matching | Fuzzy name matching + LLM disambiguation | Used for UBO and watchlist hits |
| Market intelligence | RAG over uploaded sector PDFs + web search (Brave) | Powers Market Analysis artifact |

**Prompt caching:** sector benchmark data + template scaffolding cached (Anthropic 5-min cache TTL) so per-project marginal cost is single-digit cents.

**Eval pipeline:** Golden dataset of 50 historical investment decisions → run IRS + matching → measure precision@5 and recall against known outcomes. Re-eval on every prompt change.

---

## 7. Security Architecture

- **AuthN:** OIDC via Auth0/Okta for investors and chamber admins; magic-link email for founders
- **AuthZ:** Role-Based Access Control with tenant scoping (`chamber_id`, `investor_id`, `company_id` always in JWT claims; row-level security in Postgres mirrors)
- **Data classification:**
  - Public — chamber + member directory
  - Confidential — project financials, IRS scores
  - Restricted — investor thesis, capital deployment, KYC/KYB documents
- **Secrets:** All third-party API credentials in vault (HashiCorp Vault or AWS Secrets Manager); rotated every 90 days
- **Encryption:** TLS 1.3 in transit; AES-256 at rest for object storage + DB volumes
- **Audit:** Every read of Restricted data emits a structured audit event to a write-only sink (S3 → Athena queryable)

---

## 8. Integration Layer

### Inbound

| Source | Method | Frequency |
|---|---|---|
| Chamber member directories | REST/CSV/SCIM | Hourly or daily |
| Government registry APIs (EIN, RUC, CNPJ, etc.) | REST | On-demand at onboarding |
| Compliance providers (Refinitiv, ComplyAdvantage) | REST | At onboarding + 90-day refresh |
| Bank rails (for disbursement) | SWIFT MT103 / ACH / SEPA | On milestone approval |
| Public web (company validation) | Brave Search + HTTP fetch | At IRS scoring time |

### Outbound

| Destination | Method | Trigger |
|---|---|---|
| Investor email / Slack | Webhooks | New shortlist available, milestone hit, KPI alert |
| Fund managers' CRMs (Salesforce, Affinity) | REST + Zapier connector | New match advanced to diligence |
| Accounting / ERP | API push | Disbursement events |
| Chamber portals | Webhook callbacks | Member project status changes |

---

## 9. Deployment Architecture

```
┌─ Cloudflare (CDN + WAF) ──────────────────────────────────────────┐
│                                                                   │
│   ┌─ Region: us-east-1 (primary) ──────────────────────────────┐  │
│   │  ┌─ API Gateway ──────────────────────────────────────┐    │  │
│   │  └────────────────────────────────────────────────────┘    │  │
│   │                                                            │  │
│   │  ┌─ Service Mesh (Istio or Linkerd) ──────────────────┐    │  │
│   │  │  investor-svc  chamber-svc  irs-svc  match-svc     │    │  │
│   │  │  ipe-svc  compliance-svc  pmo-svc  audit-svc       │    │  │
│   │  └────────────────────────────────────────────────────┘    │  │
│   │                                                            │  │
│   │  Postgres (HA, multi-AZ) | Redis cluster | S3 | Temporal    │  │
│   └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│   ┌─ Region: eu-west-1 (data residency for EU investors) ──┐      │
│   │   read replicas + EU-resident object storage           │      │
│   └────────────────────────────────────────────────────────┘      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

- **Containerization:** Each service runs in Docker, orchestrated by Kubernetes (EKS)
- **CI/CD:** GitHub Actions → ECR → ArgoCD progressive rollout
- **Environments:** dev → staging (with anonymized prod data) → prod
- **Multi-region:** Primary in us-east-1, EU read replica + EU object storage for GDPR data residency

---

## 10. Non-Functional Requirements & SLOs

| Concern | Target |
|---|---|
| API p50 latency (read) | < 100ms |
| API p99 latency (read) | < 500ms |
| IRS deterministic scoring | < 60s per new project |
| IPE full package generation | < 15 min per project |
| Compliance screen (cached) | < 1s |
| Compliance screen (fresh) | < 10s |
| Matching engine batch run | < 30 min for 10k projects × 50 pools |
| Uptime SLO | 99.9% for read paths, 99.5% for AI generation |
| RPO / RTO | RPO 15 min, RTO 1 hour |

---

## 11. Business Model Integration

| Revenue stream (from infographic) | Technical surface |
|---|---|
| Chambers of Commerce (SaaS) | Per-chamber tenant; tiered pricing on number of seats + members |
| Banks & Investors (Premium Access) | Subscription tier unlocks shortlist + diligence package downloads |
| Companies (Subscription) | Founder portal: free signup, paid for premium IPE features |
| PMO (Monthly Fee) | Per-active-project line item, billed via Stripe |
| Success Fee | Triggered by `project_disbursement` event, % of allocated capital |
| Marketplace Commission | Vendor management module charges % on vendor invoices processed |

All revenue events flow into a `billing` service that integrates with Stripe Billing + Stripe Connect for marketplace splits.

---

## 12. Roadmap (suggested phasing)

| Quarter | Scope |
|---|---|
| Q1 | Phase 1 + Phase 2 + basic compliance. MVP onboarding for 3 pilot chambers + 5 investors. |
| Q2 | Phase 3 (IRS). Manual matching, no IPE yet. Targeted at 1 sector vertical (HealthTech). |
| Q3 | Phase 4 (capital pools + automated matching). Open to all 5 seed sectors. |
| Q4 | Phase 5 (IPE) + Execution/PMO module. Full pipeline live. Expand to 20 chambers. |
| Year 2 Q1 | Multi-region (EU). Add 3 more capital pools. |
| Year 2 Q2 | Marketplace + vendor management + success fee billing. |

---

## 13. Open Questions for Implementation

1. **Federation governance** — Do chambers retain ownership of their member data, or does it become a shared graph? GDPR/data-portability implications.
2. **Capital escrow model** — Are pools real escrow accounts (Stripe Connect / Treasury Prime / Mercury) or commitments tracked in the system only?
3. **Diligence approval path** — Investor-only? Or co-sign with chamber + fund manager?
4. **IRS recalibration cadence** — Re-score on every project edit? Daily? Weekly? Cost vs freshness tradeoff.
5. **Sector taxonomy** — Use NAICS, ISIC, or a custom chamber-friendly taxonomy? Affects every downstream filter.
6. **AI provider strategy** — Single provider (Claude) for consistency, or multi-provider with routing for cost/latency tradeoffs?

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **IRS** | Investment Readiness Score (0-100), the aggregate AI-assisted assessment of project investability |
| **IPE** | Investment Preparation Engine, the document-generation subsystem (Phase 5) |
| **PMO** | Project Management Office, the post-allocation execution oversight layer |
| **UBO** | Ultimate Beneficial Owner, the natural person(s) ultimately controlling a legal entity |
| **KYB** | Know Your Business (entity-level KYC) |
| **AML** | Anti-Money Laundering screening |
| **Capital Pool** | Thematic fund vehicle with defined sector/region/ticket-size filters |
| **Fit Score** | Per-(project, pool) 0-100 score used by the matching engine |
| **Investment Grade** | Internal designation: package complete + IRS ≥ threshold + all compliance green |
