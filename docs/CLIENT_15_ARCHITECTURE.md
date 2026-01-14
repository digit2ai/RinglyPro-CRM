# RinglyPro Voice Booking Architecture
## Standard Configuration for All Clients

RinglyPro native calendar is the **default** for all clients. GHL, Google Calendar, and Zoho CRM are **optional** integrations that sync in the background.

---

## Quick Reference: Developer Prompt

### Quick Activation Prompt

**Before using this prompt (ElevenLabs Setup):**

1. **Create ElevenLabs agent** at https://elevenlabs.io/conversational-ai
   - Note the Agent ID (e.g., `agent_1001kdge3jz0ejj8a8g5d7vkqr8f`)

2. **Configure 4 tools** (all POST to `https://aiagent.ringlypro.com/api/elevenlabs/tools`):
   - `get_business_info` - Gets client's business details
   - `check_availability` - Checks available time slots
   - `book_appointment` - Books an appointment
   - `send_sms` - Sends confirmation SMS

3. **Get a phone number** (optional) in ElevenLabs
   - Note the Phone Number ID (e.g., `phnum_8201kdkff2qvetathjqa92x46wr4`)

4. **(Optional)** Client configures integrations via Settings UI (GHL, Google, Zoho)

**Then use this prompt:**
```
/ringlypro-dev Activate Client [ID] for voice booking.
ElevenLabs Agent ID: [AGENT_ID]
ElevenLabs Phone Number ID: [PHONE_NUMBER_ID] (optional)

Reference: docs/CLIENT_15_ARCHITECTURE.md
```

The developer agent will:
1. Store the ElevenLabs agent ID (`elevenlabs_agent_id`)
2. Store the phone number ID (`elevenlabs_phone_number_id`) if provided
3. Enable `rachel_enabled = true`
4. **Add client ID to dashboard UI** in `views/dashboard.ejs`
5. Sync existing calls from ElevenLabs
6. Fix recording URLs for audio playback
7. Enable any configured integrations (GHL, Zoho, Google) - if present

### For Clients WITH External Integrations

If client has configured GHL, Google, or Zoho in Settings:

```
/ringlypro-dev Activate Client [ID] for voice booking with calendar sync.
ElevenLabs Agent ID: [AGENT_ID]
ElevenLabs Phone Number ID: [PHONE_NUMBER_ID]

Reference: docs/CLIENT_15_ARCHITECTURE.md

Enable integrations the client has configured:
- GHL: settings.integration.ghl.enabled = true (if ghl_integrations exists)
- Google: google_calendar_integrations.is_active = true (if configured)
- Zoho: settings.integration.zoho.enabled = true (if configured)

Test booking should return:
- RinglyPro: appointment_id (always)
- Plus any enabled integrations
```

---

## System Overview

```
                                    +------------------+
                                    |   Inbound Call   |
                                    |   (Customer)     |
                                    +--------+---------+
                                             |
                                             v
                                    +------------------+
                                    |     Twilio       |
                                    | (Phone Gateway)  |
                                    +--------+---------+
                                             |
                                             v
                              +-----------------------------+
                              |     ElevenLabs Agent        |
                              |    (Rachel AI Voice)        |
                              |                             |
                              | - Natural conversation      |
                              | - Check availability        |
                              | - Book appointments         |
                              | - Send SMS confirmations    |
                              +-------------+---------------+
                                            |
                                            v
                              +-----------------------------+
                              |   RinglyPro CRM Backend     |
                              |   (aiagent.ringlypro.com)   |
                              +-------------+---------------+
                                            |
                    +-----------------------+-----------------------+
                    |                       |                       |
                    v                       v                       v
          +-----------------+     +-----------------+     +-----------------+
          |   RinglyPro DB  |     |   GHL Calendar  |     | External Cals   |
          |   (PostgreSQL)  |     | (GoHighLevel)   |     |                 |
          |                 |     |                 |     | - Google Cal    |
          | Primary source  |     | CRM sync        |     | - Zoho CRM      |
          | of truth        |     | Lead management |     |                 |
          +-----------------+     +-----------------+     +-----------------+
```

---

## ElevenLabs Voice Agent Configuration

The ElevenLabs Conversational AI agent (Rachel) is the front-end for all customer voice interactions.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ElevenLabs Agent Flow                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Customer calls Twilio number                                        │
│                    │                                                    │
│                    ▼                                                    │
│  2. Twilio webhook hits /voice/rachel/                                  │
│                    │                                                    │
│                    ▼                                                    │
│  3. RinglyPro returns TwiML connecting to ElevenLabs WebSocket          │
│                    │                                                    │
│                    ▼                                                    │
│  4. ElevenLabs agent (Rachel) handles conversation                      │
│     - Greets customer                                                   │
│     - Understands intent (booking, questions, etc.)                     │
│     - Calls tools via POST /api/elevenlabs/tools                        │
│                    │                                                    │
│                    ▼                                                    │
│  5. Tools execute actions:                                              │
│     • get_business_info  → Returns client details                       │
│     • check_availability → Checks all 4 calendars                       │
│     • book_appointment   → Books in all 4 systems                       │
│     • send_sms           → Sends confirmation via Twilio                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### ElevenLabs Configuration Options

| Option | Client 15 Setup | Description |
|--------|-----------------|-------------|
| **Agent Type** | Shared Rachel | Uses default Rachel agent for all clients |
| **Agent ID** | Not set (uses default) | Optional: `elevenlabs_agent_id` field |
| **Voice** | Rachel (21m00Tcm4TlvDq8ikWAM) | ElevenLabs voice ID |
| **Tools Endpoint** | `/api/elevenlabs/tools` | Webhook for tool calls |
| **Client Identification** | `client_id` parameter | Passed in every tool call |

---

## Client Activation Checklist (Voice Booking)

**Use this checklist to activate any client for ElevenLabs voice booking.**

---

### QUICK START - Developer Agent Prompt

**Copy this prompt to activate a new client (replace values in brackets):**

```
/ringlypro-dev Activate Client [CLIENT_ID] for voice booking.
ElevenLabs Agent ID: [AGENT_ID]. [PHONE_NUMBER_ID]

Reference: docs/CLIENT_15_ARCHITECTURE.md
```

The developer agent will execute ALL steps automatically.

---

### Database Requirements (ALL REQUIRED)

| Field | Required Value | What It Does |
|-------|----------------|--------------|
| `rachel_enabled` | `true` | Enables voice AI for inbound calls |
| `elevenlabs_agent_id` | `agent_xxx...` | Links to ElevenLabs agent |
| `elevenlabs_phone_number_id` | `phnum_xxx...` | ElevenLabs phone number for outbound |
| `use_elevenlabs_outbound` | `true` | **CRITICAL: Enables voice message audio playback** |

**Code Change Required:**
- Add client ID to `usesElevenLabs` in `views/dashboard.ejs` (line ~3769)

---

### Complete Activation Script

**Replace `[CLIENT_ID]`, `[AGENT_ID]`, and `[PHONE_NUMBER_ID]` then run ALL commands:**

```bash
# ============================================
# ELEVENLABS CLIENT ACTIVATION - ALL 5 STEPS
# ============================================
# Replace these values:
CLIENT_ID="[CLIENT_ID]"
AGENT_ID="[AGENT_ID]"
PHONE_NUMBER_ID="[PHONE_NUMBER_ID]"

# Step 1: Set Agent ID + Enable Rachel
curl -X POST "https://aiagent.ringlypro.com/api/admin/set-elevenlabs-agent/${CLIENT_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\": \"ringlypro-quick-admin-2024\", \"agentId\": \"${AGENT_ID}\", \"enableRachel\": true}"

# Step 2: Set Phone Number ID
curl -X POST "https://aiagent.ringlypro.com/api/admin/quick-set-elevenlabs-phone/${CLIENT_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\": \"ringlypro-quick-admin-2024\", \"phoneNumberId\": \"${PHONE_NUMBER_ID}\"}"

# Step 3: Enable Outbound (REQUIRED FOR AUDIO PLAYBACK!)
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d "{\"tool_name\": \"admin_enable_elevenlabs_outbound\", \"parameters\": {\"client_id\": \"${CLIENT_ID}\", \"api_key\": \"ringlypro-quick-admin-2024\", \"enabled\": true}}"

# Step 4: Sync Existing Calls
curl -X POST "https://aiagent.ringlypro.com/api/admin/sync-elevenlabs-calls/${CLIENT_ID}" \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "ringlypro-quick-admin-2024"}'

# Step 5: Fix Recording URLs
curl -X POST "https://aiagent.ringlypro.com/api/admin/fix-elevenlabs-recordings/${CLIENT_ID}" \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "ringlypro-quick-admin-2024"}'

echo "✅ Database configuration complete for Client ${CLIENT_ID}"
echo "⚠️  IMPORTANT: You must also add CLIENT_ID == ${CLIENT_ID} to usesElevenLabs in views/dashboard.ejs"
```

---

### Step-by-Step Code Change (REQUIRED)

**File:** `views/dashboard.ejs` (line ~3769)

```javascript
// Find this line:
const usesElevenLabs = CLIENT_ID == 15 || CLIENT_ID == 17 || CLIENT_ID == 32 || CLIENT_ID == 44;

// Add the new client ID:
const usesElevenLabs = CLIENT_ID == 15 || CLIENT_ID == 17 || CLIENT_ID == 32 || CLIENT_ID == 44 || CLIENT_ID == [NEW_CLIENT_ID];
```

**Then commit and push:**
```bash
git add views/dashboard.ejs
git commit -m "Add Client [NEW_CLIENT_ID] to ElevenLabs dashboard UI"
git push origin main
```

---

### Verification Checklist

After activation, verify ALL of these:

- [ ] **Database check** - Run this to confirm all fields are set:
```bash
curl -s "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "admin_get_client_config", "parameters": {"client_id": "[CLIENT_ID]", "api_key": "ringlypro-quick-admin-2024"}}'
```

Expected response should show:
```json
{
  "rachel_enabled": true,
  "elevenlabs_agent_id": "agent_xxx...",
  "elevenlabs_phone_number_id": "phnum_xxx...",
  "use_elevenlabs_outbound": true
}
```

- [ ] **Dashboard UI** - Client sees "Voicemails" tab (not regular messages)
- [ ] **Audio playback** - Clicking a voicemail shows audio player
- [ ] **Recording plays** - Audio actually plays when clicking play button

---

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| No audio player visible | `use_elevenlabs_outbound = false` | Run Step 3 (enable outbound) |
| Shows regular messages UI | Client ID not in `usesElevenLabs` | Add to dashboard.ejs |
| No calls appearing | Wrong `elevenlabs_agent_id` | Verify agent ID matches ElevenLabs |
| "Recording not available" | Recording URLs not fixed | Run Step 5 |
| Audio player but no sound | API proxy issue | Check browser console for errors |

---

### Custom Agent Setup (Optional)

For clients needing a dedicated agent with custom voice/personality:

1. Create new agent in ElevenLabs Conversational AI dashboard
2. Configure tools to point to `https://aiagent.ringlypro.com/api/elevenlabs/tools`
3. Store agent ID in `clients.elevenlabs_agent_id`
4. Update Twilio webhook to use custom agent
5. Configure post-call webhook (see below)

### ElevenLabs Agent IDs

| Client | Agent ID | Description |
|--------|----------|-------------|
| Client 15 | `agent_1001kdds1676ekrbdmd9jh918jkc` | RinglyPro Phone Voice Agent |
| Client 17 | `agent_1001kdge3jz0ejj8a8g5d7vkqr8f` | Voice Booking Agent |
| Client 32 | `agent_1801kdnq8avcews9r9rrvf7k0vh1` | Corvita Recovery & Nutrition |
| Client 44 | `agent_6301kez7b9t4en8bwk3s2nha5s9v` | Voice Booking Agent |

**Important:** The agent ID stored in `clients.elevenlabs_agent_id` must match the actual ElevenLabs agent handling calls. If messages aren't appearing, verify the agent ID is correct.

### Post-Call Webhook Configuration

To automatically save call records to the Messages tab, configure a post-call webhook in ElevenLabs:

1. Go to ElevenLabs Dashboard → Conversational AI → Settings → Webhooks
2. Add post-call webhook URL: `https://aiagent.ringlypro.com/voice/elevenlabs/post-call-webhook`
3. Enable "Transcription webhook" type
4. Save

This webhook automatically:
- Saves call records to the Messages table
- Extracts phone number, duration, and transcript summary
- Associates calls with the correct client via agent ID

### Manual ElevenLabs Sync (Admin)

If the webhook isn't configured or calls need to be re-synced:

```bash
# Sync calls from ElevenLabs to Messages table
curl -X POST "https://aiagent.ringlypro.com/api/admin/sync-elevenlabs-calls/15" \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_ADMIN_API_KEY"}'

# Update agent ID for a client
curl -X POST "https://aiagent.ringlypro.com/api/admin/set-elevenlabs-agent/15" \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_ADMIN_API_KEY", "agentId": "agent_1001kdds1676ekrbdmd9jh918jkc"}'

# Delete all ElevenLabs messages for a client (to re-sync fresh)
curl -X DELETE "https://aiagent.ringlypro.com/api/admin/elevenlabs-calls/15?all=true" \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_ADMIN_API_KEY"}'
```

### Required ElevenLabs Tools Configuration

In ElevenLabs agent settings, configure these tools:

| Tool | Endpoint | Method |
|------|----------|--------|
| `get_business_info` | `https://aiagent.ringlypro.com/api/elevenlabs/tools` | POST |
| `check_availability` | `https://aiagent.ringlypro.com/api/elevenlabs/tools` | POST |
| `book_appointment` | `https://aiagent.ringlypro.com/api/elevenlabs/tools` | POST |
| `send_sms` | `https://aiagent.ringlypro.com/api/elevenlabs/tools` | POST |

Each tool call includes `client_id` to identify which client's calendars to use.

---

## Integration Architecture

### 1. Voice Call Flow

```
Customer Call
     │
     ▼
┌─────────────┐    Webhook     ┌──────────────────┐
│   Twilio    │ ──────────────▶│  RinglyPro API   │
│   Number    │                │  /voice/rachel/  │
└─────────────┘                └────────┬─────────┘
                                        │
                                        ▼
                               ┌──────────────────┐
                               │  ElevenLabs      │
                               │  Conversational  │
                               │  AI Agent        │
                               └────────┬─────────┘
                                        │
                           Tool Calls   │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
           ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
           │ check_       │   │ book_        │   │ send_sms     │
           │ availability │   │ appointment  │   │              │
           └──────────────┘   └──────────────┘   └──────────────┘
```

### 2. Multi-Calendar Booking Flow

```
                    book_appointment API Call
                              │
                              ▼
                    ┌─────────────────────┐
                    │ dualCalendarService │
                    │                     │
                    │ Orchestrates all    │
                    │ calendar operations │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │ RinglyPro   │     │ GHL Booking │     │ External    │
   │ Database    │     │ Service     │     │ Calendars   │
   │             │     │             │     │             │
   │ INSERT      │     │ POST to     │     │ ┌─────────┐ │
   │ appointment │     │ GHL API     │     │ │ Google  │ │
   │             │     │             │     │ │Calendar │ │
   │ Returns:    │     │ Returns:    │     │ └─────────┘ │
   │ id: 31124   │     │ ghl_id:     │     │ ┌─────────┐ │
   │             │     │ RphdEJD...  │     │ │ Zoho    │ │
   └─────────────┘     └─────────────┘     │ │ CRM     │ │
                                           │ └─────────┘ │
                                           └─────────────┘
```

---

## Client 15 Configuration

### Core Settings

| Field | Value | Description |
|-------|-------|-------------|
| `id` | 15 | Client identifier |
| `business_name` | (Configured) | Business display name |
| `ringlypro_number` | +1XXXXXXXXXX | Dedicated Twilio number |
| `rachel_enabled` | true | AI voice agent active |
| `timezone` | America/New_York | Business timezone |
| `business_hours_start` | 09:00 | Opening time |
| `business_hours_end` | 17:00 | Closing time |
| `appointment_duration` | 60 | Slot duration in minutes |

### Integration Status

| Integration | Status | Configuration Location |
|-------------|--------|----------------------|
| **RinglyPro DB** | Always Active | Primary data store |
| **GoHighLevel** | Enabled | `ghl_integrations` table |
| **Google Calendar** | Enabled | `google_calendar_integrations` table |
| **Zoho CRM** | Enabled | `clients.settings.integration.zoho` |
| **ElevenLabs** | Active | Voice agent handles calls |

---

## Database Schema

### Primary Tables

```sql
-- Main client configuration
clients (
  id                    SERIAL PRIMARY KEY,
  business_name         VARCHAR NOT NULL,
  business_phone        VARCHAR UNIQUE NOT NULL,
  ringlypro_number      VARCHAR,
  rachel_enabled        BOOLEAN DEFAULT false,
  timezone              VARCHAR DEFAULT 'America/New_York',
  business_hours_start  TIME DEFAULT '09:00',
  business_hours_end    TIME DEFAULT '17:00',
  appointment_duration  INTEGER DEFAULT 30,
  settings              JSONB,  -- Contains integration configs
  ...
)

-- Appointments with all calendar sync IDs
appointments (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER REFERENCES clients(id),
  customer_name         VARCHAR NOT NULL,
  customer_phone        VARCHAR NOT NULL,
  appointment_date      DATE NOT NULL,
  appointment_time      TIME NOT NULL,
  status                VARCHAR DEFAULT 'confirmed',
  source                VARCHAR,
  -- Calendar sync IDs
  ghl_appointment_id    VARCHAR,
  google_event_id       VARCHAR,
  zoho_event_id         VARCHAR,
  ...
  UNIQUE(client_id, appointment_date, appointment_time)
)

-- GHL OAuth integration
ghl_integrations (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER REFERENCES clients(id),
  ghl_location_id       VARCHAR NOT NULL,
  access_token          TEXT,
  refresh_token         TEXT,
  expires_at            TIMESTAMP,
  is_active             BOOLEAN DEFAULT true,
  ...
)

-- Google Calendar OAuth
google_calendar_integrations (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER UNIQUE REFERENCES clients(id),
  google_email          VARCHAR,
  access_token          TEXT,
  refresh_token         TEXT,
  calendar_id           VARCHAR DEFAULT 'primary',
  is_active             BOOLEAN DEFAULT true,
  sync_appointments     BOOLEAN DEFAULT true,
  ...
)
```

### Settings JSONB Structure

```json
{
  "integration": {
    "ghl": {
      "enabled": true,
      "syncCalendar": true,
      "calendarId": "calendar_id_here",
      "locationId": "SEMmeWOBlogS8eeis0N9"
    },
    "zoho": {
      "enabled": true,
      "createEvents": true,
      "syncCalendar": true,
      "clientId": "1000.XXXX",
      "clientSecret": "XXXX",
      "refreshToken": "1000.XXXX",
      "region": "com"
    }
  }
}
```

---

## API Endpoints

### ElevenLabs Tools API

**Endpoint:** `POST /api/elevenlabs/tools`

| Tool Name | Description |
|-----------|-------------|
| `get_business_info` | Get client business details |
| `check_availability` | Get available slots from all calendars |
| `book_appointment` | Book and sync to all calendars |
| `send_sms` | Send confirmation SMS |

### Availability Check Flow

```javascript
// Request
{
  "tool_name": "check_availability",
  "parameters": {
    "client_id": "15",
    "date": "2026-01-13",
    "days_ahead": 7
  }
}

// Response
{
  "success": true,
  "calendar_type": "dual_calendar_zoho",
  "slots": [...],
  "slot_count": 30,
  "zohoCalendarActive": true,
  "googleCalendarActive": true
}
```

### Book Appointment Flow

```javascript
// Request
{
  "tool_name": "book_appointment",
  "parameters": {
    "client_id": "15",
    "date": "2026-01-13",
    "time": "10:00",
    "customer_name": "John Doe",
    "customer_phone": "+15551234567",
    "customer_email": "john@example.com"
  }
}

// Response
{
  "success": true,
  "message": "Appointment created in RinglyPro, GHL, Google Calendar, Zoho CRM",
  "appointment_id": 31124,
  "confirmation_code": "RP474639",
  "zohoEventId": "7223501000000608006"
}
```

---

## Data Sources Reference

All integration credentials are configured via the RinglyPro Settings UI at `https://aiagent.ringlypro.com/settings/...` and stored in the database.

### Settings UI Endpoints

| Integration | Settings URL | API Endpoint |
|-------------|--------------|--------------|
| **Business Info** | `/settings/business` | `GET/POST /api/client-settings/business` |
| **GHL** | `/settings/ghl` | `GET/POST /api/client-settings/ghl` |
| **Google Calendar** | `/settings/google-calendar` | `GET /api/google-oauth/authorize/:clientId` |
| **Zoho CRM** | `/settings/zoho` | `GET/POST /api/client-settings/zoho` |
| **Twilio/Voice** | `/settings/voice` | Auto-configured at signup |

### Database Storage

| Data | DB Location | Set Via |
|------|-------------|---------|
| `business_name` | `clients` table | Settings UI → `/api/client-settings/business` |
| `business_phone` | `clients` table | Signup form |
| `owner_email` | `clients` table | Signup form |
| `timezone` | `clients` table | Settings UI (default: `America/New_York`) |
| `business_hours_start` | `clients` table | Settings UI (default: 09:00) |
| `business_hours_end` | `clients` table | Settings UI (default: 17:00) |
| `appointment_duration` | `clients` table | Settings UI (default: 60 min) |
| `ringlypro_number` | `clients` table | Auto-assigned at signup |
| `twilio_number_sid` | `clients` table | Auto-assigned at signup |
| GHL credentials | `ghl_integrations` table | OAuth via `/api/client-settings/ghl` |
| Google tokens | `google_calendar_integrations` table | OAuth via `/api/google-oauth/authorize` |
| Zoho settings | `clients.settings.integration.zoho` | Settings UI → `/api/client-settings/zoho` |

### How Credentials Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Settings UI Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User visits: https://aiagent.ringlypro.com/settings/ghl        │
│                              │                                   │
│                              ▼                                   │
│  Frontend calls: GET /api/client-settings/ghl                   │
│                              │                                   │
│                              ▼                                   │
│  User clicks "Connect GHL" → OAuth flow                         │
│                              │                                   │
│                              ▼                                   │
│  Callback stores tokens in: ghl_integrations table              │
│                              │                                   │
│                              ▼                                   │
│  dualCalendarService reads from DB when booking                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Activation Checklist

### For Existing Clients (Data Already in DB)

When a client has already completed signup and integration forms, just activate:

- [ ] **Verify data exists:**
  ```sql
  SELECT id, business_name, ringlypro_number, rachel_enabled FROM clients WHERE id = [ID];
  SELECT * FROM ghl_integrations WHERE client_id = [ID] AND is_active = true;
  SELECT * FROM google_calendar_integrations WHERE client_id = [ID];
  SELECT settings->'integration' FROM clients WHERE id = [ID];
  ```

- [ ] **Enable voice agent:**
  ```sql
  UPDATE clients SET rachel_enabled = true WHERE id = [ID];
  ```

- [ ] **Enable calendar syncs:**
  ```sql
  UPDATE clients SET settings = jsonb_set(
    jsonb_set(settings, '{integration,ghl,enabled}', 'true'),
    '{integration,zoho,enabled}', 'true'
  ) WHERE id = [ID];

  UPDATE google_calendar_integrations SET is_active = true WHERE client_id = [ID];
  ```

- [ ] **Configure Twilio webhook** (if not already set):
  - Voice URL: `https://aiagent.ringlypro.com/voice/rachel/`

- [ ] **Test booking** via ElevenLabs tools endpoint

### For New Client Onboarding

#### Phase 1: Signup (Automatic)
- [ ] Client completes signup form → Creates `clients` record
- [ ] System auto-assigns Twilio number from pool
- [ ] Default timezone set to `America/New_York`
- [ ] Default hours set to 9AM-5PM

#### Phase 2: Integration Forms (Client Self-Service)
- [ ] Client configures business hours in settings
- [ ] Client completes GHL OAuth → Stores in `ghl_integrations`
- [ ] Client completes Google OAuth → Stores in `google_calendar_integrations`
- [ ] Client sets up Zoho Self-Client app → Stores in `settings.integration.zoho`

#### Phase 3: Activation (Developer)
- [ ] Enable `rachel_enabled = true`
- [ ] Enable all integration flags (ghl, zoho, google)
- [ ] Configure Twilio webhook

#### Phase 4: Verification
- [ ] Book test appointment via API
- [ ] Verify returns all 5 IDs:
  - [ ] `appointment_id` (RinglyPro)
  - [ ] `ghl_appointment_id` (GHL)
  - [ ] `google_event_id` (Google Calendar)
  - [ ] `zoho_event_id` (Zoho CRM)
  - [ ] `confirmation_code` (RP######)
- [ ] Verify appointment visible in all 4 calendar systems

---

## Service Files Reference

| Service | File | Purpose |
|---------|------|---------|
| Dual Calendar | `src/services/dualCalendarService.js` | Multi-calendar orchestration |
| GHL Booking | `src/services/ghlBookingService.js` | GoHighLevel API integration |
| Google Calendar | `src/services/googleCalendarService.js` | Google Calendar API |
| Zoho Calendar | `src/services/zohoCalendarService.js` | Zoho CRM Events API |
| ElevenLabs Tools | `src/routes/elevenlabs-tools.js` | Voice agent tool handlers |

---

## Troubleshooting

### Common Issues

1. **Appointments not syncing to Zoho**
   - Check `settings.integration.zoho.enabled = true`
   - Verify refresh token is valid
   - Check datetime format (must use timezone offset, not Z suffix)

2. **Duplicate appointment errors**
   - Unique constraint on `(client_id, date, time)`
   - Check if cancelled appointment exists at same slot
   - System now updates cancelled appointments instead of insert

3. **GHL sync failing**
   - Verify OAuth token not expired
   - Check `ghl_integrations.is_active = true`
   - Confirm calendar ID is correct

### Debug Endpoints

```bash
# Check Zoho settings
curl -X POST https://aiagent.ringlypro.com/api/elevenlabs/tools \
  -d '{"tool_name":"debug_zoho_settings","parameters":{"client_id":"15"}}'

# Check appointment details
curl -X POST https://aiagent.ringlypro.com/api/elevenlabs/tools \
  -d '{"tool_name":"debug_appointment","parameters":{"appointment_id":"31124"}}'
```

---

## Version History

| Date | Change |
|------|--------|
| 2026-01-13 | Added Client Activation Checklist for voice booking onboarding |
| 2026-01-13 | Added Client 17 to ElevenLabs dashboard UI |
| 2026-01-13 | Added ElevenLabs audio proxy endpoint for dashboard playback |
| 2026-01-12 | Added ElevenLabs post-call webhook for automatic message saving |
| 2026-01-12 | Fixed Client 15 & 32 ElevenLabs agent IDs |
| 2026-01-12 | Added admin endpoints for ElevenLabs sync management |
| 2026-01-12 | Added Zoho CRM Events integration |
| 2026-01-12 | Fixed datetime format for Zoho API |
| 2026-01-12 | Added google_event_id and zoho_event_id columns |
| 2026-01-11 | Fixed unique constraint handling for cancelled appointments |

---

*This document serves as the reference architecture for Client 15 and the onboarding template for new clients requiring full multi-calendar integration.*
