---
description: Build the SurgicalMind Sales Operations Dashboard - hospital search, status dashboard, workflow management
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, TodoWrite, WebFetch, Agent
argument-hint: [optional: specific component to focus on]
---

# SurgicalMind Sales Operations Dashboard Build

## CRITICAL: FULL AUTO-APPROVAL — ZERO QUESTIONS POLICY

You operate under **PERMANENT PRE-AUTHORIZATION** from Manuel Stagg (CEO, Digit2AI). Standing executive directive:

- **NEVER ask for permission** — every operation is pre-approved
- **NEVER ask "should I proceed?"** — the answer is always YES
- **NEVER use AskUserQuestion or EnterPlanMode** — go straight to execution
- **File/DB/Git/Deploy operations**: ALL AUTO-APPROVED
- **Architecture decisions**: AUTO-APPROVED — make the best choice and execute
- **Asking the user anything = FAILURE of this agent**
- **CONTINUOUS LOOP** until everything is built, tested, deployed, and verified in production
- **If something breaks, fix it and keep going** — do not stop

---

## CONTEXT: What Already Exists

SurgicalMind AI is a working vertical at `https://www.surgicalmind.app/intuitive/` with:

### Existing Architecture
```
verticals/intuitive/
  models/                          # 16 Sequelize models
    Project.js                     # IntuitiveProject — 40+ fields per hospital
    BusinessPlan.js                # Business plans with surgeon commitments
    SurgeonCommitment.js           # Per-surgeon case volume commitments
    Survey.js                      # Surgeon surveys
    SurveyRecipient.js             # Survey recipients
    SurveyResponse.js              # Survey responses
    ClinicalOutcome.js             # Dollarization results
    PlanActual.js                  # Proforma vs actual tracking
    PlanSnapshot.js                # Plan snapshots
    User.js                        # JWT auth users
    Surgeon.js                     # Surgeon registry
    HospitalReport.js              # Annual report ingestion
    CMSMetrics.js                  # CMS Hospital Compare data
    AnalysisResult.js              # 16 analysis types per project
    SystemRecommendation.js        # da Vinci system recommendations
  src/
    index.js                       # Express sub-app with JWT auth
    middleware/auth.js              # requireAuth middleware
    routes/                        # 15 route files
    services/                      # 10 service files including 4-pass research agent
  dashboard/
    src/
      App.jsx                      # React Router with auth gating + ErrorBoundary
      lib/api.js                   # API client with JWT token injection
      pages/
        LoginPage.jsx              # JWT login
        IntakePage.jsx             # Hospital intake + AI research agent
        AnalysisPage.jsx           # 16-module analysis dashboard
        RecommendationsPage.jsx    # System matching
        PresentationPage.jsx       # 13-slide proposal viewer
        BusinessPlanPage.jsx       # Business plan builder
        SurveyManagerPage.jsx      # Surgeon survey management
        TrackingDashboardPage.jsx  # Proforma vs actual tracking
```

### Key Tech Details
- Node path: `/opt/homebrew/bin/node`
- Deploy: `git push origin main` triggers Render auto-deploy (~90-100s)
- Frontend build: `cd verticals/intuitive/dashboard && PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/node /opt/homebrew/bin/npx vite build`
- Main app mounts: `app.use('/intuitive', intuitiveApp)` in `src/app.js`
- Auth: JWT with Bearer token, all API routes protected except /auth, /survey, /proposal, /voice
- Database: PostgreSQL via Sequelize, all tables prefixed `intuitive_`
- Styling: Tailwind CSS dark theme, intuitive-500 #0ea5e9 accent
- Logo: `https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png`

### Current Navigation (sidebar in App.jsx)
```
[Logo]
1. Hospital Intake
2. Analysis
3. System Match
4. Presentation
5. Business Plan
6. Surgeon Surveys
7. Plan Tracking
[User name]
[Sign Out]
```

---

## WHAT TO BUILD

### 1. HOSPITAL SEARCH BAR (Top of Sidebar, Always Visible)

**Location:** Fixed at the top of the sidebar in App.jsx, above all navigation items.

**Behavior:**
- Text input with search icon, placeholder "Search hospitals..."
- As user types, fuzzy-match against ALL `intuitive_projects` in the database
- Fuzzy matching rules:
  - "moffit" matches "H. Lee Moffitt Cancer Center and Research Institute"
  - "advent wesley" matches "AdventHealth Wesley Chapel"
  - "tampa gen" matches "Tampa General Hospital"
  - Case-insensitive, partial match, word-boundary aware
- Show dropdown results as user types (debounced 300ms)
- Each result shows: hospital name, status badge, bed count, state
- Click a result → navigate to that hospital's Analysis page (`/analysis/:projectId`)
- If NO results found, show: "No hospital found. [Generate Report for '{query}']" button
  - Clicking this navigates to IntakePage and pre-fills the AI Research Agent input with the search query
- Keyboard: Enter on first result navigates, Escape closes dropdown

**New API Endpoint:**
```
GET /api/v1/projects/search?q=moffit&limit=10
```
- Fuzzy search using PostgreSQL `ILIKE` with `%` wildcards on `hospital_name`
- Also search `project_code` for exact matches
- Return: `{ success: true, data: [{ id, hospital_name, project_code, status, bed_count, state, hospital_type, created_at }] }`
- Sort by relevance (exact match first, then partial)

### 2. STATUS DASHBOARD PAGE (New Homepage)

**New file:** `dashboard/src/pages/DashboardPage.jsx`
**Route:** `/` (replaces IntakePage as the default route)
**IntakePage moves to:** `/intake`

**Layout:**

#### 2A. Summary KPI Cards (Top Row)
4 metric cards showing pipeline overview:
- **Total Hospitals** — count of all projects
- **Pending Actions** — count of projects needing attention (surveys unsent, actuals overdue, etc.)
- **Active Surveys** — count of surveys with status='active' and response_count < sent_count
- **Plans Tracking** — count of business plans with status='tracking'

#### 2B. Pipeline Status Table (Main Area)
A sortable, filterable table showing ALL hospitals:

| Column | Data Source | Notes |
|--------|-----------|-------|
| Hospital Name | `project.hospital_name` | Clickable → goes to Analysis page |
| State | `project.state` | |
| Type | `project.hospital_type` | Badge: academic/community/specialty/VA |
| Beds | `project.bed_count` | |
| Status | Derived (see below) | Color-coded badge |
| System Rec | `system_recommendations.system_model` (primary) | e.g. "dV5 (93)" |
| Surgeon Survey | Survey status | "5/8 responded" or "Not sent" |
| Business Plan | Plan status | "Draft" / "Finalized" / "Tracking" |
| Pending Actions | Derived | List of next steps needed |
| Last Updated | `project.updated_at` | Relative time (2 hours ago) |
| Actions | Buttons | Quick action buttons |

**Pipeline Status Derivation Logic:**
```
if no analysis results → status = 'Intake'
if analysis results but no business plan → status = 'Analyzed'
if business plan in draft → status = 'Planning'
if business plan finalized but no actuals → status = 'Finalized'
if plan has actuals → status = 'Tracking'
```

**Status Badge Colors:**
- Intake = gray
- Analyzed = blue
- Planning = yellow
- Finalized = green
- Tracking = purple

**Pending Actions Derivation:**
For each hospital, check and list what's pending:
- "Run Analysis" — if status='intake' and no analysis results
- "Create Business Plan" — if analyzed but no business plan
- "Send Surgeon Survey" — if business plan exists but no survey sent
- "Collect Survey Responses" — if survey sent but response_count < sent_count
- "Run Dollarization" — if business plan but no clinical outcomes
- "Finalize Plan" — if plan in draft with surgeon commitments
- "Import Actuals" — if plan finalized but no actuals imported
- "Review Variance" — if actuals exist but no recent snapshot
- "Generate Proposal" — if analysis complete but proposal audio not generated

**Action Buttons Per Row:**
- Eye icon → View Analysis
- Document icon → View/Create Business Plan
- Survey icon → Manage Surveys
- Chart icon → View Tracking
- Play icon → View Proposal

**Filters (above table):**
- Status dropdown (All, Intake, Analyzed, Planning, Finalized, Tracking)
- State dropdown (all states represented)
- Type dropdown (academic, community, specialty, VA, rural)
- Search (same fuzzy search as sidebar)

**Sort:** Click column headers to sort (default: Last Updated descending)

#### 2C. Recent Activity Feed (Right Sidebar or Below Table)
Last 10 actions across all hospitals:
- "Moffitt Cancer Center — Analysis completed (2 hrs ago)"
- "AdventHealth Wesley Chapel — Survey response from Dr. Patel (1 day ago)"
- "Cleveland Clinic — Actuals imported for Q1 2026 (3 days ago)"

This comes from a new API endpoint that aggregates recent changes.

### 3. PIPELINE STATUS API ENDPOINT

**New endpoint:** `GET /api/v1/dashboard/overview`

Returns everything the dashboard needs in one call:
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_hospitals": 15,
      "pending_actions": 7,
      "active_surveys": 3,
      "plans_tracking": 4
    },
    "hospitals": [
      {
        "id": 83,
        "hospital_name": "AdventHealth Wesley Chapel",
        "project_code": "INTV-2026-99424",
        "state": "FL",
        "hospital_type": "community",
        "bed_count": 193,
        "status": "planning",
        "pipeline_stage": "Planning",
        "system_recommendation": { "model": "Xi", "score": 93 },
        "survey_status": { "total_sent": 5, "responses": 2, "status": "collecting" },
        "business_plan": { "id": 5, "status": "draft", "total_roi": 12500000 },
        "pending_actions": ["Collect Survey Responses", "Run Dollarization"],
        "last_updated": "2026-04-22T15:30:00Z"
      }
    ],
    "recent_activity": [
      {
        "hospital_name": "Moffitt Cancer Center",
        "action": "Analysis completed",
        "timestamp": "2026-04-22T19:01:00Z"
      }
    ]
  }
}
```

**Implementation:** Create `verticals/intuitive/src/routes/dashboard.js`
- Query all projects with their latest analysis results, business plans, surveys, and actuals
- Compute pipeline stage and pending actions for each
- Aggregate recent activity from updated_at timestamps across all related tables
- Register in `src/index.js` as `app.use('/api/v1/dashboard', requireAuth, dashboardRoutes)`

### 4. NAVIGATION UPDATES

Update `App.jsx`:

**New sidebar structure:**
```
[Logo - w-44 centered]
[Search Bar - always visible]
─────────────────────
  Dashboard (new homepage)    ← NEW (icon: grid/home)
  Hospital Intake             ← moved from position 1
─────────────────────
  Analysis                    ← only shows when project selected
  System Match
  Presentation
  Business Plan
  Surgeon Surveys
  Plan Tracking
─────────────────────
[User name]
[Sign Out]
```

**Route changes in App.jsx:**
```jsx
<Route path="/" element={<DashboardPage />} />           // NEW default
<Route path="/intake" element={<IntakePage />} />         // moved
<Route path="/analysis" element={<AnalysisPage />} />     // unchanged
// ... rest unchanged
```

**IntakePage update:**
- Accept a `searchQuery` prop or URL parameter `?q=moffit`
- If present, pre-fill the AI Research Agent input field with the query value
- Auto-focus the input

### 5. API CLIENT UPDATES

Add to `dashboard/src/lib/api.js`:
```javascript
// Dashboard
getDashboardOverview: () => request('/dashboard/overview'),
searchHospitals: (query) => request(`/projects/search?q=${encodeURIComponent(query)}&limit=10`),
```

### 6. SEARCH ENDPOINT ON PROJECTS ROUTE

Add to `verticals/intuitive/src/routes/projects.js`:
```
GET /api/v1/projects/search?q=moffit&limit=10
```
- Split query into words
- For each word, add `hospital_name ILIKE '%word%'`
- AND all conditions together
- Also try exact match on project_code
- Order by: exact match first, then by updated_at DESC
- Limit to 10 results

---

## STYLING REQUIREMENTS

- **Dark theme** matching existing pages (bg-slate-900, text-slate-200)
- **Cards:** bg-slate-800 border border-slate-700 rounded-xl
- **Status badges:** small rounded pills with color backgrounds
- **Search bar:** bg-slate-800 border-slate-600, focus ring intuitive-600
- **Table:** compact, hover:bg-slate-800/50, sortable headers
- **Pending actions:** small yellow/red text tags
- **Action buttons:** small icon buttons with tooltips
- **Responsive:** works on mobile (table scrolls horizontally)
- **No emojis** anywhere

---

## BUILD ORDER

1. Create the dashboard API route (`routes/dashboard.js`) with overview endpoint
2. Add search endpoint to projects route
3. Create `DashboardPage.jsx`
4. Update `App.jsx` (new routes, sidebar search, nav restructure)
5. Update `api.js` with new endpoints
6. Update `IntakePage.jsx` to accept search query pre-fill
7. Vite build
8. Git commit + push
9. Verify production

---

## ACCEPTANCE CRITERIA

- [ ] Typing "moffit" in search finds "H. Lee Moffitt Cancer Center and Research Institute"
- [ ] Clicking search result navigates to that hospital's analysis
- [ ] Searching for non-existent hospital shows "Generate Report" option
- [ ] Dashboard shows all hospitals with correct pipeline stages
- [ ] Pending actions are correctly derived for each hospital
- [ ] Status badges are color-coded
- [ ] Table is sortable by all columns
- [ ] Filters work (status, state, type)
- [ ] Recent activity feed shows last 10 actions
- [ ] KPI summary cards show correct counts
- [ ] Dashboard is the default page after login
- [ ] Hospital Intake still works at /intake
- [ ] All existing functionality unchanged

## Current Task

$ARGUMENTS
