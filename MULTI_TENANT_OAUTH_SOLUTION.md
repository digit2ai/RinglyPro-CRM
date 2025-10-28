# Multi-Tenant GoHighLevel OAuth Solution

## Problem: PIT Tokens Don't Support SMS

You discovered that **PIT (Private Integration Tokens)** from GoHighLevel don't support the `conversations/message.write` scope, even when it's enabled in your app settings. This is because PIT tokens are legacy tokens with fixed, limited permissions.

**Your concern was correct:** Using a single OAuth token won't work for a multi-tenant system where each client has their own GHL account.

## Solution: Per-Client OAuth Integration

This solution implements **OAuth 2.0 authorization per client**, allowing each of your RinglyPro clients to connect their own GoHighLevel account.

---

## Architecture

```
RinglyPro CRM (Your App)
├── Client A
│   └── GHL OAuth Token A → Accesses Client A's GHL data
├── Client B
│   └── GHL OAuth Token B → Accesses Client B's GHL data
└── Client C
    └── GHL OAuth Token C → Accesses Client C's GHL data
```

### How It Works:

1. **Client clicks "Connect GoHighLevel"** in your app
2. **Redirected to GHL OAuth page** to authorize access
3. **Client approves** → GHL sends authorization code
4. **Your app exchanges code** for access token + refresh token
5. **Tokens stored** in database per client
6. **All GHL API calls** use client's specific token

---

## Files Created

### 1. Database Migration
**File:** `migrations/20251028000000-create-ghl-integrations.js`

Creates `ghl_integrations` table with:
- `client_id` - Links to your clients table
- `access_token` - OAuth access token for GHL API
- `refresh_token` - Used to get new access tokens
- `ghl_location_id` - GHL sub-account ID
- `expires_at` - Token expiration timestamp
- `is_active` - Only one active integration per client

### 2. Model
**File:** `src/models/GHLIntegration.js`

Sequelize model with helper methods:
- `isExpired()` - Check if token expired
- `needsRefresh()` - Check if token expires soon (<5 min)
- `findByClient(clientId)` - Get active integration for client
- `findByLocationId(locationId)` - Get integration by GHL location

### 3. OAuth Routes
**File:** `src/routes/ghl-oauth.js`

Four main endpoints:

#### a) `/api/ghl-oauth/authorize?clientId=123`
- **Purpose:** Start OAuth flow
- **How:** Redirects user to GHL authorization page
- **CSRF Protection:** Uses secure state token

#### b) `/api/ghl-oauth/callback?code=XXX&state=YYY`
- **Purpose:** Handle OAuth callback from GHL
- **How:** Exchanges code for access token
- **Result:** Saves tokens to database

#### c) `/api/ghl-oauth/refresh/:clientId`
- **Purpose:** Refresh expired access token
- **How:** Uses refresh token to get new access token
- **Auto-refresh:** Can be called before API requests

#### d) `/api/ghl-oauth/status/:clientId`
- **Purpose:** Check if client has active GHL integration
- **Returns:** Connection status, expiration, scopes

---

## Setup Instructions

### Step 1: Environment Variables

Add to your `.env` file:

```bash
# GoHighLevel OAuth Configuration
GHL_CLIENT_ID=your-app-client-id-from-ghl-marketplace
GHL_CLIENT_SECRET=your-app-client-secret-from-ghl-marketplace
GHL_REDIRECT_URI=https://ringlypro-crm.onrender.com/api/ghl-oauth/callback
APP_URL=https://ringlypro-crm.onrender.com
```

**Where to find these:**
1. Go to https://marketplace.gohighlevel.com/
2. Click on your Private Integration app
3. Find **Client ID** and **Client Secret**
4. Add redirect URI: `https://ringlypro-crm.onrender.com/api/ghl-oauth/callback`

### Step 2: Update Render Environment

In Render Dashboard → Environment:
```
GHL_CLIENT_ID=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (your actual client ID)
GHL_CLIENT_SECRET=sk-ant-api03-... (your actual client secret)
GHL_REDIRECT_URI=https://ringlypro-crm.onrender.com/api/ghl-oauth/callback
APP_URL=https://ringlypro-crm.onrender.com
```

**IMPORTANT:** Remove the old `GOHIGHLEVEL_API_KEY` (PIT token) - it won't be used anymore!

### Step 3: Run Database Migration

```bash
# Locally
npx sequelize-cli db:migrate

# On Render (auto-runs on deploy if you have migration script)
# OR connect to Render Postgres and run:
psql <your-database-url> -f migrations/20251028000000-create-ghl-integrations.js
```

### Step 4: Register OAuth Route

In your main `src/index.js` or `src/app.js`:

```javascript
const ghlOAuthRoutes = require('./routes/ghl-oauth');

// Add this line with other routes
app.use('/api/ghl-oauth', ghlOAuthRoutes);
```

### Step 5: Update MCP Routes to Use Client Tokens

**This is critical!** Update `src/routes/mcp.js` to fetch the client's OAuth token instead of using environment variable.

**Before (old way):**
```javascript
const apiKey = process.env.GOHIGHLEVEL_API_KEY; // Single PIT token
const locationId = process.env.GOHIGHLEVEL_LOCATION_ID;
const proxy = new GoHighLevelMCPProxy(apiKey, locationId);
```

**After (new way):**
```javascript
const { GHLIntegration } = require('../models');

// Get client ID from session or request
const clientId = req.session.clientId || req.query.clientId;

// Fetch client's OAuth integration
const integration = await GHLIntegration.findByClient(clientId);

if (!integration) {
    return res.json({
        success: false,
        response: "Please connect your GoHighLevel account first.\n\nClick 'Connect GoHighLevel' in settings."
    });
}

// Check if token needs refresh
if (integration.needsRefresh() && integration.refresh_token) {
    // Auto-refresh token
    await refreshToken(integration);
}

// Use client's OAuth token
const proxy = new GoHighLevelMCPProxy(
    integration.access_token,
    integration.ghl_location_id
);
```

---

## User Flow

### Initial Setup (One-Time Per Client)

1. **Client logs into RinglyPro CRM**
2. **Goes to Settings → Integrations**
3. **Clicks "Connect GoHighLevel"**
   - Redirects to: `/api/ghl-oauth/authorize?clientId=123`
4. **GHL OAuth page opens**
   - Client selects their location
   - Clicks "Allow Access"
5. **Redirected back to RinglyPro**
   - Success page shows: "✅ GoHighLevel Connected!"
   - Tokens saved to database
6. **Now SMS works!**
   - All API calls use client's OAuth token
   - SMS, email, contacts, opportunities all work

### Daily Usage

- Client uses chatbot: "send sms to lina saying test"
- MCP routes fetch client's OAuth token from database
- API call made with client's token → **SMS SENT!** ✅
- If token expires → auto-refreshed using refresh token

---

## Frontend Integration

Add a "Connect GoHighLevel" button in your client dashboard:

```html
<button onclick="connectGHL()">
    Connect GoHighLevel
</button>

<script>
function connectGHL() {
    const clientId = {{ client.id }}; // From your template
    const width = 600;
    const height = 800;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);

    window.open(
        `/api/ghl-oauth/authorize?clientId=${clientId}`,
        'ghl-oauth',
        `width=${width},height=${height},top=${top},left=${left}`
    );
}
</script>
```

**Status indicator:**

```javascript
// Check if client has GHL connected
fetch(`/api/ghl-oauth/status/{{ client.id }}`)
    .then(r => r.json())
    .then(data => {
        if (data.connected) {
            document.getElementById('ghl-status').innerHTML =
                `✅ Connected to ${data.integration.locationName}`;
        } else {
            document.getElementById('ghl-status').innerHTML =
                `❌ Not connected - <a href="#" onclick="connectGHL()">Connect Now</a>`;
        }
    });
```

---

## Token Refresh Strategy

OAuth access tokens expire (usually after 24 hours). This solution handles refresh automatically:

### Option 1: Auto-Refresh Before API Calls (Recommended)

```javascript
// In MCP routes before making GHL API call
if (integration.needsRefresh()) {
    await refreshClientToken(integration);
}
```

### Option 2: Background Refresh Job

```javascript
// Run every hour via cron job
const { GHLIntegration } = require('./src/models');

async function refreshExpiringSoonTokens() {
    const integrations = await GHLIntegration.findAll({
        where: {
            is_active: true,
            expires_at: {
                [Op.lte]: new Date(Date.now() + 60 * 60 * 1000) // Expires in <1 hour
            }
        }
    });

    for (const integration of integrations) {
        if (integration.refresh_token) {
            await refreshToken(integration);
        }
    }
}
```

### Helper Function:

```javascript
async function refreshToken(integration) {
    try {
        const response = await axios.post(
            'https://services.leadconnectorhq.com/oauth/token',
            {
                client_id: process.env.GHL_CLIENT_ID,
                client_secret: process.env.GHL_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: integration.refresh_token
            }
        );

        const { access_token, refresh_token, expires_in } = response.data;

        await integration.update({
            access_token: access_token,
            refresh_token: refresh_token || integration.refresh_token,
            expires_at: new Date(Date.now() + expires_in * 1000),
            last_synced_at: new Date()
        });

        return integration;
    } catch (error) {
        console.error('Token refresh failed:', error);
        throw error;
    }
}
```

---

## Security Considerations

### 1. Encrypt Tokens (Production)

Add token encryption before storing in database:

```javascript
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY; // 32 bytes
const IV_LENGTH = 16;

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// When saving:
await GHLIntegration.create({
    access_token: encrypt(access_token),
    refresh_token: encrypt(refresh_token),
    ...
});

// When using:
const token = decrypt(integration.access_token);
```

### 2. Use Redis for OAuth States

Replace in-memory `oauthStates` Map with Redis:

```javascript
const redis = require('redis');
const client = redis.createClient();

// Store state
await client.setEx(`oauth:state:${state}`, 600, JSON.stringify(stateData));

// Verify state
const stateData = await client.get(`oauth:state:${state}`);
await client.del(`oauth:state:${state}`);
```

### 3. Rate Limiting

Add rate limiting to OAuth endpoints:

```javascript
const rateLimit = require('express-rate-limit');

const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per 15 minutes
    message: 'Too many OAuth requests, please try again later'
});

router.get('/authorize', oauthLimiter, async (req, res) => {
    // ...
});
```

---

## Testing

### 1. Test OAuth Flow

```bash
# Start OAuth flow
curl http://localhost:3000/api/ghl-oauth/authorize?clientId=1
# Browser should open GHL OAuth page

# After authorization, check status
curl http://localhost:3000/api/ghl-oauth/status/1
```

### 2. Test Token Refresh

```bash
curl -X POST http://localhost:3000/api/ghl-oauth/refresh/1
```

### 3. Test SMS with OAuth Token

```bash
# Chatbot: "send sms to lina saying this is a test"
# Should now work! ✅
```

---

## Migration Plan

### Phase 1: Setup (No Downtime)
1. ✅ Add environment variables to Render
2. ✅ Deploy new code (old PIT token still works)
3. ✅ Run database migration
4. ✅ Test OAuth flow with one test client

### Phase 2: Client Onboarding (Gradual)
1. Add "Connect GoHighLevel" button to client dashboard
2. Email clients: "Connect your GHL account for SMS features"
3. Clients authorize one-by-one
4. Once authorized, their requests use OAuth token

### Phase 3: Deprecate PIT Token (After All Clients Migrate)
1. Remove `GOHIGHLEVEL_API_KEY` from environment
2. MCP routes require OAuth integration
3. Show error if client not connected: "Please connect GoHighLevel"

---

## Troubleshooting

### Error: "Invalid redirect_uri"

**Cause:** Redirect URI in code doesn't match GHL app settings

**Fix:**
1. Go to GHL Marketplace → Your App → OAuth Settings
2. Add exact redirect URI: `https://ringlypro-crm.onrender.com/api/ghl-oauth/callback`
3. Make sure no trailing slash!

### Error: "Invalid client_id or client_secret"

**Cause:** Wrong credentials in environment variables

**Fix:**
1. Go to GHL Marketplace → Your App
2. Copy **Client ID** and **Client Secret**
3. Update Render environment variables
4. Redeploy

### Error: "The token is not authorized for this scope"

**Cause:** OAuth scopes not configured in GHL app

**Fix:**
1. Go to GHL Marketplace → Your App → Scopes
2. Enable:
   - conversations/message.write ✅
   - conversations/message.readonly ✅
   - contacts.write ✅
   - contacts.readonly ✅
3. Save and re-authorize

### SMS Still Not Working After OAuth

**Possible causes:**
1. Token expired → Check `integration.expires_at`
2. Wrong client token → Verify `clientId` in session
3. GHL API issue → Check GHL API status

**Debug:**
```javascript
console.log('Using token:', integration.access_token.substring(0, 20) + '...');
console.log('Location ID:', integration.ghl_location_id);
console.log('Token expires:', integration.expires_at);
console.log('Needs refresh:', integration.needsRefresh());
```

---

## Benefits of This Solution

✅ **Multi-Tenant:** Each client has their own GHL connection
✅ **Secure:** OAuth 2.0 standard with refresh tokens
✅ **Scalable:** Works for 1 client or 10,000 clients
✅ **Full Permissions:** All OAuth scopes available (SMS, email, contacts, etc.)
✅ **Auto-Refresh:** Tokens refresh automatically before expiration
✅ **User-Friendly:** Simple one-click "Connect GoHighLevel" button
✅ **Maintainable:** No manual token management needed

---

## Next Steps

1. **Add environment variables to Render** (GHL_CLIENT_ID, GHL_CLIENT_SECRET, GHL_REDIRECT_URI)
2. **Deploy this code** to Render
3. **Run database migration** to create `ghl_integrations` table
4. **Test OAuth flow** with one client
5. **Update MCP routes** to use client-specific tokens
6. **Add "Connect GoHighLevel" button** to client dashboard
7. **Test SMS** → Should work! ✅

Let me know which step you want to tackle first!
