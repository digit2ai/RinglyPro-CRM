# SurgicalMind AI -- Ecosystem Architecture

**da Vinci Robotic Surgical System Matching Engine**
Version 1.0.0 | Vertical: `/intuitive/`

---

## 1. What It Does

SurgicalMind AI ingests a hospital's surgical profile (volume, specialties, infrastructure, financials, workforce) and runs 16 computational analyses to recommend the optimal da Vinci system configuration (dV5, Xi, X, SP). It then generates a 13-slide voice-narrated proposal that can be shared via a public link -- no login required.

---

## 2. System Architecture

```
                          +----------------------------+
                          |      Main RinglyPro CRM    |
                          |        (src/app.js)        |
                          |   app.use('/intuitive',    |
                          |       intuitiveApp)        |
                          +-------------+--------------+
                                        |
                     +------------------v------------------+
                     |     Intuitive Sub-Application       |
                     |   verticals/intuitive/src/index.js  |
                     +--+------+------+------+------+------+
                        |      |      |      |      |
               +--------+  +--+--+ +-+--+ +-+--+ +-+---+
               |Health   |  |Proj | |Anly| |Demo| |Voice|
               |Route    |  |CRUD | |Run | |Gen | |Agent|
               +---------+  +-----+ +----+ +----+ +-----+
                                        |
                           +------------v------------+
                           |   System Matcher Svc    |
                           |  16 Analysis Pipelines  |
                           +------------+------------+
                                        |
                     +------------------v------------------+
                     |           PostgreSQL                 |
                     |  intuitive_projects                  |
                     |  intuitive_analysis_results          |
                     |  intuitive_system_recommendations    |
                     +-------------------------------------+

               +-------------------------------------------+
               |           React Dashboard (Vite)          |
               | Intake -> Analysis -> Match -> Presentation|
               +-------------------------------------------+

               +-------------------------------------------+
               |        Proposal Generator + TTS           |
               |  13 slides | ElevenLabs Rachel voice      |
               |  Standalone HTML viewer (public link)     |
               +-------------------------------------------+
```

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js / Express.js (sub-app) |
| Frontend | React 18 + React Router 6 + Vite |
| Styling | Tailwind CSS 3 (custom `intuitive` palette) |
| Charts | Recharts (dashboard), Chart.js (proposals) |
| ORM | Sequelize (PostgreSQL) |
| Voice TTS | ElevenLabs Multilingual v2 -- Rachel voice |
| Voice Agent | ElevenLabs ConvAI widget |
| Deploy | Render (auto-deploy on push to main) |

---

## 4. Database Schema

### `intuitive_projects`

| Column Group | Fields |
|-------------|--------|
| Identity | `id`, `project_code` (INTV-YYYY-XXXXX, unique) |
| Hospital | `hospital_name`, `hospital_type` (academic/community/rural/specialty/VA/military), `bed_count`, `state`, `country` |
| Contact | `contact_name`, `contact_email`, `contact_title` |
| Surgical Profile | `annual_surgical_volume`, `current_robotic_cases`, `current_system` (none/dV5/Xi/X/SP/Si/competitor), `current_system_count`, `current_system_age_years` |
| Specialty Mix (%) | `specialty_urology`, `specialty_gynecology`, `specialty_general`, `specialty_thoracic`, `specialty_colorectal`, `specialty_head_neck`, `specialty_cardiac` |
| Workforce | `credentialed_robotic_surgeons`, `surgeons_interested`, `convertible_lap_cases` |
| Infrastructure | `total_or_count`, `robot_ready_ors`, `or_sqft`, `ceiling_height_ft` |
| Financials | `capital_budget` (<1M/1-2M/2-3M/3M+), `acquisition_preference` (purchase/lease/usage_based), `avg_los_days`, `complication_rate_pct`, `readmission_rate_pct` |
| Payer Mix (%) | `payer_medicare_pct`, `payer_commercial_pct`, `payer_medicaid_pct`, `payer_self_pay_pct`, `value_based_contract_pct` |
| Competitive | `competitor_robot_nearby`, `competitor_details` |
| Planning | `target_go_live`, `primary_goal` (volume_growth/cost_reduction/competitive/quality/recruitment), `notes` |
| Meta | `status` (intake/analyzing/matching/completed/error), `analysis_started_at`, `analysis_completed_at`, `extended_data` (JSONB) |

**Associations:** hasMany AnalysisResult, hasMany SystemRecommendation

### `intuitive_analysis_results`

| Field | Type | Notes |
|-------|------|-------|
| `id` | PK | |
| `project_id` | FK | |
| `analysis_type` | string | One of 16 types; unique per project |
| `result_data` | JSONB | Schema varies by analysis type |
| `computed_at` | timestamp | |

### `intuitive_system_recommendations`

| Field | Type | Notes |
|-------|------|-------|
| `id` | PK | |
| `project_id` | FK | |
| `system_model` | string | dV5, Xi, X, SP |
| `quantity` | integer | Recommended unit count |
| `fit_score` | integer | 0--100 |
| `is_primary` | boolean | Primary vs alternative |
| `rationale` | text | Explanation |
| `acquisition_model` | string | purchase/operating_lease/usage_based |
| `estimated_price` | float | System cost |
| `estimated_annual_cost` | float | Lease + instruments + service |
| `projected_annual_cases` | integer | |
| `projected_utilization_pct` | float | 0--100 |
| `breakeven_months` | integer | |
| `five_year_roi_pct` | float | |
| `specialties_served` | JSONB | Array of specialty names |
| `risk_factors` | JSONB | Array of risk strings |
| `details` | JSONB | Additional data |

---

## 5. da Vinci Product Catalog

| Spec | dV5 | Xi | X | SP |
|------|-----|----|---|-----|
| Price | $2.3--2.8M | $1.5--2.0M | $800K--1.2M | $1.5--1.8M |
| Annual Lease | $400--550K | $250--400K | $150--250K | $300--400K |
| Service/yr | Included | $175K | $125K | $150K |
| Instruments/case | $2,200 | $1,800 | $1,800 | $2,000 |
| Min OR sqft | 650 | 600 | 550 | 500 |
| Min Ceiling | 10 ft | 10 ft | 9.5 ft | 9.5 ft |
| Ideal Cases/yr | 300 | 250 | 150 | 100 |
| Min Cases/yr | 150 | 100 | 75 | 50 |
| Training Weeks | 4 | 3 | 3 | 5 |
| Specialties | All 7 + cardiac | All except cardiac | Urology, GYN, General | Urology, Head & Neck |

---

## 6. The 16 Analysis Pipelines

All analyses run sequentially via `system-matcher.js` > `runAll()`. Each result is stored as a row in `intuitive_analysis_results` keyed by `analysis_type`.

### 6.1 Volume Projection
Applies specialty-specific robotic conversion rates (urology 85%, GYN 45%, general 25%, thoracic 30%, colorectal 35%, head/neck 20%, cardiac 15%) and models a 5-year adoption ramp starting at 40% Year 1, +15%/year. Design year = Year 3.

### 6.2 Model Matching (Scoring Algorithm)
Weighted 0--100 score per system:
- Volume Fit: 30 pts (ideal threshold = full, linear interpolation to minimum)
- Specialty Coverage: 25 pts (% of hospital specialties the system supports)
- Budget Fit: 20 pts (price vs declared capital budget)
- Infrastructure: 15 pts (penalties for small ORs / low ceilings)
- Hospital Type Bonus: 10 pts (dV5 favored for academic, X for community/rural)

Output: ranked list with primary recommendation and alternative.

### 6.3 Utilization Forecast
Uses specialty case durations (urology 2.5h, GYN 1.5h, general 1.5h, thoracic 3h, colorectal 3.5h, head/neck 2h, cardiac 4h) + 0.75h setup/turnover. 10h OR day. Systems needed = ceil(design_cases / (max_per_system_year x 0.8)).

### 6.4 Surgeon Capacity
Ideal = 150 cases/surgeon. Flags single-surgeon risk and estimates training months for new surgeons (~3 months each). Capacity status: over_capacity, good, under_capacity, critical.

### 6.5 Infrastructure Assessment
Readiness 0--100 score. Deductions: no robot-ready ORs (-40), small ORs (-15), low ceilings (-10), few total ORs (-10). Estimates renovation costs ($50K--$1.5M).

### 6.6 ROI Calculation
Assumptions: $15K avg case revenue, 15% LOS reduction @ $2,500/day, 20% complication reduction @ $25K/event, 10% marketing uplift. Outputs payback months, 5-year ROI %, cumulative projections.

### 6.7 Competitive Analysis
Binary assessment of competitor proximity. Sets market pressure (high/low), positioning strategy, and urgency recommendation.

### 6.8 Risk Assessment
Aggregates risks across workforce, utilization, infrastructure, volume, and financial categories. Severity: critical/high/moderate/low. Overall = critical if any critical; high if 2+ high.

### 6.9 Procedure Pareto (ABC Analysis)
Generates 60+ procedures weighted by specialty mix. Lorenz curve, Gini coefficient. ABC: A = top 80% volume, B = 80--95%, C = bottom 5%.

### 6.10 Monthly Seasonality
Weighted monthly distribution (Jan 1.12 ... Dec 0.74). Coefficient of Variation classification: X (stable, <15%), Y (seasonal, 15--30%), Z (erratic, >30%).

### 6.11 Weekday Distribution
Day weights: Mon 0.21, Tue 0.24 (peak), Wed 0.23, Thu 0.19, Fri 0.11, Sat 0.02, Sun 0.00.

### 6.12 Hourly Distribution
OR hours 6am--5pm. Peak 8am--4pm. Realistic surgical start time weights.

### 6.13 Design Day Analysis
Poisson-like normal approximation. Percentiles: P50, P75 (design standard), P90, P95, P99. Design day = P75 to cover 75% of operating days without overflow.

### 6.14 Robot Compatibility Matrix
Procedure-specific fit scores per system (e.g. Radical Prostatectomy: dV5=98, Xi=92, X=75, SP=85; TORS: SP=95, dV5=80, Xi=55, X=30). 20 procedures scored. Outputs average fit per system.

### 6.15 Financial Deep Dive
Per-procedure economics: robotic $18K revenue / $8.5K cost vs laparoscopic $12K / $6K. 5-year TCO: acquisition + instruments + service + training + renovation. Payer mix reimbursement adjustment (Medicare 0.75, Medicaid 0.55, Commercial 1.15, Self-pay 0.90). Month-by-month breakeven curve.

### 6.16 Growth Extrapolation
Three scenarios: conservative (10%), baseline (15%), aggressive (20%) annual growth. Specialty-level CAGRs (GYN 18%, colorectal 22%, cardiac 8%, etc.). Fleet planning per year.

---

## 7. Frontend Dashboard

**Stack:** React 18 + React Router 6 + Tailwind (dark theme: slate-900 bg, `intuitive-500` #0ea5e9 accent) + Recharts

### 4-Step Workflow

| Step | Page | Route | Purpose |
|------|------|-------|---------|
| 1 | IntakePage | `/` or `/intake` | 40+ field hospital intake form, demo generators |
| 2 | AnalysisPage | `/analysis/:projectId` | 16 analyses displayed with KPI cards and 8 chart components |
| 3 | RecommendationsPage | `/recommendations/:projectId` | Primary + alternative system match cards with rationale |
| 4 | PresentationPage | `/presentation/:projectId` | 13-slide viewer, audio playback, ElevenLabs ConvAI widget |

### Chart Components (Recharts)

1. **ProcedureParetoChart** -- Horizontal bar, top 10 procedures, ABC coloring
2. **SeasonalityChart** -- Monthly line, robotic vs total split
3. **WeekdayChart** -- Daily bar, Tue peak highlighted
4. **HourlyChart** -- Hourly bar, color-coded peak hours
5. **CompatibilityMatrix** -- Grouped horizontal bar, 4 systems x 10 procedures
6. **BreakevenChart** -- Dual-line, cumulative cost (red) vs benefit (green), breakeven marker
7. **GrowthProjectionChart** -- Multi-line, 3 scenarios over 5 years
8. **DesignDayCard** -- Stat card, P50/P75/P90/P95

### Project Persistence
Active project stored in `localStorage` key `intuitive_project_id`. Direct navigation via `/analysis/:id` overrides.

---

## 8. Proposal Generator

### Generation Flow
1. User clicks "Generate Proposal" on PresentationPage
2. `POST /api/v1/proposal/:projectId/generate` queues async TTS job
3. UI polls `GET /api/v1/proposal/:projectId/status` (init -> generating -> completed)
4. 13 narration scripts generated from analysis data
5. Each script sent to ElevenLabs TTS (Rachel voice)
6. MP3 files cached at `verticals/intuitive/proposal-audio/{projectId}/slide_{i}.mp3`

### Voice Configuration
| Parameter | Value |
|-----------|-------|
| Voice | Rachel (ID: `21m00Tcm4TlvDq8ikWAM`) |
| Model | ElevenLabs Multilingual v2 |
| Stability | 0.78 |
| Similarity Boost | 0.75 |
| Style | 0.08 |
| Speaker Boost | true |
| Speed | 0.82 |

### 13-Slide Structure

| # | Title | Chart Type |
|---|-------|-----------|
| 0 | Title Card | None |
| 1 | Hospital Profile | Pie: specialty mix |
| 2 | Procedure Pareto | Horizontal bar: procedure volume |
| 3 | Monthly Seasonality | Grouped bar: total + robotic by month |
| 4 | Weekday Distribution | Grouped bar: total + robotic by day |
| 5 | Hourly OR Utilization | Bar: peak-highlighted hourly |
| 6 | Robot Compatibility | Grouped horizontal: 4 systems |
| 7 | Design Day | Bar: percentile cases |
| 8 | Volume Projection | Bar: 5-year ramp |
| 9 | Financial Deep Dive | Line: cumulative cost vs benefit |
| 10 | Growth Extrapolation | Line: 3 scenarios |
| 11 | System Recommendation | Formatted card |
| 12 | Next Steps | 5-step action plan |

### Standalone Viewer
`GET /intuitive/proposal/:projectId` -- Full HTML5 page, no login. Dark theme, keyboard navigation (arrow keys), auto-advance on audio end. Chart.js renders inline charts.

---

## 9. Voice Agent Integration (ElevenLabs ConvAI)

Dedicated endpoints return structured JSON with `spoken_briefing` strings for the voice agent to read aloud.

| Endpoint | Content |
|----------|---------|
| `/:projectId/full-briefing` | All sections combined |
| `/:projectId/overview` | Hospital name, code, type, beds, state, volume |
| `/:projectId/system-recommendation` | Primary system, fit score, rationale, alternatives |
| `/:projectId/roi` | Breakeven, 5-yr ROI, TCO, per-procedure cost |
| `/:projectId/procedure-analysis` | Pareto, Gini, top cases, compatibility |
| `/:projectId/risk-assessment` | Risk factors, competitive, mitigation |
| `/projects/list` | Last 20 completed projects |

The PresentationPage dynamically builds a Rachel system prompt with live project data and injects it into the ConvAI widget context.

---

## 10. Complete API Reference

All endpoints prefixed with `/intuitive`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service status + DB readiness |
| POST | `/api/v1/projects` | Create hospital project |
| GET | `/api/v1/projects` | List all projects (limit 50) |
| GET | `/api/v1/projects/:id` | Get project + results + recommendations |
| PATCH | `/api/v1/projects/:id` | Update project fields |
| POST | `/api/v1/analysis/:projectId/run` | Execute all 16 analyses |
| GET | `/api/v1/analysis/:projectId/all` | Retrieve all results |
| GET | `/api/v1/analysis/systems` | da Vinci product catalog |
| POST | `/api/v1/demo/generate` | Create 5 demo hospitals |
| POST | `/api/v1/demo/generate-single` | Create 1 random demo |
| POST | `/api/v1/proposal/:projectId/generate` | Queue proposal generation |
| GET | `/api/v1/proposal/:projectId/status` | Poll generation status |
| GET | `/api/v1/proposal/:projectId/audio/:slideNum` | Stream slide MP3 |
| GET | `/api/v1/voice/:projectId/full-briefing` | Complete spoken briefing |
| GET | `/api/v1/voice/:projectId/overview` | Hospital overview |
| GET | `/api/v1/voice/:projectId/system-recommendation` | System match briefing |
| GET | `/api/v1/voice/:projectId/roi` | Financial briefing |
| GET | `/api/v1/voice/:projectId/procedure-analysis` | Procedure briefing |
| GET | `/api/v1/voice/:projectId/risk-assessment` | Risk briefing |
| GET | `/api/v1/voice/projects/list` | Recent completed projects |
| GET | `/proposal/:projectId` | Standalone HTML proposal viewer |

---

## 11. Demo Data

Five pre-built hospitals for testing and demos:

| Hospital | Type | State | Beds | Annual Vol | Current System | Goal |
|----------|------|-------|------|-----------|----------------|------|
| Tampa General | Academic | FL | 1,041 | 45,000 | 6x Xi | Volume growth |
| Lakewood Community | Community | OH | 180 | 2,800 | None (greenfield) | Competitive |
| Texas Spine & Joint | Specialty | TX | 48 | 3,200 | None | Quality |
| Memorial Hermann Woodlands | Community | TX | 393 | 6,500 | 1x Xi (at capacity) | Volume growth |
| Mountain View VA | VA | CA | 240 | 3,800 | Aging Si | Cost reduction |

Generated via `POST /api/v1/demo/generate`. Each gets full 16-analysis pipeline + recommendations.

---

## 12. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs TTS authentication |
| `ELEVENLABS_VOICE_ID` | No | Override Rachel voice ID (default: 21m00Tcm4TlvDq8ikWAM) |
| `CORS_ORIGIN` | No | CORS allowed origin (default: *) |
| `NODE_ENV` | No | development / production |

---

## 13. File Map

```
verticals/intuitive/
  config/
    database.js              -- PostgreSQL connection (shared DB)
  models/
    index.js                 -- Model loader + associations
    Project.js               -- IntuitiveProject (40+ fields)
    AnalysisResult.js        -- IntuitiveAnalysisResult (JSONB)
    SystemRecommendation.js  -- IntuitiveSystemRecommendation
  src/
    index.js                 -- Express sub-app entry point
    routes/
      projects.js            -- CRUD for hospital projects
      analysis.js            -- Run + retrieve analyses
      demo.js                -- Demo data generation
      health.js              -- Health check
      proposal.js            -- TTS proposal generation + audio streaming
      voice-agent.js         -- Voice agent JSON endpoints
    services/
      system-matcher.js      -- 16 analysis pipelines + scoring
  dashboard/
    index.html               -- Vite entry
    vite.config.js           -- Base /intuitive/, API proxy
    tailwind.config.js       -- Custom intuitive color theme
    package.json             -- React 18, Recharts, Router 6
    src/
      App.jsx                -- Router + nav shell
      main.jsx               -- React DOM entry
      lib/
        api.js               -- HTTP client for all endpoints
      pages/
        IntakePage.jsx        -- Hospital intake form
        AnalysisPage.jsx      -- 16-analysis dashboard
        RecommendationsPage.jsx -- System match cards
        PresentationPage.jsx  -- Slide viewer + ConvAI widget
      components/
        ProcedureParetoChart.jsx
        SeasonalityChart.jsx
        WeekdayChart.jsx
        HourlyChart.jsx
        CompatibilityMatrix.jsx
        BreakevenChart.jsx
        GrowthProjectionChart.jsx
        DesignDayCard.jsx
  proposal-audio/            -- Cached MP3 files per project

public/proposals/
  intuitive.html             -- Static proposal page
  intuitive-methodology.html -- Methodology explainer
```

---

## 14. Data Flow Summary

```
Hospital Intake Form
        |
        v
  POST /projects (create)
        |
        v
  POST /analysis/:id/run
        |
        v
  system-matcher.runAll()
    |-- Volume Projection
    |-- Model Matching (scoring)
    |-- Utilization Forecast
    |-- Surgeon Capacity
    |-- Infrastructure Assessment
    |-- ROI Calculation
    |-- Competitive Analysis
    |-- Risk Assessment
    |-- Procedure Pareto (ABC)
    |-- Monthly Seasonality
    |-- Weekday Distribution
    |-- Hourly Distribution
    |-- Design Day Analysis
    |-- Robot Compatibility Matrix
    |-- Financial Deep Dive
    |-- Growth Extrapolation
        |
        v
  Results + Recommendations stored in PostgreSQL
        |
        +---> Dashboard (React) displays charts + KPIs
        |
        +---> Proposal Generator builds 13 slides
        |         |
        |         +---> ElevenLabs TTS -> MP3 cache
        |         |
        |         +---> Standalone HTML viewer (public link)
        |
        +---> Voice Agent endpoints (ConvAI widget)
```
