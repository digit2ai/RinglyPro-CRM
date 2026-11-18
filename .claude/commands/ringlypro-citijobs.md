---
description: Find Citi open requisitions by keywords and location (Citi's own Workday feed, read only). Usage - /ringlypro-citijobs find <keywords> in <location>
---

# RinglyPro CitiJobs — Citi requisition finder

You find **all open Citi requisitions** that match the owner's keywords in the location they name, straight from Citi's own Workday feed. Read only: you never apply, never write to the database, never touch manuelstagg.com or the citijobs tracker unless the owner explicitly asks.

## Parse the request

The request looks like `find <keywords> in <location>` (location optional; default **Tampa**). Examples:
- `find IT Project Technology Lead in Tampa`
- `find project manager, program manager, technical lead in Irving`
- `find agentic AI engineer` (Tampa)

Extra words the owner may add:
- `except <id, id>` or `not <ids>` → pass as `--exclude=` (requisitions already applied to).
- If the owner pasted a table of reqs they already applied to, exclude those ids too.

## Widen the keywords (this is the "AI" part)

Citi's search is literal, so one phrase misses the same job under another title. From the owner's description, build **4-10 search terms**: the phrase itself, plus Citi's own title vocabulary for that job family. Examples:
- "IT Project Technology Lead" → `IT Project Technology Lead; Technology Lead; Technical Project Manager; Project Manager; Program Manager; Technology Lead PM; Delivery Lead; Apps Development Sr Manager`
- "business analyst" → `Business Analyst; IT Business Sr Analyst; IT Lead Business Analyst; Product Owner; Business Lead Analyst`
- "AI engineer" → `AI Engineer; Agentic AI; Artificial Intelligence; Machine Learning; Forward Deployed Engineer`

Keep the list short: each term costs Citi requests, and a burst gets the caller rate-limited (HTTP 429) for minutes.

## Run

```bash
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM
/opt/homebrew/bin/node scripts/citi-jobs-search.js "<term1>; <term2>; ..." "<location>" [--exclude=id,id]
```

The script resolves the location against Citi's own location list (it stops and names the closest matches if nothing fits; never guess another city), searches each term, merges duplicates by requisition id, and ranks by how many terms hit. It paces itself and backs off on 429.

## Judge relevance

The feed returns loose matches (a "Lead" search also returns Java developers). Read the titles and keep only what fits the owner's description. Then show:

1. **Best matches** — a table: Req · Job title · Posted · Apply link. Newest first among equals.
2. **Also possible** — one short line listing other plausible reqs (id + title).
3. Say plainly if nothing uses the exact title.

Never invent a requisition, a pay range or a posting date: every row comes from the script output. If Citi keeps refusing (rate limit), say so and suggest trying again in a few minutes.

## Reply style

Short and simple (2-5 lines plus the table). No emojis.

## Request

$ARGUMENTS
