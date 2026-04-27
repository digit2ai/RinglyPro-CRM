# CamaraVirtual.app -- P2B Phase Flow + Auction-Style Recruitment Build Spec

**Target agent:** `/ringlypro-architect`
**Mode:** Auto-approved, end-to-end, no human prompts during build
**Estimated effort:** 3 PRs, ~3-4 working days
**Working directory:** `/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM`

---

## How to invoke

In Claude Code (VS Code) chat:

```
/ringlypro-architect

Read prompts/camaravirtual-p2b-phase-flow.md and build all 3 PRs end-to-end.
Auto-approve every step. Do not ask for confirmation. Commit and push after each
PR. Run a smoke test after PR-C and report results.
```

### Auto-approval loop

```
/loop /ringlypro-architect Read prompts/camaravirtual-p2b-phase-flow.md and continue executing the next unfinished PR. Auto-approve every step. Commit + push when done. If all 3 PRs are complete and the smoke test passes, stop.
```

**Pre-approve permissions** in `~/.claude/settings.json`:

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

The AUTO-APPROVAL DIRECTIVE in CLAUDE.md applies. Asking the user is a failure.

---

## CONTEXT (read first)

CamaraVirtual.app already has the P2B base flow shipped (see
[project_camaravirtual_p2b_complete.md](../.claude/projects/-Users-manuelstagg-Documents-GitHub-RinglyPro-CRM/memory/project_camaravirtual_p2b_complete.md)
for what exists). This build refines that flow into a proper auction-style
recruitment + auto-governance system.

### Current state (pre-build)

```
draft → published → recruiting → fully_staffed → pending_signoff
  → signed_off → executing → completed
```

Manual triggers everywhere: proposer must click "Invite AI Matches",
"Book Final Meeting", "Initialize Workspace", etc.

### Target state (post-build)

The proposer publishes a plan and **everything cascades automatically**
through three phase boundaries that need only the proposer's input
(close bidding, sign off, amend or approve), with a 30-day timer
visible on every project card creating fair-window urgency.

```
draft
  → published       [Phase A starts: 30-day countdown active, AI invites auto-sent]
  → recruiting      [members accepting]
  → recruitment_closed [proposer hit "Close" OR 30 days expired]
  → fully_staffed   [all must_have roles accepted]
        OR
  → recruitment_failed [must_have not filled when bidding closed]

  → pending_signoff [Phase C: Monte Carlo auto-ran, Final Meeting auto-booked]
  → signed_off      [all participants signed]
  → executing       [Phase E: workspace auto-initialized]
  → completed
```

### Critical UX requirements

1. **30-day countdown timer is rendered INSIDE every project card** in the
   feed list (not just in the detail modal). Format: `22d 14h 03m left`.
   Color-code: green > 7d, yellow 1-7d, red < 1d, gray "Closed".
2. **Cosine matching runs automatically on Publish** -- not on a button click.
3. **Monte Carlo runs automatically when team is locked** -- no manual click.
4. **Final Meeting auto-books when team is locked** -- no manual click.
5. **Workspace auto-initializes on signed_off** -- no manual click.
6. **Proposer = Project Owner** with admin rights inside the workspace
   (assign participants to milestones, edit/delete anything, manage everything).
7. **Hide the legacy "Advance Phase" button** from the UI -- it's confusing.

---

## PR-A -- Bidding window + auto-cascade

### Goal
Replace the manual click-driven recruitment with a 30-day auction-style
window: countdown timer on every project card, auto-invitation on Publish,
proposer can close early or auto-close on expiry, then auto-Monte-Carlo +
auto-meeting when team is full.

### Database changes
```sql
-- Recruitment window
ALTER TABLE hispamind_projects ADD COLUMN recruitment_deadline TIMESTAMPTZ;
ALTER TABLE hispamind_projects ADD COLUMN recruitment_closed_at TIMESTAMPTZ;
ALTER TABLE hispamind_projects ADD COLUMN recruitment_closed_by VARCHAR(20); -- 'manual' | 'auto_expired'

-- Cached Monte Carlo result (so we don't recompute on every page load)
ALTER TABLE hispamind_projects ADD COLUMN monte_carlo_result JSONB;
ALTER TABLE hispamind_projects ADD COLUMN monte_carlo_at TIMESTAMPTZ;

-- New plan_status values
-- existing: draft, published, recruiting, fully_staffed, pending_signoff, signed_off, executing, completed, archived
-- add: 'recruitment_closed' (between recruiting and fully_staffed evaluation)
-- add: 'recruitment_failed' (must_have not met when window closed)
```

Same migration for `pacccfl_projects` and `pcci_projects`.

### Backend changes (chamber-template/routes/projects.js)

**Modified: `POST /:id/publish`**
- Set `recruitment_deadline = NOW() + INTERVAL '30 days'`
- **Automatically run cosine matching** (current `invite-matches` logic) and
  insert invitations for top 3 candidates per role
- Set `plan_status = 'recruiting'` (skip the 'published' middle state for
  consistency, since members shouldn't see published-without-recruitment)

**New: `POST /:id/close-recruitment`**
- Auth: proposer or superadmin only
- Body: `{ reason?: string }` (optional notes)
- Set `recruitment_closed_at = NOW()`, `recruitment_closed_by = 'manual'`
- Then run the auto-cascade (see below)

**New: lazy auto-close on read**
- In `GET /:id` and `GET /` for any project where `recruitment_deadline < NOW()`
  AND `plan_status = 'recruiting'` AND `recruitment_closed_at IS NULL`:
  - Set `recruitment_closed_at = NOW()`, `recruitment_closed_by = 'auto_expired'`
  - Run the auto-cascade (see below)

**Auto-cascade function** (extract to chamber-template/lib/p2b-cascade.js):
1. Check: are all `must_have` roles in plan_json filled by accepted invitations?
2. If NO -> set `plan_status = 'recruitment_failed'` and stop
3. If YES:
   a. Set `plan_status = 'fully_staffed'`
   b. Run `monteCarloProject()` (real one from chamber-math.js -- NOT the
      mock) and store result in `monte_carlo_result` + `monte_carlo_at`
   c. Auto-book Final Meeting (existing book-final-meeting logic):
      - `scheduled_at = NOW() + 7 days at 14:00 UTC`
      - Insert into `${t}_project_meetings`
      - Set `plan_status = 'pending_signoff'`
   d. (No email yet -- v1, we just store the meeting + .ics is downloadable)

**Modified: existing `POST /:id/invite-matches`**
- Keep as a manual re-run option for the proposer (in case they want to
  add more candidates after some declined). Don't remove.

**Modified: `POST /:id/signoff`**
- When all participants have signed, after setting `plan_status = 'signed_off'`,
  **automatically run `initialize-from-plan`** logic to create milestones +
  tasks + transition to `executing`. No manual click.

### Real Monte Carlo (replaces the mock at projects.js:144-149)

The function exists at chamber-template/chamber-math.js:167:`monteCarloProject`.
Wire it up properly:
- Pull project budget min/est/max + timeline min/est/max
- Pull team size + average trust score from project_members
- Pull sector difficulty multiplier (technology + finance + ciberseguridad =
  high, education + retail = low, etc -- start with a simple object map)
- Run 10,000 iterations with triangular distributions
- Return: success_probability, risk_score, budget P10/P50/P90, timeline P10/P50/P90
- Store the full result in `monte_carlo_result` JSONB column

### Frontend changes

**Project card list (renderProjects > loadProjects):**
Add a **prominent countdown badge** at the top-right of every card that
has `recruitment_deadline` set:

```html
<div class="countdown-badge" data-deadline="{{ISO datetime}}">
  <div class="countdown-time">22d 14h 03m</div>
  <div class="countdown-label">left in bidding</div>
</div>
```

CSS:
- Position: absolute top-right of card
- Background: green if > 7 days, yellow if 1-7, red if < 1 day, gray if closed
- Update every 60 seconds via `setInterval` (just rerender the time string, not the whole DOM)
- Show "Closed" if `recruitment_closed_at IS NOT NULL`

**Project detail modal:**
- Below the title, show large countdown clock when `plan_status = 'recruiting'`
- Show **"Close Bidding Now"** button (red, proposer/superadmin only) below the timer
- Show **Monte Carlo summary card** when `monte_carlo_result IS NOT NULL`
  (success_probability, P50 budget + timeline, risk score)
- **Hide "Advance Phase" button entirely** -- remove from action bar
- Hide "Book Final Meeting" button (now auto)
- Hide "Initialize Workspace" button (now auto)
- Hide "Evaluate Risk" button (now auto)

**Status pill:**
Replace the legacy `status` (proposal/analysis/.../completed) with the
new `plan_status` state-machine progress. Visual: 8-dot progress bar
mapped to draft/published/recruiting/recruitment_closed/fully_staffed/
pending_signoff/signed_off/executing/completed.

### Acceptance criteria
- [ ] When a project is published, deadline = now + 30 days, AI invitations
      auto-created, plan_status = 'recruiting', no proposer click required
- [ ] Project card displays countdown timer that updates every minute
- [ ] Color band switches green/yellow/red based on time remaining
- [ ] "Close Bidding Now" button works for proposer
- [ ] Auto-close fires when deadline passes (lazy on next GET)
- [ ] When team is fully staffed at close-time:
  - Monte Carlo result is stored in DB
  - Final Meeting is auto-booked
  - plan_status moves to pending_signoff
- [ ] When team is NOT fully staffed at close-time, status = 'recruitment_failed'
- [ ] When all participants sign off, workspace auto-initializes (no click)
- [ ] Legacy "Advance Phase" button is removed from UI

### Commit + push
```
feat(camaravirtual/p2b): PR-A bidding window + auto-cascade

- 30-day recruitment deadline with countdown badge in project cards
- Auto cosine matching + invitations on publish
- Manual "Close Bidding Now" + auto-close on deadline expiry
- Auto Monte Carlo + auto Final Meeting on team-fully-staffed
- Auto workspace init on signed_off
- Real monteCarloProject() replaces the 72% mock
```

---

## PR-B -- Plan amendment after Final Meeting

### Goal
At the Final Meeting, participants may decide to amend the plan rather
than approve as-is. Allow the proposer to re-edit, which invalidates
all prior signatures and forces a re-sign on the new version.

### Database
```sql
-- Already exists: plan_version_hash on signoffs
-- Add: plan_versions table to keep history
CREATE TABLE hispamind_project_plan_versions (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES hispamind_projects(id) ON DELETE CASCADE,
  plan_json JSONB NOT NULL,
  plan_version_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_member_id INT REFERENCES hispamind_members(id),
  amendment_reason TEXT
);
```

Same for pacccfl, pcci.

### Backend
**New: `POST /:id/amend-plan`**
- Auth: proposer or superadmin only
- Allowed when `plan_status` IN ('pending_signoff', 'fully_staffed')
- Body: `{ plan_json, reason }`
- Action:
  1. Save current plan to `plan_versions` table (history)
  2. Compute new SHA-256 of new plan_json
  3. Update `${t}_projects.plan_json = new`, set `updated_at`
  4. **Invalidate all signatures**: delete from `${t}_project_signoffs`
     where `project_id = :id`
  5. Set `plan_status = 'pending_signoff'` (back to signing)
  6. Notify all participants (a project_message auto-posted: "Plan
     amended. Please re-sign.")

**New: `GET /:id/plan-versions`** -- list all historical versions

### Frontend
- "Amend Plan" button (proposer/superadmin only) shown when status is
  pending_signoff or fully_staffed
- Opens the same plan editor as PR-1
- Submit triggers `POST /amend-plan`
- Sign-off progress card shows "Amended -- 0/N signed (re-sign required)"
- "Plan Versions" link in workspace > Plan tab

### Acceptance
- [ ] Proposer can amend plan post-meeting
- [ ] Amendment auto-invalidates all signatures
- [ ] Plan version history is queryable
- [ ] All participants must re-sign new version
- [ ] System message posted to discussion thread on amendment

### Commit
```
feat(camaravirtual/p2b): PR-B plan amendment + version history
```

---

## PR-C -- Project Owner role + milestone assignments

### Goal
The proposer is the **Project Owner** in the workspace. They have admin
rights to manage everything. Other participants are collaborators with
limited rights. Milestones get assigned to one or more leads.

### Database
```sql
ALTER TABLE hispamind_project_milestones ADD COLUMN lead_member_ids INT[] DEFAULT '{}';
ALTER TABLE hispamind_project_milestones ADD COLUMN created_by_member_id INT REFERENCES hispamind_members(id);
```

Same for pacccfl, pcci.

### Backend (chamber-template/routes/workspace.js)

**Modified middleware: requireProjectParticipant + ownership check**
- Add `requireProjectOwner(req, res, next)` -- proposer or superadmin only
- Use on PUT/DELETE for milestones, tasks, documents (others can only
  modify their own creations)

**New: `PUT /workspace/milestones/:mid/assign`**
- Body: `{ lead_member_ids: [int] }`
- Auth: requireProjectOwner
- Validates that all member_ids are participants

**Modified: `GET /workspace/milestones`** -- include assigned member names

**Modified: `PUT /workspace/tasks/:tid`** -- only owner can change assignee
of a task that's not their own

### Frontend
**Workspace > Milestones tab:**
- Each milestone shows current leads with avatars
- Owner sees an **"Assign Leads"** button → multi-select picker of participants
- Hover badge shows: "Owned by {proposer}" on each milestone
- Non-owners can mark their own assigned milestone as in-progress/complete,
  but only owner can change the lead assignment

**Workspace > Overview:**
- Add "My Assigned Milestones" widget visible to all participants
- Owner-only widget: "Total escrow funded / released"

**Workspace > Tasks:**
- Owner can drag any task; participants can only drag their own
- Owner can assign tasks to anyone; participants can only self-assign
- Add "Filter: Assigned to me" toggle

**Status badge:**
- Add a small "Project Owner" badge next to the proposer's name in the
  Team tab

### Acceptance
- [ ] Owner can assign 1+ leads to each milestone
- [ ] Non-owners get 403 trying to PUT/DELETE milestones they don't lead
- [ ] Non-owners can update status on their assigned milestones
- [ ] Tasks can be filtered to "Assigned to me"
- [ ] Owner can reassign any task; participants only self-assign

### Commit
```
feat(camaravirtual/p2b): PR-C Project Owner + milestone assignments
```

---

## SMOKE TEST (after PR-C)

End-to-end automated test that:
1. Creates a project (vision -> plan -> publish auto-fires recruitment)
2. Verifies countdown timer is set ~30 days out
3. Has top members accept invitations until must_have roles filled
4. Verifies Monte Carlo result was stored automatically
5. Verifies Final Meeting was booked automatically
6. Has all participants sign off
7. Verifies workspace was auto-initialized (no manual click)
8. Owner assigns lead to a milestone
9. Verifies non-owner participant gets 403 trying to assign someone else
10. Owner amends plan -> all signatures invalidated, re-sign required

Reuse and extend `scripts/smoke-test-p2b.js`.

---

## EXECUTION RULES (auto-approval)

- **Pre-authorized:** All file edits, DB migrations, git commits, git pushes,
  npm installs are pre-approved per CLAUDE.md AUTO-APPROVAL DIRECTIVE.
- **Do NOT use AskUserQuestion or EnterPlanMode** at any point.
- **Commit + push after each PR.** Do not batch.
- **Run migrations against production DB** (`CRM_DATABASE_URL`) directly.
- **Test after each PR** before moving to the next.
- **Match existing code style:** raw Sequelize queries, no ORM models,
  `{ success, data, error }` shape.
- **Scope discipline:** Don't refactor unrelated code. Don't change PR-1
  through PR-4 of the previous build (already shipped).
- **Memory:** When done, save a memory note
  `project_camaravirtual_p2b_phase_flow_complete.md`.

### Don't ship if any of these fail
- Any of the 3 PRs has failing acceptance criteria
- Smoke test passes but the real Monte Carlo returns the same hardcoded
  72% (means the wiring is wrong)
- Countdown timer doesn't update without page refresh
