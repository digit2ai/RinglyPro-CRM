# Call Transfer Loop Prevention - RinglyPro IVR System

## The Problem

When a prospect calls your RinglyPro number:
1. Call forwards to Twilio → Rachel/Lina answers
2. Prospect presses digit to transfer (e.g., "Press 2 for Manny")
3. System tries to dial your phone number
4. **If your phone has call forwarding to RinglyPro → INFINITE LOOP!**

Example:
```
Prospect calls: +1-888-610-3810 (RinglyPro number)
  ↓ (forwards to Twilio)
Rachel/Lina answers
Prospect presses 2 (Transfer to owner)
  ↓ (tries to dial: +1-305-XXX-XXXX - your cell)
Your cell forwards to: +1-888-610-3810
  ↓ (LOOP - back to Rachel/Lina!)
```

## Current Implementation

Location: `src/routes/rachelRoutes.js` lines 1002-1010

```javascript
const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${transferMsg}</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number>${dept.phone}</Number>
    </Dial>
    <Say voice="${voice}">The transfer failed. Please try again later. Goodbye.</Say>
    <Hangup/>
</Response>`;
```

---

## Solutions

### Solution 1: Custom SIP Parameters (BEST - Prevents Loop)

Add a custom SIP header to mark transfers, then check for it on incoming calls:

#### Step 1: Modify Transfer TwiML
```javascript
const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${transferMsg}</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number
            url="/voice/rachel/transfer-status?dept=${encodeURIComponent(dept.name)}"
            statusCallback="/voice/rachel/transfer-status"
            statusCallbackEvent="initiated completed answered busy no-answer failed"
        >
            ${dept.phone}?x-ringlypro-transfer=true&x-client-id=${clientId}
        </Number>
    </Dial>
    <Say voice="${voice}">The transfer failed. Please try again later. Goodbye.</Say>
    <Hangup/>
</Response>`;
```

#### Step 2: Detect Transfer on Incoming
In the initial call handler, check for the custom parameter:

```javascript
router.post('/voice/incoming', async (req, res) => {
    const isTransfer = req.body.To?.includes('x-ringlypro-transfer=true');

    if (isTransfer) {
        // This is a transfer coming back - don't answer with Rachel/Lina!
        // Instead, play busy signal or route to voicemail
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say>The person you're trying to reach is unavailable. Please leave a message after the tone.</Say>
            <Record maxLength="120" transcribe="true" transcribeCallback="/voice/voicemail-transcription"/>
            <Hangup/>
        </Response>`;

        return res.type('text/xml').send(twiml);
    }

    // Normal call flow - answer with Rachel/Lina
    // ...
});
```

---

### Solution 2: Alternative Phone Number (SIMPLE)

**Have clients provide a DIRECT phone number that does NOT forward to RinglyPro:**

#### Database Schema
Add a new field to the `ivr_options` department configuration:

```javascript
ivr_options: [
    {
        name: "Owner (Manny)",
        phone: "+13055551234",           // Main number (has forwarding)
        direct_phone: "+13055559999",     // Direct number (NO forwarding) ← NEW!
        enabled: true
    }
]
```

#### Modified Transfer Logic
```javascript
// Use direct_phone if available, fallback to phone
const transferNumber = dept.direct_phone || dept.phone;

// Warn if no direct number and phone might loop
if (!dept.direct_phone && dept.phone === client.business_phone) {
    console.warn(`⚠️ WARNING: Transfer to ${dept.name} may create loop! No direct_phone configured.`);
}

const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${transferMsg}</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number>${transferNumber}</Number>
    </Dial>
    <Say voice="${voice}">The transfer failed. Please try again later. Goodbye.</Say>
    <Hangup/>
</Response>`;
```

---

### Solution 3: Smart Call Counter (Detect Loops)

Track calls in session/database to detect when same number keeps calling:

```javascript
router.post('/voice/incoming', async (req, res) => {
    const callSid = req.body.CallSid;
    const from = req.body.From;

    // Check if this CallSid has been seen before (loop detection)
    const callCount = await redis.incr(`call:${callSid}:count`);
    await redis.expire(`call:${callSid}:count`, 300); // 5 min expiry

    if (callCount > 2) {
        console.error(`🔴 LOOP DETECTED: CallSid ${callSid} has been processed ${callCount} times!`);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say>We've detected a call routing issue. Please contact us directly. Goodbye.</Say>
            <Hangup/>
        </Response>`;

        return res.type('text/xml').send(twiml);
    }

    // Normal processing...
});
```

---

## Recommended Implementation

**Use Solution 2 (Alternative Phone Number)** because:
1. ✅ Simple to implement
2. ✅ Easy for clients to understand
3. ✅ No complex loop detection needed
4. ✅ Reliable and predictable

**Configuration Example:**

```javascript
// In the dashboard, when setting up IVR departments:
{
    name: "Owner (Manuel Stagg)",
    phone: "+13051234567",           // Cell phone (forwards to RinglyPro)
    direct_phone: "+13059876543",     // Office landline (direct)
    enabled: true
}
```

**If direct_phone is not set**, the system can:
1. Display a warning in the dashboard
2. Still allow the transfer (client's responsibility)
3. Or, require direct_phone before enabling department

---

## For Your Wife's Call Example

**Scenario:** Wife calls RinglyPro number, wants to reach you directly

**Without Fix:**
```
Wife calls: +1-888-610-3810
  ↓
Lina answers: "Press 2 for Manny"
Wife presses 2
  ↓
Tries to dial: +1-305-XXX-XXXX (your cell)
Your cell forwards to: +1-888-610-3810
  ↓
LOOP! Lina answers again
```

**With Fix (Solution 2):**
```
Wife calls: +1-888-610-3810
  ↓
Lina answers: "Press 2 for Manny"
Wife presses 2
  ↓
Dials DIRECT number: +1-305-999-9999 (no forwarding)
  ↓
YOUR PHONE RINGS! ✅
```

---

## Implementation Steps

### 1. Update Database Schema
Add `direct_phone` field to IVR department options

### 2. Update Dashboard UI
Add input field for "Direct Phone (No Forwarding)" when configuring departments

### 3. Update Transfer Logic
Modify `rachelRoutes.js` line 1005 to use `direct_phone` if available

### 4. Add Warnings
Show dashboard warning if department phone = business phone and no direct_phone set

---

## Testing

1. Set up department with direct_phone
2. Call RinglyPro number
3. Press digit to transfer
4. Verify call goes to direct number, not looping

---

## Alternative: Disable Call Forwarding During Transfers

Some carriers allow you to dial with a prefix that disables forwarding:

```javascript
// Some carriers support *73 prefix to disable forwarding
const transferNumber = `*73${dept.phone}`;
```

**Note:** This is carrier-specific and may not work universally.

---

Would you like me to implement Solution 2 (Alternative Phone Number) in your system?
