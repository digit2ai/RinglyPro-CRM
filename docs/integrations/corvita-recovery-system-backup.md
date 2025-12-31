# Corvita Recovery - Complete System Architecture Backup

## Document Purpose

This document serves as a **complete backup** of all system configurations for the Corvita Recovery Voice AI booking system. Use this to restore configurations if something breaks.

**Last Updated:** December 31, 2025
**Status:** Production - FULLY WORKING
**Client:** Corvita Recovery & Nutrition (Client ID: 32)

---

## Quick Reference - All IDs and Keys

| Component | Identifier | Value |
|-----------|------------|-------|
| **RinglyPro Client ID** | client_id | `32` |
| **ElevenLabs Agent ID** | agent_id | `agent_4801kd9a0495frvbjxz6dyrnbz1j` |
| **GHL Location ID** | ghl_location_id | `CU7M8At2sWwodiBrr71J` |
| **GHL Calendar ID** | ghl_calendar_id | `yHDUtxQWt9GzaPcdUnxs` |
| **GHL API Key (PIT)** | ghl_api_key | `pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51` |
| **Webhook URL** | url | `https://aiagent.ringlypro.com/api/elevenlabs/tools` |
| **Timezone** | timezone | `America/New_York` |

---

## 1. ElevenLabs Voice Agent Configuration

### Agent Details

| Setting | Value |
|---------|-------|
| Agent ID | `agent_4801kd9a0495frvbjxz6dyrnbz1j` |
| Agent URL | `https://elevenlabs.io/app/conversational-ai/agents/agent_4801kd9a0495frvbjxz6dyrnbz1j` |
| Widget Embed Code | `<elevenlabs-convai agent-id="agent_4801kd9a0495frvbjxz6dyrnbz1j"></elevenlabs-convai>` |

### Widget Script (Required in HTML)

```html
<script src="https://elevenlabs.io/convai-widget/index.js" async type="text/javascript"></script>
```

---

## 2. ElevenLabs Tools Configuration

### Tool 1: check_availability_recovery

**Purpose:** Check available appointment slots for Recovery Sessions

**CRITICAL:** The `tool_name` constant MUST be `"check_availability"` (NOT `"book_appointment"`)

```json
{
  "type": "webhook",
  "name": "check_availability_recovery",
  "description": "Check available appointment slots for Recovery Sessions. Use this to find open times before booking.",
  "disable_interruptions": false,
  "force_pre_tool_speech": "auto",
  "assignments": [],
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "api_schema": {
    "url": "https://aiagent.ringlypro.com/api/elevenlabs/tools",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [],
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "description": "Parameters for checking availability",
      "properties": [
        {
          "id": "tool_name",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "check_availability",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "client_id",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "32",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "days_ahead",
          "type": "string",
          "value_type": "constant",
          "description": "Number of days ahead to check for availability",
          "dynamic_variable": "",
          "constant_value": "30",
          "enum": null,
          "is_system_provided": false,
          "required": false
        },
        {
          "id": "ghl_calendar_id",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "yHDUtxQWt9GzaPcdUnxs",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "ghl_location_id",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "CU7M8At2sWwodiBrr71J",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "ghl_api_key",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51",
          "enum": null,
          "is_system_provided": false,
          "required": true
        }
      ],
      "required": false,
      "value_type": "llm_prompt"
    },
    "request_headers": [],
    "auth_connection": null
  },
  "response_timeout_secs": 20,
  "dynamic_variables": {
    "dynamic_variable_placeholders": {}
  }
}
```

### Tool 2: book_appointment_recovery

**Purpose:** Book an appointment after collecting customer details

```json
{
  "type": "webhook",
  "name": "book_appointment_recovery",
  "description": "Book an appointment for the caller. Use this after confirming the date, time, and collecting the caller's name and phone number.",
  "disable_interruptions": false,
  "force_pre_tool_speech": "auto",
  "assignments": [],
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "api_schema": {
    "url": "https://aiagent.ringlypro.com/api/elevenlabs/tools",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [],
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "description": "Parameters for booking an appointment",
      "properties": [
        {
          "id": "tool_name",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "book_appointment",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "client_id",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "32",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "customer_name",
          "type": "string",
          "value_type": "llm_prompt",
          "description": "The caller's full name",
          "dynamic_variable": "",
          "constant_value": "",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "customer_phone",
          "type": "string",
          "value_type": "llm_prompt",
          "description": "The caller's phone number",
          "dynamic_variable": "",
          "constant_value": "",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "appointment_date",
          "type": "string",
          "value_type": "llm_prompt",
          "description": "The appointment date in YYYY-MM-DD format",
          "dynamic_variable": "",
          "constant_value": "",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "appointment_time",
          "type": "string",
          "value_type": "llm_prompt",
          "description": "The appointment time in HH:MM format",
          "dynamic_variable": "",
          "constant_value": "",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "ghl_calendar_id",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "yHDUtxQWt9GzaPcdUnxs",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "ghl_location_id",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "CU7M8At2sWwodiBrr71J",
          "enum": null,
          "is_system_provided": false,
          "required": true
        },
        {
          "id": "ghl_api_key",
          "type": "string",
          "value_type": "constant",
          "description": "",
          "dynamic_variable": "",
          "constant_value": "pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51",
          "enum": null,
          "is_system_provided": false,
          "required": true
        }
      ],
      "required": false,
      "value_type": "llm_prompt"
    },
    "request_headers": [],
    "auth_connection": null
  },
  "response_timeout_secs": 20,
  "dynamic_variables": {
    "dynamic_variable_placeholders": {}
  }
}
```

### Tool Name Mapping (CRITICAL)

| ElevenLabs Tool Name | `tool_name` Constant Value | Purpose |
|---------------------|---------------------------|---------|
| `check_availability_recovery` | `"check_availability"` | Check open slots |
| `book_appointment_recovery` | `"book_appointment"` | Book appointment |

**WARNING:** If `check_availability_recovery` has `tool_name` set to `"book_appointment"`, availability checking will fail!

---

## 3. RinglyPro Database Configuration

### Client Record (clients table, id=32)

```sql
-- Client 32 Record
SELECT id, name, ghl_api_key, settings, deposit_required
FROM clients WHERE id = 32;

-- Expected values:
id = 32
name = "Corvita Recovery & Nutrition"
ghl_api_key = "pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51"
deposit_required = true

-- Settings JSONB column structure:
settings = {
  "integration": {
    "ghl": {
      "calendarId": "yHDUtxQWt9GzaPcdUnxs",
      "locationId": "CU7M8At2sWwodiBrr71J"
    }
  }
}
```

### Appointments Table Structure

Voice bookings are stored with these values:

```sql
-- Voice booking record example
INSERT INTO appointments (
  client_id,
  customer_name,
  customer_phone,
  appointment_date,
  appointment_time,
  status,
  deposit_status,
  source,
  confirmation_code
) VALUES (
  32,
  'Customer Name',
  '813-555-1234',
  '2026-01-08',
  '10:00',
  'pending',           -- Because deposit_required = true
  'pending',           -- Awaiting deposit
  'voice_booking',     -- Identifies as voice AI booking
  'ABC12345'           -- Auto-generated
);
```

---

## 4. GoHighLevel (GHL) Configuration

### Calendar: CORVITA RECOVERY SPECIALIST

| Setting | Value |
|---------|-------|
| Calendar ID | `yHDUtxQWt9GzaPcdUnxs` |
| Location ID | `CU7M8At2sWwodiBrr71J` |
| API Key | `pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51` |
| API Version | `2021-04-15` |

### Availability Settings

| Setting | Value |
|---------|-------|
| Slot Duration | 60 minutes |
| Slot Interval | 60 minutes |
| Buffer | 0 minutes |
| Appointments Per Slot | 1 |
| Allow Booking For | 60 days ahead |

### Business Hours

```
Monday:    10:00 AM - 9:00 PM
Tuesday:   10:00 AM - 9:00 PM
Wednesday: 10:00 AM - 9:00 PM
Thursday:  10:00 AM - 9:00 PM
Friday:    10:00 AM - 9:00 PM
Saturday:  10:00 AM - 3:00 PM
Sunday:    CLOSED
```

### Google Calendar Integration Settings

| Setting | Value | Notes |
|---------|-------|-------|
| Linked Calendar | `recovery` | Where NEW appointments are created |
| Conflict Calendars | `recovery`, `Corvita Recovery Specialist` | Calendars that block availability |
| Assign appointments to | `recovery` | Must match Linked Calendar |
| Date Range | 60 days | How far ahead to check availability |

### GHL API Endpoints

**Check Free Slots:**
```bash
curl -X GET "https://services.leadconnectorhq.com/calendars/yHDUtxQWt9GzaPcdUnxs/free-slots?startDate=TIMESTAMP_MS&endDate=TIMESTAMP_MS&timezone=America/New_York" \
  -H "Authorization: Bearer pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51" \
  -H "Version: 2021-04-15"
```

**Create Appointment:**
```bash
curl -X POST "https://services.leadconnectorhq.com/calendars/events/appointments" \
  -H "Authorization: Bearer pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51" \
  -H "Version: 2021-04-15" \
  -H "Content-Type: application/json" \
  -d '{
    "calendarId": "yHDUtxQWt9GzaPcdUnxs",
    "locationId": "CU7M8At2sWwodiBrr71J",
    "contactId": "CONTACT_ID",
    "startTime": "2026-01-08T10:00:00-05:00",
    "endTime": "2026-01-08T11:00:00-05:00",
    "title": "Recovery Session - Customer Name",
    "appointmentStatus": "new"
  }'
```

---

## 5. Google Calendar Configuration

### Calendar Details

| Setting | Value |
|---------|-------|
| Calendar Name | `recovery` |
| Timezone | `America/New_York` |
| Connected via | GoHighLevel OAuth |

### Sync Behavior

```
Voice Booking → RinglyPro DB → GHL Calendar → Google Calendar
                                    ↓
                            ~30-60 second delay
```

---

## 6. RinglyPro Dashboard Widget

### Widget Embed Code (in dashboard.ejs)

```html
<!-- Voice AI Widget -->
<div id="elevenlabs-widget-wrapper">
    <button id="widget-close-btn" onclick="closeVoiceWidget()" title="Close widget">×</button>
    <div id="elevenlabs-widget-container">
        <elevenlabs-convai agent-id="agent_4801kd9a0495frvbjxz6dyrnbz1j"></elevenlabs-convai>
    </div>
</div>

<!-- Reopen button (shown when widget is closed) -->
<button id="widget-reopen-btn" onclick="reopenVoiceWidget()" title="Open Voice AI">
    🎙️
</button>

<!-- ElevenLabs Script -->
<script src="https://elevenlabs.io/convai-widget/index.js" async type="text/javascript"></script>
```

---

## 7. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CORVITA RECOVERY SYSTEM                         │
└─────────────────────────────────────────────────────────────────────────┘

Customer Phone Call / Widget
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ELEVENLABS VOICE AGENT                                                 │
│  Agent ID: agent_4801kd9a0495frvbjxz6dyrnbz1j                          │
│                                                                         │
│  Tools:                                                                 │
│  ├── check_availability_recovery → tool_name: "check_availability"     │
│  └── book_appointment_recovery   → tool_name: "book_appointment"       │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ POST /api/elevenlabs/tools
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  RINGLYPRO API (aiagent.ringlypro.com)                                 │
│  File: src/routes/elevenlabs-tools.js                                   │
│                                                                         │
│  Handles:                                                               │
│  ├── check_availability → Queries GHL free-slots API                   │
│  ├── book_appointment   → Creates appointment in DB + GHL              │
│  ├── get_business_info  → Returns business details                     │
│  └── send_sms           → Sends SMS via GHL                            │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────────────────┐
│  RINGLYPRO DATABASE      │    │  GOHIGHLEVEL (GHL)                       │
│  (PostgreSQL)            │    │  Location: CU7M8At2sWwodiBrr71J          │
│                          │    │                                          │
│  Tables:                 │    │  Calendar: yHDUtxQWt9GzaPcdUnxs          │
│  ├── clients (id=32)     │    │  Name: "CORVITA RECOVERY SPECIALIST"     │
│  ├── appointments        │    │                                          │
│  └── customers           │    │  API: pit-c06c6e76-...                   │
└──────────────────────────┘    └────────────────┬─────────────────────────┘
                                                  │ OAuth Sync
                                                  ▼
                                 ┌──────────────────────────────────────────┐
                                 │  GOOGLE CALENDAR                         │
                                 │  Calendar: "recovery"                    │
                                 │                                          │
                                 │  Events appear ~30-60 seconds after      │
                                 │  booking via GHL                         │
                                 └──────────────────────────────────────────┘
```

---

## 8. Testing Commands

### Test Availability Check

```bash
curl -s -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"check_availability","client_id":"32"}'
```

**Expected Response:**
```json
{
  "success": true,
  "calendar_id": "yHDUtxQWt9GzaPcdUnxs",
  "timezone": "America/New_York",
  "slots": [...],
  "slot_count": 8
}
```

### Test GHL API Directly

```bash
# Get current timestamp in milliseconds
START=$(date +%s)000
END=$(($(date +%s) + 604800))000

curl -s "https://services.leadconnectorhq.com/calendars/yHDUtxQWt9GzaPcdUnxs/free-slots?startDate=$START&endDate=$END&timezone=America/New_York" \
  -H "Authorization: Bearer pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51" \
  -H "Version: 2021-04-15"
```

### Health Check

```bash
curl -s "https://aiagent.ringlypro.com/api/elevenlabs/tools/health"
```

---

## 9. Common Issues & Fixes

### Issue: "Trouble checking calendar" / Availability not working

**Cause:** `check_availability_recovery` tool has wrong `tool_name` constant

**Fix:** Ensure `tool_name` is `"check_availability"` (NOT `"book_appointment"`)

### Issue: Slots not showing blocked times

**Cause:** Conflict calendars not configured in GHL

**Fix:** Add `recovery` and `Corvita Recovery Specialist` to Conflict Calendars in GHL calendar settings

### Issue: Appointment not in Google Calendar

**Cause 1:** Wait 30-60 seconds for GHL→Google sync

**Cause 2:** "Assign appointments to" setting wrong

**Fix:** Set to `recovery` in GHL calendar settings

### Issue: Booking fails with API error

**Cause:** GHL API key expired or invalid

**Fix:** Generate new Private Integration Token in GHL > Settings > Integrations

---

## 10. Key Files in RinglyPro Codebase

| File | Purpose |
|------|---------|
| `src/routes/elevenlabs-tools.js` | Main webhook handler for ElevenLabs |
| `src/services/ghlBookingService.js` | GHL API integration service |
| `src/services/appointmentService.js` | Local appointment creation |
| `src/routes/appointments.js` | Dashboard appointments API |
| `views/dashboard.ejs` | Dashboard with Voice AI widget |
| `docs/integrations/elevenlabs-corvita-recovery-setup.md` | Integration documentation |

---

## 11. Restoration Checklist

If you need to restore this configuration:

### ElevenLabs

- [ ] Create/verify agent `agent_4801kd9a0495frvbjxz6dyrnbz1j`
- [ ] Add `check_availability_recovery` tool with `tool_name: "check_availability"`
- [ ] Add `book_appointment_recovery` tool with `tool_name: "book_appointment"`
- [ ] Set webhook URL to `https://aiagent.ringlypro.com/api/elevenlabs/tools`
- [ ] Verify all constant values match this document

### GoHighLevel

- [ ] Verify calendar `yHDUtxQWt9GzaPcdUnxs` exists
- [ ] Check business hours are set correctly
- [ ] Verify Google Calendar linked as `recovery`
- [ ] Add conflict calendars: `recovery`, `Corvita Recovery Specialist`
- [ ] Verify API key is valid

### RinglyPro Database

- [ ] Verify client 32 exists with correct settings
- [ ] Check `ghl_api_key` is set
- [ ] Verify `settings->integration->ghl` has correct calendarId and locationId

### Dashboard

- [ ] Widget embed code uses correct agent ID
- [ ] ElevenLabs script is loaded

---

## Document History

| Date | Change |
|------|--------|
| 2025-12-31 | Initial comprehensive backup created |
| 2025-12-31 | Fixed check_availability tool_name from "book_appointment" to "check_availability" |

---

**END OF BACKUP DOCUMENT**
