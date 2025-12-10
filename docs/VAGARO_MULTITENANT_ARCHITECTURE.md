# Vagaro Multitenant Architecture - Technical Summary

## Overview

RinglyPro's Vagaro integration has been architected as a **multitenant system** where each client (salon/spa business) configures their own Vagaro credentials and uses their own Vagaro account. This document explains the architecture, why it was designed this way, and how it works.

---

## Why Multitenant?

### The Problem
Initially, the Vagaro integration was designed with global credentials stored in `.env`:
```bash
VAGARO_API_KEY=shared_key_here
VAGARO_MERCHANT_ID=shared_merchant_here
```

This approach had a critical flaw: **all RinglyPro clients would use the same Vagaro account**. This doesn't work because:

1. Each salon/spa business has their own Vagaro account
2. Each business needs to manage their own appointments, customers, and services
3. Appointment bookings should go to the correct business's Vagaro account
4. Each business pays Vagaro separately ($10/month for API access)

### The Solution
**Multitenant architecture** where:
- Each RinglyPro client stores their own Vagaro credentials in the database
- Lina/Rachel retrieve credentials from the database when handling calls
- API calls use the specific client's credentials
- Each business's data stays in their own Vagaro account

---

## Architecture Changes

### Before (Incorrect - Single Tenant)
```
.env file
├─ VAGARO_API_KEY=shared_key          ❌ Wrong
├─ VAGARO_MERCHANT_ID=shared_id       ❌ Wrong
└─ VAGARO_WEBHOOK_TOKEN=shared_token  ❌ Wrong

vagaroService.js
├─ Reads credentials from process.env
└─ All clients use same Vagaro account  ❌ Wrong
```

### After (Correct - Multitenant)
```
Database (clients.settings JSON column)
├─ Client 1: { vagaro: { apiKey, merchantId, webhookToken } }
├─ Client 2: { vagaro: { apiKey, merchantId, webhookToken } }
└─ Client 3: { vagaro: { apiKey, merchantId, webhookToken } }

vagaroService.js
├─ Accepts credentials as function parameter
├─ makeVagaroRequest(credentials, endpoint, options)
└─ Each client uses their own Vagaro account  ✅ Correct

Routes (vagaro.js)
├─ Authenticated routes: Fetch credentials from database by userId
├─ Webhook handlers: Fetch credentials by merchantId
└─ Pass credentials to vagaroService functions  ✅ Correct
```

---

## Database Schema

### Client Settings Storage
Vagaro credentials are stored in the `clients.settings` JSONB column:

```json
{
  "integration": {
    "vagaro": {
      "enabled": true,
      "clientId": "client_specific_oauth_client_id",
      "clientSecretKey": "client_specific_oauth_secret",
      "merchantId": "client_specific_merchant_id",
      "webhookToken": "client_specific_webhook_token",
      "region": "us01",
      "updatedAt": "2025-12-10T18:00:00Z"
    }
  }
}
```

### Vagaro ID Fields
For tracking and syncing records between RinglyPro and Vagaro:

```sql
-- Links RinglyPro contacts to Vagaro customers
ALTER TABLE contacts ADD COLUMN vagaro_id VARCHAR(255) UNIQUE;

-- Links RinglyPro appointments to Vagaro appointments
ALTER TABLE appointments ADD COLUMN vagaro_id VARCHAR(255) UNIQUE;
```

---

## Code Flow

### 1. Client Configures Credentials (Settings UI)

**File:** [views/settings-vagaro.ejs](../views/settings-vagaro.ejs)

User enters their OAuth credentials at `/settings/vagaro`:
- Client ID (OAuth application ID)
- Client Secret Key (OAuth secret)
- Merchant ID
- Webhook Token
- Region (us01-us05)
- Enables integration

**API Endpoint:** `POST /api/client-settings/vagaro`

**File:** [src/routes/client-settings.js:236-310](../src/routes/client-settings.js)

Saves to `clients.settings`:
```javascript
const updatedSettings = {
  ...currentSettings,
  integration: {
    vagaro: {
      enabled: true,
      clientId: clientId,
      clientSecretKey: clientSecretKey,
      merchantId: merchantId,
      webhookToken: webhookToken,
      region: region || 'us01',
      updatedAt: new Date().toISOString()
    }
  }
};
```

---

### 2. Lina/Rachel Handles Appointment Booking Call

**Step 1:** Get client settings from database
```javascript
// When call comes in for Client ID 5
const clientSettings = await getClientSettings(clientId: 5);
const vagaroSettings = clientSettings.integration?.vagaro;

if (vagaroSettings.enabled && vagaroSettings.clientId) {
  // Use this client's Vagaro OAuth credentials
  const credentials = {
    clientId: vagaroSettings.clientId,
    clientSecretKey: vagaroSettings.clientSecretKey,
    merchantId: vagaroSettings.merchantId,
    region: vagaroSettings.region || 'us01'
  };
}
```

**Step 2:** Generate OAuth token and search for customer in client's Vagaro account
```javascript
// OAuth token is automatically generated and cached
const customers = await vagaroService.searchCustomers(
  credentials,  // Client 5's OAuth credentials
  { phone: patientPhone }
);
```

**Step 3:** Create appointment in client's Vagaro account
```javascript
const appointment = await vagaroService.createAppointment(
  credentials,  // Client 5's OAuth credentials (token auto-generated)
  {
    customerId: customerId,
    serviceId: serviceId,
    date: appointmentDate,
    time: appointmentTime
  }
);
```

**Result:** Appointment is created in **Client 5's Vagaro account**, not a shared account.

---

### 3. Vagaro Webhook Handler

**When Vagaro sends webhook:**
```javascript
POST /api/vagaro/webhooks/appointment
{
  "event": "appointment.created",
  "merchantId": "client_5_merchant_id",  // Identifies which client
  "appointment": { ... }
}
```

**Handler flow:**
```javascript
// 1. Find which RinglyPro client this webhook is for
const clientId = await getClientIdFromMerchantId(merchantId);

// 2. Get that client's webhook token
const [client] = await sequelize.query(
  'SELECT settings FROM clients WHERE id = :clientId'
);
const webhookToken = client.settings.integration.vagaro.webhookToken;

// 3. Verify webhook signature
if (providedToken === webhookToken) {
  // 4. Sync appointment to RinglyPro for this specific client
  await vagaroService.syncAppointmentToRinglyPro(appointment, sequelize);
}
```

---

## Key Files Modified

### 1. [src/services/vagaroService.js](../src/services/vagaroService.js)
**Changes:**
- All functions now accept `credentials` as first parameter
- Removed global ENV credential reading
- Added per-client logging with merchant ID

**Before:**
```javascript
async function getAppointments(params = {}) {
  // Uses global VAGARO_API_KEY
}
```

**After:**
```javascript
async function getAppointments(credentials, params = {}) {
  // Uses client-specific credentials.apiKey
  await makeVagaroRequest(credentials, endpoint);
}
```

### 2. [src/routes/vagaro.js](../src/routes/vagaro.js)
**Changes:**
- Added `getClientVagaroCredentials(userId)` helper function
- Added `getClientIdFromMerchantId(merchantId)` for webhooks
- All routes now fetch credentials from database before calling service
- Webhook handlers identify client by merchant ID

**Example:**
```javascript
router.get('/appointments', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  // Fetch THIS user's client's Vagaro credentials
  const credentials = await getClientVagaroCredentials(userId);

  // Use THEIR credentials for API call
  const appointments = await vagaroService.getAppointments(
    credentials,
    { startDate, endDate }
  );
});
```

### 3. [.env](./.env)
**Changes:**
- Removed `VAGARO_API_KEY`
- Removed `VAGARO_MERCHANT_ID`
- Removed `VAGARO_WEBHOOK_TOKEN`
- Kept only `VAGARO_API_URL` (default API base URL)

### 4. [docs/VAGARO_QUICK_START.md](./VAGARO_QUICK_START.md)
**Changes:**
- Updated to emphasize "YOUR Vagaro account"
- Added note about multitenant setup
- Clarified each business has their own credentials

---

## How It Works in Production

### Scenario: Three Salon Businesses Using RinglyPro

**Client A: "Bella Salon"**
- RinglyPro Client ID: 1
- Vagaro Merchant ID: `bella_salon_merchant_123`
- OAuth Client ID: `bella_oauth_client_xyz`
- OAuth Client Secret: `bella_oauth_secret_xyz`
- Region: `us01`
- Settings stored in: `clients.id=1.settings.integration.vagaro`

**Client B: "Elite Spa"**
- RinglyPro Client ID: 2
- Vagaro Merchant ID: `elite_spa_merchant_456`
- OAuth Client ID: `elite_oauth_client_abc`
- OAuth Client Secret: `elite_oauth_secret_abc`
- Region: `us04`
- Settings stored in: `clients.id=2.settings.integration.vagaro`

**Client C: "Modern Hair Studio"**
- RinglyPro Client ID: 3
- Vagaro Merchant ID: `modern_hair_merchant_789`
- OAuth Client ID: `modern_oauth_client_def`
- OAuth Client Secret: `modern_oauth_secret_def`
- Region: `us01`
- Settings stored in: `clients.id=3.settings.integration.vagaro`

### What Happens When Each Client Gets a Call:

**Call to Bella Salon:**
1. Customer calls Bella's RinglyPro number
2. Lina retrieves Bella's settings (Client ID 1)
3. Generates OAuth token using `bella_oauth_client_xyz` + secret
4. Searches Bella's Vagaro account using OAuth token
5. Books appointment in Bella's Vagaro calendar (region: us01)
6. Vagaro sends confirmation SMS to customer from Bella's account

**Call to Elite Spa:**
1. Customer calls Elite's RinglyPro number
2. Lina retrieves Elite's settings (Client ID 2)
3. Generates OAuth token using `elite_oauth_client_abc` + secret
4. Searches Elite's Vagaro account using OAuth token
5. Books appointment in Elite's Vagaro calendar (region: us04)
6. Vagaro sends confirmation SMS to customer from Elite's account

**No Cross-Contamination:**
- Bella's appointments never appear in Elite's Vagaro
- Elite's customers never show up in Modern Hair's database
- Each business's data stays isolated in their own Vagaro account

---

## Security Considerations

### 1. Credential Storage
- OAuth credentials (Client ID, Client Secret) stored in PostgreSQL JSONB column (encrypted at rest)
- Access tokens cached in-memory with expiration tracking
- Never exposed to client-side JavaScript
- Only accessible via authenticated API endpoints

### 2. Webhook Verification
- Each client has their own webhook token
- Webhooks verified using client-specific token
- Prevents unauthorized webhook spoofing

### 3. JWT Authentication
- All API routes require valid JWT token
- Token contains userId → maps to clientId
- Client can only access their own Vagaro data

---

## Setup Instructions for New Clients

### For RinglyPro Client (Salon/Spa Owner):

1. **Get Vagaro OAuth API Access**
   - Contact: enterprise@vagaro.com
   - Request: "Enable OAuth APIs & Webhooks"
   - Cost: $10/month add-on
   - Receive: OAuth Client ID, OAuth Client Secret, Merchant ID, Webhook Token, Region

2. **Configure in RinglyPro**
   - Go to: https://aiagent.ringlypro.com/settings/vagaro
   - Enter your OAuth Client ID, Client Secret Key, Merchant ID, Webhook Token, Region
   - Toggle "Enable Integration" ON
   - Click "Save Settings"
   - Click "Test Connection"

3. **Set Up Webhooks in Vagaro**
   - Log in to YOUR Vagaro dashboard
   - Go to: Settings → Developer → Webhooks
   - Add these URLs:
     - `https://aiagent.ringlypro.com/api/vagaro/webhooks/appointment`
     - `https://aiagent.ringlypro.com/api/vagaro/webhooks/customer`
     - `https://aiagent.ringlypro.com/api/vagaro/webhooks/transaction`
   - Use your webhook token from step 2

4. **Test**
   - Call your RinglyPro number
   - Say "I need an appointment"
   - Lina books in YOUR Vagaro account
   - You receive webhook notifications
   - Customer receives SMS from YOUR Vagaro

---

## Future Enhancements

### Potential Improvements:

1. **Multi-Location Support**
   - Some businesses have multiple Vagaro locations
   - Could support different settings per location

2. **Credential Encryption**
   - Add application-level encryption for API keys
   - Use encryption keys stored in AWS Secrets Manager

3. **Credential Rotation**
   - Allow clients to update credentials without downtime
   - Validate new credentials before switching

4. **Usage Analytics**
   - Track API calls per client
   - Monitor rate limits per Vagaro account

5. **Automated Testing**
   - Periodic connection tests
   - Alert clients if credentials become invalid

---

## Troubleshooting

### "Vagaro integration not configured" Error
**Cause:** Client hasn't added credentials in settings
**Fix:** Go to `/settings/vagaro` and configure API Key + Merchant ID

### "Connection error" on Test Connection
**Cause:** Invalid credentials or Vagaro API down
**Fix:** Verify credentials are correct in Vagaro dashboard

### Webhooks Not Working
**Cause:** Webhook token mismatch or wrong URL
**Fix:**
1. Check webhook token matches in both Vagaro and RinglyPro settings
2. Verify webhook URLs are correct in Vagaro dashboard
3. Check server logs for webhook attempts

### Appointments Not Syncing
**Cause:** Webhooks not configured or credentials expired
**Fix:**
1. Verify webhooks are active in Vagaro
2. Test credentials using "Test Connection"
3. Check RinglyPro logs for errors

---

## Summary

**Old Approach (Wrong):**
- Single set of credentials in `.env`
- All clients share one Vagaro account
- Data isolation impossible

**New Approach (Correct):**
- Each client stores their own credentials in database
- Each client uses their own Vagaro account
- Perfect data isolation
- Fully multitenant

**Key Benefit:** Scalable to thousands of salon/spa businesses, each with their own Vagaro integration working independently.

---

## Questions?

For technical questions about this implementation, refer to:
- [VAGARO_INTEGRATION.md](./VAGARO_INTEGRATION.md) - Complete integration guide
- [LINA_VAGARO_INTEGRATION.md](./LINA_VAGARO_INTEGRATION.md) - Lina workflow details
- [VAGARO_QUICK_START.md](./VAGARO_QUICK_START.md) - Client setup guide

For Vagaro API documentation: https://docs.vagaro.com/

---

**Last Updated:** December 10, 2025
**Architecture:** Multitenant Per-Client Credentials
**Status:** Production Ready ✅
