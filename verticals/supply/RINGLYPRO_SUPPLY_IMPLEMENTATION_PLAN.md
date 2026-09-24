# RinglyPro Supply — implementation plan and build record

Status on 2026-09-23: **Phase 1 built and tested.** Mounted at `/supply` (folder `verticals/supply/`).
Tests: `node verticals/supply/sit.js` → 126/126 · `node verticals/supply/test-ui.js` → 55/55.
Not tested: a real GoHighLevel sub-account, a real voice call, the model path.

## 1. What already existed

| Piece | Where | What it means for Supply |
|---|---|---|
| RinglyPro CRM | `src/app.js`, `src/routes/*`, `src/services/*` | Single-tenant-per-`client_id` CRM. Voice, SMS, WhatsApp and number provisioning call Twilio directly from 24 files (below). Too coupled to reuse as Supply's call layer. |
| RinglyPro Lite | `ringlypro-lite/` (separate Render service, separate DB) | Has the only telephony abstraction in the repo (`src/telephony/TelephonyProvider.js`), but its one implementation is Twilio and its contract is carrier-shaped (buy number, TwiML). Kept isolated by design; Supply copies its **pattern** (provider interface, allow-list compliance, fail-closed), not its code. |
| Existing GoHighLevel connection | `ghl_integrations` + `clients.settings.integration.ghl`, OAuth refresh in `src/routes/ghl-oauth.js` | Real, refreshed token for CRM client 15. Supply can reuse it read-at-call-time (super admin only), exactly as BuyersLine's staff alerts do. |
| House vertical pattern | `verticals/levelup`, `verticals/lawncopilot` | Self-contained Express router, own Sequelize, migrations run on boot under a lock, `{{BASE}}` pages, SIT with throwaway tenants. Supply follows it. |
| ConversationRelay agent | `src/services/conversationRelayAgent.js` | Twilio-bound. Not reused. |

### Twilio dependency map (not touched by Supply)
CRM: `src/routes/{admin,auth,calls,conditionalForward,elevenlabs-tools,elevenlabs-voice,messages,mobile,outbound-caller,scheduled-actions,voiceBot,voiceWebhook,whatsapp}.js`,
`src/services/{appointmentNotification,conversationRelayAgent,linaSpanishService,linaVoiceService,outbound-caller,rachelVoiceService,treatmentExecutor,twilioNumberProvisioning,twilioNumberService,voiceService,whatsappService}.js`.
Lite: `ringlypro-lite/src/telephony/{index,twilioProvider}.js`, `src/security/twilioSignature.js`.

**Decision:** Supply does not migrate these. It is a new vertical with **zero** Twilio imports (SIT fails if one appears). Migrating the CRM's own voice stack is a separate project; the `CommunicationProvider` built here is the interface that migration would target.

## 2. CommunicationProvider

`src/communications/CommunicationProvider.js` — the only door from business logic to a phone line:
`capabilities · health · upsertContact · setContactContext · startOutboundCall · listCallLogs · upsertOpportunity · parseWebhook`.
Implementations: `GoHighLevelProvider` (production), `NotConnectedProvider` (refuses honestly; there is no "pretend it called" path). `providerFor(tenant)` in `communications/index.js` picks one per tenant. A provider never invents an id.

## 3. GoHighLevel integration map (checked against HighLevel's public docs, 2026-09-23)

| Need | Class | How |
|---|---|---|
| Contacts | API_AUTOMATED | `POST /contacts/upsert` |
| Context the agent reads | API_AUTOMATED | `PUT /contacts/{id}` custom fields `rps_context`, `rps_offer`, `rps_rep`, `rps_campaign` (created on first "Test connection") |
| Start an outbound AI call | API_AUTOMATED | `POST /contacts/{id}/workflow/{workflowId}` — enrolls the contact; the workflow's **Voice AI Outbound Call** action dials. HighLevel has no direct dial endpoint. |
| The outbound workflow | MANUAL | Built once in GHL Automation; its id goes on the campaign. |
| Voice AI agents (inbound + outbound) | MANUAL | Created in GHL; prompts reference `{{contact.rps_context}}` / `{{contact.rps_offer}}` (text on the AI Agents screen). |
| Extraction fields | MANUAL | `rps_outcome, rps_interest, rps_product, rps_quantity, rps_timeframe, rps_wants_transfer, rps_price_discussed, rps_notes` |
| Call results | API_AUTOMATED | `GET /voice-ai/dashboard/call-logs` (Version `v3`): summary, transcript, extractedData, executedCallActions |
| Call-ended / inbound signals | WEBHOOK_DRIVEN | Workflow Webhook action → `/supply/webhooks/ghl/<tenant token>` |
| Human transfer | MANUAL | Call Transfer action on the agent; recorded from call-log actions |
| Opportunities | API_AUTOMATED | `POST /opportunities/`, `PUT /opportunities/{id}`; pipeline + stage ids mapped on the GoHighLevel screen |
| Phone numbers, calendars | MANUAL | Bought / configured in GHL |
| Webhook signatures | NOT_CURRENTLY_SUPPORTED | Workflow webhooks are unsigned → secret per-tenant URL token + optional `X-Supply-Token`, constant-time compare, location check |
| Dial without a workflow | NOT_CURRENTLY_SUPPORTED | Not in HighLevel's public API |

**Callback recognition works without any webhook:** after every call the current context is written onto the GHL contact, so when the contractor calls back the inbound agent already has it. The inbound webhook only refreshes it. A `GET /webhooks/ghl/<token>/context?phone=` endpoint also exists for a Voice AI custom action.

## 4. Data model (22 `sup_` tables, `migrations/20260923_supply_tables.sql`, run on boot, idempotent)
tenants · users · sales_reps · categories · products · product_relevance · competitors · competitor_prices · contractors · suppression · campaigns · campaign_targets · calls · buyers · transfers · sales · commissions · webhook_events · audit · integration_health · locks.
External ids stored beside local keys: `ghl_contact_id`, `ghl_opportunity_id`, call `provider_call_id`; tenant `ghl.location_id / pipeline_id / stage_map / agent ids / default_workflow_id`. Billing fields (`sup_tenants.billing` JSONB) are reserved; no pricing model is coded.

## 5. Multi-tenant strategy
- One tenant per supplier; every tenant table has `tenant_id NOT NULL` + index.
- **Enforced in the data layer:** `db.tq/tone/trun` refuse a query that lacks `tenant_id = :tenant` (or an insert without `:tenant`). Business services may not use the unscoped helpers (SIT greps). Tenant id comes from the signed-in user row, re-read every request, never from a body.
- Super admin sees counts and money per tenant only; acting inside a tenant is audited in that tenant's log.
- A tenant can store its own GHL token; only a super admin can point a tenant at an existing CRM GHL connection.

## 6. Intelligence
- **Product Intelligence** (`services/intelligence.js`): keyword evidence per tenant category → saturating score with the matched words as the reason; optional model adjustment limited to existing categories; manual scores never overwritten. LV-100 → Flooring 92, Remodeling 83, General 61, Plumbers 8.
- **Competitive pricing** (`services/pricing.js`): recorded by a person/import, never scraped. Match confidence from UPC / brand+model / part number / attributes; name-only ≤ 0.50; unit mismatch ≤ 0.30. Claimable only when verified, fresh (30 days), same unit, and higher than our price.
- **Offer engine** (`services/offers.js`): all figures computed; comparison only from a claimable price; a model rewrite is discarded if it adds a number or a comparison.
- **Campaign generator** (`services/campaigns.js#generate`): ranks by verified saving, margin, stock value; writes drafts with the reasoning.
- **Contractor matching**: best relevance of the campaign's products to the contractor's category, geography filter, compliance filter.

## 7. Campaigns, dialer, compliance
Draft → pending approval → approved → active; approve/activate need owner/admin; activation needs a GHL workflow id; a material edit after approval resets to draft. Dialer (`services/dialer.js`) re-checks DNC, opt-out, consent and calling hours in the **contractor's** timezone at dial time; daily limit per campaign; failed dispatch = call `failed`, target requeued with the reason. Loop runs only in production or `SUPPLY_DIALER=on`, one instance at a time (lease row). National DNC scrubbing is **not built** (needs an FTC SAN); scrubbed numbers load as `national_dnc`.

## 8. Customer memory, buyers, attribution, commissions
- Memory (`services/memory.js`): deterministic ≤1,500-char summary from rows; no model, so it cannot recall what did not happen.
- Outcome: extracted field → transfer action → conservative keyword rules; unclassifiable = no outcome, no buyer.
- Potential Buyer: one open per contractor+product; **campaign and original outbound call set once, never edited** (API and UI). A callback updates needs, not attribution.
- Sale recorded by a person; attribution copied from the buyer; commission % from the rep, else tenant default, stored at sale time; pending → approved → paid; nothing pays anyone.

## 9. Security
Cookie JWT audience `supply`, 12 h, user re-read per request; `X-Supply: 1` header on every mutation; published passwords refused; owner super admin seeded only from a private `SUPPLY_OWNER_PASSWORD`; GHL token AES-256-GCM (`SUPPLY_SECRET`), never returned; webhook token constant-time; audit log for settings, GHL, campaigns, suppression, sales, commissions, super-admin actions.

## 10. Environment variables
`SUPPLY_OWNER_PASSWORD` (+ `SUPPLY_OWNER_EMAIL`, default mstagg@digit2ai.com) · `SUPPLY_JWT_SECRET` (falls back to `JWT_SECRET`) · `SUPPLY_SECRET` (token encryption; falls back to `JWT_SECRET`) · `SUPPLY_DATABASE_URL` (falls back to CRM DB) · `SUPPLY_DIALER` (`on`/`off`) · `SUPPLY_DIALER_INTERVAL_SEC` (60) · `SUPPLY_MODEL` (Haiku; `off` = rules only) · `SUPPLY_SIGNUP` (`off` closes signup) · `SUPPLY_GHL_BASE`, `SUPPLY_GHL_VOICE_VERSION` (`v3`). Reuses `ANTHROPIC_API_KEY`.

## 11. Migration risks
1. GHL Voice AI extraction is configured by hand; if the agent does not return `rps_outcome`, outcomes fall back to keyword rules on the summary (labelled `rules`).
2. The call-logs endpoint has no documented `toNumber`/`direction`; direction is inferred from our own dispatched row.
3. Workflow webhooks are unsigned; security rests on the secret URL token.
4. HighLevel's per-location daily outbound cap (5,000) and its compliance checks apply on top of ours.
5. Reusing the CRM client-15 connection shares that sub-account's contacts; a dedicated sub-account per supplier is the clean path.

## 12. Phases
- **Phase 1 (done):** everything above, SIT + UI tests, mounted at `/supply`.
- **Phase 2 (needs the owner):** connect a GHL sub-account, build the outbound workflow + two Voice AI agents with the prompt text on the AI Agents screen, point the call-ended webhook, run one real test call each way.
- **Phase 3:** licensed competitor price feed, FTC DNC scrub, billing model, per-rep dashboards, SMS follow-up through the provider.

## 13. Acceptance scenario (steps 1–18)
All 18 steps run in `sit.js` against a fake provider: LV-100 at $1.89 with 20,000 sq ft; flooring/remodel/GC relevance; Home Depot $2.69 verified (29.7%); generator draft; approval; ABC Flooring LLC queued; enrollment in the outbound workflow; interest → Potential Buyer with campaign + original call + Samuel; callback matched by phone with context; transfer recorded to Samuel; sale $3,780 attributed to tenant/product/campaign/original call/contractor/rep; commission 5% = $189.00. No Twilio in the path.
