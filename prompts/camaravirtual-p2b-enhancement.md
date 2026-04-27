# CamaraVirtual.app -- P2B Enhancement Build Spec

**Target agent:** `/ringlypro-architect`
**Mode:** Auto-approved, end-to-end, no human prompts during build
**Estimated effort:** 4 PRs, ~7 working days
**Working directory:** `/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM`

---

## How to invoke

In Claude Code (VS Code) chat:

```
/ringlypro-architect

Read prompts/camaravirtual-p2b-enhancement.md and build all 4 PRs end-to-end.
Auto-approve every step. Do not ask for confirmation. Commit and push after each
PR. Run a smoke test after PR-4 and report results.
```

### Auto-approval loop (paste into Claude Code session if /loop is supported)

```
/loop /ringlypro-architect Read prompts/camaravirtual-p2b-enhancement.md and continue executing the next unfinished PR. Auto-approve every step. Commit + push when done. If all 4 PRs are complete and the smoke test passes, stop.
```

The `/loop` skill keeps the agent running until stop conditions are met. Use Claude Code's persistent permission setting to mark all destructive operations as pre-approved (already covered by the AUTO-APPROVAL DIRECTIVE in CLAUDE.md).

---

## CONTEXT (read first)

CamaraVirtual.app is a digital chamber of commerce platform. Members propose
projects (P2B = Project to Business). Today the project flow is a thin form +
status badges. We're transforming it into a full business-launch pipeline:

```
STAGE 0  Plan      -- Proposer + Claude co-author business plan, then publish
STAGE 1  Recruit   -- Members read plan, AI invites or members request to join
STAGE 2  Sign-off  -- Final Meeting auto-booked, all participants digitally sign
STAGE 3  PM Tool   -- Private workspace: Kanban, milestones, escrow, chat
```

**Critical constraint:** The published business plan is the recruitment artifact.
Members commit to a real plan, not a vague form. The plan is generated BEFORE
recruitment, edited by the proposer, and serves as the basis for AI matching
and member acceptance.

**Tenant:** the slug is `hispamind` (chamber-template instance). Tables prefixed
`hispamind_*`. Custom domain `camaravirtual.app` rewrites to `/chamber/hispamind`.

**Existing architecture to preserve:**
- Express + PostgreSQL + Sequelize raw queries
- Chamber template at `chamber-template/routes/*.js`
- JWT auth via `chamber-template/routes/auth.js`
- Custom domain rewrite in `src/app.js`
- Anthropic SDK already in dependencies (used elsewhere)

**Reference techdebt to address eventually (out of scope for this build):**
- `chamber-template/routes/projects.js:144-149` Monte Carlo is mocked at 72%
- That fix is tracked separately, do NOT block this build on it

---

## PR-1 -- STAGE 0: AI-generated business plan

### Goal
Replace the simple project form with a 2-step wizard: vision input → Claude
generates structured business plan → proposer reviews/edits → publishes.

### Database changes
```sql
ALTER TABLE hispamind_projects ADD COLUMN plan_json JSONB;
ALTER TABLE hispamind_projects ADD COLUMN plan_status VARCHAR(30) DEFAULT 'draft';
-- plan_status values: draft, published, recruiting, fully_staffed,
-- pending_signoff, signed_off, executing, completed, archived
ALTER TABLE hispamind_projects ADD COLUMN visibility VARCHAR(30) DEFAULT 'public_plan';
-- visibility values: public_plan (recruiting), participants_only (executing+), archived
```

Add the same columns to `pacccfl_projects` and `pcci_projects` (template chambers
should match) -- use `ALTER TABLE IF EXISTS` style migration.

### Backend
**New endpoint:** `POST /api/projects/draft`
```
Auth: member JWT required
Body: { vision: string (2 paragraphs, max 1500 chars), sector, countries[], budget_tier }
Action:
  1. Call Anthropic SDK (claude-sonnet-4-6) with the prompt template (see below)
  2. Receive structured JSON plan
  3. INSERT INTO hispamind_projects with plan_json = result, plan_status = 'draft'
  4. Return: { project_id, plan_json }
```

**New endpoint:** `PUT /api/projects/:id/plan`
```
Auth: proposer only
Body: { plan_json: <full plan> }
Action: update plan_json, return updated row
```

**New endpoint:** `POST /api/projects/:id/publish`
```
Auth: proposer only
Action:
  - Validate plan_json has all required sections
  - SET plan_status = 'published', visibility = 'public_plan'
  - Return success
```

### Anthropic prompt template (place in `chamber-template/lib/plan-generator.js`)
```
System: You are a business plan generator for a chamber of commerce P2B
(Project to Business) platform. Given a 2-paragraph vision and basic
constraints, produce a complete structured business plan in JSON.

Output schema (strict JSON):
{
  "title": string,
  "executive_summary": string (3-5 sentences),
  "problem_market": {
    "problem_statement": string,
    "tam_usd": number,
    "sam_usd": number,
    "som_usd": number,
    "target_segments": string[]
  },
  "solution": {
    "description": string,
    "key_differentiators": string[],
    "tech_stack_or_methodology": string[]
  },
  "go_to_market": {
    "phases": [{ "name": string, "duration_months": number, "activities": string[] }],
    "channel_strategy": string,
    "regional_priorities": [{ "region": string, "rationale": string }]
  },
  "revenue_model": {
    "pricing_tiers": [{ "name": string, "price_usd": number, "period": string }],
    "year1_revenue_estimate_usd": number,
    "year3_revenue_estimate_usd": number
  },
  "team_roles_required": [
    {
      "role_title": string,
      "responsibilities": string[],
      "required_skills": string[],
      "preferred_sectors": string[],
      "preferred_regions": string[],
      "commitment_pct": number,
      "must_have": boolean
    }
  ],
  "budget_breakdown": [{ "category": string, "amount_usd": number, "phase": string }],
  "timeline_milestones": [
    { "month": number, "milestone": string, "deliverable": string }
  ],
  "risks": [{ "risk": string, "likelihood": "low|medium|high", "mitigation": string }],
  "success_kpis": [{ "kpi": string, "target": string, "measurement_period": string }]
}

User vision: {{vision}}
Sector: {{sector}}
Countries: {{countries}}
Budget tier: {{budget_tier}}  // "small" $50k-200k | "medium" $200k-1M | "large" $1M+

Generate a thorough, realistic plan. team_roles_required should specify 3-7
distinct roles with clear required_skills and preferred_sectors so AI matching
can identify candidates. Output ONLY valid JSON, no prose.
```

Use prompt caching (cache the system prompt). Use `extended-thinking` mode for
better plan quality.

### Frontend
**Replace** the existing project creation modal in
`public/chamber/hispamind/dashboard/index.html` with a 2-step wizard:

**Step 1 -- Vision form:**
- Textarea for vision (2 paragraphs)
- Sector dropdown (existing 24 sectors)
- Countries multi-select
- Budget tier dropdown
- Submit button: "Generate Business Plan with AI"
- Loading spinner: "Claude is drafting your plan..."

**Step 2 -- Plan editor:**
- Render plan_json sections as collapsible cards
- Each section is editable (inline contenteditable or modal-edit)
- Sticky header with two buttons: `Save Draft` and `Publish Plan`
- "Re-generate with Claude" button per section (advanced)

After publishing, project appears in feed with `plan_status = published`.

### Acceptance criteria
- [ ] Member can enter vision and get a complete plan back from Claude in <30s
- [ ] All 12 sections of plan_json are populated
- [ ] Proposer can edit any section before publishing
- [ ] Published project shows full plan to all members (not the old form fields)
- [ ] Old form is removed; old "Propose Project" button now opens the wizard

### Commit + push
```
feat(camaravirtual/p2b): PR-1 Stage 0 -- AI-generated business plan

- New endpoints: POST /api/projects/draft, PUT /api/projects/:id/plan, POST /api/projects/:id/publish
- Anthropic SDK integration with structured JSON plan generation
- 2-step wizard UI replaces simple form
- DB: plan_json, plan_status, visibility columns
```

---

## PR-2 -- STAGE 1: Recruit via published plan

### Goal
Members read the published plan and either (a) get AI-invited to fill specific
roles, or (b) browse and request to join. Each role tracks required vs. filled.

### Database
```sql
CREATE TABLE hispamind_project_invitations (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  member_id INT NOT NULL REFERENCES hispamind_members(id),
  role_index INT NOT NULL,  -- index into plan_json.team_roles_required
  role_title VARCHAR(200),
  status VARCHAR(30) DEFAULT 'pending',  -- pending | accepted | declined | withdrawn
  match_score NUMERIC(4,3),  -- cosine similarity score at invitation time
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  message TEXT,  -- optional message from inviter or response
  UNIQUE (project_id, member_id, role_index)
);
```

Add column to `hispamind_project_members`:
```sql
ALTER TABLE hispamind_project_members ADD COLUMN role_title VARCHAR(200);
ALTER TABLE hispamind_project_members ADD COLUMN role_index INT;
ALTER TABLE hispamind_project_members ADD COLUMN invitation_id INT REFERENCES hispamind_project_invitations(id);
```

### Backend
**New endpoint:** `POST /api/projects/:id/invite-matches`
```
Auth: proposer only
Action:
  - Read plan_json.team_roles_required
  - For each role, run cosine matching against hispamind_members
    (using sector + region preferences from the role definition + member skills)
  - Pick top N matches per role (default N=3)
  - INSERT INTO hispamind_project_invitations
  - Return: { invitations_created: <count>, by_role: [...] }
```

**New endpoint:** `POST /api/projects/:id/invitations/:inv_id/respond`
```
Auth: invited member only
Body: { action: "accept" | "decline", message?: string }
Action:
  - Update invitation row
  - If accepted, INSERT INTO hispamind_project_members with role linkage
  - Check if all must_have roles are filled -> SET plan_status = 'fully_staffed'
  - Return success
```

**Modified endpoint:** `GET /api/projects` and `GET /api/projects/:id`
- If visibility = 'public_plan', return plan + role status (filled/open per role)
- If visibility = 'participants_only', filter: only members in
  `hispamind_project_members` for this project see it (plus superadmin)
- Response includes: plan_json, fill_status (per role), team summary

### Frontend
**New "Invitations" section** in member dashboard sidebar:
- Lists pending invitations for the logged-in member
- Each card shows: project title, role being invited for, match_score, plan link
- Buttons: Accept / Decline / View Plan

**Updated project detail view:**
- Renders the full business plan
- Shows team roles section with status badges (Open / Filled by [Member] / Multiple Candidates)
- "Request to Join Role" button on open roles (members can self-nominate)
- "Invite Matches" button for proposer (triggers AI matching)

### Acceptance criteria
- [ ] Proposer can invite AI-matched members to specific roles
- [ ] Invitees see invitations in their dashboard inbox
- [ ] Accepted invitations create project_members rows linked to the role
- [ ] Project transitions to 'fully_staffed' when all must_have roles accepted
- [ ] Self-nomination via "Request to Join" creates a pending invitation that
      proposer can approve/decline

### Commit + push
```
feat(camaravirtual/p2b): PR-2 Stage 1 -- AI-driven role-based recruitment

- hispamind_project_invitations table
- AI cosine matching against role specs in plan_json
- Member invitation inbox + accept/decline flow
- Status transition to fully_staffed when must_have roles complete
```

---

## PR-3 -- STAGE 2: Final Meeting & digital sign-off

### Goal
When all roles are filled, system auto-books a Final Meeting for participants
only. Each participant digitally signs the business plan. Unanimous sign-off
unlocks Stage 3.

### Database
```sql
CREATE TABLE hispamind_project_meetings (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  meeting_type VARCHAR(50) NOT NULL,  -- 'final_review' | 'kickoff' | 'milestone'
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 60,
  video_link VARCHAR(500),
  ical_event_uid VARCHAR(200),
  attendees INT[] NOT NULL,  -- array of member_ids
  status VARCHAR(30) DEFAULT 'scheduled',  -- scheduled | completed | cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hispamind_project_signoffs (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  member_id INT NOT NULL REFERENCES hispamind_members(id),
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  plan_version_hash VARCHAR(64),  -- hash of plan_json at time of signing
  signature_method VARCHAR(30),  -- 'typed_name' | 'click_through' | 'eth_wallet'
  signature_payload TEXT,  -- typed name or signature data
  ip_address VARCHAR(50),
  user_agent VARCHAR(500),
  UNIQUE (project_id, member_id)
);
```

### Backend
**New endpoint:** `POST /api/projects/:id/book-final-meeting`
```
Auth: superadmin or proposer
Trigger: usually called automatically when plan_status -> 'fully_staffed'
Body: { proposed_datetime?: ISO8601, duration_minutes?: number }
Action:
  - If no datetime, propose 7 days from now at 14:00 UTC
  - Generate video link (use Twilio Video or simple jitsi.org/<uid> link)
  - Generate iCal event with all participants as attendees
  - INSERT INTO hispamind_project_meetings
  - Email iCal attachment + plan PDF link to all participants
    (use existing email infrastructure)
  - SET plan_status = 'pending_signoff'
  - Return: meeting record
```

**New endpoint:** `POST /api/projects/:id/signoff`
```
Auth: project participant only (must be in hispamind_project_members)
Body: { typed_name: string, agreed: true }
Action:
  - Compute SHA256 of current plan_json
  - INSERT INTO hispamind_project_signoffs
  - Check if all participants have signed -> SET plan_status = 'signed_off',
    visibility = 'participants_only'
  - Return: { signed: true, all_signed: bool, remaining: [...] }
```

**New endpoint:** `GET /api/projects/:id/signoff-status`
```
Auth: participant or superadmin
Returns: { total_participants, signed_count, remaining: [{member_id, name}] }
```

### Calendar integration
Use a simple iCal generator (no external API needed for v1):
- Generate `BEGIN:VCALENDAR ... END:VCALENDAR` blob
- Email as `.ics` attachment via existing email service
- Include video meeting link in DESCRIPTION
- For the video link: use `https://meet.jit.si/CamaraVirtual-<project_id>-<random>` (free, no auth)

(Phase 2 -- swap for Google Calendar / Zoom OAuth later. For now keep it simple.)

### Frontend
**Updated project detail view (when fully_staffed):**
- "Final Meeting" card showing scheduled datetime, video link, attendees
- "Sign Off on Business Plan" button → modal:
  - Renders the full plan one more time
  - Checkbox: "I agree to the business plan as written"
  - Text input: "Type your full name to sign"
  - Submit → POST /signoff
- Sign-off progress bar: "3 of 4 participants signed off"

**When all signed:**
- Card flips to "Signed Off ✓ -- Project moves to private workspace"
- Project disappears from public feed
- Participants get a link to the new private PM workspace (built in PR-4)

### Acceptance criteria
- [ ] When project transitions to fully_staffed, system auto-books Final Meeting
- [ ] All participants receive iCal invite email with video link
- [ ] Each participant can sign off via the modal
- [ ] Plan version is hashed and stored with each signature
- [ ] When all signed, plan_status = 'signed_off' and visibility = 'participants_only'
- [ ] Public feed no longer shows the project (only stub: "<Title> -- in execution")

### Commit + push
```
feat(camaravirtual/p2b): PR-3 Stage 2 -- Final Meeting + digital sign-off

- hispamind_project_meetings + hispamind_project_signoffs tables
- Auto-book Final Meeting on full staffing
- iCal email invitations with Jitsi video links
- Per-participant digital sign-off with plan version hashing
- Visibility flips to participants_only after unanimous sign-off
```

---

## PR-4 -- STAGE 3: Private PM workspace

### Goal
Once signed off, project lives in a private participants-only workspace with
Kanban tasks, milestones tracking, document repo, chat, and Stripe escrow.

### Database
```sql
CREATE TABLE hispamind_project_tasks (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  status VARCHAR(30) DEFAULT 'todo',  -- todo | doing | review | done | blocked
  assignee_member_id INT REFERENCES hispamind_members(id),
  milestone_id INT,
  priority VARCHAR(20) DEFAULT 'medium',  -- low | medium | high | critical
  due_date DATE,
  created_by_member_id INT NOT NULL REFERENCES hispamind_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE hispamind_project_milestones (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  target_month INT,  -- relative to project start
  target_date DATE,
  budget_allocation_usd NUMERIC(12,2),
  escrow_status VARCHAR(30),  -- 'pending' | 'funded' | 'released' | 'disputed'
  stripe_escrow_id VARCHAR(200),
  status VARCHAR(30) DEFAULT 'planned',  -- planned | in_progress | completed | delayed
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hispamind_project_messages (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  member_id INT NOT NULL REFERENCES hispamind_members(id),
  body TEXT NOT NULL,
  attachment_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hispamind_project_documents (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  uploaded_by_member_id INT NOT NULL REFERENCES hispamind_members(id),
  title VARCHAR(300) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  doc_type VARCHAR(50),  -- 'contract' | 'nda' | 'financial' | 'pitch' | 'other'
  visibility VARCHAR(30) DEFAULT 'participants',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend
**Mount under `/api/projects/:id/workspace/*` -- all routes participant-only auth**

```
GET    /workspace/overview         -- summary: tasks count, milestones, recent activity
GET    /workspace/tasks            -- list with filters
POST   /workspace/tasks            -- create
PUT    /workspace/tasks/:tid       -- update (status, assignee, etc.)
DELETE /workspace/tasks/:tid

GET    /workspace/milestones
POST   /workspace/milestones
PUT    /workspace/milestones/:mid
POST   /workspace/milestones/:mid/fund-escrow      -- Stripe integration
POST   /workspace/milestones/:mid/release-escrow

GET    /workspace/messages         -- paginated
POST   /workspace/messages

GET    /workspace/documents
POST   /workspace/documents        -- upload (S3 or local)

POST   /workspace/initialize-from-plan  -- proposer/superadmin: bulk-create
        tasks + milestones from plan_json.timeline_milestones automatically
```

### Auth helper
Add `requireProjectParticipant(req, res, next)` middleware:
```js
async function requireProjectParticipant(req, res, next) {
  const memberId = req.member.id;
  const projectId = parseInt(req.params.id);
  const [row] = await sequelize.query(
    `SELECT 1 FROM hispamind_project_members WHERE project_id = :p AND member_id = :m
     UNION SELECT 1 FROM hispamind_members WHERE id = :m AND access_level = 'superadmin'`,
    { replacements: { p: projectId, m: memberId }, type: QueryTypes.SELECT }
  );
  if (!row) return res.status(403).json({ success: false, error: 'Not a project participant' });
  next();
}
```

### Frontend
New page: `public/chamber/hispamind/dashboard/workspace.html` (or modal SPA in
existing dashboard) with these tabs:

1. **Overview** -- progress %, milestone burndown, recent activity feed
2. **Tasks** -- Kanban board (To Do | Doing | Review | Done | Blocked)
   - Drag-and-drop status changes
   - Click task → modal with details, comments, assignee, due date
3. **Milestones** -- timeline view with budget per milestone, Stripe escrow status
4. **Discussion** -- threaded chat (basic, no replies needed)
5. **Documents** -- file repository (drag to upload)
6. **Team** -- list of participants with role, contribution stats
7. **Plan** -- read-only view of the signed-off business plan

When user opens a project they're a participant of, sidebar shows
"Workspace" link. When they open from public feed and they're not a
participant, the project shows as a stub: "RinglyPro.com -- in execution
-- 4 participants -- private".

### Initialize from plan
When project transitions to `executing`, automatically:
- Create one milestone per `timeline_milestones[]` entry
- Create starter tasks for each milestone (one per deliverable)
- Tasks are assigned by AI-suggesting (member_id from team_roles_required)
- All visible immediately to participants in their Kanban board

### Acceptance criteria
- [ ] After sign-off, project disappears from public feed
- [ ] Participants see new "Workspace" link in their sidebar (per project)
- [ ] Workspace has all 7 tabs functional
- [ ] Tasks can be created, dragged, completed
- [ ] Milestones initialized from plan_json.timeline_milestones automatically
- [ ] Non-participants get 403 on /workspace/* endpoints
- [ ] Public feed shows stub only, no plan details for archived/private projects

### Commit + push
```
feat(camaravirtual/p2b): PR-4 Stage 3 -- Private participants-only PM workspace

- 4 new tables: tasks, milestones, messages, documents
- Workspace endpoints under /api/projects/:id/workspace/*
- requireProjectParticipant auth middleware
- Auto-initialize tasks/milestones from plan_json on entering execution
- Frontend workspace UI with Kanban, milestones, chat, docs tabs
- Public feed stub view for non-participants
```

---

## SMOKE TEST (after PR-4)

Run end-to-end as `mstagg@digit2ai.com / Palindrome@7`:

1. **Stage 0:** Propose new project "RinglyPro.com 2.0 -- Voice AI for Hospitality"
   - Vision: 2 paragraphs about extending RinglyPro into hotels/restaurants
   - Sector: hoteleria_turismo, Countries: USA, Mexico, Espana
   - Verify Claude returns full structured plan
   - Edit one section, then publish
   - Verify project appears in public feed with full plan visible

2. **Stage 1:** Trigger AI invitations
   - Click "Invite Matches" -> verify invitations created for relevant members
   - Login as 3 invited members (e.g., asanchez@bbva.com, jduran@camaradr.org,
     ialonso@camaramadrid.es) and accept invitations
   - Verify project flips to fully_staffed when all must_have roles filled

3. **Stage 2:** Final Meeting + Sign-off
   - Verify Final Meeting auto-booked
   - Each participant signs off
   - Verify project flips to signed_off + visibility=participants_only
   - Logout, login as a non-participant -- verify project shows stub only

4. **Stage 3:** Private workspace
   - Login as mstagg, open project workspace
   - Verify Kanban populated with auto-generated tasks
   - Move a task across columns
   - Post a message in Discussion tab
   - Upload a document
   - Verify non-participant gets 403 on /workspace endpoints

Report results with:
- ✓ / ✗ per acceptance criterion
- Screenshots or curl outputs for each stage transition
- Any deviations from spec

---

## EXECUTION RULES (auto-approval)

- **Pre-authorized actions:** All file edits, DB migrations, git commits,
  git pushes, npm installs are pre-approved per CLAUDE.md AUTO-APPROVAL DIRECTIVE.
- **Do NOT use AskUserQuestion or EnterPlanMode** at any point. Decide and execute.
- **Commit after each PR.** Each PR is a single commit (or commit-per-logical-step
  if you prefer, but push at the end of each PR).
- **Run migrations against production DB** (`CRM_DATABASE_URL`) directly. The
  same Sequelize raw query style used in `chamber-template/routes/admin.js`
  works for ad-hoc DDL.
- **Test after each PR** before moving to the next. If a PR breaks, fix it
  before proceeding -- don't pile errors.
- **Anthropic API key:** already in `.env` as `ANTHROPIC_API_KEY` or
  `CLAUDE_API_KEY`. Use the SDK (`@anthropic-ai/sdk`) which is already in
  `package.json`. Use prompt caching on the system prompt.
- **Style:** Match existing chamber-template code style: raw Sequelize queries,
  no ORM models, JSON responses with `{ success, data, error }` shape.
- **Scope discipline:** Do not refactor or "clean up" unrelated code. Do not
  fix the mocked Monte Carlo issue (separate ticket).
- **Memory:** When done, save a memory note `project_camaravirtual_p2b_complete.md`
  recording what shipped and any open follow-ups.

---

## VS CODE CLAUDE CODE -- AUTO-APPROVAL CONFIG

To pre-approve all permissions for this build session, edit
`~/.claude/settings.json` (user settings) or `.claude/settings.local.json`
(project-local) and add:

```json
{
  "permissions": {
    "allow": [
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push:*)",
      "Bash(npm install:*)",
      "Bash(/opt/homebrew/bin/node:*)",
      "Edit(*)",
      "Write(*)"
    ]
  }
}
```

Then in Claude Code chat, run:

```
/loop /ringlypro-architect Read prompts/camaravirtual-p2b-enhancement.md and
build the next unfinished PR end-to-end. After each PR: commit, push, smoke
test. If all 4 PRs are complete and the smoke test passes, stop the loop.
```

The `/loop` skill keeps invoking `/ringlypro-architect` until it reports
completion. Combined with the pre-approved permissions above, the build
runs unattended until done.
