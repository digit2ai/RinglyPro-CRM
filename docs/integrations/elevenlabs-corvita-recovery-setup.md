# ElevenLabs Voice AI Integration - Corvita Recovery (Client 32)

## Overview

This document describes the complete setup for ElevenLabs Conversational AI integration with RinglyPro for Client 32 (Corvita Recovery & Nutrition). The voice agent allows customers to call and book Recovery Session appointments via phone, which sync to both RinglyPro dashboard and Google Calendar.

**Last Updated:** December 31, 2025
**Status:** Production Ready

---

## Architecture

```
Customer Phone Call
        │
        ▼
┌─────────────────┐
│   ElevenLabs    │
│   Voice Agent   │
└────────┬────────┘
         │ Webhook (POST)
         ▼
┌─────────────────────────────────────┐
│  RinglyPro API                      │
│  /api/elevenlabs/tools              │
│  (src/routes/elevenlabs-tools.js)   │
└────────┬────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌─────────────┐
│RinglyPro│  │   GHL API   │
│Database│  │(GoHighLevel)│
└───────┘  └──────┬──────┘
                  │
                  ▼
           ┌────────────┐
           │  Google    │
           │  Calendar  │
           └────────────┘
```

---

## Client Configuration

### Database Settings (clients table, id=32)

```sql
-- Client 32 GHL Settings stored in JSONB settings column
settings->'integration'->'ghl' = {
  "calendarId": "yHDUtxQWt9GzaPcdUnxs",
  "locationId": "CU7M8At2sWwodiBrr71J"
}

-- API Key stored in ghl_api_key column
ghl_api_key = "pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51"

-- Deposit requirement
deposit_required = true  -- Appointments created with status='pending', deposit_status='pending'
```

### Key Identifiers

| Setting | Value | Description |
|---------|-------|-------------|
| Client ID | `32` | RinglyPro client identifier |
| GHL Location ID | `CU7M8At2sWwodiBrr71J` | GoHighLevel sub-account |
| GHL Calendar ID | `yHDUtxQWt9GzaPcdUnxs` | "CORVITA RECOVERY SPECIALIST" calendar |
| GHL API Key | `pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51` | Private Integration Token (PIT) |
| Timezone | `America/New_York` | Eastern Time |

---

## GoHighLevel Calendar Configuration

### Calendar: CORVITA RECOVERY SPECIALIST

**Location in GHL:** Settings > Calendars > CORVITA RECOVERY SPECIALIST

#### Availability Settings
- **Slot Duration:** 60 minutes
- **Slot Interval:** 60 minutes
- **Buffer:** 0 minutes
- **Appointments Per Slot:** 1
- **Allow Booking For:** 60 days ahead

#### Business Hours
```
Monday - Friday: 10:00 AM - 9:00 PM
Saturday: 10:00 AM - 3:00 PM
Sunday: Closed
```

#### Google Calendar Integration (CRITICAL)

These settings are essential for two-way sync:

1. **Linked Calendar:** `recovery`
   - This is the Google Calendar where NEW appointments are created
   - Must be the actual calendar name in Google (not display name)

2. **Conflict Calendars:** `recovery`, `Corvita Recovery Specialist`
   - These calendars are checked for existing events to block slots
   - Add ALL calendars that contain events that should block availability
   - The "INTRO Session" events on "Corvita Recovery Specialist" calendar will block slots

3. **Which calendar should we assign appointments to:** `recovery`
   - This determines where GHL creates new calendar events
   - Must match the Linked Calendar for proper sync

4. **Date Range:** 60 days
   - How far ahead availability is calculated

#### How Conflict Calendars Work

```
GHL Free Slots API checks:
├── Linked Calendar ("recovery") → blocks if events exist
└── Conflict Calendars
    ├── "recovery" → blocks if events exist
    └── "Corvita Recovery Specialist" → blocks if events exist (e.g., INTRO Sessions)
```

**Example:** If "INTRO Session" exists on Jan 8 at 7pm on "Corvita Recovery Specialist" calendar:
- 7pm slot will NOT appear in available slots
- Voice agent will not offer 7pm to callers

---

## ElevenLabs Agent Configuration

### Webhook URL
```
https://aiagent.ringlypro.com/api/elevenlabs/tools
```

### Available Tools

The agent should be configured with these tools:

#### 1. check_availability_recovery
```json
{
  "name": "check_availability_recovery",
  "description": "Check available appointment slots for Recovery Sessions",
  "parameters": {
    "client_id": {
      "type": "string",
      "description": "Client ID",
      "default": "32"
    },
    "days_ahead": {
      "type": "integer",
      "description": "Number of days to check",
      "default": 7
    }
  }
}
```

**Important:** The `client_id` must be set to `"32"` either as a default value or passed dynamically.

#### 2. book_appointment_recovery
```json
{
  "name": "book_appointment_recovery",
  "description": "Book a Recovery Session appointment",
  "parameters": {
    "client_id": {
      "type": "string",
      "default": "32"
    },
    "customer_name": {
      "type": "string",
      "description": "Customer's full name"
    },
    "customer_phone": {
      "type": "string",
      "description": "Customer's phone number"
    },
    "appointment_date": {
      "type": "string",
      "description": "Date in YYYY-MM-DD format"
    },
    "appointment_time": {
      "type": "string",
      "description": "Time in HH:MM format or ISO datetime"
    }
  }
}
```

#### Tool Name Aliases

The API accepts multiple tool name variations:
- `check_availability` / `check_availability_recovery` / `check_availability_corvita`
- `book_appointment` / `book_appointment_recovery` / `book_appointment_corvita`
- `get_business_info` / `get_business_info_recovery`
- `send_sms` / `send_sms_recovery`

---

## API Endpoint Details

### POST /api/elevenlabs/tools

**File:** `src/routes/elevenlabs-tools.js`

#### Supported Request Formats

The endpoint handles multiple request formats for flexibility:

```javascript
// Format 1: Flat (preferred)
{ "tool_name": "check_availability_recovery", "client_id": "32" }

// Format 2: Nested parameters
{ "tool_name": "check_availability_recovery", "parameters": { "client_id": "32" } }

// Format 3: Nested tool object
{ "tool": { "name": "check_availability_recovery", "parameters": { "client_id": "32" } } }

// Format 4: OpenAI-style
{ "name": "check_availability_recovery", "parameters": { "client_id": "32" } }
```

#### Example: Check Availability

**Request:**
```bash
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"check_availability_recovery","client_id":"32"}'
```

**Response:**
```json
{
  "success": true,
  "calendar_id": "yHDUtxQWt9GzaPcdUnxs",
  "timezone": "America/New_York",
  "start_date": "2025-12-31",
  "end_date": "2026-01-07",
  "slots": [
    {"date": "2026-01-01", "time": "2026-01-01T10:00:00-05:00", "datetime": "2026-01-01T10:00:00-05:00"},
    {"date": "2026-01-01", "time": "2026-01-01T11:00:00-05:00", "datetime": "2026-01-01T11:00:00-05:00"}
  ],
  "slot_count": 8
}
```

**Note:** Slots are limited to 2 per day, max 10 total, to spread availability across multiple days for better voice UX.

#### Example: Book Appointment

**Request:**
```bash
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "book_appointment_recovery",
    "client_id": "32",
    "customer_name": "John Smith",
    "customer_phone": "813-555-1234",
    "appointment_date": "2026-01-08",
    "appointment_time": "10:00"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Appointment booked successfully for John Smith",
  "appointment_id": 255,
  "confirmation_code": "ABC12345",
  "appointment_date": "2026-01-08",
  "appointment_time": "10:00",
  "customer_name": "John Smith",
  "customer_phone": "813-555-1234"
}
```

---

## Booking Flow

### What Happens When a Customer Books

1. **Customer calls** → ElevenLabs agent answers
2. **Agent checks availability** → Calls `check_availability_recovery` tool
3. **Customer selects slot** → Agent collects name, phone
4. **Agent books appointment** → Calls `book_appointment_recovery` tool

### Backend Processing (book_appointment_recovery)

```
1. Validate input (name, phone, date, time)
           │
           ▼
2. Check if client requires deposit
   └── Client 32: deposit_required = true
           │
           ▼
3. Create appointment in RinglyPro DB
   └── status = 'pending'
   └── deposit_status = 'pending'
   └── source = 'voice_booking'
           │
           ▼
4. Sync to GHL Calendar
   └── Uses ghlBookingService.bookFromWhatsApp()
   └── Creates contact if needed
   └── Creates calendar event
           │
           ▼
5. GHL syncs to Google Calendar
   └── Event appears on "recovery" calendar
   └── ~30-60 second delay typical
```

---

## Data Flow Summary

### Voice Booking → All Systems

```
Voice Agent books appointment
        │
        ├──► RinglyPro Database
        │    └── appointments table
        │    └── status: pending (deposit required)
        │    └── source: voice_booking
        │
        └──► GHL Calendar API
             └── Creates event on calendar
             └── Creates/updates contact
                    │
                    ▼
             Google Calendar
             └── "recovery" calendar
             └── Event visible immediately*

* May take 30-60 seconds to sync
```

### Where Appointments Appear

| System | Shows Voice Bookings? | Notes |
|--------|----------------------|-------|
| RinglyPro Dashboard | Yes | Filter by date range, source=voice_booking |
| GHL Calendar | Yes | On "CORVITA RECOVERY SPECIALIST" calendar |
| Google Calendar | Yes | On "recovery" calendar |
| GHL Contacts | Yes | Contact created/updated with booking |

---

## Troubleshooting

### Issue: Agent says "trouble checking calendar"

**Cause:** Missing or incorrect `client_id` parameter

**Fix:** Ensure ElevenLabs tool configuration includes `client_id: "32"` as default or dynamic parameter

**Test:**
```bash
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"check_availability_recovery","client_id":"32"}'
```

### Issue: Blocked slots showing as available

**Cause:** Conflict calendars not configured in GHL

**Fix:**
1. Go to GHL > Settings > Calendars > CORVITA RECOVERY SPECIALIST
2. Add all calendars with blocking events to "Conflict Calendars"
3. Include: `recovery`, `Corvita Recovery Specialist`

### Issue: Appointment not appearing in Google Calendar

**Cause 1:** Sync delay (wait 30-60 seconds)

**Cause 2:** Wrong "Which calendar should we assign appointments to" setting

**Fix:** Ensure it's set to `recovery` (same as Linked Calendar)

### Issue: Appointment in Google but not RinglyPro

**Cause:** GHL sync to RinglyPro not working

**Fix:** Check if auto-sync is enabled on dashboard load (see `src/routes/appointments.js`)

### Issue: No slots returned from API

**Cause 1:** GHL calendar not configured

**Test:**
```bash
curl -X GET "https://services.leadconnectorhq.com/calendars/yHDUtxQWt9GzaPcdUnxs/free-slots?startDate=$(date +%s)000&endDate=$(($(date +%s) + 604800))000&timezone=America/New_York" \
  -H "Authorization: Bearer pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51" \
  -H "Version: 2021-04-15"
```

**Cause 2:** Business hours not set in GHL calendar

---

## Key Files

| File | Purpose |
|------|---------|
| `src/routes/elevenlabs-tools.js` | Main webhook handler for ElevenLabs |
| `src/services/ghlBookingService.js` | GHL API integration |
| `src/services/appointmentService.js` | Local appointment creation |
| `src/routes/appointments.js` | Dashboard appointments API |

---

## Testing Commands

### Check availability
```bash
curl -s -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"check_availability_recovery","client_id":"32"}'
```

### Check specific date from GHL directly
```bash
# Replace timestamps as needed (milliseconds)
curl -s "https://services.leadconnectorhq.com/calendars/yHDUtxQWt9GzaPcdUnxs/free-slots?startDate=1735689600000&endDate=1736899200000&timezone=America/New_York" \
  -H "Authorization: Bearer pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51" \
  -H "Version: 2021-04-15"
```

### Health check
```bash
curl -s "https://aiagent.ringlypro.com/api/elevenlabs/tools/health"
```

---

## Important Notes

1. **Deposit Required:** Client 32 has `deposit_required=true`, so all voice bookings are created with `status='pending'` and `deposit_status='pending'`

2. **Appointment Source:** Voice bookings are tagged with `source='voice_booking'` in the database

3. **Slot Limiting:** The API returns max 2 slots per day, 10 total, to provide a better voice experience

4. **Calendar Scope:** This integration is ONLY for the Recovery Session calendar. Other calendars (if any) require separate configuration.

5. **Sync Direction:**
   - Voice booking → RinglyPro ✅ → GHL ✅ → Google Calendar ✅
   - Direct GHL booking → Google Calendar ✅ (RinglyPro doesn't auto-import these)

---

## Contacts

- **RinglyPro Support:** Check server logs on Render dashboard
- **GHL Support:** GoHighLevel support for calendar configuration issues
- **ElevenLabs:** Check agent configuration and webhook settings
