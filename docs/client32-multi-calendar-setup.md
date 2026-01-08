# Client 32 (Corvita Recovery & Nutrition) - Multi-Calendar Setup

## Date: 2026-01-08

## Overview
Client 32 uses GoHighLevel (GHL) with 3 separate calendars for different services. The RinglyPro CRM dashboard supports filtering appointments by calendar.

## GHL Credentials
- **Location ID**: `CU7M8At2sWwodiBrr71J`
- **API Key**: Stored in `clients.ghl_api_key` column
- **ElevenLabs Agent ID**: `agent_1801kdnq8avcews9r9rrvf7k0vh1`

## Calendars

| Calendar Name | Calendar ID | Service |
|--------------|-------------|---------|
| CORVITA RECOVERY SPECIALIST | `yHDUtxQWt9GzaPcdUnxs` | Recovery Specialist Appointments |
| CORVITA HYPERBARIC OXYGEN THERAPY | `lqwsBWMJip0wx6NGLeaG` | Hyperbaric Oxygen Therapy |
| CORVITA LOCALIZED CRYOTHERAPY | `mV3NGEcqoXayzHtIEE97` | Localized Cryotherapy |

## Calendar Hours (All Calendars)
- **Monday-Friday**: 10:00 AM - 9:00 PM EST
- **Saturday**: 10:00 AM - 3:00 PM EST
- **Sunday**: Closed

## Syncing Blocked Slots

The blocked slots are derived from GHL's free-slot availability API. To sync blocked slots for each calendar:

### Recovery Specialist
```bash
curl -X POST "https://ringlypro-crm.onrender.com/api/test-ghl/sync-from-availability/32" \
  -H "Content-Type: application/json" \
  -d '{"calendarId": "yHDUtxQWt9GzaPcdUnxs", "days": 14}'
```

### Hyperbaric Oxygen Therapy
```bash
curl -X POST "https://ringlypro-crm.onrender.com/api/test-ghl/sync-from-availability/32" \
  -H "Content-Type: application/json" \
  -d '{"calendarId": "lqwsBWMJip0wx6NGLeaG", "days": 14}'
```

### Localized Cryotherapy
```bash
curl -X POST "https://ringlypro-crm.onrender.com/api/test-ghl/sync-from-availability/32" \
  -H "Content-Type: application/json" \
  -d '{"calendarId": "mV3NGEcqoXayzHtIEE97", "days": 14}'
```

## Check Calendar Status
```bash
curl -s "https://ringlypro-crm.onrender.com/api/test-ghl/check-calendar-ids/32"
```

## Dashboard Calendar Selector

The dashboard (`views/dashboard.ejs`) includes a calendar selector dropdown for Client 32 that filters appointments by `ghl_calendar_id`.

### Dropdown Location
File: `views/dashboard.ejs` (around line 2592)

### Calendar Selector Options
- Recovery Specialist (default)
- Hyperbaric Oxygen Therapy
- Localized Cryotherapy

### Filtering Logic
The `placeAppointmentsOnCalendar()` function filters appointments based on `selectedCalendarId`:
- Compares `apt.ghlCalendarId` or `apt.ghl_calendar_id` against selected value
- Only shows appointments matching the selected calendar

## Database Schema

Appointments are stored in the `appointments` table with:
- `client_id`: 32
- `ghl_calendar_id`: The calendar ID from GHL
- `customer_name`: For blocked slots, format is "Busy - {CALENDAR_NAME}"
- `source`: 'manual' for blocked slots derived from availability

## Troubleshooting

### Calendar filter not working
1. Check if `ghl_calendar_id` is being returned in the API response
2. Verify the dashboard query includes `ghl_calendar_id` field
3. Check `crmAppointmentService.js` dashboard query includes the field

### Blocked slots missing
1. Run the sync-from-availability endpoint for the affected calendar
2. Note: GHL API has rate limits (429 errors) - may need to wait and retry
3. Check `api/test-ghl/check-calendar-ids/32` to verify data

### Restore blocked slots
If blocked slots are accidentally deleted, re-run the sync-from-availability commands above.

## Related Files
- `src/routes/test-ghl.js` - Sync endpoints
- `src/services/crmAppointmentService.js` - Dashboard appointments query
- `views/dashboard.ejs` - Calendar selector UI and filtering logic
- `src/routes/client.js` - Debug appointments endpoint

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/test-ghl/calendars/32` | List all GHL calendars |
| `GET /api/test-ghl/check-calendar-ids/32` | Check calendar IDs in database |
| `GET /api/test-ghl/debug-blocked/32/{calendarId}` | Debug blocked slots from GHL |
| `POST /api/test-ghl/sync-from-availability/32` | Sync blocked slots |
| `GET /api/client/debug/appointments/32` | Debug appointments in database |
