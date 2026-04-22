# Prompt: Review, Analyze & Enhance the SurgicalMind AI Business Analyst Agent

## Execution Directive

All operations are permanently pre-authorized by the project owner. Execute immediately without asking for permission or confirmation. Never use AskUserQuestion or EnterPlanMode. File create/edit/delete, git commit/push, database changes, deployments -- all approved in advance. Make architectural decisions autonomously. Report results after completion, not before. Do not ask "should I proceed?" or "is this OK?" -- just do it.

## Context

You are reviewing the **SurgicalMind AI Hospital Research Agent** -- a 4-pass Maker-Checker system that generates CFO-grade hospital profiles for Intuitive Surgical da Vinci robotic surgery sales. The agent lives at `verticals/intuitive/src/services/hospital-research-agent.js` (45KB) and is the intelligence backbone of a platform that includes a 16-analysis system matcher, clinical dollarization engine, surgeon survey system, business plan builder, and 13-slide TTS proposal generator.

### Current Architecture (4 Passes)

- **Pass 0 (Data Gatherer)**: Deterministic code -- CMS Hospital Compare API lookup, Brave Search API web research, known hospital system bounds validation, national robotic adoption ratios, industry benchmarks by hospital type (academic/community/specialty/VA/rural).
- **Pass 1 (Maker)**: Claude Opus generates 40+ field hospital profile from Pass 0 context. Each field tagged CONFIRMED or ESTIMATED.
- **Pass 2 (Checker)**: Claude Opus validates Maker output against benchmarks, CMS data, adoption ratios. Returns confidence scores and flags.
- **Pass 3 (Deterministic Validator)**: Hard math rules -- percentages sum to 100, volumes align, normalization.

### The Problem

Our recent research on the top 25 U.S. hospitals by robotic surgery volume exposed critical data gaps:

| Data Point | Current Availability | Gap |
|------------|---------------------|-----|
| Total staffed beds | 70% (from CMS/AHA) | 30% missing, especially community hospitals |
| Number of surgeons on staff | 20% (rarely disclosed) | 80% missing -- agent falls back to estimates |
| da Vinci systems installed (model) | 50% (from press releases) | Intuitive doesn't publish per-site data |
| Annual robotic surgery volume | 40% (some press releases) | Most hospitals don't disclose |
| Annual open surgery volume | <5% (almost never reported) | Near-total gap |
| Robotic-to-open ratio by specialty | National averages only | Zero hospital-level data available |

The agent currently relies heavily on Pass 1 (Maker) estimation when Pass 0 returns incomplete data, which means **60-80% of the hospital profile is AI-estimated rather than data-driven**. This is the core weakness.

### Available Enhancement Data Sources

We have identified 8 data pipelines that could feed Pass 0, dramatically reducing the estimation burden:

**Layer 1 -- High Accuracy (claims-level)**
1. **CMS Medicare Provider Utilization & Payment Data** (free, downloadable CSV)
   - Procedure counts by provider NPI/hospital
   - New ICD-10-PCS code `8E0W0CZ` (Robotic Assisted Procedure) separates robotic from laparoscopic starting 2024
   - Covers ~40% of surgical volume nationally (Medicare population)
   - Can derive: annual volume, specialty breakdown, robotic vs open ratio

2. **State Inpatient Databases (HCUP/SID)** via AHRQ
   - De-identified discharge records with hospital ID + procedure codes + approach modifiers
   - Available for NY, FL, CA, TX, PA and most other states
   - Can derive: total surgical volume, approach-specific counts, payer mix

3. **AHA Annual Survey Database** ($2,000-5,000/year subscription)
   - Staffed beds, total surgeries, FTEs by department, equipment inventories
   - Some fields specifically track "robotic surgical systems on site"
   - Can derive: bed counts, surgeon FTEs, equipment inventory

**Layer 2 -- Medium Accuracy (proxy/indirect)**
4. **FDA MAUDE Database** (free, downloadable)
   - Adverse event reports by device AND facility
   - Every da Vinci adverse event names the hospital
   - Reporting frequency correlates with volume -- high-volume centers file more
   - Can derive: which hospitals have da Vinci, relative volume proxy, system model

5. **Hospital Price Transparency Files** (CMS mandate since Jan 2021)
   - Machine-readable pricing files listing every procedure with charge code
   - If a hospital lists robotic-specific DRGs/CPTs, they have the capability
   - Can derive: robotic capability confirmation, procedure menu

6. **Web Scraping + NLP Pipeline**
   - Target ~500 largest U.S. hospital websites for keywords ("robotic surgery", "da Vinci", "milestone")
   - NLP extraction on hospital annual reports (PDFs)
   - Can derive: cumulative milestones, system acquisitions, program age

**Layer 3 -- Highest Accuracy (authoritative)**
7. **Professional Society Registries**
   - SRC (Surgical Review Corporation): audited volume verification for Centers of Excellence
   - ACS NSQIP: procedure outcomes by hospital including approach type
   - SAGES robotic surgery registry
   - Can derive: verified volumes, quality metrics, accreditation status

8. **Intuitive Surgical Internal Data** (via sales rep relationship)
   - Exact system counts by model per account
   - Annual case volumes per customer
   - Surgeon credentialing numbers
   - Pipeline/competitive intelligence
   - Can derive: ground truth for all robotic-specific fields

### Existing Models That Would Store This Data

The platform already has Sequelize models ready for enhanced data:

- **IntuitiveHospitalReport**: `extracted_procedures` JSONB array of `{ procedure, open_count, lap_count, robotic_count, total_count, year }`
- **IntuitiveCMSMetrics**: `measure_id, score, national_avg, comparison` per hospital
- **IntuitiveClinicalOutcome**: `hospital_case_data` JSONB by specialty with `annual_cases, open_pct, lap_pct, robotic_pct`
- **IntuitiveProject**: 40+ fields including `annual_surgical_volume, current_robotic_system, robotic_cases_annual, specialty_mix_%`

### Current Benchmarks Used by Pass 0

```
Academic:  40 cases/bed/year, 25% robotic adoption, 2.5 robotic surgeons/100 beds
Community: 25 cases/bed/year, 15% robotic adoption, 1.5 robotic surgeons/100 beds
Specialty: 50 cases/bed/year, 30% robotic adoption, 3.0 robotic surgeons/100 beds
VA:        20 cases/bed/year, 10% robotic adoption
Rural:     15 cases/bed/year,  5% robotic adoption
```

### National Robotic Adoption Ratios (current)

```
Prostatectomy:    94.8% robotic (AUA 2024)
Hysterectomy:     ~61% robotic (2018)
Overall urology:  40-45%
Overall GYN:      25-30%
General surgery:  20-30%
Colectomy:        ~15-20% (growing fast)
```

---

## Your Task

Review the current hospital-research-agent.js architecture and produce a detailed enhancement plan that addresses:

### 1. Data Pipeline Architecture
- Design the ingestion pipelines for each of the 8 data sources listed above
- Define the ETL flow: source -> extraction -> transformation -> storage (which model/table)
- Specify which sources can be automated (scheduled cron) vs. manual upload vs. API call
- Define data freshness requirements (how often to refresh each source)
- Handle deduplication and conflict resolution when multiple sources provide the same field

### 2. Pass 0 Enhancement
- Redesign Pass 0 to query all available data layers before invoking the AI passes
- Define a **confidence hierarchy**: when CMS claims say 500 robotic cases but a press release says 600, which wins?
- Implement a **data completeness score** (0-100) per hospital before Pass 1 runs -- if score > 80, skip Pass 1 entirely (no AI estimation needed)
- Add a **data provenance tracker**: every field in the final profile should carry `{ value, source, confidence, last_updated }`

### 3. Pass 1 (Maker) Refinement
- The Maker should only estimate fields that Pass 0 couldn't fill
- Rewrite the Maker prompt to explicitly receive a "known facts" block and a "fields needing estimation" block
- The Maker should explain its estimation methodology for each estimated field
- Add specialty-specific estimation models (urology volume estimation differs from GYN)

### 4. Pass 2 (Checker) Refinement
- The Checker should cross-validate against ALL data layers, not just benchmarks
- Add statistical anomaly detection: if a 200-bed community hospital claims 5,000 robotic cases, flag it
- Implement a **disagreement resolution protocol** when Maker and data sources conflict
- Add peer comparison: "This hospital's robotic adoption is 2 standard deviations above peers in its cohort"

### 5. New Pass: Enrichment Layer
- Consider adding a **Pass 2.5** that enriches the profile with derived metrics:
  - Market share estimation (hospital robotic volume / metro area total)
  - Competitive pressure index (number of da Vinci-equipped hospitals within 30-mile radius)
  - Growth trajectory (if we have multi-year data, compute CAGR)
  - Surgeon pipeline risk (aging workforce, training program presence)
  - Payer mix impact on robotic surgery reimbursement

### 6. Ground Truth Calibration
- Design a feedback loop: when Greg Eriksen (Intuitive sales rep) provides actual data for a hospital, use it to:
  - Calibrate the estimation models (how far off were we?)
  - Update the benchmarks (are our cases/bed/year ratios accurate?)
  - Train better priors for similar hospitals (same type, region, size)
- Store calibration data so the system gets smarter over time

### 7. API & Database Schema Changes
- Define any new tables, columns, or indexes needed
- Define new API endpoints for data ingestion (bulk upload, scheduled refresh)
- Define the admin UI needed to manage data sources, monitor freshness, and review confidence scores

### 8. Implementation Priority
- Rank all enhancements by: (a) data quality improvement, (b) implementation effort, (c) cost
- Propose a phased rollout: Phase 1 (quick wins, free data), Phase 2 (paid subscriptions), Phase 3 (advanced ML)
- Identify which enhancement would most reduce the estimation burden (biggest bang for buck)

---

## Deliverable Format

Return a structured enhancement plan with:
1. Architecture diagram (text-based) showing data flow from all 8 sources through Pass 0-3
2. Database migration SQL for new tables/columns
3. Pseudocode for the enhanced Pass 0 orchestrator
4. Revised Maker and Checker prompts
5. API endpoint specifications for new ingestion routes
6. Priority matrix with effort/impact scoring
7. Cost analysis for paid data sources (AHA, HCUP)
8. Timeline estimate for phased implementation

---

## Files to Read Before Starting

Read these files to understand the current implementation:

1. `verticals/intuitive/src/services/hospital-research-agent.js` -- The 4-pass agent (45KB)
2. `verticals/intuitive/src/services/system-matcher.js` -- 16-analysis pipeline (52KB)
3. `verticals/intuitive/src/services/clinical-dollarization.js` -- Savings calculator (18KB)
4. `verticals/intuitive/src/services/clinical-evidence.js` -- Evidence library (24KB)
5. `verticals/intuitive/src/services/cms-hospital-compare.js` -- Current CMS integration
6. `verticals/intuitive/src/services/annual-report-ingester.js` -- PDF extraction
7. `verticals/intuitive/models/index.js` -- All model associations
8. `verticals/intuitive/models/HospitalReport.js` -- Report ingestion model
9. `verticals/intuitive/models/CMSMetrics.js` -- CMS data model
10. `verticals/intuitive/models/ClinicalOutcome.js` -- Clinical outcome model
11. `verticals/intuitive/models/Project.js` -- 40+ field hospital profile
12. `verticals/intuitive/ECOSYSTEM.md` -- Full technical documentation
13. `verticals/intuitive/data/top_25_robotic_surgery_hospitals.md` -- Research findings exposing data gaps
14. `verticals/intuitive/data/top_25_robotic_surgery_hospitals.json` -- Structured hospital data
