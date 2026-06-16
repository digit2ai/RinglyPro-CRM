---
description: Migrate every Anthropic Claude model ID in the repo to the current tiered scheme (Opus 4.8 / Sonnet 4.6 / Haiku 4.5). Runs as ringlypro-architect on the most capable model.
argument-hint: "[optional: path or vertical to scope, e.g. verticals/cw_carriers]"
model: claude-opus-4-8
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# /upgrade — Claude Model Tier Migration (ringlypro-architect)

You are **ringlypro-architect** running on the **most capable + latest** Claude model (Opus 4.8). Your job for this command is a safe, surgical migration of **Anthropic Claude model IDs** across the codebase to the current, supported tiered scheme. **Change only model identifiers and their cost tables — never change prompts, parameters, business logic, or behavior.**

## Target tiered scheme (the only allowed destination IDs)

| Tier | Target model ID | Use for |
|---|---|---|
| **Core reasoning / agents (high-stakes)** | `claude-opus-4-8` | Orchestration, architect/prompt-synthesis, senior analyst, deep multi-step reasoning, viability/strategy analysis, code generation |
| **Workhorse features** | `claude-sonnet-4-6` | Chat, drafting, summarization, tool use, intake/triage, document analysis, general app traffic |
| **High-volume classifiers** | `claude-haiku-4-5-20251001` | Classification, routing, tagging, extraction, short yes/no pre-filters, anything high-frequency + simple |

Always migrate **forward** to these IDs. Never introduce dated snapshots other than the Haiku ID above. Never leave a retiring/legacy ID in place.

## Legacy / retiring IDs to replace (non-exhaustive — find all)

- `claude-opus-4-20250514`, `claude-opus-4-6`, `claude-opus-4-7` → **`claude-opus-4-8`**
- `claude-sonnet-4-20250514`, `claude-sonnet-4-5-20250514` (invalid/typo), `claude-sonnet-4-5-20250929` → **`claude-sonnet-4-6`** (unless the call site is clearly high-stakes core reasoning — then `claude-opus-4-8`)
- `claude-3-5-sonnet-20241022`, `claude-3-haiku-*`, `claude-3-*` → workhorse `claude-sonnet-4-6`, or `claude-haiku-4-5-20251001` if it's a classifier
- Any other `claude-*-YYYYMMDD` dated snapshot → its tier equivalent above

## How to classify each call site

Read the surrounding code and the feature's purpose, not just the variable name:
1. **Opus 4.8** if it's: the architect / prompt synth (`architectPromptSynth`), the Senior Business Analyst (`businessAnalystAgent`), MCP orchestration/planning, multi-step agent reasoning, strategy/viability/clinical-grade analysis, or code generation.
2. **Haiku 4.5** if it's: a classifier/router/tagger/short-extractor, or named `classifier`/`triageRouter`/`tracking`/`maintenance` and produces small structured output at high volume.
3. **Sonnet 4.6** for everything else (the safe default). When genuinely ambiguous, choose Sonnet 4.6 and **flag it** in the final report for human review.

## Process (follow in order)

1. **Inventory.** Run a repo scan (exclude `node_modules`, `package-lock.json`, `.git`):
   ```
   grep -rniE "claude-(opus|sonnet|haiku)-[0-9a-z-]+" --include='*.js' --include='*.ts' --include='*.json' . | grep -v node_modules
   ```
   If an argument was passed, scope the scan to that path/vertical only.
2. **Build a classification table** — every file:line, current ID, target ID, tier, and one-line reason.
3. **Apply edits** per file with Edit:
   - Replace the model ID with the tiered target.
   - **Preserve every `process.env.XXX_MODEL || '...'` override pattern** — only change the fallback literal.
   - If the file has a cost-rate map (e.g., `COST_RATES`), add the new model's rate (`claude-opus-4-8`: $15/$75 per MTok; `claude-sonnet-4-6`: $3/$15; `claude-haiku-4-5-20251001`: ~$1/$5) and update any default fallback to a current ID.
   - Update stale comments that name an old model.
4. **Do NOT touch**: `CLAUDE.md`, historical `*_COMPLETE.md` notes, migration comments describing past state, or anything in `node_modules`. Documentation `.md` references may be updated only if they are live instructions, not historical records.
5. **Verify**:
   - `node -c <file>` (syntax) on every edited `.js`.
   - Re-run the grep to confirm **zero** legacy/retiring IDs remain in scope.
6. **Report** a before/after table grouped by tier, list any files left on Sonnet-by-default that a human should confirm, and note any env vars (`ARCHITECT_MODEL`, `SENIOR_BA_MODEL`, `TRIAGE_PREVIEW_MODEL`, etc.) that override the literals.
7. **Commit & deploy** per repo convention (branch is `main`, Render auto-deploys on push). Commit message:
   `chore(models): migrate Claude model IDs to tiered scheme (Opus 4.8 / Sonnet 4.6 / Haiku 4.5)`
   End the commit body with the standard co-author trailer.

## Guardrails

- This is a **mechanical, reversible** change set — model IDs and cost tables only. If a change would alter behavior beyond model selection, stop and flag it instead.
- Already-correct IDs (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) are left as-is.
- If `$ARGUMENTS` is provided, restrict the entire run to that path; otherwise cover all of `src/`, `digit2ai-projects/`, `verticals/`, `chamber-template/`, and `mcp-integrations/`.
- Report results after completion — do not ask for permission mid-run (operations are pre-authorized).
