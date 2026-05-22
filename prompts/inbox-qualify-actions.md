# BUILD: Inbox Qualify Actions — Schedule Meeting, PDF send, Threaded Q&A

## Why this exists

The AI Triage Agent already produces 20-30 bilingual stakeholder questions per
new intake. Today those questions just sit inside the triage brief for the
user to read. The user wants three actions on each Inbox card that put those
questions to work BEFORE the approve/reject decision — so by the time the
user clicks Approve or Reject they actually have answers, not just guesses.

End result: every new intake gets qualified through any combination of
(a) a scheduled meeting where the questions are the agenda, (b) a PDF with
the questions the requestor can read offline, or (c) an in-app threaded Q&A
the requestor answers asynchronously through the magic link.

## Top-level instructions

Build this entire feature end-to-end inside the Digit2AI Projects app,
autonomously, in one PR. Auto-approve every step per CLAUDE.md. Never use
EnterPlanMode or AskUserQuestion. Run smoke tests against prod after deploy
and report results in markdown. Auto-fix any failures and continue. Revert
only with a specific file:line failure report.

Working directory: /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/digit2ai-projects/

## Pre-flight reading (required)

1. CLAUDE.md root — AUTO-APPROVAL DIRECTIVE
2. src/services/agents/inboxTriageAgent.js — structured output shape includes `stakeholder_questions_es[]` and `stakeholder_questions_en[]`
3. dashboard/assets/app.js → `function renderInboxCard(p)` and `function renderInboxTriagePanel(p)` — these are the entry points for the new buttons
4. dashboard/intake/batch.html (or equivalent magic-link page) — this is what the requestor sees when they open the share link; we need to add threaded Q&A here
5. src/routes/projects.js → `router.get('/inbox', ...)` — confirms p.triage_brief and p.triage_structured already flow to the frontend
6. src/routes/intake.js → existing share-token JWT flow (`share/:token/identify`, intakeAuth middleware) — reuse for the requestor-side endpoints
7. src/services/meetingInvite.js + dashboard openTaskWhatsAppModal — the existing WhatsApp send pattern (wa.me URLs, recipient picker, phone persistence)
8. src/routes/calendar.js — POST `/api/v1/calendar` with `create_zoom: true`, `invite_emails: [...]`, `invite_message: "..."` for the meeting scheduler

## Hard constraints

- Reuse existing patterns. Do not fork meetingInvite, openTaskWhatsAppModal, or the calendar event creator.
- PDF rendering: use a pure-Node lib (no headless Chrome). Recommended: `pdfkit` (npm). If missing from package.json, install it.
- All three actions must work even when the triage brief is not yet generated — if triage_structured is null, prompt the user to run triage first via the existing "Run Triage Now" button. Do not silently use a partial / empty question list.
- Backwards-compatible: do not break existing Inbox card actions (Approve, Reject, Meeting Request, Open discussion).
- Workspace single-tenant: workspace_id = 1.

## What to build

### Action 1 — 📅 Qualify Meeting button

**Trigger:** new button on each Inbox card, only enabled when `p.triage_structured` exists.

**Behavior:**
- Click → opens the existing `openEventModal()` with these pre-fills:
  - `title`: `"Qualification Meeting — {project.name}"`
  - `description`: project summary (from p.description) + a clearly-labeled section "Stakeholder Questions (please come prepared):" followed by the AI Triage questions in the requestor's language (use Spanish if p.country is a Spanish-speaking country, English otherwise — match the existing language-detection logic in outreachDrafterAgent.js)
  - `invite_emails`: requestor's email (p.submitter_email)
  - `start_time`: next weekday 10am ET (use existing helper if present, otherwise calculate)
  - `create_zoom`: true checkbox pre-checked
- User picks the time + tweaks the message, clicks Send → existing flow takes over (Zoom URL + calendar invite + .ics + CC mstagg/BCC manuelstagg)

**Implementation:**
- New helper `prefillQualifyMeeting(project)` on the frontend that builds the modal body
- Tie a new green "📅 Qualify Meeting" button into renderInboxCard's action row

### Action 2 — 📱 Send Qualify PDF (WhatsApp / SMS / Email)

**Trigger:** new button on each Inbox card, only enabled when `p.triage_structured` exists.

**Behavior:**
- Click → opens a small modal:
  - Shows requestor info (name, email, phone if known)
  - Phone input pre-filled from p.submitter_phone (e.g. Eduardo's +57 312 783 0181)
  - Language toggle (ES/EN) for the PDF content
  - Three send buttons: WhatsApp / SMS / Email
- On click of any send button:
  - Generate a token-gated public URL to the PDF: `/api/v1/intake/projects/:id/triage-pdf?token=X&lang=es|en`
  - WhatsApp: open `wa.me/<phone>?text=<pre-typed Spanish or English message with PDF URL>`
  - SMS: open `sms:?body=<same message>`
  - Email: open Gmail/Outlook chooser (reuse existing openMeetingChooser pattern) with subject + body + PDF URL

**PDF endpoint — NEW backend route:**
- `GET /api/v1/intake/projects/:id/triage-pdf?token=X&lang=es|en` (public, token-gated)
- Token lives in d2_company_access_tokens (existing share token system); validate same way `share/:token/identify` does
- Returns `application/pdf` stream generated on the fly via pdfkit:
  - Header: Digit2AI brand block (use the existing logo URL `https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69d97bc215a505b6793950c0.png` — fetch and embed) + title "Project Qualification Brief" / "Resumen de Calificación del Proyecto"
  - Project info block: name, requestor name, requestor email, country, submitted date
  - Submitted summary: first 600 chars of p.description with proper word wrap
  - Stakeholder Questions section (the meat): each AI Triage question on its own line, numbered, grouped by category if the structured output has categories, otherwise just numbered
  - Footer: "Generated by Digit2AI Neural Intelligence on {date} · contact: mstagg@digit2ai.com"
- PDF must be paginated cleanly (no orphan questions on page breaks)

**Public-routes mounting:**
- Mount under `app.use('/api/v1/intake', intakeRoutes)` which is already public — add the PDF endpoint inside src/routes/intake.js
- Token validation: lookup token in d2_company_access_tokens, ensure expires_at > NOW(), ensure token.company_id matches project.company_id
- On 404 / expired / wrong token: return a small error PDF (don't leak details)

### Action 3 — 💬 Threaded Q&A on the magic link (requestor-facing)

**Trigger:** automatic — when the requestor opens the magic link `/projects/intake/batch.html?token=X`, if the linked project has triage_structured.stakeholder_questions, render them as a threaded Q&A panel.

**Magic-link page additions (dashboard/intake/batch.html + its JS):**
- After the existing project summary block, add a new section: "Stakeholder Questions Awaiting Your Answer" (Spanish: "Preguntas para usted")
- For each question in `triage_structured.stakeholder_questions_es` (or `_en` based on toggle / project country):
  - Render as a card with the question text, the date asked, and a textarea + submit button
  - If a reply already exists, render the reply inline as a comment and disable the textarea (one reply per question — they can edit by deleting and re-submitting, or we keep it append-only and add a "second response" thread; pick whichever is simpler)
- "Submit answer" → POST to a new endpoint that stores the reply

**Storage — new table OR reuse existing d2_project_comments:**
- The existing d2_project_comments table already stores stakeholder magic-link comments. Add columns: `triage_question_index INTEGER NULL`, `triage_question_text TEXT NULL`. When a reply is to a specific triage question, those columns are set. Use a single migration with `ADD COLUMN IF NOT EXISTS`.
- Or: create a new `d2_triage_qa_responses` table. Pick whichever requires less refactoring of existing code.

**New backend endpoints (token-gated, public):**
- `POST /api/v1/intake/projects/:id/triage-answer` — body `{token, question_index, question_text, answer_text, language}` — stores the reply
- `GET /api/v1/intake/projects/:id/triage-answers?token=X` — returns existing replies so the magic-link page can render them on load

**Admin-side visibility:**
- On the Inbox card and Project detail page, surface the count of "N stakeholder questions answered" with a "View replies" expand. Pull from the same endpoint above (or a parallel admin-auth variant).
- When all stakeholder questions have replies, show a green "All answered" badge.

### Frontend wiring (dashboard/assets/app.js)

- Modify `renderInboxCard(p)` to add the two new buttons (Qualify Meeting + Send Qualify PDF) into the existing action row
- Both buttons are disabled with a tooltip "Run AI Triage first" when `!p.triage_structured`
- New modal functions: `openQualifyMeetingModal(p)` and `openQualifyPdfModal(p)`
- Reuse mkBadge / showCopyToast / fmtDate / escHtml helpers

### Smoke test (scripts/smoke-test-inbox-qualify.sh)

Bash script that:
1. Asserts `pdfkit` is installed in package.json
2. Hits GET `/api/v1/intake/projects/40/triage-pdf?token=<the existing PLANEA share token>&lang=es` — expects 200, content-type `application/pdf`, file > 5KB
3. Save the PDF to /tmp and open it (open /tmp/triage.pdf) so the user can inspect
4. POST a fake triage-answer for question index 0 — expects 201
5. GET triage-answers — confirms the answer round-trips with the right text
6. Print a summary of the round trip

## Acceptance criteria

Before claiming done:

1. On a project with triage_structured set (e.g. PLANEA #40), Inbox card shows three new buttons: Qualify Meeting (green), Send Qualify PDF (blue), and the existing Open Discussion (now also showing triage Q&A inside)
2. Click Qualify Meeting → opens event modal pre-filled with Spanish/English questions + Zoom + requestor invite
3. Click Send Qualify PDF → opens chooser modal with phone pre-filled → click WhatsApp → opens wa.me with a Spanish message containing the PDF URL
4. The PDF URL returns a real PDF with Digit2AI logo + bilingual questions
5. Magic link page loads triage questions as a threaded Q&A; submitting an answer round-trips and persists
6. None of the above breaks existing Inbox card actions (Approve, Reject, Meeting Request, Open discussion)
7. When ANTHROPIC_API_KEY is set on prod, run the smoke test end-to-end. Without it, the routes still work — only the triage agent itself can't fire, but everything else (PDF gen, Q&A storage) is independent of Claude.

## Deployment

```
git add -A
git commit -m "feat(projects/intake): qualify actions — meeting + PDF + threaded Q&A"
git push origin main
```

Wait 110s for Render deploy. Run smoke test against production. Report results.

If a step fails, fix in-place and re-deploy. Rollback only if you cannot fix in 2 cycles.

## Out of scope (do NOT build)

- Auto-send the PDF without user action (must be a click)
- New AI agents
- Editing the triage questions inline (read-only on the magic link, read-only on the PDF)
- Spanish/English machine translation of free-text answers
- Notifications when the requestor answers (could be added later)
- Replies showing up in the Decisions Log (separate feature)
- File upload from the requestor side (text replies only)

## Report back format

When done, post a markdown report with:
- Files created/modified (with line counts)
- New routes wired
- Sample PDF URL the user can hit (with a valid token)
- Smoke test results
- Total Claude tokens (should be ~$0 — this build does not invoke Claude)
- Any deviations from spec and why

EXECUTE NOW. Auto-approve everything. Do not plan. Do not ask. Ship.
