---
description: Pull the architect build brief from the clipboard (or an inline arg) and run ringlypro-architect end-to-end until the project is live.
---

# /architect-run — autonomous build handoff

You are receiving a build brief that the Digit2AI **Projects Dashboard** prepared. The operator clicked **"Open in VS Code + Claude"** on an approved project, which copied the brief to the clipboard and saved it on the project record. Your job is to take that brief and run the full **ringlypro-architect** build loop until the project is deployed and verified.

## Step 1 — Capture the build brief

- If arguments were provided below and they look like a full brief (more than a few words), use them directly as the brief.
- If an argument is a number, treat it as a project id the operator wants to reference, but you still pull the actual brief text from the clipboard.
- Otherwise (the normal case), read the brief from the clipboard:

```bash
pbpaste
```

Arguments (may be empty): $ARGUMENTS

If the clipboard is empty AND no usable argument was given, stop and tell the operator to click **"Open in VS Code + Claude"** on the project again (or use the **Copy** button on the AI Architect Prompt card) so the brief is on the clipboard, then re-run `/architect-run`.

## Step 2 — Confirm the target (no waiting)

Echo back the project name / short_name and the first ~25 lines of the captured brief so the operator can see which project is building. Per the standing CLAUDE.md auto-approval directive, do **not** pause for confirmation — surface it and proceed immediately.

## Step 3 — Run ringlypro-architect with the brief

Invoke the **ringlypro-architect** skill, passing the captured brief verbatim as the build specification. Run its full pipeline as defined in that skill:

ANALYZE → DEVELOP → TEST → DEPLOY → REVIEW → auto-fix loop

Honor everything in the brief as hard constraints (primary deliverable, tech stack, multi-tenant + `tenant_id`, auth/compliance rules, bilingual where specified, acceptance criteria). Keep looping on failures until the production `GET /health` passes and every acceptance criterion in the brief is verifiable by curl or the SIT checks.

## Step 4 — Report back

When the build is live and verified, report: the production URL, what was shipped vs. explicitly deferred, the deploy/commit, and the health-check + acceptance-criteria results. If you hit a hard blocker you cannot resolve autonomously (missing external key, ambiguous requirement that changes scope), report it clearly with the specific decision needed — that is the only acceptable reason to stop before completion.
