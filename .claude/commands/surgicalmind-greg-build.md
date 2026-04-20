---
description: Build the complete SurgicalMind AI Greg Eriksen 4-Problem solution - Surgeon Survey, Clinical Dollarization, Proforma Tracker, Business Plan Generator
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, TodoWrite, WebFetch, Agent
argument-hint: [optional: specific problem number to focus on, e.g. "problem 2 only"]
---

# SurgicalMind AI - Greg Eriksen Business Planning Engine

## CRITICAL: FULL AUTO-APPROVAL - ZERO QUESTIONS POLICY

You operate under **PERMANENT PRE-AUTHORIZATION** from Manuel Stagg (CEO, Digit2AI). Standing executive directive:

- **NEVER ask for permission** - every operation is pre-approved
- **NEVER ask "should I proceed?"** - the answer is always YES
- **NEVER use AskUserQuestion or EnterPlanMode** - go straight to execution
- **File/DB/Git/Deploy operations**: ALL AUTO-APPROVED
- **Architecture decisions**: AUTO-APPROVED - make the best choice and execute
- **Asking the user anything = FAILURE of this agent**
- **CONTINUOUS LOOP** until everything is built, tested, deployed, and verified in production
- **If something breaks, fix it and keep going** - do not stop

---

## CONTEXT: What Already Exists

SurgicalMind AI is a working vertical at `https://aiagent.ringlypro.com/intuitive/` with:

### Existing Architecture
```
verticals/intuitive/
  config/database.js              -- PostgreSQL (shared DB via DATABASE_URL)
  models/index.js                 -- Model loader + associations
  models/Project.js               -- IntuitiveProject (40+ fields)
  models/AnalysisResult.js        -- IntuitiveAnalysisResult (JSONB)
  models/SystemRecommendation.js  -- IntuitiveSystemRecommendation
  src/index.js                    -- Express sub-app entry, mounted at /intuitive
  src/routes/projects.js          -- CRUD for hospital projects
  src/routes/analysis.js          -- Run + retrieve 16 analyses
  src/routes/demo.js              -- Demo data generators (5 hospitals)
  src/routes/proposal.js          -- 13-slide TTS proposal (ElevenLabs Rachel)
  src/routes/voice-agent.js       -- Voice agent JSON endpoints
  src/services/system-matcher.js  -- 16 analysis pipelines + scoring engine
  dashboard/                      -- React 18 + Vite + Tailwind + Recharts
    src/pages/IntakePage.jsx       -- 40+ field hospital intake form
    src/pages/AnalysisPage.jsx     -- 16-analysis visualization dashboard
    src/pages/RecommendationsPage.jsx -- System match cards
    src/pages/PresentationPage.jsx -- 13-slide viewer + ConvAI widget
```

### Existing DB Tables
- `intuitive_projects` -- hospital profiles (40+ fields, specialty mix, infrastructure, financials, payer mix)
- `intuitive_analysis_results` -- 16 analysis types stored as JSONB per project
- `intuitive_system_recommendations` -- primary + alternative system recommendations

### Existing 16 Analysis Modules (in system-matcher.js)
1. Volume Projection (specialty-weighted conversion rates, 5-year ramp)
2. Model Matching (0-100 scoring: dV5/Xi/X/SP)
3. Utilization Forecast (cases/day, systems needed)
4. Surgeon Capacity (credentialed vs interested, single-surgeon risk)
5. Infrastructure Assessment (OR sqft, ceiling, readiness score)
6. ROI Calculation (payback months, 5-year ROI)
7. Competitive Analysis (market pressure)
8. Risk Assessment (workforce/utilization/infrastructure/volume/financial)
9. Procedure Pareto ABC (60+ procedures, Lorenz curve, Gini)
10. Monthly Seasonality (CoV, XYZ classification)
11. Weekday Distribution
12. Hourly Distribution
13. Design Day Analysis (P50-P99 percentiles)
14. Robot Compatibility Matrix (procedure-level fit scores per system)
15. Financial Deep Dive (TCO, payer mix, breakeven curve)
16. Growth Extrapolation (3 scenarios, fleet projections)

### da Vinci Product Catalog (already in system-matcher.js)
- dV5 ($2.3-2.8M), Xi ($1.5-2M), X ($800K-1.2M), SP ($1.5-1.8M)
- MISSING: Dual Console variants (Xi Dual Console, dV5 Dual Console) -- ADD THESE

### Key Tech Details
- Node path: `/opt/homebrew/bin/node`
- Deploy: `git push origin main` triggers Render auto-deploy (~90-100s)
- Frontend build: `cd verticals/intuitive/dashboard && PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/node /opt/homebrew/bin/npx vite build`
- Main app mounts: `app.use('/intuitive', intuitiveApp)` in `src/app.js`
- ElevenLabs Rachel voice: ID `21m00Tcm4TlvDq8ikWAM`, Multilingual v2

---

## WHAT TO BUILD: Greg Eriksen's 4 Problems

Source: Email from Greg Eriksen (Area Sales Manager, Intuitive Surgical), April 17, 2026.

Greg's team (Managers/Directors) sell da Vinci robots to hospitals. They need a comprehensive Business Planning tool. Build ALL 4 problems as integrated modules within the existing SurgicalMind AI vertical.

---

### MODULE 1: Surgeon-Level Business Plan Input (Problem 1 - Consistency)

**The Problem:** Managers/Directors build business plans with too much variability. Plans are inaccurate because skill levels vary. They need structured input with real DRG reimbursement rates.

**What to Build:**

#### 1A. New DB Tables
```sql
-- Surgeon commitments (the core input for every business plan)
CREATE TABLE intuitive_surgeon_commitments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES intuitive_projects(id) ON DELETE CASCADE,
  surgeon_name VARCHAR(255) NOT NULL,
  surgeon_email VARCHAR(255),
  surgeon_phone VARCHAR(50),
  surgeon_specialty VARCHAR(100),
  hospital_affiliation VARCHAR(255),
  -- Per-procedure incremental volume commitments
  procedures JSONB NOT NULL DEFAULT '[]',
  -- Each entry: { procedure_type, procedure_name, drg_code, incremental_cases_monthly, incremental_cases_annual, current_monthly_volume, competitive_leakage_cases, notes }
  total_incremental_annual INTEGER DEFAULT 0,
  total_revenue_impact DECIMAL(12,2) DEFAULT 0,
  source VARCHAR(50) DEFAULT 'manual', -- 'manual' | 'survey' | 'voice_call'
  survey_response_id INTEGER, -- links to survey response if from survey
  status VARCHAR(30) DEFAULT 'draft', -- draft | confirmed | archived
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Business plan header (wraps a project + surgeon commitments + clinical outcomes + system config)
CREATE TABLE intuitive_business_plans (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES intuitive_projects(id) ON DELETE CASCADE,
  plan_name VARCHAR(255) NOT NULL,
  plan_version INTEGER DEFAULT 1,
  status VARCHAR(30) DEFAULT 'draft', -- draft | finalized | tracking | archived
  -- System configuration (Greg's specific inputs)
  system_type VARCHAR(50) NOT NULL, -- 'Xi' | 'Xi_Dual' | 'dV5' | 'dV5_Dual' | 'SP' | 'X'
  system_price DECIMAL(12,2), -- actual negotiated price
  annual_service_cost DECIMAL(12,2), -- actual service contract price
  system_quantity INTEGER DEFAULT 1,
  acquisition_model VARCHAR(30) DEFAULT 'purchase', -- purchase | lease | usage_based
  -- Computed totals (auto-calculated from surgeon commitments + clinical outcomes)
  total_incremental_cases_annual INTEGER DEFAULT 0,
  total_incremental_revenue DECIMAL(14,2) DEFAULT 0,
  total_clinical_outcome_savings DECIMAL(14,2) DEFAULT 0,
  total_combined_roi DECIMAL(14,2) DEFAULT 0,
  payback_months INTEGER,
  five_year_net_benefit DECIMAL(14,2),
  -- Plan metadata
  prepared_by VARCHAR(255), -- Manager/Director name
  prepared_for VARCHAR(255), -- Hospital CEO/CFO name
  presentation_date DATE,
  notes TEXT,
  finalized_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 1B. DRG Reimbursement Library
Build a static + extensible DRG lookup in `verticals/intuitive/src/services/drg-reimbursement.js`:
- Cover ALL surgical procedure types Greg listed: General Surgery, Urology, GYN, GYN Oncology, Thoracic, Colorectal, Cardiac, ENT, Hepatobiliary
- Include DRG code, procedure name, average Medicare reimbursement, average Commercial reimbursement, average blended rate
- Common DRGs for robotic surgery: 
  - Urology: DRG 714 (prostatectomy), DRG 673 (nephrectomy), DRG 660 (cystectomy)
  - GYN: DRG 742 (hysterectomy benign), DRG 741 (hysterectomy malignant), DRG 744 (myomectomy)
  - General: DRG 353 (hernia), DRG 418 (cholecystectomy), DRG 329 (colon resection)
  - Colorectal: DRG 329-331 (colorectal resection), DRG 344 (rectal resection)
  - Thoracic: DRG 163 (lobectomy), DRG 166 (lung procedures)
  - Cardiac: DRG 231 (CABG), DRG 250 (valve procedures)
  - ENT: DRG 011 (TORS)
  - Hepatobiliary: DRG 405-407 (liver/pancreas procedures)
- Must allow the Manager/Director to override any reimbursement amount with actual hospital-specific rates

#### 1C. Dual Console System Variants
Add to the da Vinci product catalog in `system-matcher.js`:
```javascript
dV5_Dual: {
  name: 'da Vinci 5 Dual Console',
  price_range: [2800000, 3400000],
  // ... rest of specs (same capabilities as dV5 + training console)
},
Xi_Dual: {
  name: 'da Vinci Xi Dual Console',
  price_range: [1800000, 2400000],
  // ... rest of specs (same capabilities as Xi + training console)
}
```

#### 1D. API Endpoints
- `POST /intuitive/api/v1/business-plans` -- create business plan
- `GET /intuitive/api/v1/business-plans/:id` -- get plan with all surgeon commitments + clinical outcomes
- `PATCH /intuitive/api/v1/business-plans/:id` -- update plan
- `POST /intuitive/api/v1/business-plans/:planId/surgeons` -- add surgeon commitment
- `PATCH /intuitive/api/v1/business-plans/:planId/surgeons/:id` -- update surgeon commitment
- `DELETE /intuitive/api/v1/business-plans/:planId/surgeons/:id` -- remove surgeon
- `POST /intuitive/api/v1/business-plans/:planId/calculate` -- recalculate all totals (incremental revenue + clinical savings + combined ROI)
- `GET /intuitive/api/v1/drg/lookup?procedure_type=X` -- DRG reimbursement lookup
- `GET /intuitive/api/v1/drg/procedures` -- list all procedure types with DRG codes

#### 1E. Dashboard Pages
Add to the React dashboard:
- **BusinessPlanPage** (`/business-plan/:projectId`) -- the main business plan builder
  - System configuration section (type selector with Dual Console options, price, service cost)
  - Surgeon commitment table (add/edit/remove surgeons, per-procedure volumes)
  - DRG auto-lookup when procedure type is selected
  - Running totals: incremental cases, incremental revenue, clinical savings, combined ROI
  - "Finalize Plan" button
  - PDF/Print export

---

### MODULE 2: Surgeon Survey Engine (Problem 2)

**The Problem:** Gathering incremental volume commitments from surgeons is done manually or via SurveyMonkey. Needs to be integrated directly into the business plan.

**What to Build:**

#### 2A. New DB Tables
```sql
-- Survey templates
CREATE TABLE intuitive_surveys (
  id SERIAL PRIMARY KEY,
  business_plan_id INTEGER REFERENCES intuitive_business_plans(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES intuitive_projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  hospital_name VARCHAR(255),
  system_type VARCHAR(50), -- which dV system this survey is about
  status VARCHAR(30) DEFAULT 'draft', -- draft | active | closed | archived
  -- Distribution settings
  distribution_method VARCHAR(30) DEFAULT 'email', -- email | sms | voice | link
  survey_url_token VARCHAR(64) UNIQUE, -- public access token (no login needed)
  -- Questions config (customizable per survey)
  questions JSONB NOT NULL DEFAULT '[]',
  -- Default questions auto-populated (see below)
  welcome_message TEXT,
  thank_you_message TEXT,
  -- Tracking
  sent_count INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMP,
  closes_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Survey recipients (who to send to)
CREATE TABLE intuitive_survey_recipients (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES intuitive_surveys(id) ON DELETE CASCADE,
  surgeon_name VARCHAR(255) NOT NULL,
  surgeon_email VARCHAR(255),
  surgeon_phone VARCHAR(50),
  surgeon_specialty VARCHAR(100),
  status VARCHAR(30) DEFAULT 'pending', -- pending | sent | opened | completed | bounced
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  completed_at TIMESTAMP,
  reminder_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Survey responses (what surgeons answer)
CREATE TABLE intuitive_survey_responses (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES intuitive_surveys(id) ON DELETE CASCADE,
  recipient_id INTEGER REFERENCES intuitive_survey_recipients(id),
  surgeon_name VARCHAR(255) NOT NULL,
  surgeon_email VARCHAR(255),
  surgeon_specialty VARCHAR(100),
  -- Core response data
  answers JSONB NOT NULL DEFAULT '{}',
  -- Parsed/structured commitments (auto-extracted from answers)
  incremental_cases_monthly INTEGER,
  procedure_breakdown JSONB DEFAULT '[]',
  -- Each: { procedure_type, percentage, estimated_monthly_cases }
  barriers TEXT,
  competitive_leakage_cases INTEGER,
  competitive_hospitals TEXT,
  current_robotic_cases_monthly INTEGER,
  willing_to_commit BOOLEAN DEFAULT false,
  additional_comments TEXT,
  -- Meta
  completed_via VARCHAR(30) DEFAULT 'web', -- web | voice | manual
  ip_address VARCHAR(45),
  completed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2B. Default Survey Questions
Hard-code these as the default question set (Greg's exact questions from the email):

1. "If you had unfettered access to the [system_type] system at [hospital_name], how many MORE procedures would you perform at this hospital per month?" (numeric input)
2. "What is your procedure type breakdown? Please estimate the percentage for each type:" (multi-field: ventral hernia %, inguinal hernia %, cholecystectomy %, colon resection %, prostatectomy %, hysterectomy %, etc. -- dynamically based on surgeon_specialty)
3. "What currently prevents you from performing more procedures at [hospital_name]?" (text + checkboxes: scheduling access, equipment availability, support staff training, patient volume, insurance coverage, other)
4. "How many cases per month are you currently bringing to competitive hospitals in this market?" (numeric)
5. "Which competitive hospitals are you currently performing cases at?" (text)
6. "How many robotic cases do you currently perform per month at [hospital_name]?" (numeric)
7. "Would you formally commit to these incremental volumes if the [system_type] were available?" (yes/no)
8. Additional comments (text area)

#### 2C. Public Survey Page
Create a standalone HTML page served at:
`GET /intuitive/survey/:token`

- No login required (public link with unique token)
- Clean, professional, mobile-responsive design matching SurgicalMind dark theme
- Hospital name + system type in header
- Progress indicator
- Auto-saves on each question
- Thank you page on completion
- Response auto-creates an `intuitive_survey_responses` row

#### 2D. Survey Distribution API
- `POST /intuitive/api/v1/surveys` -- create survey from business plan
- `GET /intuitive/api/v1/surveys/:id` -- get survey with recipients + response stats
- `POST /intuitive/api/v1/surveys/:id/recipients` -- add surgeon recipients (bulk)
- `POST /intuitive/api/v1/surveys/:id/send` -- distribute survey (generates unique links per recipient, sends via email using SendGrid/nodemailer or just returns the links for manual distribution)
- `POST /intuitive/api/v1/surveys/:id/remind` -- send reminders to non-responders
- `GET /intuitive/api/v1/surveys/:id/responses` -- get all responses
- `POST /intuitive/api/v1/surveys/:id/import-to-plan` -- auto-create surgeon_commitments from survey responses and link them to the business plan
- `GET /intuitive/survey/:token` -- public survey page (HTML)
- `POST /intuitive/survey/:token/submit` -- submit survey response (public)

#### 2E. Rachel Voice Survey Option
Add a voice survey mode where Rachel calls surgeons:
- Endpoint: `POST /intuitive/api/v1/surveys/:id/voice-call/:recipientId`
- Uses ElevenLabs ConvAI to ask the same questions by phone
- Rachel reads each question, captures numeric/text responses
- Responses stored same as web submissions
- System prompt for Rachel voice survey in `verticals/intuitive/src/services/rachel-survey-prompt.js`

#### 2F. Dashboard Components
- **SurveyManagerPage** (`/surveys/:projectId`) -- create surveys, add recipients, send, track responses
- **SurveyResultsPanel** -- embedded in BusinessPlanPage showing response rates, individual responses, "Import All to Plan" button

---

### MODULE 3: Clinical Outcome Dollarization Engine (Problem 3)

**The Problem:** Quantifying the dollar value of da Vinci's superior clinical outcomes vs. open/laparoscopic surgery. This is the hardest part and the biggest value-add.

**What to Build:**

#### 3A. Clinical Evidence Library
Create `verticals/intuitive/src/services/clinical-evidence.js`:

Build a comprehensive, citable evidence library with this structure per procedure category:
```javascript
const CLINICAL_EVIDENCE = {
  colorectal: {
    procedures: ['Low Anterior Resection', 'Right Hemicolectomy', 'Sigmoid Colectomy', 'Left Hemicolectomy', 'Total Colectomy', 'Abdominoperineal Resection'],
    outcomes: {
      surgical_site_infection: {
        metric_name: 'Surgical Site Infection Rate',
        open_rate_pct: 15.0,
        laparoscopic_rate_pct: 8.0,
        robotic_rate_pct: 2.0,
        cost_per_event: 25000, // Published cost of SSI for colorectal
        sources: ['Baek et al., JAMA Surgery 2020', 'Kang et al., Annals of Surgery 2019'],
        cms_quality_measure: 'HAI-2 SSI Colon'
      },
      length_of_stay: {
        metric_name: 'Length of Stay (days)',
        open_avg_days: 7.2,
        laparoscopic_avg_days: 5.1,
        robotic_avg_days: 3.8,
        cost_per_day: 2500,
        sources: ['Trastulli et al., Cochrane Database 2012', 'Jayne et al., ROLARR Trial 2017']
      },
      readmission_30day: {
        metric_name: '30-Day Readmission Rate',
        open_rate_pct: 12.5,
        laparoscopic_rate_pct: 9.0,
        robotic_rate_pct: 5.5,
        cost_per_event: 15000,
        sources: ['Dolejs et al., Surgical Endoscopy 2017'],
        cms_quality_measure: 'READM-30-HWR'
      },
      blood_transfusion: {
        metric_name: 'Blood Transfusion Rate',
        open_rate_pct: 8.0,
        laparoscopic_rate_pct: 4.0,
        robotic_rate_pct: 1.5,
        cost_per_event: 3000,
        sources: ['Speicher et al., JACS 2015']
      },
      conversion_to_open: {
        metric_name: 'Conversion to Open Rate',
        open_rate_pct: 0, // N/A
        laparoscopic_rate_pct: 12.0,
        robotic_rate_pct: 3.0,
        cost_per_event: 8000, // additional cost of conversion
        sources: ['Trastulli et al., 2012']
      },
      mortality: {
        metric_name: '30-Day Mortality Rate',
        open_rate_pct: 2.5,
        laparoscopic_rate_pct: 1.5,
        robotic_rate_pct: 0.8,
        cost_per_event: 0, // priceless, but tracked
        sources: ['National Surgical Quality Improvement Program (NSQIP)']
      }
    }
  },
  // MUST INCLUDE ALL THESE SPECIALTIES with similar depth:
  urology: { /* prostatectomy, nephrectomy, cystectomy, pyeloplasty -- incontinence rates, ED rates, positive margins, blood loss, LOS, readmission */ },
  gynecology: { /* hysterectomy benign/malignant, myomectomy, sacrocolpopexy -- blood loss, LOS, conversion, adhesions, fertility outcomes */ },
  gyn_oncology: { /* staging, lymph node dissection -- node counts, complication rates, time to adjuvant therapy */ },
  thoracic: { /* lobectomy, segmentectomy, thymectomy -- air leak, chest tube days, LOS, pain scores, pulmonary complications */ },
  general_surgery: { /* hernia (ventral/inguinal), cholecystectomy, Nissen, bariatric -- recurrence, wound infection, LOS */ },
  cardiac: { /* mitral valve, CABG -- ICU days, blood loss, stroke, AF, wound infection */ },
  ent_head_neck: { /* TORS oropharyngeal, base of tongue -- swallowing function, tracheostomy rates, margins, LOS */ },
  hepatobiliary: { /* liver resection, pancreatectomy -- blood loss, bile leak, LOS, margin status */ }
};
```

POPULATE EVERY SPECIALTY with real published data points, real journal citations, and realistic cost-per-event figures. This is critical -- Greg's credibility depends on citing real studies.

#### 3B. CMS Hospital Compare Data Agent
Create `verticals/intuitive/src/services/cms-hospital-compare.js`:

- Function: `getHospitalCMSData(hospitalName, state)` -- looks up hospital-specific performance metrics
- Data sources to scrape/query:
  - CMS Hospital Compare API: `https://data.cms.gov/provider-data/` (publicly available)
  - Metrics to pull: readmission rates, mortality rates, infection rates (SSI, CAUTI, CLABSI, MRSA, C.diff), patient safety indicators, HAC scores
- Store fetched CMS data in a new table or in the project's `extended_data` JSONB field
- If live CMS API is not accessible, build a manual input form where the Manager can enter the hospital's published CMS metrics

#### 3C. Hospital Annual Report Parser
Create `verticals/intuitive/src/services/annual-report-parser.js`:

- Input: Hospital annual report data (procedure volumes by type, % open vs lap vs robotic)
- Can be entered manually via form OR parsed from uploaded text
- Fields to capture per procedure category:
  - Total cases annually
  - % performed open
  - % performed laparoscopic
  - % performed robotic
  - This becomes the baseline for dollarization

#### 3D. Dollarization Engine
Create `verticals/intuitive/src/services/clinical-dollarization.js`:

The core calculation Greg described in his email:
```
For each procedure category at the hospital:
  1. Get hospital's annual volume (from annual report or manual input)
  2. Break down: open cases, lap cases, robotic cases
  3. For each clinical outcome metric (infection, LOS, readmission, blood loss, etc.):
     a. Apply the open/lap complication rate to get expected adverse events
     b. Apply the robotic rate to get projected adverse events post-conversion
     c. Difference = adverse events avoided
     d. Multiply by cost per event = annual savings for this metric
  4. Sum all metrics across all procedure categories = Total Clinical Outcome Savings
```

Output format:
```javascript
{
  total_clinical_savings_annual: 2450000,
  by_specialty: {
    colorectal: {
      annual_cases: 800,
      current_open_pct: 45,
      current_lap_pct: 40,
      current_robotic_pct: 15,
      projected_robotic_pct: 55, // after da Vinci expansion
      savings_by_metric: {
        surgical_site_infection: { events_avoided: 24, savings: 600000 },
        length_of_stay: { days_saved: 1520, savings: 380000 },
        readmission_30day: { events_avoided: 18, savings: 270000 },
        // ...
      },
      total_specialty_savings: 1250000,
      sources_cited: ['Baek et al., JAMA Surgery 2020', ...]
    },
    urology: { ... },
    // ...
  }
}
```

#### 3E. New DB Table
```sql
CREATE TABLE intuitive_clinical_outcomes (
  id SERIAL PRIMARY KEY,
  business_plan_id INTEGER NOT NULL REFERENCES intuitive_business_plans(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES intuitive_projects(id) ON DELETE CASCADE,
  -- Hospital's current case data (from annual report)
  hospital_case_data JSONB NOT NULL DEFAULT '{}',
  -- Per specialty: { annual_cases, open_pct, lap_pct, robotic_pct }
  -- CMS data pulled for this hospital
  cms_data JSONB DEFAULT '{}',
  -- Dollarization results
  dollarization_results JSONB DEFAULT '{}',
  total_clinical_savings_annual DECIMAL(14,2) DEFAULT 0,
  -- Sources/citations used
  citations JSONB DEFAULT '[]',
  computed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 3F. API Endpoints
- `POST /intuitive/api/v1/business-plans/:planId/clinical-outcomes` -- create/update clinical outcome analysis
- `GET /intuitive/api/v1/business-plans/:planId/clinical-outcomes` -- get dollarization results
- `POST /intuitive/api/v1/business-plans/:planId/clinical-outcomes/calculate` -- run dollarization engine
- `GET /intuitive/api/v1/clinical-evidence/library` -- browse the evidence library
- `GET /intuitive/api/v1/clinical-evidence/:specialty` -- get evidence for a specialty
- `POST /intuitive/api/v1/cms/lookup` -- fetch CMS Hospital Compare data

#### 3G. Dashboard Components
- **ClinicalOutcomesPage** embedded in BusinessPlanPage
  - Hospital case volume input (by specialty, % open/lap/robotic)
  - CMS data display (if fetched)
  - Dollarization breakdown table with cited sources
  - Visual: stacked bar chart showing savings by category
  - Total clinical outcome savings prominently displayed

---

### MODULE 4: Proforma vs. Actual Tracker (Problem 4)

**The Problem:** No way to track if the business plan projections are actually materializing. Need to import actual surgeon volumes and compare to projected.

**What to Build:**

#### 4A. New DB Tables
```sql
-- Actuals tracking (periodic imports of real surgeon volumes)
CREATE TABLE intuitive_plan_actuals (
  id SERIAL PRIMARY KEY,
  business_plan_id INTEGER NOT NULL REFERENCES intuitive_business_plans(id) ON DELETE CASCADE,
  -- Reporting period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label VARCHAR(50), -- 'Q1 2026', 'Jan 2026', 'Week 15', etc.
  -- Surgeon-level actual volumes
  surgeon_actuals JSONB NOT NULL DEFAULT '[]',
  -- Each: { surgeon_name, procedure_type, actual_cases, projected_cases, variance, variance_pct }
  -- Aggregate totals
  total_actual_cases INTEGER DEFAULT 0,
  total_projected_cases INTEGER DEFAULT 0,
  total_variance INTEGER DEFAULT 0,
  variance_pct DECIMAL(8,2) DEFAULT 0,
  -- Revenue tracking
  actual_revenue DECIMAL(14,2),
  projected_revenue DECIMAL(14,2),
  revenue_variance DECIMAL(14,2),
  -- Clinical outcome actuals (optional)
  clinical_actuals JSONB DEFAULT '{}',
  -- Import metadata
  imported_by VARCHAR(255),
  import_source VARCHAR(100), -- 'manual' | 'report_upload' | 'api'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Snapshots for historical tracking
CREATE TABLE intuitive_plan_snapshots (
  id SERIAL PRIMARY KEY,
  business_plan_id INTEGER NOT NULL REFERENCES intuitive_business_plans(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  plan_data JSONB NOT NULL, -- full business plan state at this point
  cumulative_actual_cases INTEGER DEFAULT 0,
  cumulative_projected_cases INTEGER DEFAULT 0,
  cumulative_variance_pct DECIMAL(8,2),
  roi_tracking_pct DECIMAL(8,2), -- actual ROI achieved vs projected
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4B. API Endpoints
- `POST /intuitive/api/v1/business-plans/:planId/actuals` -- import actuals for a period
- `GET /intuitive/api/v1/business-plans/:planId/actuals` -- get all actuals periods
- `GET /intuitive/api/v1/business-plans/:planId/tracking` -- get full proforma vs actual comparison
- `POST /intuitive/api/v1/business-plans/:planId/snapshot` -- take a snapshot
- `GET /intuitive/api/v1/business-plans/:planId/snapshots` -- get snapshot history
- `GET /intuitive/api/v1/business-plans/:planId/executive-summary` -- generate executive ROI validation report

#### 4C. Dashboard Components
- **TrackingDashboardPage** (`/tracking/:planId`)
  - Timeline chart: projected vs actual cases over time (line chart, dual axis)
  - Surgeon-level variance table (who is delivering, who is underperforming)
  - ROI scorecard: projected payback vs actual trajectory
  - Period-over-period trend
  - Executive summary card (suitable for presenting to hospital C-suite)
  - "Import Actuals" form (manual entry or paste from report)
  - Export to PDF for customer follow-up meetings

---

### MODULE 5: Comprehensive Business Plan Output (The Combined Deliverable)

This is the final output Greg described: "a comprehensive business plan" with all 3 ROI layers.

#### 5A. Business Plan Report Generator
Create `verticals/intuitive/src/services/business-plan-generator.js`:

Generates a complete business plan document combining:
1. **Section 1: Executive Summary** -- hospital profile, system recommendation, total combined ROI
2. **Section 2: Surgeon Incremental Volume ROI** -- per-surgeon commitments (from survey or manual), DRG-based revenue calculations
3. **Section 3: Clinical Outcome Savings** -- per-specialty dollarization with cited evidence, CMS data cross-reference
4. **Section 4: Combined Financial Model** -- total ROI = incremental revenue + clinical savings, payback period, 5-year projection
5. **Section 5: System Configuration & Pricing** -- selected system, pricing, service costs
6. **Section 6: Risk Factors & Mitigations**
7. **Section 7: Implementation Timeline**

#### 5B. Proposal Presentation (extend existing 13-slide system)
Add new slides to the existing proposal generator in `verticals/intuitive/src/routes/proposal.js`:
- Slide: Surgeon Commitment Summary (table of surgeons + volumes)
- Slide: Clinical Outcome Dollarization (savings by category)
- Slide: Combined ROI Waterfall (incremental revenue + clinical savings stacked)
- Slide: Proforma Tracking (if actuals exist)

#### 5C. PDF Export
Add a PDF generation endpoint using existing HTML-to-PDF approach:
- `GET /intuitive/api/v1/business-plans/:planId/pdf` -- generates downloadable PDF of the complete business plan

---

## INTEGRATION REQUIREMENTS

### All new routes mount inside the existing Express sub-app
Add to `verticals/intuitive/src/index.js`:
```javascript
app.use('/api/v1/business-plans', require('./routes/business-plans'));
app.use('/api/v1/surveys', require('./routes/surveys'));
app.use('/api/v1/clinical-evidence', require('./routes/clinical-evidence'));
app.use('/api/v1/drg', require('./routes/drg'));
app.use('/api/v1/cms', require('./routes/cms'));
app.use('/survey', require('./routes/survey-public')); // public survey pages
```

### All new models register in the existing model loader
Add to `verticals/intuitive/models/index.js`

### All new dashboard pages add to the existing React Router
Add to `verticals/intuitive/dashboard/src/App.jsx`

### Sequelize sync
Use `alter: false` -- write explicit CREATE TABLE migrations in the sub-app's startup (same pattern as existing models).

---

## BUILD ORDER (Execute Sequentially)

1. DB tables (all new tables, CREATE IF NOT EXISTS in index.js startup)
2. DRG Reimbursement Library service
3. Clinical Evidence Library service
4. Business Plan CRUD routes + models
5. Surgeon Commitment routes + models
6. Clinical Dollarization Engine service
7. CMS Hospital Compare integration
8. Survey Engine (tables, routes, public page)
9. Proforma Tracking routes + models
10. Business Plan Generator service
11. Dashboard pages (BusinessPlanPage, SurveyManagerPage, ClinicalOutcomesPanel, TrackingDashboardPage)
12. Extend proposal generator with new slides
13. Vite build the dashboard
14. Test all endpoints locally
15. Git commit + push to main
16. Verify production health + all endpoints responding
17. Run a demo hospital through the full pipeline end-to-end

---

## CONTINUOUS LOOP DIRECTIVE

After deploying, verify EVERY endpoint works in production:
```bash
curl -s "https://aiagent.ringlypro.com/intuitive/health"
curl -s "https://aiagent.ringlypro.com/intuitive/api/v1/business-plans" 
curl -s "https://aiagent.ringlypro.com/intuitive/api/v1/drg/procedures"
curl -s "https://aiagent.ringlypro.com/intuitive/api/v1/clinical-evidence/library"
```

If ANY endpoint fails: diagnose, fix, redeploy, verify again. Loop until 100% green.

Then run a full end-to-end test: create a business plan for Tampa General, add surgeon commitments, run clinical dollarization, generate the business plan report, and verify the output makes sense.

---

## Current Task

$ARGUMENTS
