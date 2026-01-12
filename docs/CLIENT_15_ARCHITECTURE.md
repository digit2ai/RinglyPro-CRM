# Client 15 System Architecture
## Model Configuration for New Client Onboarding

This document describes the complete system architecture for Client 15, which serves as the reference model for onboarding new clients with full multi-calendar integration.

---

## Quick Reference: Developer Prompt

### For Existing Clients (Mirror Client 15 Setup)

Use this prompt to enable full multi-calendar integration for an existing client:

```
Enable full multi-calendar integration for Client [ID] (same as Client 15).

Reference: docs/CLIENT_15_ARCHITECTURE.md

The system will automatically fetch from database:
- Business name, timezone, hours (from clients table)
- Twilio number (assigned at signup)
- GHL credentials (from ghl_integrations table)
- Google Calendar tokens (from google_calendar_integrations table)
- Zoho settings (from clients.settings.integration.zoho)

Tasks:
1. Verify client exists and has required integrations configured
2. Enable rachel_enabled = true
3. Configure Twilio webhook → /voice/rachel/
4. Enable GHL calendar sync (settings.integration.ghl.enabled = true)
5. Enable Google Calendar sync (is_active = true)
6. Enable Zoho Events sync (settings.integration.zoho.enabled = true)
7. Book a test appointment and verify all IDs are returned

Expected test result:
- RinglyPro: appointment_id
- GHL: ghl_appointment_id
- Google: google_event_id
- Zoho: zoho_event_id
- Confirmation: RP######
```

### For New Client Onboarding

Use this prompt during new client signup:

```
Onboard new client with full multi-calendar integration (Client 15 model).

Reference: docs/CLIENT_15_ARCHITECTURE.md

Client will provide via signup/integration forms:
- Business name, phone, email
- Business hours (default: 9AM-5PM EST)
- GHL credentials (via OAuth flow)
- Google Calendar (via OAuth flow)
- Zoho CRM (via Self-Client app setup)

System auto-assigns:
- Client ID (auto-increment)
- Twilio number (from pool or provisioned)
- Timezone (default: America/New_York)

After onboarding, verify with test booking.
```

### Quick Enable Command

For clients who already have all integrations configured but just need activation:

```
Activate Client [ID] for voice booking (Client 15 model).

Enable:
- rachel_enabled = true
- settings.integration.ghl.enabled = true
- settings.integration.zoho.enabled = true
- google_calendar_integrations.is_active = true

Test with booking to verify all 4 calendar IDs returned.
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

### Custom Agent Setup (Optional)

For clients needing a dedicated agent with custom voice/personality:

1. Create new agent in ElevenLabs Conversational AI dashboard
2. Configure tools to point to `https://aiagent.ringlypro.com/api/elevenlabs/tools`
3. Store agent ID in `clients.elevenlabs_agent_id`
4. Update Twilio webhook to use custom agent

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
| 2026-01-12 | Added Zoho CRM Events integration |
| 2026-01-12 | Fixed datetime format for Zoho API |
| 2026-01-12 | Added google_event_id and zoho_event_id columns |
| 2026-01-11 | Fixed unique constraint handling for cancelled appointments |

---

*This document serves as the reference architecture for Client 15 and the onboarding template for new clients requiring full multi-calendar integration.*
