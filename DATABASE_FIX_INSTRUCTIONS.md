# Database Constraint Fix Instructions

## Problem

The production database has an incorrect unique constraint on the `appointments` table:

```sql
-- WRONG (current): Prevents ANY client from booking the same time slot
CONSTRAINT unique_time_slot UNIQUE (appointment_date, appointment_time)

-- CORRECT (needed): Allows different clients to book the same time slot
CONSTRAINT unique_time_slot_per_client UNIQUE (client_id, appointment_date, appointment_time)
```

### Symptoms

When a client tries to book an appointment at a time already taken by **another client**, they get:

```
ERROR: duplicate key value violates unique constraint "unique_time_slot"
Key (appointment_date, appointment_time)=(2025-10-07, 10:00:00) already exists.
```

This breaks multi-tenant functionality - Client A can't book 2pm if Client B already has 2pm.

## Solution

Run the constraint fix script on the production database.

### Method 1: Via Render Dashboard (Recommended)

1. Log into Render dashboard
2. Go to your service
3. Open Shell tab
4. Run:
```bash
npm run fix-constraint
```

### Method 2: Via Direct Database Connection

If you have direct database access:

```bash
node scripts/fix-appointment-constraint.js
```

## What the Script Does

1. **Checks** existing constraints on `appointments` table
2. **Drops** old `unique_time_slot` constraint (if exists)
3. **Adds** new `unique_time_slot_per_client` constraint
4. **Verifies** final state

## Expected Output

```
🔌 Connecting to database...
✅ Database connection established

📋 Checking existing constraints...
Current unique constraints on appointments table:
  - unique_time_slot: UNIQUE (appointment_date, appointment_time)

🗑️  Dropping old constraint: unique_time_slot (without client_id)...
✅ Old constraint dropped

➕ Adding new constraint: unique_time_slot_per_client (with client_id)...
✅ New constraint added

🔍 Verifying final constraints...
Final unique constraints on appointments table:
  - unique_time_slot_per_client: UNIQUE (client_id, appointment_date, appointment_time)

✅ Constraint migration complete!
💡 Clients can now book the same time slots without conflicts
```

## Verification

After running the fix, test by:

1. Booking an appointment for Client A at 2pm
2. Booking an appointment for Client B at 2pm (should succeed now)
3. Try booking another appointment for Client A at 2pm (should fail - correct behavior)

## Rollback

If you need to rollback (NOT recommended):

```sql
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_time_slot_per_client;
ALTER TABLE appointments ADD CONSTRAINT unique_time_slot UNIQUE (appointment_date, appointment_time);
```

⚠️ **Warning**: Rolling back breaks multi-tenant functionality!

## Files Modified

- `scripts/fix-appointment-constraint.js` - New migration script
- `package.json` - Added `fix-constraint` npm script
- `src/routes/voiceBot.js` - Fixed field names (camelCase vs snake_case)
- `src/routes/rachelRoutes.js` - Added available slot suggestions
- `src/routes/linaRoutes.js` - Added available slot suggestions (Spanish)

## Related Issues

- ✅ Spanish appointments not saving to database - FIXED
- ✅ Call recording `notNull` violations - FIXED (field name mismatch)
- ⏳ Database constraint preventing multi-tenant bookings - **NEEDS PRODUCTION FIX**
