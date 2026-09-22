# LevelUp Media Marketing — Unified Requirements

One document that merges and supersedes:

1. **Creator Agent Workforce — System Architecture** (2026-09-21) — a writeup of a recorded Spanish-language training call from The Artillery creator community describing ONE creator's private back office run by cloud AI agents on a third-party platform ("GrokBot").
2. **The Integrated Content Creator System — Project Brief** (2026-09-22, prepared for Andrea) — the product vision: one warm, simple home for planning, scripting, editing, posting and the business side of being a creator, for MANY creators.

Product name: **LevelUp Media Marketing** — domain **levelupmediamarketing.com**, also served at **aiagent.ringlypro.com/levelupmediamarketing**.

Where the two sources disagree, **the Project Brief wins** (it is the owner's stated requirement); the architecture writeup is used where it confirms, sharpens or usefully challenges the plan. Each such decision is marked **[DECISION]**.

---

## 1. Vision and goals

An all-in-one system that gives content creators everything they need to plan, create, edit and publish content, and to run the business side of their work. The system gets to know each creator deeply and tailors every idea, script and edit to their brand, objectives and style.

Guiding principles:

- **Helpful and friendly first.** Every screen hand-holds the creator and reduces overwhelm.
- **Editing is the key seller.** It is the biggest pain point and the feature that sets the product apart.
- **The creator stays in control.** Nothing is published or sent without the creator reviewing and approving it.
- **Their voice, not ours.** Everything produced is tailored to the individual creator.
- **Warm, community-first look.** Approachable language; soft, feminine, welcoming design.

## 2. Architecture decision: a multi-tenant product built as an agent workforce

**[DECISION]** The writeup describes one creator's back office on a third-party platform; the brief requires a product many creators sign up for. LevelUp therefore takes the writeup's *pattern* — a manager agent that hands work to single-job specialist agents — and builds it as **our own multi-tenant MCP ecosystem**, not on GrokBot. Reasons (from both sources): third-party infrastructure, pricing and rules; not built to serve many creators; credentials held by a vendor; self-hosted laptop agents were unstable (the "Open Claw" Mac Mini attempt failed after a week).

- **One MCP Brain** is the only door to every agent. It enforces, in code: tenant isolation (the tenant comes from the session or API key, never from a tool argument), channel rules, human-only actions, a per-tenant daily model-call cap, and an audit row for every call including denials.
- **Andrea**, the manager agent, is the creator's single point of contact. Every specialist reports through it; the creator may still open any agent directly.
- Runs **in the cloud, always on**, so work continues when the creator's laptop is closed.
- An **MCP endpoint** lets the creator's own AI tools call the same agents with a scoped API key.

### 2.1 The agent roster

| Agent | Team | Job | Status in v1 |
|---|---|---|---|
| Andrea | Management | Takes instructions, routes to the right specialist, reports, asks for approval | Built |
| Creative Strategist | Core | Finds niche, content pillars, offer and a realistic plan from the creator's own words | Built |
| Ideas | Core | Ideas per pillar, or built from the creator's own thoughts | Built |
| Scripts | Core | Scripts from proven structures, written fresh in the creator's voice | Built |
| Calendar | Core | Interactive calendar, statuses, batching suggestions | Built |
| Video Editor | Core | Base cleanup + style layer via Descript | Job queue and rules built; **Descript connection not built** |
| Publisher | Core | Platform-ready draft package per post | Draft package built; **no platform API connected — creator posts by hand** |
| Business Assistant | Add-on | Brand-email analysis, lead filtering, rate replies, retainers | Built (paste-in, read only); **inbox connection not built** |
| Product Research | Add-on | Product ranking and top-video structure analysis | Structure analysis built; **data provider (Kalodata / TikTok Shop) not connected** |
| Top Picks | Add-on | Shoppable lists with a public page | Built (manual item entry, no scraping) |
| Trainer | Platform | Holds the knowledge and rules every agent reads | Built |

Out of v1, recorded so they are not forgotten: Outreach (on hold in the source as "not the right business model"), Accounting, Invoicing as its own step (see Open questions), AI video generation, native apps.

## 3. Training: every agent and the Brain learn this ecosystem

This is the requirement that ties both sources together (skills, memory and "Teach-a-Task" in the writeup; "the system gets to know each creator" and "this keeps happening" in the brief).

- **Knowledge documents** (text or markdown) and **rules** (corrections) are stored per creator, scoped to **all agents** or to **one agent**. Every model call made by that agent receives them.
- **Platform knowledge** (tenant 0) applies to every creator on LevelUp; only a platform admin can write it.
- **Rules travel first**, above documents, under "Team corrections", and still below each agent's own safety rules.
- Editing a document or rule creates a **new version**; the old one stays in the history. Deactivating stops agents reading it; nothing is deleted.
- **"This keeps happening"** on the editing review screen counts repeats of the same issue; on the **third** repeat LevelUp proposes a general rule for the creator to confirm. It never writes a rule on its own. ("If the same error happens three times, it is an instruction problem.")
- **Test the training**: ask an agent a question with and without the knowledge and see both answers side by side.
- This is **context, not model retraining**, and the product says so.

## 4. Who it serves and how it is packaged

| Tier | Best for | Included |
|---|---|---|
| Core | Every creator | Creative strategist, ideas, scripts, interactive calendar, editing with in-app drafts |
| Add-on: Product Research | TikTok Shop sellers, Amazon influencers | Product analysis, top-video structure breakdowns, scripts from proven structures |
| Add-on: Business Assistant | Creators working with brands | Read-only inbox assistant, deal analysis, rate replies, lead filtering, retainers |
| Add-on: Product Links and Top Picks | Creators who recommend or sell products | Curated shoppable lists, shareable page, click and earnings tracking |
| Add-on: Short Course | Creators leveling up | Filming, scripting, and the phone-to-folder setup lesson |

Pricing reference (stated on the recorded call, not verified): an agent platform runs about USD 20/month light to USD 100–200/month heavy, against a human editor or inbox assistant costing well above USD 200/month. Tier prices are an open decision.

## 5. Look and feel

- Soft blush pink as the main color, with pastel blue, mint green and peach to color-code accounts, pillars and statuses. The same color always means the same thing.
- Rounded cards, generous white space, clear section titles.
- Handwritten script accents for the logo and encouraging notes; clean readable body text.
- Warm microcopy ("You're doing amazing", "Progress over perfection").

Dashboard areas: left menu (Dashboard, Content Calendar, Today's Plan, Content Pipeline, Batch Planning, Affiliate Tracker, Analytics Tracker, Notes and Ideas, Resources, Settings) · stat cards · Today's Plan (status, pillar, purpose, hook, format tags, effort, destinations, Mark Day Complete) · color-coded month calendar · pipeline Planned → Filmed → Editing → Ready to Post · Quick Actions · Content Pillar progress · This Week's Focus · Top Performing Posts · Affiliate Tracker · Notes and Reminders.

**[DECISION]** Views, revenue and "top performing posts" need official platform data. Until a platform is connected those cards say **"Not connected"** — never a sample number presented as the creator's.

Phone: single column with Today first; the left menu becomes a bottom tab bar (Today, Calendar, Pipeline, Batch, More); stat cards and pipeline columns swipe; the calendar collapses to a week strip; 44px tap targets; one clear action per screen. Delivery: responsive web app → installable home-screen app (PWA) → native iPhone/Android later (with a "Send to Editing" share action).

## 6. Core: Creative Strategist

Creators share their brand, objectives, style, audience and what they sell; psychology-based prompts help them find voice, values and strengths. Output: a recommended niche, 3–5 content pillars, a clear offer, a realistic plan for their time and energy, and a **living creator profile** every other agent reads. The more they share, the more tailored every output.

## 7. Core: Ideas and Scripts

- Ideas are built around the creator's pillars, or from thoughts the creator feeds in.
- Scripts use copywriting and consumer psychology.
- **Originality rule:** copy 100% of a proven *structure* (hook type, pacing, proof, objection handling, call to action) and write every word fresh in the creator's voice. **[DECISION]** Enforced in code: a script may not reproduce 8 or more consecutive words from a reference transcript, and any number the creator never gave is flagged "confirm before filming", never presented as fact.

## 8. Core: Interactive Content Calendar

Each post tracks type/format, purpose (grow, connect, sell), links, what is needed to film, effort, destination accounts, and a status: **idea → script → filmed → editing → edited → approved → posted**. Filters by type, needs and effort; a Today view is the default screen; batching suggestions group posts that share a location, outfit or setup; retainer deliverables appear automatically when the Business Assistant is on.

## 9. Core: the Editing Pipeline (headline feature)

The creator records, shares raw footage, and the software edits it in **Descript** (independently confirmed by the second source, which dropped CapCut as too slow with poor results), then notifies the creator when a first draft is ready to review.

Two layers: **base cleanup** (always on) and a **style layer** built from the creator's style profile and example videos (captions, fonts, music, zooms, images, B-roll — rolls out after base cleanup).

Default editing rules (each creator can adjust):

1. Start on the hook — the first word, no dead space; never cut off the first word.
2. Mistakes and repeated takes — keep the clearest version; drop failed attempts and "again"; keep repetition meant for emphasis.
3. Filler words — remove uh, ah, um when natural; keep words that carry meaning or personality.
4. Pauses and pacing — trim long silences; keep breaths and short pauses that help.
5. Smooth cuts — never cut words, syllables or sentence endings.
6. Respect the message — no invented sentences, generated voice, replaced words, sped-up voice or changed tone.
7. Base edit only by default — captions, music, zooms, effects, overlays and B-roll only when requested or in the style profile.
8. Ending — keep the full final sentence and call to action; remove trailing time.
9. Review before export — hook, best takes, cut-off words, audio flow, full message, sync.

Delivery: MP4, original orientation and resolution, file named `<original>_EDITED`, original always kept, one editing agent per task, and **a specific blocker reported when something cannot be done — never marked complete if not exported**.

**Editing and publishing are two separate steps** with separate statuses, notifications and approvals.

Quick review checklist (seconds, not minutes): hook starts immediately · no strange pause · no absurd filler · best take chosen · cuts feel natural.

## 10. Getting footage in: phone to folder

Record → select videos in Photos → Share → **SEND TO EDITING** → files land in the `01_TO_EDIT` inbox folder → a new file means a new editing task → Descript applies the creator's rules → the creator reviews.

iOS Shortcut: Save File action, input = Shortcut Input (the fix when the folder came up empty), destination `01_TO_EDIT`, Ask Where to Save off, Overwrite off, Show in Share Sheet with input type Media; test with one video, then several; large files need time to sync.

Troubleshooting: not in folder → check destination and Shortcut Input · cloud icon → still syncing · not picked up → check the trigger and watched folder · edit looks strange → improve the editing instructions, the tool is usually fine. Find which step failed; never start over from zero.

Product ideas: a guided setup wizard with screenshots, Android / Google Drive / Dropbox paths, an in-app "send me a screenshot of where you are" help, a native share action later, and the setup as a Short Course lesson.

## 11. Permissions, approval and the path to automation

Two rules hold everywhere; they are the safety floor, not temporary limits:

- **Rule 1 — read only stays read only.** Anything touching an inbox, messages or accounts only reads and drafts. It never sends a reply, closes a deal or acts on the creator's behalf without that specific action being approved.
- **Rule 2 — posts default to drafts.** Every edited video lands as a draft; the creator publishes.

Scheduled publishing is an opt-in, per-account upgrade for **posting only**: draft-and-approve (default, always available) → scheduled publishing of already-approved videos at chosen slots → pause any time, full log, switch back to manual. It never extends to brand replies, messages or anything involving money.

**[DECISION]** The writeup's autonomy ladder (supervised → assisted → ~99% autonomous) is adopted **for posting only**. Brand replies, deals and invoices stay supervised in LevelUp regardless of settings. In v1 the "approve" and "mark posted / mark sent" actions are human-only: the MCP key and the agents cannot perform them, and LevelUp records "marked sent by you" rather than claiming it sent anything.

**Platform risk [DECISION]:** the second source used a custom Android app to get past TikTok's slider CAPTCHAs. That may break TikTok's terms and put accounts at risk. LevelUp uses **official APIs and partner programs only**, never workarounds or scraping.

## 12. Add-on: Product Research

Product analysis, rankings and best sellers; what brands pay including commission rates; a fit score against the creator's niche and audience; breakdowns of top videos' structure; scripts built from those structures in the creator's voice, sent into Scripts and the Calendar. Data access needs an official API or licence (Kalodata, TikTok Shop partner APIs, other providers). **No scraping.** v1 ships the structure analysis from a transcript the creator pastes; product data says "not connected" until a licensed source exists.

## 13. Add-on: Business Assistant

v1 (the brief's simpler, fully supervised version):

- Read-only access to the creator's brand email (v1: the creator pastes or forwards the text), every reply approved before it goes.
- Reviews brand emails, analyzes the deal, works out which account it is for (rates differ by account and audience size), drafts a reply using the creator's **rate card**, **negotiation template** and tone.
- **[DECISION]** A draft may only contain a price that is on the creator's rate card. A draft with any other figure is discarded for the template version. No rate card = no price in the draft, and it says so.
- Filters real leads from fake. Red flags: sender or brand cannot be verified · vague offer with no deliverables or budget · asks the creator to pay upfront · sender domain does not match the brand.
- Retainers: brand, monthly rate, deliverables, due dates, renewal date, payment status; reminders, behind-schedule alerts, draft renewal / rate-increase replies for approval; deliverables linked to the calendar.

Later release (from the writeup, larger scope): TikTok inbox filter with a standard "email me" redirect; qualify → approval gate → close → invoice → report. Only through official APIs and only once the simpler assistant has earned trust.

Knowledge the assistant needs: rate card, negotiation template, deal and brand history, the creator's tone learned from edits at approval.

## 14. Add-on: Product Links and Top Picks

Curated lists ("Fall Kitchen Favorites", "Under $25 Finds") with product name, image, price, retailer, affiliate or tracking link and a short "why I picked it" note; a clean shareable page in the creator's branding for the link in bio; lists linked to calendar posts; click tracking per link and per list (orders and earnings only where an affiliate program reports them). Pulling product details automatically needs each retailer's own program; **no scraping**. v1: manual entry, public page, click counting.

## 15. Add-on: Short Course

A short course, created together, on filming, working through scripts, and the phone-to-folder setup.

## 16. Integrations

| System | Used by | Official path | v1 |
|---|---|---|---|
| Descript | Video Editor | Descript API / partner terms | Not built — verify API and multi-creator terms |
| iCloud / Google Drive / Dropbox | Video Editor | Drive/Dropbox APIs; iCloud likely needs a companion app | Not built |
| TikTok, Instagram, Facebook | Publisher | Content Posting API / Graph API (app review) | Not built |
| Brand email | Business Assistant | Gmail / Microsoft OAuth read-only | Not built (paste-in) |
| Kalodata / TikTok Shop / Amazon | Product Research, Top Picks | Licensed API / affiliate programs | Not built |
| Edge neural TTS + Web Speech | Voice orb on the site | Existing shared routes | Built |
| Claude (Anthropic) | Every agent's prose | Existing key | Built; keyless fallback labelled |

## 17. Security, reliability and cost

- Dedicated business email for automation; banking and payment accounts never connected.
- The approval step is the main defense against a wrong price, a wrong tone, or a manipulated brand email. Pasted emails are treated as data: instructions inside them are ignored and flagged.
- Rate cards and negotiation templates are stored per creator, isolated by tenant; nobody else can read them.
- Cloud execution avoids the laptop-sleeps failure; expected weak points are expiring logins, export time on long videos, and platform rule changes.
- Every model call is audited and capped per creator per day.

## 18. Build phases

1. Core planning — profile, strategist, ideas, scripts, calendar, dashboard; test with a small group. **(v1, built)**
2. Base-cleanup editing — folder inbox, Descript, in-app drafts, notifications, approval. **(job queue + rules built; Descript pending)**
3. Style layer and posting drafts to platforms.
4. Add-ons — Product Research, Business Assistant with retainers, Top Picks, Short Course. **(partial v1 as above)**
5. AI video creation (optional).
6. Native apps with a built-in "Send to Editing".

## 19. Open questions and things to verify

- Descript API access, pricing and terms for a multi-creator product.
- How outside software can watch an iCloud folder (companion app vs Drive/Dropbox).
- Data source for Product Research (Kalodata licence, TikTok Shop, Amazon).
- Platform approvals for posting drafts to TikTok, Instagram and Facebook.
- Permissions and security review for read-only inbox access.
- Official analytics and affiliate data for Top Performing Posts and the Affiliate Tracker.
- How far the home-screen web app goes on iPhone before native.
- How much of the style layer is automated in the first release.
- Tier pricing.
- Where the rate card and negotiation template live and who can edit them (v1: the creator, in Settings).
- Invoicing: its own step or part of deal closing.
- Outreach to new brands: build it or keep out of scope.
- Whether to prototype on an existing agent platform first (v1 answer: no — built directly as our own ecosystem).
- Which link and affiliate programs to integrate first.
- What an account must show before scheduled publishing is offered (e.g. a minimum number of approved drafts without edits).
- The missing part of the recorded call (00:47:28–01:11:42) holds the editing prompt, Descript settings and storage connection used by the source creator.
- Stated on the call, never verified: GrokBot plan tiers, agent limits and data-retention terms.
