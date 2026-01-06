# GHL Calendar Sync Implementation - Conversation Backup
## Date: January 5, 2026

## Problem Statement
Client 32 (Corvita Recovery & Nutrition) calendar in RinglyPro dashboard needs to sync with GHL calendar showing all busy/blocked slots with color coding by calendar type.

## GHL Calendar Configuration for Client 32
- **Location ID**: From clients table `ghl_location_id`
- **3 Calendars**:
  1. CORVITA HYPERBARIC OXYGEN THERAPY (ID: `lqwsBWMJip0wx6NGLeaG`) - Color: Orange
  2. CORVITA RECOVERY SPECIALIST (ID: `OD1RVR9H5rnGhD3s0xoD`) - Color: Red
  3. CORVITA LOCALIZED CRYOTHERAPY (ID: `a4NHsZo1R2mGdpORoJSB`) - Color: Green
  4. AI-booked appointments - Color: Blue

## Open Hours Configuration
- Mon-Fri: 10:00 AM to 9:00 PM (21:00)
- Saturday: 10:00 AM to 3:00 PM (15:00)
- Sunday: Closed

## Key Technical Discovery
GHL API `/calendars/events` endpoint does NOT return "Busy" blocks from external calendar syncs.
**Solution**: Derive busy slots by:
1. Get calendar open hours configuration
2. Get free slots from `/calendars/{calendarId}/free-slots` endpoint
3. Busy slots = All possible slots - Free slots

## Files Modified

### 1. src/services/ghlBookingService.js
- `getAppointments()` method completely rewritten
- Fetches all calendars for location
- For each calendar, derives busy slots from open hours vs free slots
- Parses time directly from ISO string to avoid timezone issues
- Key code pattern:
```javascript
const allPossibleSlots = [];
for (let h = openHour; h < closeHour; h++) {
  allPossibleSlots.push(`${dateStr}T${h.toString().padStart(2, '0')}:00:00-05:00`);
}
const freeSlots = freeSlotsResult.data[dateStr]?.slots || [];
const busySlots = allPossibleSlots.filter(slot => !freeSlots.includes(slot));
```

### 2. src/services/crmAppointmentService.js
- Added `ghl_calendar_id` to INSERT query in `syncToLocalDB()`
- Stores calendar ID for color-coding

### 3. src/routes/appointments.js
- Sync runs in background using `setImmediate()` (non-blocking)
- Reduced sync range from 30 days to 7 days to avoid timeout

### 4. views/dashboard.ejs
- Added CSS classes for calendar-specific colors:
  - `.hyperbaric-busy` - Orange (#f97316)
  - `.recovery-busy` - Red (#ef4444)
  - `.cryotherapy-busy` - Green (#22c55e)
  - `.voice-booking` - Blue (#3b82f6)
- Updated `placeAppointmentsOnCalendar()` to detect busy slots and apply colors

## Database Schema
Appointments table has:
- `ghl_calendar_id` (varchar) - stores calendar ID
- `ghl_appointment_id` (varchar) - stores busy slot ID like `busy_calendarId_date_hour`
- `source` (enum) - 'ghl_sync' for synced appointments
- `notes` (text) - contains 'Busy/Blocked slot from GHL calendar' for busy slots

## Current Database State (Client 32)
- 376 total appointments
- 375 ghl_sync (busy slots)
- 1 voice_booking (Nelson Sánchez at 7PM on Jan 5)

## Known Issues Fixed
1. **Timezone bug**: `new Date(isoString).getHours()` returns UTC on server - Fixed by parsing hour directly from string
2. **Blocking sync timeout**: 30-day sync with many API calls caused timeout - Fixed by making non-blocking and reducing to 7 days
3. **Rachel toggle error**: DOM element destroyed when setting textContent - Fixed by separating into sibling spans

## API Endpoints Used
- `GET /calendars/` - List all calendars
- `GET /calendars/{id}` - Get calendar details with open hours
- `GET /calendars/{id}/free-slots` - Get available slots for date range

## Service Worker Cache Versions
Started at v15, now at v23

## Commands to Test GHL API
```bash
DATABASE_URL="postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require" node -e "
const { Sequelize } = require('sequelize');
const axios = require('axios');
// ... test code
"
```

## Color Coding Logic in Dashboard
```javascript
const isBusySlot = notes.includes('busy/blocked slot') || (apt.customerName || '').toLowerCase() === 'busy';

if (isBusySlot && source === 'ghl_sync') {
  if (purpose.includes('hyperbaric') || ghlCalendarId === 'lqwsBWMJip0wx6NGLeaG') {
    eventClass += ' hyperbaric-busy';  // Orange
  } else if (purpose.includes('recovery') || ghlCalendarId === 'OD1RVR9H5rnGhD3s0xoD') {
    eventClass += ' recovery-busy';  // Red
  } else if (purpose.includes('cryotherapy') || ghlCalendarId === 'a4NHsZo1R2mGdpORoJSB') {
    eventClass += ' cryotherapy-busy';  // Green
  }
}
```

## Next Steps If Issue Persists
1. Check if appointments are being returned from API (console log shows count)
2. Check if date filtering is correct (7-day range)
3. Verify calendar grid starts at 8AM and scrolls to show 10AM slots
4. Hard refresh (Ctrl+Shift+R) to clear service worker cache
