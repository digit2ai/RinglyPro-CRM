# Neural Intelligence — Architecture & Data Flow

## How Neural Intelligence Gathers Data

Neural Intelligence does NOT hardcode API keys or make direct external API calls to CRMs. Instead, it operates on a **local data lake** pattern: external systems push data INTO RinglyPro's PostgreSQL database via webhooks and sync jobs, and Neural queries that local data to generate insights.

---

## Data Source 1: ElevenLabs Voice AI Logs

### How call data gets into the system

```
Caller ──▶ Twilio ──▶ ElevenLabs Voice AI ──▶ Post-Call Webhook ──▶ RinglyPro DB
```

1. **Inbound call arrives** via Twilio (`POST /voice/elevenlabs/incoming`)
2. Twilio routes the call to ElevenLabs Conversational AI via WebSocket
3. ElevenLabs handles the conversation (Rachel/Ana/Lina voice agents)
4. **When the call ends**, ElevenLabs fires a post-call webhook to `POST /voice/elevenlabs/post-call-webhook`
5. The webhook handler extracts: `conversation_id`, `duration`, `transcript`, `phone_number`, `agent_id`, `call_type`
6. It identifies the client by matching `agent_id` → `clients.elevenlabs_agent_id`
7. Call data is **inserted into the `messages` table** (and linked to `calls` table via status webhooks from Twilio)

### What Neural queries

The Neural Engine runs SQL queries against the **local `calls` table**:

```sql
-- Missed calls analysis
SELECT COUNT(*) FROM calls
WHERE client_id = :clientId
  AND call_status IN ('missed','no-answer')
  AND direction IN ('incoming','inbound')
  AND created_at >= :since

-- Call duration patterns
SELECT CASE WHEN duration >= 90 THEN 'long' ELSE 'short' END AS bucket,
       COUNT(DISTINCT c.id) AS call_count,
       COUNT(DISTINCT a.id) AS booking_count
FROM calls c LEFT JOIN appointments a ...

-- After-hours call patterns
SELECT COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM created_at) < 9
       OR EXTRACT(HOUR FROM created_at) >= 18) AS after_hours
FROM calls WHERE client_id = :clientId
```

**Key point**: Neural never calls the ElevenLabs API. All voice data is already in PostgreSQL via webhooks.

---

## Data Source 2: CRM Integrations (GHL, HubSpot, Zoho)

### Are API connections hardcoded?

**No.** CRM API credentials are stored per-client in the `clients` table and configured through the Settings pages:

| CRM | Settings Page | Where Credentials Are Stored |
|-----|--------------|------------------------------|
| GoHighLevel | `/settings/ghl` | `clients.ghl_api_key`, `clients.ghl_location_id`, or `ghl_integrations` table (OAuth) |
| HubSpot | `/settings/hubspot` | `clients.hubspot_api_key`, `clients.settings->'integration'->'hubspot'` |
| Zoho CRM | `/settings/zoho` | `clients.settings->'integration'->'zoho'` (OAuth refresh token) |

Each client configures their own API credentials via these settings pages. The credentials are stored encrypted in the database and are never shared across tenants.

### How CRM data flows into RinglyPro

CRM data enters the local database through several mechanisms:

1. **Appointment sync** — When Rachel books an appointment during a call, it's written to the local `appointments` table AND synced to the connected CRM (GHL calendar, HubSpot meeting, or Zoho event)
2. **Contact creation** — New callers are auto-created as `contacts` locally and optionally synced to the CRM
3. **GHL Calendar Cards** — The dashboard fetches GHL calendar data via API and displays it, with data cached locally
4. **HubSpot availability** — When booking, RinglyPro checks HubSpot meeting link availability in real-time

### What Neural queries from CRM data

Neural currently queries the **local tables** that contain CRM-synced data:

```sql
-- Appointments (synced from GHL/HubSpot/Zoho)
SELECT COUNT(*) FROM appointments
WHERE client_id = :clientId AND status = 'no-show'

-- Contacts (created from calls, synced to CRM)
SELECT source, COUNT(*) AS lead_count
FROM contacts WHERE client_id = :clientId
GROUP BY source

-- Connection status check (reads client config, not external API)
SELECT ghl_api_key, hubspot_api_key, settings
FROM clients WHERE id = :clientId
```

### Current limitation

**Neural does NOT currently make live API calls to GHL, HubSpot, or Zoho to pull pipeline data, deal stages, or account activity.** It only analyzes data that has already been synced into the local PostgreSQL tables via webhooks and sync jobs.

The "Connections" panel on the Neural dashboard shows whether each CRM is configured (has API key stored), but doesn't verify the connection is live.

---

## Neural Intelligence Analysis Pipeline

The Neural Engine (`src/services/neuralEngine.js`) runs 10 analyzers:

| # | Analyzer | Data Source | What It Detects |
|---|----------|-------------|-----------------|
| 1 | Missed Revenue Detector | `calls` table | Missed/no-answer incoming calls |
| 2 | Call Conversion Intelligence | `calls` + `appointments` | Call duration vs booking correlation |
| 3 | Lead Response Speed | `contacts` + `calls` + `messages` | Time to first outreach after lead creation |
| 4 | Scheduling Optimization | `appointments` | Underbooked days of the week |
| 5 | Voice Conversation Insights | `calls` | Calls ending < 30 seconds (engagement failure) |
| 6 | Lead Source Intelligence | `contacts` + `appointments` | Which lead sources convert best |
| 7 | Outbound Campaign Performance | `calls` (outgoing) | Best time of day for answer rates |
| 8 | No-Show Pattern Detection | `appointments` | No-show rate and wasted slots |
| 9 | Revenue Opportunity Forecast | `calls` + `appointments` | Projected bookings from conversion improvement |
| 10 | After-Hours Call Analysis | `calls` | Calls outside business hours being missed |

Each analyzer returns a finding with: `title`, `summary`, `evidence` (JSON), `impact` (critical/high/medium/low), `impactEstimate`, and `recommendedAction`.

### Health Score Calculation

The overall health score (0-100) is the average of 5 panel scores:

| Panel | How It's Calculated |
|-------|-------------------|
| Call Health | 70% answer rate + 30% avg duration engagement (120s = perfect) |
| Pipeline Health | Conversion rate (max 60 pts) + inverse no-show rate (max 40 pts) |
| Lead Capture Rate | (New leads / total calls) × 200, capped at 100 |
| Customer Retention | Completed appointments / (completed + no-shows) × 100 |
| Automation Coverage | Active integrations / 6 recommended × 100 |

---

## Treatment Workflows — Current State

### How suggestions work today

When Neural generates a finding, it also generates a **Treatment Plan** — a recommended workflow described in plain English:

```
Trigger: "When an incoming call is missed or goes to voicemail"
Condition: "If caller is not in contacts or has no recent callback"
Action: "Auto-send SMS within 30 seconds, create contact, schedule callback task"
```

### Are these workflows connected to GHL/HubSpot/Zoho?

**Not yet.** The treatment workflows are currently **display-only suggestions**. When a user clicks "Activate Treatment" in the Neural dashboard:

- The toggle state is stored **in the browser only** (JavaScript variable)
- No API call is made to GHL, HubSpot, or Zoho to create an actual automation
- No workflow is actually executed

### What would be needed to wire them

To make treatment workflows execute automatically, the system would need:

1. **Workflow Execution Engine** — A backend service that monitors triggers (missed call events, new contacts, stale deals) and fires actions
2. **CRM API Integration Layer** — Using the client's stored API credentials from settings:
   - **GHL**: Create workflow via `POST /workflows` or trigger existing workflow via contact tags
   - **HubSpot**: Create enrollment in a sequence, or trigger a workflow via contact property change
   - **Zoho**: Create a workflow rule or trigger Blueprint transition
3. **SMS/Call Automation** — Using Twilio (already integrated) to send auto-SMS or initiate callbacks
4. **Per-client activation storage** — Store which treatments are active in the database, not just browser state

### Recommended architecture for live workflows

```
Neural Finding Detected
        │
        ▼
Treatment Activated (stored in DB: neural_treatments table)
        │
        ▼
Event Monitor (cron job or webhook listener)
        │
        ├── Missed call detected ──▶ Twilio SMS auto-reply + CRM contact create
        ├── Lead created, no response ──▶ Auto-callback via ElevenLabs outbound
        ├── Appointment no-show ──▶ CRM tag update + SMS reminder sequence
        └── Stale deal detected ──▶ CRM task creation for follow-up
```

---

## Summary: What's Real vs What's Planned

| Feature | Status | Details |
|---------|--------|---------|
| ElevenLabs call data in Neural | **LIVE** | Post-call webhook → local DB → Neural queries |
| CRM credentials from Settings pages | **LIVE** | Per-client, stored in DB, not hardcoded |
| Neural health scores from real data | **LIVE** | 10 analyzers query calls, appointments, contacts |
| Neural findings with recommendations | **LIVE** | Generated from actual client data patterns |
| CRM connection status display | **LIVE** | Reads client config to show connected/disconnected |
| Live CRM pipeline data in Neural | **NOT YET** | Would need direct API calls to GHL/HubSpot/Zoho |
| Treatment workflow execution | **NOT YET** | Suggestions only — no actual automation triggered |
| Auto-sync CRM deals/pipeline to local DB | **NOT YET** | Would enable richer Neural analysis |

---

## File References

- Neural Engine: `src/services/neuralEngine.js` (10 analyzers + overview metrics)
- Neural API Routes: `src/routes/neural.js` (dashboard, analyze, insights endpoints)
- Neural Frontend: `public/neural/intelligence.html` (dashboard UI)
- ElevenLabs Voice Webhook: `src/routes/elevenlabs-voice.js` (post-call-webhook)
- GHL Settings API: `src/routes/client-settings.js` → `/api/client-settings/ghl`
- HubSpot Settings API: `src/routes/client-settings.js` → `/api/client-settings/hubspot`
- Zoho Settings API: `src/routes/client-settings.js` → `/api/client-settings/zoho`
- Client Model: `src/models/Client.js` (stores all integration credentials)
- Neural Insight Model: `src/models/NeuralInsight.js` (persisted findings)
