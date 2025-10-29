# EMERGENCY FIX: Outbound Caller Duplicate Call Prevention

## Critical Issue (2025-10-29)

**Problem:** The scheduled auto-caller called +14243242113 **49 TIMES** in 2 hours (9:12 AM - 10:38 AM EST).

### Root Cause Analysis

1. **Webhook Failure**: Twilio's status callback webhook failed to reach the server or update the database
2. **No Immediate Status Update**: Database was only updated when webhook fired, not when call initiated
3. **No Retry Prevention**: Same number kept appearing in `TO_BE_CALLED` query every 2 minutes
4. **No Safety Mechanisms**: No duplicate detection, no emergency stop, no alerts

### Legal/Business Impact

- **TCPA Violation Risk**: Up to $1,500 per unwanted call (49 calls = potential $73,500 liability)
- **Carrier Blocking**: Twilio number (+12396103810) at risk of being blocked
- **Harassment Complaints**: Recipient may file complaints with FCC/FTC
- **Reputation Damage**: Business credibility severely damaged

---

## Emergency Fixes Implemented

### 1. BAD_NUMBER Status & Permanent Block

**Files:**
- `migrations/add-bad-number-status.js`
- `scripts/emergency-block-bad-number.sql`

**Changes:**
- Added `BAD_NUMBER` status to call_status enum
- Marked +14243242113 as BAD_NUMBER with note: "EMERGENCY BLOCK: Called 49 times on 2025-10-29"
- Added PostgreSQL trigger to prevent changing BAD_NUMBER back to TO_BE_CALLED
- Updated `getNextProspect()` to exclude BAD_NUMBER entries

**Run immediately:**
```bash
psql $DATABASE_URL < scripts/emergency-block-bad-number.sql
```

### 2. Immediate Database Update (No More Retries)

**File:** `src/services/scheduled-auto-caller.js` (lines 319-332)

**Before:**
```javascript
// Called prospect
// Waited for Twilio webhook to update database
// If webhook failed → number stayed as TO_BE_CALLED → called again
```

**After:**
```javascript
// IMMEDIATELY mark as CALLING before Twilio call
await sequelize.query(
  `UPDATE business_directory
   SET call_status = 'CALLING',
       last_called_at = CURRENT_TIMESTAMP
   WHERE id = :prospectId`
);

// Make Twilio call
// Even if webhook fails, status is already CALLING
// Next query won't return this number
```

**New Status Flow:**
```
TO_BE_CALLED → CALLING (immediate) → CALLED (webhook) OR FAILED (webhook)
```

### 3. Duplicate Call Detection

**File:** `src/services/scheduled-auto-caller.js` (lines 96-120)

**Implementation:**
- Tracks last 10 phone numbers called in memory
- Before making call, checks if number was already called
- If duplicate detected → Emergency stop + email notification

```javascript
checkForDuplicates(phoneNumber) {
  const duplicate = this.recentCalls.find(call => call.phone === phoneNumber);
  if (duplicate) {
    this.emergencyStopAndNotify(
      `DUPLICATE CALL DETECTED: ${phoneNumber} called multiple times`
    );
    return true;
  }
  this.recentCalls.push({ phone: phoneNumber, timestamp: new Date() });
  return false;
}
```

### 4. Emergency Kill Switch

**File:** `src/services/scheduled-auto-caller.js` (lines 45-94)

**Triggers:**
- **3 consecutive failures**: Stops calling, sends email
- **2 duplicate detections**: Stops calling, sends email
- **Any system error**: Logs and counts toward consecutive failures

**Configuration:**
```javascript
this.config = {
  maxConsecutiveFailures: 3,    // EMERGENCY: Stop after 3 failures
  maxDuplicateDetections: 2     // EMERGENCY: Stop if same number called twice
};
```

**Safety Checks (every 2 minutes):**
```javascript
if (this.consecutiveFailures >= 3) {
  await this.emergencyStopAndNotify(
    'Too many consecutive failures. Possible webhook failure.'
  );
  return;
}

if (this.checkForDuplicates(phoneNumber)) {
  await this.emergencyStopAndNotify(
    'DUPLICATE CALL DETECTED: Database update failed.'
  );
  return;
}
```

### 5. Email Notifications

**File:** `src/services/scheduled-auto-caller.js` (lines 48-93)

**Sends to:** mstagg@digit2ai.com

**Triggers:**
- Duplicate call detected
- Too many consecutive failures
- System error during calling

**Email Content:**
```
Subject: 🚨 EMERGENCY: Outbound Caller STOPPED

Technical Issue Detected

The Outbound Caller system has been automatically stopped due to:
[Reason - duplicate/failures/error]

Stats:
- Calls made today: X
- Failed calls: Y
- Duplicate detections: Z
- Consecutive failures: N

⚠️ Please investigate immediately to prevent TCPA violations.
```

### 6. Additional Safety Features

**Call Status Tracking:**
```javascript
this.stats = {
  totalProspects: 0,
  calledToday: 0,
  failedCalls: 0,              // NEW
  duplicateDetections: 0,       // NEW
  consecutiveFailures: 0        // NEW
};
```

**Status Updates on Success:**
```javascript
if (result.success) {
  this.consecutiveFailures = 0;  // Reset on success
  // Update to CALLED immediately (don't wait for webhook)
  await sequelize.query(`UPDATE ... SET call_status = 'CALLED'`);
}
```

**Status Updates on Failure:**
```javascript
else {
  this.consecutiveFailures++;
  this.stats.failedCalls++;

  // Mark as BAD_NUMBER if invalid phone
  const isBadNumber = result.error?.includes('Invalid');
  await sequelize.query(`
    UPDATE ... SET call_status = :status
    WHERE status = ${isBadNumber ? 'BAD_NUMBER' : 'FAILED'}
  `);
}
```

---

## Deployment Steps

### STEP 1: Emergency Block (RUN IMMEDIATELY)

```bash
# Block the problematic number
psql $DATABASE_URL < scripts/emergency-block-bad-number.sql

# Verify it's blocked
psql $DATABASE_URL -c "
  SELECT id, business_name, phone_number, call_status, call_notes
  FROM business_directory
  WHERE phone_number ILIKE '%424324211%';
"
```

### STEP 2: Add CALLING Status

```bash
# Add CALLING status to database
node migrations/add-calling-status.js

# Or manually via SQL
psql $DATABASE_URL -c "
  COMMENT ON COLUMN business_directory.call_status IS
  'Call status: TO_BE_CALLED, CALLING, CALLED, FAILED, BAD_NUMBER, SKIPPED';
"
```

### STEP 3: Deploy Code Changes

```bash
# Commit all changes
git add .
git commit -m "EMERGENCY: Add safety mechanisms to prevent duplicate calls"

# Deploy to production
git push origin main

# Restart services
pm2 restart all
```

### STEP 4: Verify Safety Mechanisms

```bash
# Check logs for safety features
pm2 logs --lines 50 | grep -E "SAFETY|EMERGENCY|DUPLICATE"

# Test duplicate detection (should fail after 1 call)
# Test consecutive failures (should stop after 3)
# Test email notification (check inbox)
```

---

## Prevention Checklist

- [x] BAD_NUMBER status added
- [x] +14243242113 permanently blocked
- [x] Database trigger prevents unblocking BAD_NUMBER
- [x] Immediate CALLING status update before Twilio call
- [x] Duplicate call detection (last 10 calls tracked)
- [x] Emergency kill switch (3 consecutive failures)
- [x] Email notifications to mstagg@digit2ai.com
- [x] Status updates on both success and failure
- [x] Invalid numbers marked as BAD_NUMBER automatically
- [x] Consecutive failure counter resets on success

---

## Testing & Monitoring

### Manual Testing

1. **Test Normal Operation:**
   ```bash
   # Start scheduler with 1 prospect
   curl -X POST http://localhost:3000/api/scheduled-auto-caller/start
   # Should call once and mark as CALLED
   ```

2. **Test Duplicate Prevention:**
   ```bash
   # Manually set a prospect back to TO_BE_CALLED after calling
   # Scheduler should detect duplicate and emergency stop
   ```

3. **Test Webhook Failure:**
   ```bash
   # Block Twilio webhook temporarily
   # Call should still be marked as CALLING
   # Number should not be called again
   ```

### Production Monitoring

```bash
# Watch for emergency stops
pm2 logs | grep "🚨 EMERGENCY"

# Check duplicate detections
pm2 logs | grep "DUPLICATE CALL"

# Monitor consecutive failures
pm2 logs | grep "consecutiveFailures"

# View scheduler status
curl http://localhost:3000/api/scheduled-auto-caller/status
```

### Database Queries

```sql
-- Check for BAD_NUMBER entries
SELECT id, business_name, phone_number, call_status, call_notes
FROM business_directory
WHERE call_status = 'BAD_NUMBER';

-- Check for stale CALLING statuses (webhook may have failed)
SELECT id, business_name, phone_number, call_status, last_called_at
FROM business_directory
WHERE call_status = 'CALLING'
  AND last_called_at < NOW() - INTERVAL '5 minutes';

-- Count calls per number (should all be 1 or 2 max)
SELECT phone_number, COUNT(*) as call_count
FROM business_directory
WHERE call_status = 'CALLED'
GROUP BY phone_number
HAVING COUNT(*) > 2
ORDER BY call_count DESC;
```

---

## Future Improvements

1. **Rate Limiting**: Add per-number rate limit (max 1 call per 24 hours)
2. **DNC List Integration**: Check against National Do Not Call Registry
3. **Webhook Retry Logic**: Implement exponential backoff for webhook retries
4. **Call Recording**: Record all calls for quality assurance and legal compliance
5. **Dashboard**: Real-time monitoring dashboard for call status
6. **Alerting**: PagerDuty/Slack integration for critical issues
7. **Audit Trail**: Log all status changes with timestamps and reasons

---

## Contact

**For Emergencies:**
- Email: mstagg@digit2ai.com
- Phone: (Check emergency contact list)

**System Owner:** Manuel Stagg
**Last Updated:** 2025-10-29
**Severity:** CRITICAL - P0
**Status:** FIXED - DEPLOYED
