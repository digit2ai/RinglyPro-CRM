# 3-Tier Authentication System for MCP Copilot

## Overview

This document describes the complete 3-tier access control system implemented to solve the multi-tenant GHL issue and ensure proper authentication flow.

---

## The Problem We Solved

**Original Issue**: All users were creating contacts in ONE GoHighLevel account (yours) instead of each client's own GHL account.

**Root Cause**: Users could access the copilot without proper authentication, and there was no enforcement that GHL credentials must be configured before using features.

---

## The Solution: 3-Tier Access Control

### Tier 1: Login Required (Basic Access)
**What Works**: Basic dashboard features that don't require GHL:
- ✅ Send SMS
- ✅ Make Phone Calls
- ✅ Settings configuration
- ✅ IVR management
- ✅ Share/Referrals

**Authentication**: User must login via `https://aiagent.ringlypro.com/login`

### Tier 2: View Copilot (Authenticated + client_id)
**What Works**: Can VIEW the copilot interface

**Requirements**:
- Must come from authenticated dashboard session
- URL must have `client_id` parameter
- Example: `https://aiagent.ringlypro.com/mcp-copilot/?client_id=15`

**What DOESN'T Work**: Cannot USE any features without GHL configured

**User Experience**:
- Sees copilot interface
- Can see feature buttons and benefits
- Clicking any feature shows upgrade prompt if GHL not configured

### Tier 3: Full Feature Access (GHL Required)
**What Works**: All premium features that require GHL:
- ✅ **CRM AI Agent** - AI-powered contact creation and management
- ✅ **Social Media** - Automated social media posting
- ✅ **Business Collector** - Scrape and import 100s of leads
- ✅ **Outbound Calling** - Smart automated calling campaigns
- ✅ **Prospect Manager** - Advanced lead management
- ❌ **Email Marketing** - Excluded (requires SendGrid API instead)

**Requirements**:
- Tier 1 + Tier 2 requirements PLUS
- Client must have GHL API Key and Location ID configured in Settings

**User Experience**:
- If GHL configured → Features work normally
- If GHL NOT configured → Upgrade prompt appears

---

## Architecture

### Frontend Flow

```javascript
// 1. Page Load
copilot.js initializes
  ↓
Extract client_id from URL (?client_id=15)
  ↓
checkGHLConfiguration() - Check if GHL is configured
  ↓
Store result in global variable: ghlConfigured = true/false

// 2. User Clicks Feature
User clicks "CRM AI Agent" button
  ↓
requireGHL('CRM AI Agent') checks ghlConfigured
  ↓
If TRUE → Allow feature to open
If FALSE → showUpgradePrompt()
```

### Backend Flow

```
API Request
  ↓
Check if client_id provided
  ↓
Query database: SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = ?
  ↓
If BOTH fields are NOT NULL → Feature allowed
If either field is NULL → Return 403 with upgrade_needed = true
```

---

## File Structure

### New Files

**1. Middleware**
- `src/middleware/ghl-required.js`
  - `requireGHLConfig()` - Middleware to block API requests without GHL
  - `checkGHLConfig()` - Check GHL status endpoint

**2. Routes**
- `src/routes/copilot-access.js`
  - `GET /api/copilot/check-access/:client_id` - Check GHL configuration
  - `GET /api/copilot/session-check` - Verify user session

- `src/routes/ghl-payment.js`
  - `POST /api/payment/create-ghl-subscription` - Create Stripe checkout ($40/month)
  - `POST /api/payment/webhook/ghl-subscription` - Handle Stripe webhooks
  - `GET /api/payment/ghl-subscription-status/:clientId` - Check subscription status

**3. Frontend Components**
- `public/mcp-copilot/ghl-upgrade-prompt.html`
  - Modal UI shown when GHL not configured
  - "Configure in Settings" button
  - "Get Started ($40/month)" button for Stripe payment
  - "Maybe Later" option

### Modified Files

**1. Frontend**
- `public/mcp-copilot/copilot.js`
  - Added `ghlConfigured` and `ghlCheckComplete` global variables
  - Added `checkGHLConfiguration()` function
  - Added `requireGHL(featureName)` function
  - Updated all feature functions to call `requireGHL()` before opening:
    - `openSocialMedia()`
    - `openProspectManager()`
    - `connectBusinessCollector()`
    - `sendMessage()` (CRM AI Agent chat)

- `public/mcp-copilot/index.html`
  - Added dynamic loading of `ghl-upgrade-prompt.html` component

**2. Backend**
- `src/app.js`
  - Import `copilotAccessRoutes` and `ghlPaymentRoutes`
  - Mount routes at `/api/copilot` and `/api/payment`

---

## API Endpoints

### 1. Check GHL Configuration
```
GET /api/copilot/check-access/:client_id
```

**Response** (GHL Configured):
```json
{
  "success": true,
  "clientId": 15,
  "businessName": "Acme Corp",
  "ghl_configured": true,
  "features_available": [
    "crm_ai_agent",
    "social_media",
    "business_collector",
    "outbound_calling",
    "prospect_manager"
  ],
  "upgrade_needed": false
}
```

**Response** (GHL NOT Configured):
```json
{
  "success": true,
  "clientId": 15,
  "businessName": "Acme Corp",
  "ghl_configured": false,
  "features_available": [],
  "upgrade_needed": true
}
```

### 2. Session Check
```
GET /api/copilot/session-check?client_id=15
```

**Response**:
```json
{
  "success": true,
  "authenticated": true,
  "clientId": "15",
  "message": "Session valid"
}
```

### 3. Create GHL Subscription
```
POST /api/payment/create-ghl-subscription
Content-Type: application/json

{
  "clientId": 15,
  "plan": "ghl_access",
  "amount": 40.00
}
```

**Response**:
```json
{
  "success": true,
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
  "sessionId": "cs_test_..."
}
```

**Stripe Checkout Details**:
- Product: "GoHighLevel CRM Integration Access"
- Price: $40.00/month recurring
- Mode: subscription
- Success URL: `/dashboard?client_id={clientId}&ghl_payment=success#settings`
- Cancel URL: `/mcp-copilot/?client_id={clientId}&ghl_payment=cancelled`

---

## User Experience

### Scenario 1: User WITHOUT GHL Configured

1. User logs into dashboard
2. Clicks "CRM Copilot" button
3. Copilot loads, shows interface
4. User clicks "CRM AI Agent" or any premium feature
5. **Upgrade prompt appears**:
   ```
   🚀 GoHighLevel Integration Required

   You must configure your GoHighLevel API credentials
   to use these powerful features.

   Features You'll Unlock:
   ✓ AI-Powered Contact Management
   ✓ Automated Social Media Posts
   ✓ Business Lead Collector
   ✓ Smart Outbound Calling
   ✓ Advanced Prospect Manager

   [Configure in Settings]  [Get Started ($40/month)]  [Maybe Later]
   ```

6a. **If clicks "Configure in Settings"**:
   - Redirects to `/dashboard?client_id=15#settings`
   - User enters GHL API Key and Location ID
   - Saves settings
   - Returns to copilot → Features now work

6b. **If clicks "Get Started ($40/month)"**:
   - Creates Stripe checkout session
   - Redirects to Stripe payment page
   - User completes payment
   - Returns to Settings page to configure GHL credentials
   - (Note: Payment tracks subscription, but user still needs to provide their own GHL credentials)

### Scenario 2: User WITH GHL Configured

1. User logs into dashboard
2. Clicks "CRM Copilot" button
3. Copilot loads
4. GHL check runs: `ghlConfigured = true`
5. User clicks any premium feature → **Works immediately** ✅
6. Contacts created in THEIR OWN GHL account

---

## How It Solves Multi-Tenant Issue

### Before This Fix:
```
User A logs in → Uses copilot → Creates contact → Goes to YOUR GHL account ❌
User B logs in → Uses copilot → Creates contact → Goes to YOUR GHL account ❌
User C logs in → Uses copilot → Creates contact → Goes to YOUR GHL account ❌
```

### After This Fix:
```
User A logs in → copilot checks GHL for client A → NOT configured → Show upgrade prompt
  → User configures their own GHL → Create contact → Goes to User A's GHL ✅

User B logs in → copilot checks GHL for client B → NOT configured → Show upgrade prompt
  → User configures their own GHL → Create contact → Goes to User B's GHL ✅

User C logs in → copilot checks GHL for client C → Configured ✅ → Create contact → Goes to User C's GHL ✅
```

**Key Changes**:
1. ✅ Each user MUST configure their own GHL credentials
2. ✅ Cannot use features without GHL configured
3. ✅ Frontend checks GHL status before allowing feature use
4. ✅ Backend validates GHL credentials exist before processing requests
5. ✅ Clear upgrade path with payment option
6. ✅ No more cross-contamination of contacts

---

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Stripe Configuration (for GHL subscription payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App URL (for Stripe redirects)
APP_URL=https://aiagent.ringlypro.com

# JWT Secret (if not already set)
JWT_SECRET=your-super-secret-jwt-key

# Session Secret (if not already set)
SESSION_SECRET=ringlypro-session-secret
```

### Stripe Setup

1. **Create Product** in Stripe Dashboard:
   - Name: "GoHighLevel CRM Integration Access"
   - Price: $40.00/month recurring

2. **Configure Webhook**:
   - URL: `https://aiagent.ringlypro.com/api/payment/webhook/ghl-subscription`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.deleted`

3. **Get Keys**:
   - Copy Secret Key → `STRIPE_SECRET_KEY`
   - Copy Webhook Signing Secret → `STRIPE_WEBHOOK_SECRET`

---

## Testing

### Test 1: User Without GHL (Upgrade Flow)

1. Create test client in database (or use existing one)
2. Ensure `ghl_api_key` and `ghl_location_id` are NULL:
   ```sql
   UPDATE clients SET ghl_api_key = NULL, ghl_location_id = NULL WHERE id = 15;
   ```
3. Login as that client
4. Click "CRM Copilot"
5. Try to use CRM AI Agent → Should show upgrade prompt ✅
6. Click "Configure in Settings" → Should redirect to Settings ✅

### Test 2: User With GHL (Features Work)

1. Configure GHL credentials in Settings:
   - GHL API Key: `pit-xxxx...`
   - Location ID: `abc123...`
2. Return to Copilot
3. Try to use CRM AI Agent → Should work immediately ✅
4. Create a contact → Should appear in THAT CLIENT's GHL account ✅

### Test 3: Stripe Payment Flow

1. User without GHL clicks "Get Started ($40/month)"
2. Should redirect to Stripe checkout ✅
3. Complete test payment (use Stripe test card: `4242 4242 4242 4242`)
4. Should redirect back to Settings page ✅
5. Configure GHL credentials
6. Return to Copilot → Features should now work ✅

### Test 4: Multi-Tenant Isolation

1. Configure two different clients with different GHL accounts:
   - Client A → GHL Account A
   - Client B → GHL Account B
2. Login as Client A → Create contact "Test A"
3. Check GHL Account A → Should have "Test A" ✅
4. Check GHL Account B → Should NOT have "Test A" ✅
5. Login as Client B → Create contact "Test B"
6. Check GHL Account B → Should have "Test B" ✅
7. Check GHL Account A → Should NOT have "Test B" ✅

---

## Monitoring

### Check GHL Configuration Status

Use the diagnostic endpoint created earlier:
```bash
curl https://aiagent.ringlypro.com/api/client/debug/ghl-credentials
```

This shows:
- Which clients have GHL configured
- Which clients don't have GHL
- Whether multiple clients are sharing credentials (shouldn't happen now!)

### Monitor Upgrade Prompt Usage

Check browser console logs:
```
🔍 GHL Configuration Status: ❌ Not Configured
⚠️ CRM AI Agent requires GHL configuration
```

### Monitor Stripe Payments

Check Render logs for:
```
✅ Created GHL subscription checkout for client 15: cs_test_...
✅ GHL subscription payment completed for client 15
```

---

## Future Enhancements

### 1. OAuth Integration (Instead of Manual API Keys)

Instead of users manually entering GHL API keys, implement OAuth:
- User clicks "Connect GoHighLevel"
- Redirects to GHL OAuth consent page
- User approves
- System automatically receives and stores API token
- Much better UX!

See: [MULTI_TENANT_OAUTH_SOLUTION.md](MULTI_TENANT_OAUTH_SOLUTION.md)

### 2. Subscription Management Dashboard

Add a page where users can:
- View their GHL subscription status
- Cancel subscription
- Update payment method
- View billing history

### 3. Grace Period After Cancellation

When subscription is cancelled:
- Give 7-day grace period
- Send reminder emails
- After grace period → Disable GHL features (but don't delete credentials)
- If they re-subscribe → Re-enable immediately

### 4. Usage Analytics

Track:
- Which features users use most
- Conversion rate from free trial to paid
- Drop-off points in upgrade flow

---

## Troubleshooting

### Issue: Upgrade prompt not appearing

**Check**:
1. Is `ghl-upgrade-prompt.html` loading? Check browser Network tab
2. Is `window.ghlUpgrade` defined? Check browser console
3. Is `requireGHL()` being called? Add debug logs

**Fix**: Clear browser cache and hard refresh (Cmd+Shift+R)

### Issue: Features work even without GHL

**Check**:
1. Is `ghlConfigured` set correctly? Check console logs
2. Is `requireGHL()` function being called before feature opens?
3. Is the client_id being passed correctly?

**Fix**: Make sure `checkGHLConfiguration()` completes before allowing feature use

### Issue: Stripe payment redirect fails

**Check**:
1. Is `APP_URL` environment variable set correctly?
2. Is Stripe API key valid (not expired)?
3. Check Render logs for Stripe API errors

**Fix**: Verify environment variables and Stripe configuration

### Issue: Multiple clients sharing same GHL

**Check**: Run diagnostic endpoint:
```bash
curl https://aiagent.ringlypro.com/api/client/debug/ghl-credentials
```

If `duplicates.found = true`:

**Fix**: Clear duplicate credentials:
```sql
-- Find your client ID first
SELECT id, business_name, owner_email FROM clients WHERE owner_email = 'your_email@example.com';

-- Clear duplicates (keep yours)
UPDATE clients
SET ghl_api_key = NULL, ghl_location_id = NULL
WHERE id != YOUR_CLIENT_ID
  AND ghl_api_key IS NOT NULL;
```

---

## Summary

| Tier | Access Level | Requirements | Features |
|------|--------------|--------------|----------|
| **Tier 1** | Dashboard | Login required | SMS, Calls, Settings, IVR, Share |
| **Tier 2** | View Copilot | Login + client_id from dashboard | View interface, see benefits |
| **Tier 3** | Use Features | Login + client_id + GHL configured | AI Agent, Social Media, Business Collector, Outbound Calling, Prospect Manager |

**Key Points**:
- ✅ Each client MUST configure their own GHL credentials
- ✅ Cannot use premium features without GHL
- ✅ Clear upgrade path with payment option
- ✅ Multi-tenant isolation enforced
- ✅ No more contacts going to wrong account

**Files Changed**: 7 files (4 new, 3 modified)

**Lines Added**: ~800 lines of code + documentation

**Deployment**: Ready to deploy - push to GitHub, Render will auto-deploy
