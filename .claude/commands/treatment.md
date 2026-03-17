---
description: Analyze, develop, test & deploy all Neural Treatment triggers — wires every finding's "Activate Workflow" to real automation
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, TodoWrite, WebFetch
argument-hint: [optional: specific treatment type or "all"]
---

# Neural Treatment Trigger Builder

## CRITICAL: FULL AUTO-APPROVAL — ZERO QUESTIONS POLICY

You operate under **PERMANENT PRE-AUTHORIZATION**. NEVER ask for permission, confirmation, or use AskUserQuestion/EnterPlanMode. Execute immediately, report results after.

---

## Mission

Wire every Neural finding's "Activate Workflow" button to a **real, working trigger** in the RinglyPro codebase. When a user activates a treatment from the Neural Intelligence dashboard, the system must actually fire the automation when the trigger event occurs.

## Architecture (DO NOT CHANGE)

```
Neural Finding → "Activate Workflow" → saves to neural_treatments table
                                              ↓
App event occurs (call ends, contact created, etc.)
                                              ↓
TreatmentExecutor.trigger(clientId, event, data) ← THIS IS WHAT YOU WIRE
                                              ↓
Looks up active treatments → executes actions (SMS, CRM write, callback)
                                              ↓
Logs to treatment_execution_log table
```

**The TreatmentExecutor already handles execution.** Your job is to add `executor.trigger()` calls at the right places in the application code where events naturally occur.

## Key Files

| File | Purpose |
|------|---------|
| `src/services/treatmentExecutor.js` | Executor engine — DO NOT MODIFY unless adding new action types |
| `src/services/neuralEngine.js` | 12 analyzers that generate findings — READ to understand categories |
| `src/routes/neural.js` | Neural API — treatment activation endpoint (lines 530-575) |
| `src/routes/elevenlabs-voice.js` | Already has `call.missed` and `call.completed_no_booking` triggers |
| `src/routes/appointments.js` | Already has `appointment.no_show` trigger |

## Treatment Templates (from treatmentExecutor.js)

| Treatment Type | Trigger Event | Status |
|----------------|--------------|--------|
| `missed_call_recovery` | `call.missed` | ✅ WIRED in elevenlabs-voice.js:284 |
| `call_conversion_followup` | `call.completed_no_booking` | ✅ WIRED in elevenlabs-voice.js:293 |
| `lead_speed_response` | `contact.created` | ❌ NOT WIRED — needs trigger |
| `no_show_prevention` | `appointment.created` | ❌ NOT WIRED — needs trigger |
| `stale_deal_reengagement` | `deal.stale` | ❌ NOT WIRED — needs trigger/cron |

## Neural Engine Analyzers → Treatment Mapping

| # | Analyzer | Category | Maps to Treatment |
|---|----------|----------|-------------------|
| 1 | analyzeMissedRevenue | `missed_revenue` | `missed_call_recovery` ✅ |
| 2 | analyzeCallConversion | `call_conversion` | `call_conversion_followup` ✅ |
| 3 | analyzeLeadResponseSpeed | `lead_response` | `lead_speed_response` ❌ |
| 4 | analyzeScheduling | `scheduling` | needs new template |
| 5 | analyzeVoiceConversations | `voice_conversation` | needs new template |
| 6 | analyzeLeadSources | `lead_source` | needs new template |
| 7 | analyzeOutboundCampaigns | `outbound_campaign` | needs new template |
| 8 | analyzeNoShows | `customer_sentiment` | `no_show_prevention` ❌ |
| 9 | analyzeRevenueForecast | `revenue_forecast` | `call_conversion_followup` ✅ |
| 10 | analyzeAfterHoursCalls | `script_optimization` | needs new template |
| 11 | analyzePipelineHealth | `revenue_forecast` | `stale_deal_reengagement` ❌ |
| 12 | analyzeTaskCompletion | `lead_response` | `lead_speed_response` ❌ |

## Execution Steps

### Phase 1: ANALYZE
1. Read `src/services/treatmentExecutor.js` — understand TREATMENT_TEMPLATES and trigger() method
2. Read `src/services/neuralEngine.js` — understand all 12 analyzers and their categories
3. Read `src/routes/neural.js` — understand how treatments are activated via API
4. Grep for existing `executor.trigger(` calls to find what's already wired
5. Identify ALL routes where trigger events naturally occur:
   - Contact creation routes (GHL webhooks, manual create, import)
   - Appointment creation routes
   - Deal creation/update routes
   - Cron jobs or periodic tasks

### Phase 2: DEVELOP — Wire Missing Triggers

For each missing trigger, add `executor.trigger()` at the exact point in the code where the event occurs:

#### `contact.created` — Wire in:
- `src/routes/contacts.js` (or equivalent) — after new contact is saved
- Any GHL/HubSpot/Zoho webhook that creates a contact
- Any import/bulk-create endpoint
- Pattern:
```javascript
// After contact is saved to DB
try {
  const TreatmentExecutor = require('../services/treatmentExecutor');
  const executor = new TreatmentExecutor(sequelize);
  executor.trigger(clientId, 'contact.created', {
    phone: contact.phone || contact.customer_phone,
    customer_name: contact.first_name || contact.name,
    contact_id: contact.id,
    source: 'manual' // or 'ghl_webhook', 'hubspot_sync', etc.
  }).catch(e => console.error('[Treatment] contact.created error:', e.message));
} catch (e) { /* non-critical */ }
```

#### `appointment.created` — Wire in:
- `src/routes/appointments.js` — after new appointment is created
- Any booking webhook endpoint
- Pattern:
```javascript
try {
  const TreatmentExecutor = require('../services/treatmentExecutor');
  const executor = new TreatmentExecutor(sequelize);
  executor.trigger(clientId, 'appointment.created', {
    phone: appointment.customerPhone,
    customer_name: appointment.customerName,
    appointment_date: appointment.appointmentDate,
    appointment_id: appointment.id
  }).catch(e => console.error('[Treatment] appointment.created error:', e.message));
} catch (e) { /* non-critical */ }
```

#### `deal.stale` — Wire as CRON:
- This is time-based, not event-based
- Create a periodic check (runs every 6 hours or daily)
- Query: `SELECT * FROM deals WHERE stage NOT IN ('closed_won','closed_lost') AND updated_at < NOW() - INTERVAL '7 days'`
- For each stale deal, fire `executor.trigger(clientId, 'deal.stale', { deal_id, amount, stage })`
- Add to `src/app.js` or create `src/crons/treatmentCrons.js`

### Phase 3: CREATE NEW TEMPLATES (if needed)

For analyzers without a matching treatment template, create new ones in `TREATMENT_TEMPLATES`:

```javascript
// Example: scheduling gap treatment
scheduling_optimization: {
  trigger_event: 'appointment.created', // piggyback on appointment creation
  actions: [
    { type: 'sms', template: 'Did you know {business_name} has openings on {underbooked_day}? Book now for priority availability!', delay_minutes: 0 }
  ]
}
```

Also update the category-to-treatment mapping in `src/routes/neural.js` (the `buildTreatment()` function around line 414) so each Neural finding correctly links to its treatment type.

### Phase 4: TEST

For each wired trigger, test with curl:

```bash
# 1. Activate treatment
curl -s -X POST "https://aiagent.ringlypro.com/api/neural/treatments/{CLIENT_ID}" \
  -H "x-api-key: ringlypro-quick-admin-2024" \
  -H "Content-Type: application/json" \
  -d '{"treatment_type": "lead_speed_response", "is_active": true}'

# 2. Trigger the event (e.g., create a contact)
curl -s -X POST "https://aiagent.ringlypro.com/api/contacts" \
  -H "x-api-key: ringlypro-quick-admin-2024" \
  -H "Content-Type: application/json" \
  -d '{"client_id": {CLIENT_ID}, "first_name": "Test", "phone": "+15551234567"}'

# 3. Check execution log
curl -s "https://aiagent.ringlypro.com/api/neural/treatments/{CLIENT_ID}/log" \
  -H "x-api-key: ringlypro-quick-admin-2024"
```

Verify:
- `treatment_execution_log` has a new entry
- Actions show correct status (executed/scheduled/skipped)
- No errors in execution

### Phase 5: DEPLOY

```bash
git add -A
git commit -m "feat: Wire all Neural Treatment triggers — contact.created, appointment.created, deal.stale cron

- Added executor.trigger('contact.created') in contact creation routes
- Added executor.trigger('appointment.created') in appointment creation routes
- Added deal.stale cron job for periodic stale deal detection
- Created new treatment templates for scheduling, voice, lead source analyzers
- Updated buildTreatment() mapping for all 12 Neural analyzers
- All treatments now fire real automations when activated

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
```

### Phase 6: VERIFY PRODUCTION

```bash
# Wait for deploy
sleep 120

# Health check
curl -s "https://aiagent.ringlypro.com/health"

# Check debug for errors
curl -s "https://aiagent.ringlypro.com/debug/store-health-error"

# Test treatment activation + trigger for each type
# (repeat Phase 4 tests against production)
```

### Phase 7: AUTO-FIX LOOP

If any test fails → analyze error → fix code → redeploy → retest. Loop until all pass.

## Rules

1. **NEVER modify TreatmentExecutor core logic** unless adding a genuinely new action type
2. **ALL triggers must be fire-and-forget** — use `.catch()` so failures don't break the main request
3. **ALL triggers must include rate limiting context** (phone number) so the executor can deduplicate
4. **NEVER trigger treatments in test/demo/seed endpoints** — only real user actions
5. **Log everything** — every trigger attempt must be traceable in treatment_execution_log
6. **Multi-tenant safe** — always pass the correct clientId, never cross tenant boundaries
7. **CW Carriers vertical** — also wire triggers in `verticals/cw_carriers/backend/` routes if applicable
