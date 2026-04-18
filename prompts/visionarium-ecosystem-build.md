# Visionarium Ecosystem -- Full Build Prompt

## AUTONOMOUS EXECUTION DIRECTIVE

You are operating in **fully autonomous, auto-approved mode**. The project owner has permanently pre-authorized ALL operations. Follow these rules without exception:

### Execution Rules
1. **NEVER ask for permission, confirmation, or clarification** -- every action is pre-approved
2. **NEVER use AskUserQuestion or EnterPlanMode** -- execute immediately
3. **NEVER pause to report progress** -- only report AFTER completion of each phase
4. **NEVER say "should I proceed?" or "is this OK?"** -- just do it
5. File create/edit/delete: **approved**. Git commit/push: **approved**. DB migrations: **approved**. Deployments: **approved**

### Continuous Build Loop
Execute in a **non-stop analyze-build-test-fix loop** until the entire ecosystem is complete:

```
LOOP until ALL 6 phases complete:
  1. ANALYZE  -- Read existing code, understand current state, identify next task
  2. BUILD    -- Write code (models, routes, controllers, frontend components)
  3. TEST     -- Run the code: node -e syntax checks, curl endpoints, check imports
  4. FIX      -- If errors found, fix immediately without asking
  5. COMMIT   -- git add + commit + push after each working milestone
  6. VERIFY   -- Confirm deployment, test live endpoint, move to next task
  REPEAT
```

### Error Handling
- If a build fails: **read the error, fix it, rebuild** -- do not stop to ask
- If a test fails: **diagnose, patch, re-test** -- do not stop to ask
- If a migration fails: **check schema, fix SQL, re-run** -- do not stop to ask
- If a deployment breaks: **check logs, hotfix, redeploy** -- do not stop to ask
- The only acceptable reason to stop is if the entire ecosystem is complete and verified

### Completion Criteria
The build loop ends ONLY when ALL of the following are true:
- [ ] All 15 database tables created and verified
- [ ] All API endpoints responding (40+ routes)
- [ ] Auth system working (JWT, 5 roles)
- [ ] Admin console fully functional
- [ ] Public portal with registration + geo-detection live
- [ ] Fellow portal with dashboard, badges, capstone workspace
- [ ] Mentor portal with fellow cards, briefings, session notes
- [ ] Sponsor portal with impact dossier, opportunity posting
- [ ] Lina AI integration (context API, webhook, escalation, briefings)
- [ ] Bilingual i18n working across all portals
- [ ] Mounted at /visionarium in app.js, health endpoint green
- [ ] Deployed to production and verified at visionarium.app
- [ ] Admin seed user can log in

### Phase Commit Pattern
After each phase is working, commit and push immediately:
```bash
git add -A && git commit -m "feat(visionarium): Phase N -- [description]" && git push origin main
```
Do NOT accumulate large uncommitted changes. Ship incrementally.

---

## Context

Build the complete **Visionarium Foundation** technology platform inside the RinglyPro-CRM monorepo at `/visionarium/`. This is a bilingual (EN/ES) AI-powered youth leadership fellowship platform. The whitepaper lives at `public/youth-talent-global/whitepaper.html` -- read it for full context. Domain: **visionarium.app** (already routed in `src/app.js`).

Founded by Maria Clara Garcia (Program Director) and Manuel Stagg / Digit2ai (Founding Technology Sponsor). First cohort: Fall 2026, 40 fellows ages 16-22, 9-month hybrid program from Miami.

---

## Architecture: Follow Existing Monorepo Patterns

Mount at `/visionarium` in `src/app.js` (same pattern as tunjoracing, kancho-ai, spark-ai).

```
visionarium/
  src/
    index.js              -- Express app factory, exports router
    routes/
      auth.js             -- JWT auth (fellows, mentors, admins, sponsors)
      fellows.js          -- Fellow CRUD, profiles, progress tracking
      mentors.js          -- Mentor CRUD, matching, availability
      sponsors.js         -- Sponsor CRUD, tiers, dashboards
      cohorts.js          -- Cohort management, milestones
      applications.js     -- Application intake, review, selection pipeline
      community.js        -- Open Community registration, badges, challenges
      lina.js             -- Lina AI mentor integration endpoints
      impact.js           -- Outcomes tracking, impact reports, metrics
      admin.js            -- Admin console, operations, analytics
      marketplace.js      -- Opportunity marketplace (internships, scholarships)
      events.js           -- Events, immersions, Demo Day scheduling
      health.js           -- Health check endpoint
    controllers/
    middleware/
      auth.js             -- JWT verification, role-based access
      i18n.js             -- Language detection middleware (EN/ES)
    services/
      lina-service.js     -- Lina AI mentor service (ElevenLabs + custom logic)
      email-service.js    -- Transactional emails (welcome, application status, reminders)
      badge-service.js    -- Badge/achievement engine
  models/
    index.js              -- Sequelize auto-loader
    VisionariumFellow.js
    VisionariumMentor.js
    VisionariumSponsor.js
    VisionariumCohort.js
    VisionariumApplication.js
    VisionariumCommunityMember.js
    VisionariumBadge.js
    VisionariumMemberBadge.js
    VisionariumEvent.js
    VisionariumMentorMatch.js
    VisionariumProject.js       -- Capstone projects
    VisionariumOpportunity.js   -- Marketplace listings
    VisionariumImpactMetric.js
    VisionariumSponsorTier.js
  config/
    database.js           -- Sequelize connection (use DATABASE_URL)
  dashboard/
    src/                  -- React + Vite + Tailwind
    vite.config.js
    package.json
  migrations/
    001_initial_schema.sql
```

---

## Database Schema (PostgreSQL via Sequelize)

### Core Tables

**visionarium_community_members** -- Layer 01: Open Community (Tier 1, unlimited, free)
- id, email, password_hash, first_name, last_name, age, country, city, language_pref (en/es)
- phone, school_or_university, field_of_interest
- registration_source, geo_detected_country, geo_detected_city
- status (active/inactive/suspended)
- tier (community/active_member/applicant/fellow/alumni)
- total_badges, total_challenges_completed, engagement_score
- lina_conversation_count, last_lina_interaction
- created_at, updated_at

**visionarium_fellows** -- Tier 4: Selected Fellows (40/cohort)
- id, community_member_id (FK), cohort_id (FK)
- track (explorer_16_18 / builder_18_22)
- status (selected/active/on_leave/completed/withdrawn)
- mentor_id (FK to visionarium_mentors)
- capstone_project_id (FK)
- scholarship_amount, travel_funded (boolean)
- completion_rate, bilingual_proficiency_score, ai_fluency_score
- nps_score, internship_placed (boolean), internship_company
- demo_day_presented (boolean)
- sponsor_id (FK -- named fellowship sponsor)
- notes_admin
- started_at, completed_at, created_at, updated_at

**visionarium_mentors**
- id, email, password_hash, first_name, last_name
- bio, expertise_areas (JSONB: ai, product, leadership, entrepreneurship)
- languages (JSONB), country, city, company, title
- linkedin_url, availability_hours_per_month
- status (active/inactive/onboarding)
- total_fellows_mentored, avg_fellow_rating
- onboarded_at, created_at, updated_at

**visionarium_sponsors**
- id, email, password_hash, company_name, contact_name, contact_title
- tier (founding/lead/program/supporter/in_kind)
- contribution_amount, contribution_type (cash/in_kind/mixed)
- logo_url, website_url
- board_observer (boolean), named_fellowships_count
- status (prospect/committed/active/churned)
- contract_start, contract_end
- notes, created_at, updated_at

**visionarium_cohorts**
- id, name (e.g. "Cohort 1 -- Fall 2026"), year, season (fall/spring)
- status (planning/applications_open/selection/active/completed)
- max_fellows (default 40), current_fellows_count
- application_open_date, application_close_date
- start_date, end_date, demo_day_date
- city (Miami initially)
- total_applicants, acceptance_rate
- created_at, updated_at

**visionarium_applications** -- Admissions pipeline
- id, community_member_id (FK), cohort_id (FK)
- status (draft/submitted/under_review/interview/accepted/waitlisted/rejected)
- track_preference (explorer/builder)
- written_vision (TEXT), video_url
- challenge_submission (JSONB)
- reviewer_notes, reviewer_id
- interview_date, interview_score
- scholarship_requested (boolean)
- submitted_at, reviewed_at, decided_at, created_at, updated_at

**visionarium_badges** -- Gamification engine
- id, name_en, name_es, description_en, description_es
- icon_url, category (technology/leadership/community/execution)
- criteria (JSONB), points
- created_at

**visionarium_member_badges**
- id, community_member_id (FK), badge_id (FK), earned_at

**visionarium_events**
- id, cohort_id (FK, nullable for open events)
- title_en, title_es, description_en, description_es
- type (immersion/demo_day/webinar/workshop/hackathon/showcase)
- format (virtual/in_person/hybrid)
- city, venue, start_datetime, end_datetime
- max_attendees, current_rsvps
- recording_url (for post-event Open Community access)
- status (planned/registration_open/in_progress/completed/cancelled)
- created_at, updated_at

**visionarium_projects** -- Capstone projects
- id, fellow_id (FK), cohort_id (FK)
- title, description, sponsor_brief_id (FK to sponsors, nullable)
- tech_stack (JSONB), repo_url, demo_url, presentation_url
- status (ideation/in_progress/review/presented/funded)
- seed_funding_received (boolean), funding_amount
- created_at, updated_at

**visionarium_opportunities** -- Marketplace (Layer 06)
- id, sponsor_id (FK), title, description_en, description_es
- type (internship/scholarship/incubation/mentorship/job)
- location, remote_eligible (boolean)
- requirements (JSONB), compensation
- application_url, deadline
- status (open/closed/filled)
- created_at, updated_at

**visionarium_impact_metrics** -- Layer 07
- id, cohort_id (FK), metric_name, metric_value, target_value
- category (completion/placement/capstone/bilingual/ai_fluency/sponsor_engagement/funding/nps)
- measured_at, created_at

**visionarium_mentor_matches**
- id, fellow_id (FK), mentor_id (FK), cohort_id (FK)
- status (proposed/active/paused/completed)
- total_sessions, avg_rating_by_fellow, avg_rating_by_mentor
- matched_at, ended_at

**visionarium_sponsor_tiers** -- Reference table
- id, name (founding/lead/program/supporter/in_kind)
- min_contribution, benefits (JSONB)
- board_observer (boolean), named_fellowship (boolean)
- demo_day_speaking (boolean), custom_impact_dossier (boolean)

---

## The 8-Layer Architecture Mapping

| Layer | What It Is | Backend Components |
|-------|------------|-------------------|
| **01 Identity** | Fellow digital passport -- bio, skills, portfolio, badges, credentials | community_members + fellows + badges + projects |
| **02 Learning** | Bilingual curriculum delivery, self-paced + cohort milestones | Curriculum content API, progress tracking, Torna Idioma integration |
| **03 AI Mentor (Lina)** | Bilingual voice+chat AI coach, 24/7, mission-aligned | lina-service.js, ElevenLabs ConvAI, conversation logging, escalation triggers |
| **04 Human Connection** | 1:1 mentor matching, expert forums, cohort community, alumni network | mentor_matches, events, community forums |
| **05 Execution** | Project management, sponsor-briefed challenges, hackathons, capstone | projects, sponsor briefs, portfolio auto-build |
| **06 Opportunity Marketplace** | Sponsor-posted internships, incubation, scholarships | opportunities table, matching engine |
| **07 Impact & Credentialing** | Sponsor dashboards + public impact reports, fellow transcripts | impact_metrics, report generation, PDF export |
| **08 Operator** | Admissions, cohort ops, mentor mgmt, sponsor CRM, analytics | admin routes, applications pipeline, analytics dashboards |

---

## Dashboard (React + Vite + Tailwind)

### Four Portal Views (role-based routing)

**1. Public Portal** (`/visionarium/`)
- Landing page with program overview
- Open Community registration form (with geo-detection pre-fill)
- Fellowship application portal (when applications are open)
- Public impact reports viewer
- Event calendar with RSVP
- Language toggle EN/ES persistent across all views
- Lina AI chat widget (ElevenLabs embed)

**2. Fellow Portal** (`/visionarium/fellow/`)
- Dashboard: upcoming sessions, mentor info, badge progress, Lina shortcut
- Weekly cadence view (Mon Tech Lab, Wed Leadership Forum, Fri 1:1 Mentor)
- Capstone project workspace (status, milestones, sponsor brief)
- Portfolio / digital passport viewer
- Opportunity marketplace browser
- Event calendar (immersions, Demo Day countdown)
- Bilingual toggle

**3. Mentor Portal** (`/visionarium/mentor/`)
- Dashboard: assigned fellows, upcoming 1:1s, Lina briefing summaries
- Fellow progress cards (engagement, badges, capstone status)
- Availability calendar
- Session notes / feedback forms
- Community forum moderation

**4. Sponsor Portal** (`/visionarium/sponsor/`)
- Dashboard: tier benefits, contribution status, named fellows
- Impact dossier viewer (custom per sponsor)
- Talent pipeline browser (fellow profiles, capstone demos)
- Opportunity posting interface (internships, challenges)
- Aggregate engagement metrics
- ESG/CSR report download (UN SDGs 4, 8, 10 alignment)

**5. Admin Console** (`/visionarium/admin/`)
- Cohort management (create, configure, timeline)
- Application pipeline (kanban: draft > submitted > review > interview > decided)
- Fellow management (status, track, mentor assignment)
- Mentor onboarding and management
- Sponsor CRM (pipeline: prospect > LOI > committed > active)
- Community analytics (registrations, engagement, geo breakdown)
- Impact metrics dashboard (Cohort 1 targets vs. actuals)
- Lina analytics (conversation volume, escalations, engagement signals)
- Event management (create, RSVPs, attendance)
- Badge administration
- Financial overview (sponsor commitments, fellowship costs)

---

## Design System

Match the whitepaper aesthetic:
- **Colors**: Navy (#0b1d4a), Teal (#3dcbca / neon #2de8e6), Coral (#ef6c57), Gold (#d4a574)
- **Background**: Near-black (#010409)
- **Typography**: Inter (UI), Source Serif 4 (body), JetBrains Mono (code/data)
- **Style**: Dark theme, subtle grid overlays, mesh gradients, teal glow accents
- **Cards**: Glass-morphism with backdrop-filter blur, teal borders
- **Buttons**: Teal fill for primary, outlined for secondary, coral for destructive

---

## API Endpoints Summary

### Public (no auth)
```
POST   /visionarium/api/v1/auth/register          -- Community member registration
POST   /visionarium/api/v1/auth/login              -- Login (all roles)
GET    /visionarium/api/v1/community/stats          -- Public community stats
GET    /visionarium/api/v1/events/public             -- Public events list
GET    /visionarium/api/v1/impact/public/:cohort_id  -- Public impact report
GET    /visionarium/health                           -- Health check
```

### Fellow (JWT: role=fellow)
```
GET    /visionarium/api/v1/fellows/me                -- My profile + passport
PUT    /visionarium/api/v1/fellows/me                -- Update profile
GET    /visionarium/api/v1/fellows/me/badges          -- My badges
GET    /visionarium/api/v1/fellows/me/mentor           -- My mentor info
GET    /visionarium/api/v1/fellows/me/project          -- My capstone
PUT    /visionarium/api/v1/fellows/me/project          -- Update capstone
GET    /visionarium/api/v1/fellows/me/schedule         -- Weekly cadence
GET    /visionarium/api/v1/opportunities               -- Browse marketplace
POST   /visionarium/api/v1/opportunities/:id/apply     -- Apply to opportunity
```

### Mentor (JWT: role=mentor)
```
GET    /visionarium/api/v1/mentors/me                  -- My profile
GET    /visionarium/api/v1/mentors/me/fellows           -- My assigned fellows
GET    /visionarium/api/v1/mentors/me/lina-briefings    -- Lina briefing summaries
POST   /visionarium/api/v1/mentors/sessions/:id/notes   -- Add session notes
PUT    /visionarium/api/v1/mentors/availability          -- Update availability
```

### Sponsor (JWT: role=sponsor)
```
GET    /visionarium/api/v1/sponsors/me                  -- My sponsor profile
GET    /visionarium/api/v1/sponsors/me/impact            -- My impact dossier
GET    /visionarium/api/v1/sponsors/me/fellows           -- Named fellows
GET    /visionarium/api/v1/sponsors/me/pipeline          -- Talent pipeline
POST   /visionarium/api/v1/sponsors/opportunities        -- Post opportunity
GET    /visionarium/api/v1/sponsors/me/metrics           -- Engagement metrics
```

### Admin (JWT: role=admin)
```
GET    /visionarium/api/v1/admin/dashboard               -- Overview analytics
CRUD   /visionarium/api/v1/admin/cohorts                  -- Manage cohorts
CRUD   /visionarium/api/v1/admin/fellows                  -- Manage fellows
CRUD   /visionarium/api/v1/admin/mentors                  -- Manage mentors
CRUD   /visionarium/api/v1/admin/sponsors                 -- Manage sponsors
CRUD   /visionarium/api/v1/admin/applications             -- Pipeline management
CRUD   /visionarium/api/v1/admin/events                   -- Event management
CRUD   /visionarium/api/v1/admin/badges                   -- Badge administration
CRUD   /visionarium/api/v1/admin/opportunities            -- Marketplace moderation
GET    /visionarium/api/v1/admin/community/analytics      -- Engagement analytics
GET    /visionarium/api/v1/admin/impact/:cohort_id        -- Impact metrics
GET    /visionarium/api/v1/admin/lina/analytics            -- Lina usage analytics
```

### Lina Integration
```
POST   /visionarium/api/v1/lina/webhook                   -- ElevenLabs conversation webhook
GET    /visionarium/api/v1/lina/context/:member_id         -- Fellow context for Lina
POST   /visionarium/api/v1/lina/escalate                   -- Escalation trigger to human mentor
GET    /visionarium/api/v1/lina/briefing/:fellow_id        -- Pre-1:1 mentor briefing
```

---

## Lina AI Mentor Integration Details

Lina is already configured as an ElevenLabs ConvAI agent (`agent_3301kp969e5tfcmb8jk2bam3exqa`). Extend with:

1. **Context API**: When Lina starts a conversation, she calls `/lina/context/:member_id` to get the fellow's current state (badges, capstone status, upcoming sessions, recent activity, mentor name)
2. **Conversation Logging**: ElevenLabs webhook posts conversation summaries to `/lina/webhook` -- store in a `visionarium_lina_conversations` table for analytics
3. **Escalation System**: If Lina detects disengagement signals (missed sessions, negative sentiment, explicit request), POST to `/lina/escalate` which notifies the assigned mentor via email
4. **Mentor Briefings**: Before each Friday 1:1, generate a briefing at `/lina/briefing/:fellow_id` summarizing the fellow's week (Lina conversations, badge activity, capstone progress)
5. **Aggregate Analytics**: Dashboard endpoint showing conversation volume, top topics, engagement trends, escalation rate

---

## Bilingual (i18n) Requirements

- All API responses include both `_en` and `_es` fields where applicable
- Frontend language toggle persists via localStorage
- Registration form auto-detects language from geo-detection (same ipapi.co pattern already in whitepaper)
- Email templates in both languages, sent based on user's `language_pref`
- Lina operates bilingually (already configured in ElevenLabs agent)
- Admin console is English-only (operator tool)

---

## Geo-Detection Integration

Reuse the ipapi.co pattern from the whitepaper pages:
- On community registration, auto-detect and pre-fill country/city
- Store `geo_detected_country` and `geo_detected_city` on the member record
- Use for analytics (geographic distribution of community members)
- Auto-set `language_pref` based on detected country (Spanish-speaking countries default to ES)

---

## Key Metrics to Track (Cohort 1 Targets)

| Metric | Target |
|--------|--------|
| Open Community registrations | 5,000+ by Oct 2026 |
| Fellowship applications | 600+ |
| Acceptance rate | 5-8% |
| Completion rate | >= 85% |
| Internship placement | >= 60% |
| Capstones shipped | 100% |
| Bilingual proficiency at exit | >= 90% |
| AI fluency certification | >= 80% |
| Sponsor engagement (1+ briefed project) | 100% |
| Seed funding (fellows receiving) | >= 3 |
| NPS score at exit | >= 70 |

---

## Build Order (Suggested Phases)

**Phase 1 -- Foundation (Backend + DB)**
1. Directory structure, database config, model definitions
2. Auth system (JWT, roles: community/fellow/mentor/sponsor/admin)
3. Community member registration with geo-detection
4. Mount in app.js, health endpoint
5. Run migrations

**Phase 2 -- Admin Console**
6. Admin dashboard (React)
7. Cohort management CRUD
8. Application pipeline (kanban)
9. Fellow, mentor, sponsor CRUD
10. Badge administration

**Phase 3 -- Public Portal**
11. Landing page (match whitepaper aesthetic)
12. Community registration form
13. Fellowship application flow
14. Public event listing
15. Lina chat widget integration

**Phase 4 -- Fellow + Mentor Portals**
16. Fellow dashboard, schedule, badges, capstone workspace
17. Mentor dashboard, fellow cards, session notes
18. Mentor matching system
19. Digital passport / portfolio view

**Phase 5 -- Sponsor Portal + Impact**
20. Sponsor dashboard, impact dossier
21. Opportunity marketplace (post + browse)
22. Talent pipeline viewer
23. Impact report generation (public + sponsor-specific)

**Phase 6 -- Lina Deep Integration**
24. Context API for Lina
25. Conversation webhook + logging
26. Escalation system
27. Mentor briefing generation
28. Lina analytics dashboard

---

## Admin Credentials (Initial Seed)

```
Email: admin@visionarium.app
Password: Visionarium2026!
Role: admin
```

---

## Environment Variables Needed

```
DATABASE_URL                    -- PostgreSQL (existing)
VISIONARIUM_JWT_SECRET          -- JWT signing key
ELEVENLABS_API_KEY              -- For Lina integration
ELEVENLABS_AGENT_ID             -- agent_3301kp969e5tfcmb8jk2bam3exqa
IPAPI_KEY                       -- Optional, for geo-detection (free tier works)
SMTP_HOST / SMTP_USER / SMTP_PASS  -- For transactional emails
```

---

## Non-Functional Requirements

- All routes behind try-catch with fallback (match existing monorepo pattern)
- Debug endpoint at `/debug/visionarium-error` if mount fails
- Sequelize `alter: false` -- use explicit migrations for schema changes
- Mobile-responsive dashboard (fellows are 16-22, primarily mobile users)
- Rate limiting on public registration endpoint
- Input sanitization on all user-facing forms (XSS prevention)
- CORS configured for visionarium.app domain
