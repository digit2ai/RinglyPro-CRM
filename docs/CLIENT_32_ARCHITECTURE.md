# Corvita Recovery & Nutrition - Client 32 Architecture
## Voice AI + GHL Calendar Integration

Client 32 (Corvita Recovery & Nutrition) uses ElevenLabs for **inbound** voice calls with GHL calendar integration. This document outlines the current setup and requirements for enabling outbound AI calling.

---

## Quick Reference

### Current Configuration

| Setting | Value |
|---------|-------|
| **Client ID** | 32 |
| **Business Name** | Corvita Recovery & Nutrition |
| **Owner** | Wuisem Khuchaifeh |
| **Owner Email** | corvitarn@gmail.com |
| **Owner Phone** | (786) 643-3735 |
| **RinglyPro Number** | +18048120489 |
| **Timezone** | America/New_York |
| **Business Hours** | Mon-Fri 10:00 AM - 9:00 PM, Sat 9:00 AM - 3:00 PM |

### ElevenLabs Configuration

| Setting | Value | Status |
|---------|-------|--------|
| **elevenlabs_agent_id** | `agent_1801kdnq8avcews9r9rrvf7k0vh1` | Active |
| **elevenlabs_phone_number_id** | `null` | **NOT SET** |
| **rachel_enabled** | `false` | Disabled |
| **use_elevenlabs_outbound** | `false` | Disabled |
| **voice_provider** | `elevenlabs` | Active |

### Calendar Integration

| Integration | Status | Details |
|-------------|--------|---------|
| **RinglyPro Native** | Active | Default calendar |
| **GoHighLevel (GHL)** | Active | Location: CU7M8At2sWwodiBrr71J, Calendar: yHDUtxQWt9GzaPcdUnxs |
| **Google Calendar** | Not configured | - |
| **Zoho CRM** | Not configured | - |

---

## System Architecture

```
                                    +------------------+
                                    |   Inbound Call   |
                                    |   (Customer)     |
                                    +--------+---------+
                                             |
                                             v
                                    +------------------+
                                    |  Twilio Number   |
                                    | +18048120489     |
                                    +--------+---------+
                                             |
                                             v
                                    +------------------+
                                    |  ElevenLabs AI   |
                                    |  Voice Agent     |
                                    | (agent_1801...)  |
                                    +--------+---------+
                                             |
                        +--------------------+--------------------+
                        |                    |                    |
                        v                    v                    v
               +----------------+   +----------------+   +----------------+
               | check_         |   | book_          |   | send_sms       |
               | availability   |   | appointment    |   |                |
               +-------+--------+   +-------+--------+   +-------+--------+
                       |                    |                    |
                       v                    v                    v
               +--------------------------------------------------+
               |              RinglyPro Backend                    |
               |         /api/elevenlabs/tools                     |
               +--------------------------------------------------+
                       |                    |
                       v                    v
               +----------------+   +----------------+
               |  RinglyPro     |   |  GoHighLevel   |
               |  Calendar      |   |  Calendar      |
               +----------------+   +----------------+
```

---

## Current Capabilities

### What Works Now (Inbound)

1. **Inbound Voice Calls**: ElevenLabs AI agent answers calls on +18048120489
2. **Appointment Booking**: Books to both RinglyPro and GHL calendars
3. **SMS Confirmations**: Sends via Twilio from +18048120489
4. **GHL Calendar Sync**: Bi-directional sync with GHL calendar
5. **IVR Options**: Customer Service transfer to +17864623869

### What Needs to be Enabled (Outbound)

1. **ElevenLabs Outbound Calling**: `use_elevenlabs_outbound = true`
2. **ElevenLabs Phone Number ID**: Needs to be configured
3. **Rachel Voice Booking**: `rachel_enabled = true`
4. **Prospect Database**: Upload prospects for outbound calls

---

## Comparison: Client 32 vs Client 15

| Feature | Client 15 (RinglyPro) | Client 32 (Corvita) |
|---------|----------------------|---------------------|
| **Inbound AI Calls** | Active | Active |
| **Outbound AI Calls** | Active | **NOT ACTIVE** |
| **elevenlabs_phone_number_id** | `phnum_0001kejbmfnkex99t0tmstm99kcx` | `null` |
| **use_elevenlabs_outbound** | `true` | `false` |
| **rachel_enabled** | `true` | `false` |
| **GHL Integration** | No | Yes (Active) |
| **Google Calendar** | Yes | No |
| **Zoho CRM** | Yes | No |
| **Prospect Database** | 550 prospects | 0 prospects |

---

## Enabling Outbound Calling for Client 32

### Step 1: Get ElevenLabs Phone Number ID

Client 32 needs an ElevenLabs phone number ID for outbound calls. Options:

**Option A: Use Shared Phone Number (Same as Client 15)**
```bash
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "admin_set_elevenlabs_phone",
    "parameters": {
      "client_id": "32",
      "phone_number_id": "phnum_0001kejbmfnkex99t0tmstm99kcx",
      "api_key": "ringlypro-quick-admin-2024"
    }
  }'
```

**Option B: Create Dedicated Phone Number in ElevenLabs**
1. Go to https://elevenlabs.io/conversational-ai
2. Create a new phone number for Corvita
3. Copy the phone number ID (format: `phnum_xxxxx`)
4. Run the admin command above with the new ID

### Step 2: Enable Outbound Calling Flag

```bash
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "admin_enable_elevenlabs_outbound",
    "parameters": {
      "client_id": "32",
      "enabled": true,
      "api_key": "ringlypro-quick-admin-2024"
    }
  }'
```

### Step 3: Enable Rachel (Optional)

For inbound voice booking:
```bash
# Via database or admin tool
UPDATE clients SET rachel_enabled = true WHERE id = 32;
```

### Step 4: Upload Prospects

Once outbound is enabled, use the Prospect Manager to upload prospects:

**URL**: `https://aiagent.ringlypro.com/mcp-copilot/prospect-manager.html?client_id=32`

---

## GHL Integration Details

### Active Settings

```json
{
  "integration": {
    "ghl": {
      "apiKey": "pit-c06c6e76-a6c2-4ad6-adcc-132ccaf11d51",
      "enabled": true,
      "calendarId": "yHDUtxQWt9GzaPcdUnxs",
      "locationId": "CU7M8At2sWwodiBrr71J",
      "syncCalendar": true,
      "syncContacts": true,
      "triggerWorkflows": false
    }
  }
}
```

### Appointment Flow with GHL

1. Customer calls +18048120489
2. ElevenLabs AI answers and offers appointment booking
3. AI calls `check_availability` to get open slots
4. Customer selects a slot
5. AI calls `book_appointment`:
   - Creates appointment in RinglyPro database
   - Creates appointment in GHL calendar (via API)
6. AI calls `send_sms` to send confirmation

---

## IVR Configuration

Client 32 has IVR enabled with transfer options:

```json
{
  "ivr_enabled": true,
  "ivr_options": [
    {
      "name": "Customer Service",
      "phone": "+17864623869",
      "enabled": true
    }
  ]
}
```

---

## ElevenLabs Tool Configuration

The ElevenLabs agent for Client 32 should have these 3 tools configured:

### Webhook URL
`https://aiagent.ringlypro.com/api/elevenlabs/tools`

### Tools (POST Method)

1. **check_availability** - Check open appointment slots
2. **book_appointment** - Book an appointment (syncs to GHL)
3. **send_sms** - Send SMS confirmation

See [ELEVENLABS_TOOL_SCHEMAS.md](./ELEVENLABS_TOOL_SCHEMAS.md) for full JSON schemas.

---

## Prospect Manager Requirements

### Current State
- **Prospects**: 0 (no prospects uploaded)
- **Outbound Enabled**: No

### Required: Upload Function

The Prospect Manager needs an upload function to:

1. Accept CSV file with prospect data
2. Parse columns: business_name, phone_number, email, location, category
3. Validate phone numbers (E.164 format)
4. Insert into `business_directory` table with `client_id = 32`
5. Set `call_status = 'TO_BE_CALLED'`

### CSV Format

```csv
business_name,phone_number,email,location,category
"Recovery Center Tampa","+18135551234","info@example.com","Tampa, FL","Recovery Center"
"Wellness Clinic Miami","+13055555678","contact@example.com","Miami, FL","Wellness"
```

---

## Database Tables

### Relevant Tables for Client 32

1. **clients** - Main client configuration
2. **appointments** - Booked appointments
3. **messages** - Call logs and SMS history
4. **business_directory** - Prospect database for outbound calls
5. **ghl_integrations** - GHL OAuth tokens (if using OAuth flow)

### Prospect Table Schema

```sql
CREATE TABLE business_directory (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  business_name VARCHAR(255),
  phone_number VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  street VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  location VARCHAR(255),
  category VARCHAR(255),
  call_status VARCHAR(50) DEFAULT 'TO_BE_CALLED',
  call_attempts INTEGER DEFAULT 0,
  last_called_at TIMESTAMP,
  call_result VARCHAR(255),
  call_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Activation Checklist

- [x] Set `elevenlabs_phone_number_id` for Client 32 (`phnum_1901kesr2ez7fv9bpvrsmxf8e8mw`)
- [x] Enable `use_elevenlabs_outbound = true`
- [ ] Enable `rachel_enabled = true` (optional, for inbound)
- [x] Add CSV upload function to Prospect Manager
- [ ] Upload prospect list for Corvita
- [ ] Test outbound call via Prospect Manager
- [ ] Verify appointments sync to GHL calendar

---

## Quick Admin Commands

### Check Current Config
```bash
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"admin_get_client_config","parameters":{"client_id":"32","api_key":"ringlypro-quick-admin-2024"}}'
```

### Test Availability Check
```bash
curl -X POST "https://aiagent.ringlypro.com/api/elevenlabs/tools" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"check_availability","parameters":{"client_id":"32","days_ahead":"7"}}'
```

### View Recent Appointments
```bash
curl -s "https://aiagent.ringlypro.com/api/client/debug/appointments/32"
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-12 | Created Client 32 architecture document |
| 2026-01-10 | Backup created for Client 32 configuration |
| 2025-12-29 | GHL integration enabled |
| 2025-12-10 | Client 32 created |

---

*This document serves as the reference architecture for Client 32 (Corvita Recovery & Nutrition) and the guide for enabling outbound AI calling.*
