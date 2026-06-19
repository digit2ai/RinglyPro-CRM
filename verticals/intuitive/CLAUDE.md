# Intuitive / SurgicalMind — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. Focused context below.

## What this is
da Vinci surgical sales-ops vertical for Intuitive Surgical. Surgeon Survey, Clinical Dollarization, Proforma Tracker, Business Plan Generator. Strategic contact: Greg Eriksen (Area Sales Manager, Florida).

## Critical domain rules (do not conflate)
- **Incremental** = net-new cases surgeons bring FROM other hospitals (revenue, Step 7 / Business Plan).
- **Conversion** = surgeon's own open cases switched to da Vinci (cost avoidance, Step 6).
- Surgeon commitments use **additive** per-procedure math (converted + net-new) via `src/utils/commitment-math.js`. The `net_new_clean` flag keeps legacy rows from double-counting. Display label "Pull-Forward" → "Splitter".

## Hard constraints
- **Never regenerate proposal MP3 narration without approval** (ElevenLabs token cost). Deck-version key in `src/index.js` gates regen.
- **Render audio dir is ephemeral** — `proposal-audio/` is wiped on every redeploy; ANY code push triggers a full 11-slide regen. Don't push between final narration validation and a live demo.
- Project data is **production-only** — verify by curling live `aiagent.ringlypro.com` endpoints, not locally.

## Env vars
`SENDGRID_API_KEY`+`SENDGRID_FROM_EMAIL` (survey auto-send), `INTUITIVE_ENGAGEMENT_GO=1` (Wave 4).
