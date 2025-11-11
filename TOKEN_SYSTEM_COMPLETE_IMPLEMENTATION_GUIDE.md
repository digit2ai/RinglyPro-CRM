# RinglyPro Token System - Complete Implementation Guide

**Date Created**: November 3, 2025
**Purpose**: Complete guide to implement the token-based billing system
**Status**: Ready for implementation - All foundation files exist

---

## 📋 TABLE OF CONTENTS

1. [Current Status Overview](#current-status-overview)
2. [System Architecture](#system-architecture)
3. [Implementation Steps](#implementation-steps)
4. [Code Changes Required](#code-changes-required)
5. [Database Schema](#database-schema)
6. [Testing Procedures](#testing-procedures)
7. [Deployment Checklist](#deployment-checklist)
8. [Troubleshooting Guide](#troubleshooting-guide)

---

## 🎯 CURRENT STATUS OVERVIEW

### ✅ COMPLETED COMPONENTS

#### 1. Token Service (`src/services/tokenService.js`)
**Status**: ✅ Fully implemented and ready to use

**Key Features**:
- Service cost definitions for 20+ services
- `hasEnoughTokens(userId, serviceType)` - Check user balance
- `deductTokens(userId, serviceType, metadata)` - Atomic token deduction with transaction logging
- `addTokens(userId, amount, source, metadata)` - Add tokens (purchases, refunds)
- `getBalance(userId)` - Get current balance and monthly stats
- `getUsageHistory(userId, options)` - Transaction history with pagination
- `getUsageAnalytics(userId, startDate, endDate)` - Usage breakdown by service
- `checkLowBalanceWarning(userId)` - Automatic warning at <25% balance

**Service Costs**:
```javascript
{
  // Business Collector
  'business_collector_100': 20,      // Collect 100 leads
  'business_collector_csv': 5,        // Export to CSV
  'outbound_campaign_100': 50,        // Auto-call 100 leads
  'outbound_call_single': 1,          // Single outbound call

  // AI Copilot
  'ai_chat_message': 1,               // MCP chat message
  'ghl_query': 2,                     // GoHighLevel query
  'data_analysis': 5,                 // Complex analysis

  // Marketing
  'email_sent': 2,                    // Send single email
  'sms_sent': 3,                      // Send single SMS
  'social_post': 10,                  // Create social media post
  'email_campaign': 50,               // Email campaign (up to 1000)

  // CRM
  'appointment_booking': 2,           // Book appointment
  'contact_create': 1,                // Create contact
  'contact_update': 1,                // Update contact
  'contact_export_100': 5,            // Export 100 contacts
  'calendar_sync_month': 10,          // Monthly calendar sync

  // Voice (future migration)
  'voice_inbound_minute': 5,          // Inbound call per minute
  'voice_outbound_minute': 5,         // Outbound call per minute
  'voicemail_transcription': 3,       // Voicemail transcription
  'call_forward': 2,                  // Call forwarding
  'ivr_interaction': 1                // IVR menu interaction
}
```

#### 2. Token API Routes (`src/routes/tokens.js`)
**Status**: ✅ Implemented but NOT mounted in app.js

**Endpoints Available**:

**User-Facing Endpoints**:
- `GET /api/tokens/balance` - Get current token balance
- `GET /api/tokens/usage` - Get usage history (paginated)
- `GET /api/tokens/analytics` - Get usage analytics with breakdown
- `GET /api/tokens/pricing` - Get service costs
- `POST /api/tokens/purchase` - Purchase tokens via Stripe
- `GET /api/tokens/purchases` - Get purchase history

**Internal Endpoints** (for service integration):
- `POST /api/tokens/check` - Check if user has enough tokens
- `POST /api/tokens/deduct` - Deduct tokens after service use

#### 3. Database Migration (`migrations/add-token-system.sql`)
**Status**: ✅ SQL file created but NOT executed on production database

**What it creates**:
- Adds token columns to `users` table
- Creates `token_transactions` table for logging
- Creates `token_purchases` table for Stripe payments
- Creates `token_usage_summary` view for analytics
- Creates `reset_monthly_tokens()` function for automatic monthly reset
- Seeds existing users with 100 free tokens
- Includes comprehensive indexes for performance
- Includes rollback plan

#### 4. Documentation
**Status**: ✅ Complete

Files:
- `TOKEN_SYSTEM_IMPLEMENTATION_STATUS.md` - Original implementation status
- `MULTI_TENANT_TOKEN_BILLING_ARCHITECTURE.md` - Full architecture documentation
- `MONDAY_DELIVERY_PLAN.md` - Original delivery plan

---

### ❌ NOT COMPLETED YET

#### 1. Token Routes Not Mounted ❌
**File**: `src/app.js`
**Issue**: Token routes exist but are not mounted, so `/api/tokens/*` endpoints return 404

**Required Change**:
```javascript
// Add this to src/app.js after existing route mounts
const tokenRoutes = require('./routes/tokens');
app.use('/api/tokens', tokenRoutes);
console.log('💰 Token API routes mounted at /api/tokens');
```

#### 2. Database Migration Not Run ❌
**Issue**: Token-related tables and columns don't exist in production database

**Required Action**: Run migration SQL on production database (see [Database Schema](#database-schema) section)

#### 3. No Service Integration ❌
**Issue**: Services don't check or deduct tokens

**Affected Services**:
- AI Copilot (MCP chat) - `src/routes/mcp.js`
- Business Collector - `src/routes/mcp.js`
- Social Media posting - `src/routes/mcp.js`
- Email marketing - `src/routes/email.js`
- SMS sending - various routes

#### 4. No Frontend Display ❌
**Issue**: Users can't see token balance or purchase tokens

**Missing UI Elements**:
- Token balance display in MCP Copilot
- Token balance display in main dashboard
- "Buy Tokens" button
- Usage analytics dashboard
- Low balance warnings

---

## 🏗️ SYSTEM ARCHITECTURE

### Token Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                 │
│  (Email: user@example.com, ID: 123)                         │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Makes Request
             ▼
┌─────────────────────────────────────────────────────────────┐
│                  SERVICE ENDPOINT                            │
│  (e.g., POST /api/mcp/copilot/chat)                         │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 1. Check Tokens
             ▼
┌─────────────────────────────────────────────────────────────┐
│              TokenService.hasEnoughTokens()                  │
│  Query: SELECT tokens_balance FROM users WHERE id = 123     │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─── NO → Return Error: "Insufficient Tokens"
             │
             │ YES
             ▼
┌─────────────────────────────────────────────────────────────┐
│                  EXECUTE SERVICE                             │
│  (Process chat message, collect leads, etc.)                │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 2. Service Succeeded
             ▼
┌─────────────────────────────────────────────────────────────┐
│              TokenService.deductTokens()                     │
│  BEGIN TRANSACTION:                                          │
│    1. Lock user row (FOR UPDATE)                            │
│    2. Deduct tokens (balance - cost)                        │
│    3. Increment usage counter                               │
│    4. Log transaction to token_transactions                 │
│  COMMIT TRANSACTION                                          │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 3. Return Result
             ▼
┌─────────────────────────────────────────────────────────────┐
│                  RETURN TO USER                              │
│  Response: {                                                 │
│    success: true,                                            │
│    result: "...",                                            │
│    tokens_remaining: 73                                      │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```
users table (modified)
├── tokens_balance (INTEGER) - Current token balance
├── monthly_free_tokens (INTEGER) - Free tokens per month (default: 100)
├── tokens_used_this_month (INTEGER) - Usage this billing cycle
├── last_token_reset_date (DATE) - Last monthly reset date
└── low_token_warning_sent (BOOLEAN) - Warning notification flag

token_transactions table (new)
├── id (SERIAL PRIMARY KEY)
├── user_id (INTEGER FK → users.id)
├── service_type (VARCHAR) - e.g., 'ai_chat_message'
├── tokens_used (INTEGER) - Amount deducted
├── tokens_balance_after (INTEGER) - Balance after transaction
├── metadata (JSONB) - Additional service data
├── created_at (TIMESTAMP)
└── INDEX on (user_id, created_at DESC)

token_purchases table (new)
├── id (SERIAL PRIMARY KEY)
├── user_id (INTEGER FK → users.id)
├── amount (DECIMAL) - Purchase amount in USD
├── tokens_purchased (INTEGER) - Number of tokens
├── stripe_payment_intent_id (VARCHAR) - Stripe reference
├── stripe_charge_id (VARCHAR)
├── status (VARCHAR) - 'pending', 'completed', 'failed', 'refunded'
├── created_at (TIMESTAMP)
└── INDEX on (user_id, created_at DESC)

token_usage_summary view (new)
├── user_id
├── total_tokens_used
├── total_spent (calculated from purchases)
├── most_used_service
└── usage_count_by_service
```

---

## 📝 IMPLEMENTATION STEPS

### PHASE 1: Foundation Setup (30 minutes)

#### Step 1.1: Mount Token Routes

**File**: `src/app.js`

**Location**: Add after the existing route mounts (around line 170)

```javascript
// Find this section in app.js:
// 📧 Email Marketing routes mounted at /api/email
// 📞 Outbound Caller routes mounted at /api/outbound-caller

// Add AFTER the above routes:

// ============================================
// Token System Routes
// ============================================
const tokenRoutes = require('./routes/tokens');
app.use('/api/tokens', tokenRoutes);
console.log('💰 Token API routes mounted at /api/tokens');
```

**Test**:
```bash
# Restart server
npm start

# Test endpoint (should return 401 or proper response, not 404)
curl https://aiagent.ringlypro.com/api/tokens/pricing
```

#### Step 1.2: Run Database Migration

**Option A: Using Render PostgreSQL Console**
1. Go to Render Dashboard → RinglyPro Database
2. Click "Connect" → "External Connection"
3. Copy the connection string
4. Open a PostgreSQL client and run: `migrations/add-token-system.sql`

**Option B: Using SQL File Directly**
```bash
# If you have psql installed locally
psql "postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require" -f migrations/add-token-system.sql
```

**Option C: Manual Execution** (safest for first time)
1. Open `migrations/add-token-system.sql`
2. Copy the SQL contents
3. Execute in Render's SQL console (Run SQL tab)
4. Verify tables were created

**Verification Query**:
```sql
-- Check if token columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('tokens_balance', 'monthly_free_tokens', 'tokens_used_this_month');

-- Check if new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('token_transactions', 'token_purchases');

-- Check if users have initial tokens
SELECT email, tokens_balance, monthly_free_tokens
FROM users
LIMIT 5;
```

**Expected Results**:
- 3 new columns in `users` table
- 2 new tables created
- All existing users should have `tokens_balance = 100`

#### Step 1.3: Create Test Endpoint

**File**: `src/routes/tokens.js` (already exists, but add this test route temporarily)

```javascript
// Add this route at the top of the file for testing
router.get('/test', async (req, res) => {
  try {
    const { User } = require('../models');

    // Get first user with tokens
    const user = await User.findOne({
      where: { tokens_balance: { [require('sequelize').Op.gt]: 0 } },
      attributes: ['id', 'email', 'tokens_balance', 'monthly_free_tokens', 'tokens_used_this_month']
    });

    if (!user) {
      return res.json({
        success: false,
        message: 'No users with tokens found - migration may not have run'
      });
    }

    return res.json({
      success: true,
      message: 'Token system is working!',
      sample_user: {
        id: user.id,
        email: user.email,
        tokens_balance: user.tokens_balance,
        monthly_free_tokens: user.monthly_free_tokens,
        tokens_used_this_month: user.tokens_used_this_month
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

**Test**:
```bash
curl https://aiagent.ringlypro.com/api/tokens/test
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Token system is working!",
  "sample_user": {
    "id": 1,
    "email": "user@example.com",
    "tokens_balance": 100,
    "monthly_free_tokens": 100,
    "tokens_used_this_month": 0
  }
}
```

---

### PHASE 2: AI Copilot Integration (2 hours)

#### Step 2.1: Add Token Check to MCP Chat

**File**: `src/routes/mcp.js`

**Location**: In the main chat handler, before processing the message

Find this section (around line 800-900):
```javascript
// Process user message with MCP
router.post('/copilot/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  // ... session validation code ...
```

**Add BEFORE processing the message**:

```javascript
router.post('/copilot/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  // ... existing session validation code ...

  // ============================================
  // TOKEN CHECK - Added for token billing
  // ============================================

  // Get user ID from session
  const userId = session.userId || session.clientId;

  if (userId) {
    try {
      const tokenService = require('../services/tokenService');

      // Determine service type based on message
      let serviceType = 'ai_chat_message'; // Default: 1 token

      // Check if this is a GHL query (costs more)
      if (message.toLowerCase().includes('gohighlevel') ||
          message.toLowerCase().includes('ghl') ||
          /create|update|delete|search/.test(message.toLowerCase())) {
        serviceType = 'ghl_query'; // 2 tokens
      }

      // Check if user has enough tokens
      const hasTokens = await tokenService.hasEnoughTokens(userId, serviceType);

      if (!hasTokens) {
        const balance = await tokenService.getBalance(userId);

        return res.json({
          success: false,
          response: `❌ Insufficient Tokens!\n\n` +
                   `You need ${tokenService.serviceCosts[serviceType]} tokens for this action.\n` +
                   `💰 Current balance: ${balance.tokens_balance} tokens\n\n` +
                   `📦 Free tokens reset: ${balance.days_until_reset} days\n` +
                   `🛒 Purchase more tokens to continue`,
          tokens_required: tokenService.serviceCosts[serviceType],
          tokens_balance: balance.tokens_balance,
          action_required: 'purchase_tokens'
        });
      }

      console.log(`✅ Token check passed for user ${userId} (${serviceType})`);
    } catch (error) {
      console.error('❌ Token check error:', error);
      // Don't block the request if token check fails
      // Log for manual reconciliation
    }
  }

  // ============================================
  // Continue with existing message processing...
  // ============================================
```

**Add AFTER successful message processing**:

Find where the response is sent back to the user (usually at the end of the handler):

```javascript
  // ... MCP processing code ...

  // ============================================
  // TOKEN DEDUCTION - After successful operation
  // ============================================

  if (userId && data.success) {
    try {
      const tokenService = require('../services/tokenService');

      // Deduct tokens
      const deduction = await tokenService.deductTokens(
        userId,
        serviceType,
        {
          message: message.substring(0, 100),
          response_length: data.response?.length || 0,
          session_id: sessionId
        }
      );

      console.log(`💰 Deducted ${deduction.tokens_deducted} tokens from user ${userId}`);

      // Add token info to response
      data.tokens_used = deduction.tokens_deducted;
      data.tokens_remaining = deduction.tokens_remaining;

      // Add token balance to response message
      if (data.response) {
        data.response += `\n\n💰 Tokens: ${deduction.tokens_remaining} remaining`;
      }

    } catch (error) {
      console.error('❌ Token deduction error:', error);
      // Don't block the response - user got their result
      // Log for manual reconciliation
    }
  }

  return res.json(data);
});
```

#### Step 2.2: Display Token Balance in Copilot UI

**File**: `public/mcp-copilot/copilot.js`

**Location**: Add token balance display to the header

Find the header section (around line 100-200):

```javascript
// Add this function to fetch and display token balance
async function updateTokenBalance() {
  try {
    // Only if user is logged in
    if (!sessionId) return;

    const response = await fetch('/api/tokens/balance', {
      headers: {
        'Authorization': `Bearer ${sessionId}` // or however your auth works
      }
    });

    if (response.ok) {
      const data = await response.json();

      // Create or update token display
      let tokenDisplay = document.getElementById('tokenBalance');
      if (!tokenDisplay) {
        tokenDisplay = document.createElement('div');
        tokenDisplay.id = 'tokenBalance';
        tokenDisplay.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 20px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9999;
          cursor: pointer;
        `;
        document.body.appendChild(tokenDisplay);

        // Click to show details
        tokenDisplay.addEventListener('click', showTokenDetails);
      }

      // Update display
      const percentage = (data.tokens_balance / data.monthly_free_tokens) * 100;
      let emoji = '💰';
      if (percentage < 25) emoji = '⚠️';
      if (percentage < 10) emoji = '🚨';

      tokenDisplay.innerHTML = `
        ${emoji} ${data.tokens_balance} Tokens
        <span style="opacity: 0.8; font-size: 11px; margin-left: 8px;">
          (${data.tokens_used_this_month}/${data.monthly_free_tokens} used)
        </span>
      `;

      // Low balance warning
      if (percentage < 25) {
        tokenDisplay.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
      }
    }
  } catch (error) {
    console.error('Error fetching token balance:', error);
  }
}

function showTokenDetails() {
  // Show modal with token usage breakdown
  // This will be implemented in Phase 4
  alert('Token details coming soon! Check your dashboard for detailed usage.');
}

// Call on page load and after each message
updateTokenBalance();

// Update after each chat message
// Add this after fetch('/api/mcp/copilot/chat') in your chat handler:
// updateTokenBalance();
```

#### Step 2.3: Test AI Copilot Integration

**Test Scenarios**:

1. **Test with sufficient tokens**:
   - User has 100 tokens
   - Send chat message
   - Should work normally
   - Balance should decrease by 1 token
   - Response should show "99 tokens remaining"

2. **Test with low tokens**:
   - Manually set user to 5 tokens (via database)
   - Send chat message
   - Should still work
   - UI should show warning (emoji changes)

3. **Test with zero tokens**:
   - Set user to 0 tokens
   - Send chat message
   - Should be blocked
   - Should see "Insufficient Tokens" error
   - Should show purchase suggestion

**Test Commands**:
```bash
# Test with different user token balances
# You can modify a test user's balance in database:

# SQL to set test user to 0 tokens:
UPDATE users SET tokens_balance = 0 WHERE email = 'test@example.com';

# SQL to reset test user to 100 tokens:
UPDATE users SET tokens_balance = 100 WHERE email = 'test@example.com';
```

---

### PHASE 3: Business Collector Integration (2 hours)

#### Step 3.1: Add Token Check to Lead Collection

**File**: `src/routes/mcp.js`

**Location**: In the business collector handler

Find the lead collection code (search for "business-collector" or "collectBusinesses"):

```javascript
// BEFORE collecting leads
if (session.type === 'business-collector' && /collect|find|get/i.test(message)) {

  // ============================================
  // TOKEN CHECK for Business Collector
  // ============================================

  const userId = session.userId || session.clientId;

  if (userId) {
    try {
      const tokenService = require('../services/tokenService');

      // Business collector costs 20 tokens for 100 leads
      const hasTokens = await tokenService.hasEnoughTokens(
        userId,
        'business_collector_100'
      );

      if (!hasTokens) {
        const balance = await tokenService.getBalance(userId);

        return res.json({
          success: false,
          response: `❌ Insufficient Tokens for Lead Collection!\n\n` +
                   `Collecting 100 business leads requires 20 tokens.\n` +
                   `💰 Your balance: ${balance.tokens_balance} tokens\n\n` +
                   `📦 Free tokens reset in ${balance.days_until_reset} days\n` +
                   `🛒 Purchase more tokens to continue\n\n` +
                   `💡 Tip: Each 100 leads = 20 tokens`,
          tokens_required: 20,
          tokens_balance: balance.tokens_balance,
          action_required: 'purchase_tokens'
        });
      }

      console.log(`✅ Token check passed for lead collection (user ${userId})`);
    } catch (error) {
      console.error('❌ Token check error:', error);
    }
  }

  // Continue with lead collection...
  const result = await session.proxy.collectBusinesses({
    category,
    geography,
    maxResults: 100
  });

  // ============================================
  // TOKEN DEDUCTION after successful collection
  // ============================================

  if (userId && result.success) {
    try {
      const tokenService = require('../services/tokenService');

      const deduction = await tokenService.deductTokens(
        userId,
        'business_collector_100',
        {
          category: category,
          geography: geography,
          leads_collected: result.summary?.total || 0,
          session_id: sessionId
        }
      );

      console.log(`💰 Deducted 20 tokens for lead collection (user ${userId})`);

      // Add token info to response
      result.response += `\n\n💰 Tokens Used: 20\n💰 Remaining: ${deduction.tokens_remaining}`;

    } catch (error) {
      console.error('❌ Token deduction error:', error);
      // Don't block - user got their leads
    }
  }

  return res.json(result);
}
```

#### Step 3.2: Add Token Check to CSV Export

**File**: `src/routes/mcp.js`

**Location**: In the CSV export handler

```javascript
// BEFORE CSV export
if (/export|download|csv/i.test(message)) {

  // ============================================
  // TOKEN CHECK for CSV Export
  // ============================================

  const userId = session.userId || session.clientId;

  if (userId) {
    try {
      const tokenService = require('../services/tokenService');

      // CSV export costs 5 tokens
      const hasTokens = await tokenService.hasEnoughTokens(
        userId,
        'business_collector_csv'
      );

      if (!hasTokens) {
        const balance = await tokenService.getBalance(userId);

        return res.json({
          success: false,
          response: `❌ Insufficient Tokens for CSV Export!\n\n` +
                   `Exporting to CSV requires 5 tokens.\n` +
                   `💰 Your balance: ${balance.tokens_balance} tokens\n\n` +
                   `🛒 Purchase more tokens to continue`,
          tokens_required: 5,
          tokens_balance: balance.tokens_balance
        });
      }
    } catch (error) {
      console.error('❌ Token check error:', error);
    }
  }

  // Generate CSV...
  const csvData = generateCSV(businesses);

  // ============================================
  // TOKEN DEDUCTION after successful export
  // ============================================

  if (userId) {
    try {
      const tokenService = require('../services/tokenService');

      const deduction = await tokenService.deductTokens(
        userId,
        'business_collector_csv',
        {
          filename: filename,
          rows: businesses.length,
          session_id: sessionId
        }
      );

      console.log(`💰 Deducted 5 tokens for CSV export (user ${userId})`);

    } catch (error) {
      console.error('❌ Token deduction error:', error);
    }
  }

  return res.json({
    success: true,
    response: `📥 CSV Ready for Download!\n\n💰 Tokens Used: 5\n💰 Remaining: ${deduction?.tokens_remaining || 'N/A'}`,
    csvData: csvData,
    csvFilename: filename
  });
}
```

#### Step 3.3: Add Token Check to Social Media Posts

**File**: `src/routes/mcp.js`

**Location**: In the social media post handler

```javascript
// BEFORE creating social post
if (claudeResponse.action === 'schedule_social_post') {

  // ============================================
  // TOKEN CHECK for Social Media Post
  // ============================================

  const userId = session.userId || session.clientId;

  if (userId) {
    try {
      const tokenService = require('../services/tokenService');

      // Social post costs 10 tokens
      const hasTokens = await tokenService.hasEnoughTokens(
        userId,
        'social_post'
      );

      if (!hasTokens) {
        const balance = await tokenService.getBalance(userId);

        return res.json({
          success: false,
          response: `❌ Insufficient Tokens for Social Media Post!\n\n` +
                   `Creating a social media post requires 10 tokens.\n` +
                   `💰 Your balance: ${balance.tokens_balance} tokens\n\n` +
                   `🛒 Purchase more tokens to continue`,
          tokens_required: 10,
          tokens_balance: balance.tokens_balance
        });
      }
    } catch (error) {
      console.error('❌ Token check error:', error);
    }
  }

  // Create social post...
  const result = await session.proxy.createSocialPost(postData);

  // ============================================
  // TOKEN DEDUCTION after successful post
  // ============================================

  if (userId && result) {
    try {
      const tokenService = require('../services/tokenService');

      const deduction = await tokenService.deductTokens(
        userId,
        'social_post',
        {
          platforms: platforms,
          scheduled: !!scheduleTime,
          session_id: sessionId
        }
      );

      console.log(`💰 Deducted 10 tokens for social post (user ${userId})`);

    } catch (error) {
      console.error('❌ Token deduction error:', error);
    }
  }
}
```

---

### PHASE 4: Testing & Polish (1-2 hours)

#### Step 4.1: End-to-End Testing

**Test Script**:

```javascript
// Save this as: test-token-system.js
// Run with: node test-token-system.js

const fetch = require('node-fetch');

const API_BASE = 'https://aiagent.ringlypro.com';
const TEST_USER_EMAIL = 'test@example.com'; // Replace with actual test user

async function testTokenSystem() {
  console.log('🧪 Starting Token System End-to-End Test\n');

  // Test 1: Check token balance
  console.log('Test 1: Checking token balance...');
  const balanceResponse = await fetch(`${API_BASE}/api/tokens/balance`, {
    headers: { 'user-email': TEST_USER_EMAIL }
  });
  const balance = await balanceResponse.json();
  console.log('✅ Balance:', balance);
  console.log('');

  // Test 2: Get pricing
  console.log('Test 2: Getting pricing...');
  const pricingResponse = await fetch(`${API_BASE}/api/tokens/pricing`);
  const pricing = await pricingResponse.json();
  console.log('✅ Pricing:', pricing);
  console.log('');

  // Test 3: Send chat message (should deduct 1 token)
  console.log('Test 3: Sending chat message...');
  const chatResponse = await fetch(`${API_BASE}/api/mcp/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'test-session',
      message: 'Hello, how are you?'
    })
  });
  const chatResult = await chatResponse.json();
  console.log('✅ Chat result:', chatResult);
  console.log('');

  // Test 4: Check balance again (should be 1 less)
  console.log('Test 4: Checking balance after chat...');
  const balanceAfter = await fetch(`${API_BASE}/api/tokens/balance`, {
    headers: { 'user-email': TEST_USER_EMAIL }
  }).then(r => r.json());
  console.log('✅ Balance after:', balanceAfter);
  console.log('');

  // Test 5: Get usage history
  console.log('Test 5: Getting usage history...');
  const usageResponse = await fetch(`${API_BASE}/api/tokens/usage`, {
    headers: { 'user-email': TEST_USER_EMAIL }
  });
  const usage = await usageResponse.json();
  console.log('✅ Usage:', usage);
  console.log('');

  console.log('🎉 All tests completed!');
}

testTokenSystem().catch(console.error);
```

**Manual Testing Checklist**:

- [ ] User can see token balance in UI
- [ ] Token balance updates after each action
- [ ] Low balance warning appears at <25 tokens
- [ ] Services blocked at 0 tokens
- [ ] Error messages are clear and helpful
- [ ] Token deductions are logged correctly
- [ ] Monthly reset works (test by changing `last_token_reset_date`)

#### Step 4.2: Error Handling Improvements

**Add Global Error Handler for Token Operations**:

```javascript
// Add this to src/services/tokenService.js

class TokenService {
  // ... existing methods ...

  /**
   * Safe token deduction with automatic retry
   * @param {number} userId
   * @param {string} serviceType
   * @param {object} metadata
   * @param {number} retries
   * @returns {Promise<object>}
   */
  async safeDeductTokens(userId, serviceType, metadata = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.deductTokens(userId, serviceType, metadata);
      } catch (error) {
        logger.error(`[TOKENS] Deduction attempt ${attempt}/${retries} failed:`, error);

        if (attempt === retries) {
          // Last attempt failed - log for manual reconciliation
          logger.error(`[TOKENS] FAILED TO DEDUCT - Manual reconciliation needed:`, {
            userId,
            serviceType,
            metadata,
            error: error.message
          });

          // Return a "failed" result but don't throw
          return {
            success: false,
            error: error.message,
            tokens_deducted: 0,
            tokens_remaining: null,
            requires_manual_reconciliation: true
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
  }
}
```

**Add Low Balance Email Notifications**:

```javascript
// Add this to src/services/tokenService.js

const sendgrid = require('@sendgrid/mail');

class TokenService {
  // ... existing methods ...

  /**
   * Check and send low balance warning
   * @param {number} userId
   */
  async checkAndNotifyLowBalance(userId) {
    try {
      const balance = await this.getBalance(userId);

      // Calculate percentage used
      const percentageUsed = (balance.tokens_used_this_month / balance.monthly_free_tokens) * 100;

      // Get user info
      const { User } = require('../models');
      const user = await User.findByPk(userId);

      if (!user) return;

      // Send warning at 75% usage (if not already sent)
      if (percentageUsed >= 75 && !user.low_token_warning_sent) {
        await this.sendLowBalanceEmail(user, balance, percentageUsed);

        // Mark as sent
        user.low_token_warning_sent = true;
        await user.save();

        logger.info(`[TOKENS] Low balance warning sent to user ${userId}`);
      }

      // Reset flag if usage drops below 50%
      if (percentageUsed < 50 && user.low_token_warning_sent) {
        user.low_token_warning_sent = false;
        await user.save();
      }

    } catch (error) {
      logger.error(`[TOKENS] Error checking low balance:`, error);
    }
  }

  /**
   * Send low balance email via SendGrid
   * @param {object} user
   * @param {object} balance
   * @param {number} percentageUsed
   */
  async sendLowBalanceEmail(user, balance, percentageUsed) {
    try {
      const msg = {
        to: user.email,
        from: 'noreply@ringlypro.com',
        subject: '⚠️ RinglyPro: Low Token Balance Warning',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f5576c;">⚠️ Low Token Balance</h2>

            <p>Hi ${user.name || 'there'},</p>

            <p>You've used <strong>${percentageUsed.toFixed(0)}%</strong> of your monthly free tokens.</p>

            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Current Balance:</strong> ${balance.tokens_balance} tokens</p>
              <p style="margin: 5px 0;"><strong>Used This Month:</strong> ${balance.tokens_used_this_month}/${balance.monthly_free_tokens}</p>
              <p style="margin: 5px 0;"><strong>Resets In:</strong> ${balance.days_until_reset} days</p>
            </div>

            <p>Need more tokens?</p>

            <a href="https://aiagent.ringlypro.com/dashboard"
               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;
                      font-weight: bold; margin: 20px 0;">
              Purchase More Tokens
            </a>

            <p style="color: #6b7280; font-size: 14px; margin-top: 40px;">
              Questions? Contact us at support@ringlypro.com
            </p>
          </div>
        `
      };

      if (process.env.SENDGRID_API_KEY) {
        sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
        await sendgrid.send(msg);
        logger.info(`[TOKENS] Low balance email sent to ${user.email}`);
      } else {
        logger.warn(`[TOKENS] SendGrid not configured, skipping email`);
      }

    } catch (error) {
      logger.error(`[TOKENS] Error sending low balance email:`, error);
    }
  }
}

module.exports = new TokenService();
```

**Update Deduction to Include Notification Check**:

```javascript
// In deductTokens() method, after successful deduction:

// Check for low balance and notify if needed
this.checkAndNotifyLowBalance(userId).catch(err => {
  logger.error('[TOKENS] Low balance check failed:', err);
  // Don't throw - this is non-critical
});
```

---

## 🗃️ DATABASE SCHEMA

### Complete Migration SQL

**File**: `migrations/add-token-system.sql`

This file already exists in your codebase. Here's what it contains:

```sql
-- =====================================================
-- RinglyPro Token System Migration
-- File: migrations/add-token-system.sql
-- Purpose: Add token-based billing to existing system
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Add Token Columns to Users Table
-- =====================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS tokens_balance INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS monthly_free_tokens INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS tokens_used_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_token_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS low_token_warning_sent BOOLEAN DEFAULT FALSE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_tokens_balance ON users(tokens_balance);
CREATE INDEX IF NOT EXISTS idx_users_token_reset_date ON users(last_token_reset_date);

-- =====================================================
-- 2. Create Token Transactions Table
-- =====================================================

CREATE TABLE IF NOT EXISTS token_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type VARCHAR(50) NOT NULL,
  tokens_used INTEGER NOT NULL,
  tokens_balance_after INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON token_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_transactions_service_type ON token_transactions(service_type);

-- =====================================================
-- 3. Create Token Purchases Table
-- =====================================================

CREATE TABLE IF NOT EXISTS token_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  tokens_purchased INTEGER NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_token_purchases_user_id ON token_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_status ON token_purchases(status);
CREATE INDEX IF NOT EXISTS idx_token_purchases_created_at ON token_purchases(created_at DESC);

-- =====================================================
-- 4. Create Token Usage Summary View
-- =====================================================

CREATE OR REPLACE VIEW token_usage_summary AS
SELECT
  u.id AS user_id,
  u.email,
  u.tokens_balance,
  u.monthly_free_tokens,
  u.tokens_used_this_month,
  u.last_token_reset_date,
  COALESCE(SUM(tp.amount), 0) AS total_spent,
  COALESCE(SUM(tp.tokens_purchased), 0) AS total_tokens_purchased,
  COUNT(DISTINCT tt.id) AS total_transactions,
  (
    SELECT service_type
    FROM token_transactions
    WHERE user_id = u.id
    GROUP BY service_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ) AS most_used_service
FROM users u
LEFT JOIN token_purchases tp ON u.id = tp.user_id AND tp.status = 'completed'
LEFT JOIN token_transactions tt ON u.id = tt.user_id
GROUP BY u.id, u.email, u.tokens_balance, u.monthly_free_tokens,
         u.tokens_used_this_month, u.last_token_reset_date;

-- =====================================================
-- 5. Create Monthly Token Reset Function
-- =====================================================

CREATE OR REPLACE FUNCTION reset_monthly_tokens()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET
    tokens_balance = tokens_balance + (monthly_free_tokens - tokens_used_this_month),
    tokens_used_this_month = 0,
    last_token_reset_date = CURRENT_DATE,
    low_token_warning_sent = FALSE
  WHERE
    last_token_reset_date < DATE_TRUNC('month', CURRENT_DATE);

  RAISE NOTICE 'Monthly tokens reset completed for % users',
    (SELECT COUNT(*) FROM users WHERE last_token_reset_date = CURRENT_DATE);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. Seed Existing Users with Initial Tokens
-- =====================================================

UPDATE users
SET
  tokens_balance = 100,
  monthly_free_tokens = 100,
  tokens_used_this_month = 0,
  last_token_reset_date = CURRENT_DATE
WHERE tokens_balance IS NULL OR tokens_balance = 0;

-- =====================================================
-- 7. Create Scheduled Job for Monthly Reset (PostgreSQL Cron)
-- Note: Requires pg_cron extension - optional
-- =====================================================

-- If pg_cron is available:
-- SELECT cron.schedule('monthly-token-reset', '0 0 1 * *', 'SELECT reset_monthly_tokens()');

COMMIT;

-- =====================================================
-- ROLLBACK PLAN (if needed)
-- =====================================================

-- To rollback this migration:
/*
BEGIN;

DROP VIEW IF EXISTS token_usage_summary;
DROP TABLE IF EXISTS token_purchases;
DROP TABLE IF EXISTS token_transactions;
DROP FUNCTION IF EXISTS reset_monthly_tokens();

ALTER TABLE users
DROP COLUMN IF EXISTS tokens_balance,
DROP COLUMN IF EXISTS monthly_free_tokens,
DROP COLUMN IF EXISTS tokens_used_this_month,
DROP COLUMN IF EXISTS last_token_reset_date,
DROP COLUMN IF EXISTS low_token_warning_sent;

COMMIT;
*/
```

---

## 🧪 TESTING PROCEDURES

### Test 1: Database Migration

**Objective**: Verify migration ran successfully

**Steps**:
1. Run migration SQL
2. Execute verification queries
3. Check sample user data

**Verification Queries**:
```sql
-- 1. Check new columns in users table
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name LIKE '%token%';

-- Expected: 5 rows (tokens_balance, monthly_free_tokens, etc.)

-- 2. Check new tables
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('token_transactions', 'token_purchases');

-- Expected: 2 rows

-- 3. Check sample user tokens
SELECT id, email, tokens_balance, monthly_free_tokens, tokens_used_this_month
FROM users
WHERE tokens_balance > 0
LIMIT 5;

-- Expected: All users should have 100 tokens

-- 4. Check view
SELECT * FROM token_usage_summary LIMIT 5;

-- Expected: Returns user token summary data
```

**Success Criteria**:
- ✅ All queries return expected results
- ✅ No errors in database logs
- ✅ All users have 100 initial tokens

### Test 2: Token Service

**Objective**: Verify TokenService methods work correctly

**Test Script**:
```javascript
// Save as: test-token-service.js
// Run: node test-token-service.js

const tokenService = require('./src/services/tokenService');

async function testTokenService() {
  const TEST_USER_ID = 1; // Replace with actual user ID

  console.log('🧪 Testing Token Service\n');

  // Test 1: Get Balance
  console.log('Test 1: getBalance()');
  const balance = await tokenService.getBalance(TEST_USER_ID);
  console.log('✅ Balance:', balance);
  console.log('');

  // Test 2: Check Tokens (should pass)
  console.log('Test 2: hasEnoughTokens() - should pass');
  const hasEnough = await tokenService.hasEnoughTokens(TEST_USER_ID, 'ai_chat_message');
  console.log('✅ Has enough:', hasEnough);
  console.log('');

  // Test 3: Deduct Tokens
  console.log('Test 3: deductTokens()');
  const deduction = await tokenService.deductTokens(
    TEST_USER_ID,
    'ai_chat_message',
    { test: true }
  );
  console.log('✅ Deduction:', deduction);
  console.log('');

  // Test 4: Get Usage History
  console.log('Test 4: getUsageHistory()');
  const history = await tokenService.getUsageHistory(TEST_USER_ID, { limit: 5 });
  console.log('✅ History:', history);
  console.log('');

  // Test 5: Get Analytics
  console.log('Test 5: getUsageAnalytics()');
  const analytics = await tokenService.getUsageAnalytics(TEST_USER_ID);
  console.log('✅ Analytics:', analytics);
  console.log('');

  console.log('🎉 All token service tests passed!');
}

testTokenService().catch(console.error);
```

**Success Criteria**:
- ✅ All methods execute without errors
- ✅ Balance decreases after deduction
- ✅ Transaction is logged
- ✅ History shows recent transactions
- ✅ Analytics show usage breakdown

### Test 3: API Endpoints

**Objective**: Verify all token API endpoints work

**Test Commands**:
```bash
# Set your API base URL
API_BASE="https://aiagent.ringlypro.com"

# Test 1: Get pricing (public endpoint)
echo "Test 1: GET /api/tokens/pricing"
curl -s "$API_BASE/api/tokens/pricing" | jq

# Test 2: Get balance (requires auth)
echo "Test 2: GET /api/tokens/balance"
curl -s "$API_BASE/api/tokens/balance" \
  -H "Authorization: Bearer YOUR_SESSION_ID" | jq

# Test 3: Get usage history
echo "Test 3: GET /api/tokens/usage"
curl -s "$API_BASE/api/tokens/usage" \
  -H "Authorization: Bearer YOUR_SESSION_ID" | jq

# Test 4: Get analytics
echo "Test 4: GET /api/tokens/analytics"
curl -s "$API_BASE/api/tokens/analytics" \
  -H "Authorization: Bearer YOUR_SESSION_ID" | jq

# Test 5: Check tokens (internal endpoint)
echo "Test 5: POST /api/tokens/check"
curl -s "$API_BASE/api/tokens/check" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "serviceType": "ai_chat_message"}' | jq
```

**Success Criteria**:
- ✅ All endpoints return 200 status
- ✅ Response format matches expected schema
- ✅ Data is accurate

### Test 4: Service Integration

**Objective**: Verify services deduct tokens correctly

**Test Scenarios**:

**Scenario A: AI Copilot Chat**
```
1. Check user balance: 100 tokens
2. Send chat message via /api/mcp/copilot/chat
3. Verify response contains "99 tokens remaining"
4. Check database: tokens_used_this_month = 1
5. Check token_transactions table: 1 new row
```

**Scenario B: Business Collector**
```
1. Check user balance: 99 tokens
2. Collect 100 leads
3. Verify response shows "79 tokens remaining"
4. Verify leads were collected
5. Check token_transactions: service_type = 'business_collector_100'
```

**Scenario C: CSV Export**
```
1. Check user balance: 79 tokens
2. Export CSV
3. Verify response shows "74 tokens remaining"
4. Verify CSV was generated
5. Check token_transactions: service_type = 'business_collector_csv'
```

**Scenario D: Insufficient Tokens**
```
1. Set user balance to 3 tokens
2. Try to collect leads (requires 20 tokens)
3. Verify request is blocked
4. Verify error message shows current balance
5. Verify error includes "Purchase tokens" suggestion
6. Verify NO transaction was created
7. Verify balance unchanged (still 3 tokens)
```

**Success Criteria**:
- ✅ Tokens deducted after successful operations
- ✅ Operations blocked when insufficient tokens
- ✅ All transactions logged correctly
- ✅ Balance displayed accurately
- ✅ Error messages are clear

### Test 5: UI Integration

**Objective**: Verify token balance displayed in UI

**Test Steps**:
1. Open MCP Copilot: https://aiagent.ringlypro.com/mcp-copilot/
2. Verify token balance shown in top-right corner
3. Send a chat message
4. Verify balance updates automatically
5. Set balance to <25 tokens
6. Verify warning emoji appears (⚠️ or 🚨)
7. Set balance to 0 tokens
8. Verify all operations blocked

**Success Criteria**:
- ✅ Balance visible on page load
- ✅ Balance updates after operations
- ✅ Warning indicators work
- ✅ UI is responsive and clear

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] All code changes committed to Git
- [ ] Local testing completed successfully
- [ ] Database migration tested on development database
- [ ] Backup of production database created
- [ ] Rollback plan documented and tested
- [ ] Environment variables checked (SENDGRID_API_KEY, STRIPE_API_KEY)

### Deployment Steps

#### Step 1: Deploy Code Changes (No Database Changes Yet)

```bash
# Push to GitHub
git add .
git commit -m "feat: Add token billing system"
git push origin main

# Render will auto-deploy
# Wait for deployment to complete
# Verify health check: https://aiagent.ringlypro.com/health
```

**Verification**:
- ✅ Server starts without errors
- ✅ Health check returns 200 OK
- ✅ Existing functionality still works (voice calls, SMS, etc.)

#### Step 2: Run Database Migration

**Option A: Via Render SQL Console (Recommended)**
1. Go to Render Dashboard
2. Select RinglyPro Database
3. Click "Run SQL"
4. Copy contents of `migrations/add-token-system.sql`
5. Paste and execute
6. Verify success messages

**Option B: Via psql (if installed)**
```bash
psql "postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require" -f migrations/add-token-system.sql
```

**Verification Queries**:
```sql
-- Verify columns added
SELECT COUNT(*) FROM information_schema.columns
WHERE table_name = 'users' AND column_name LIKE '%token%';
-- Expected: 5

-- Verify users have tokens
SELECT COUNT(*) FROM users WHERE tokens_balance = 100;
-- Expected: Total number of users

-- Verify tables created
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name IN ('token_transactions', 'token_purchases');
-- Expected: 2
```

#### Step 3: Test in Production

```bash
# Test token system endpoint
curl https://aiagent.ringlypro.com/api/tokens/test

# Expected response:
{
  "success": true,
  "message": "Token system is working!",
  "sample_user": {
    "id": 1,
    "email": "user@example.com",
    "tokens_balance": 100,
    ...
  }
}
```

#### Step 4: Monitor Logs

```bash
# Via Render Dashboard
# Go to RinglyPro Service → Logs
# Watch for:
# - "💰 Token API routes mounted"
# - Any token-related errors
# - Token deduction logs
```

#### Step 5: Test with Real User

1. Use your own account
2. Open MCP Copilot
3. Send chat message
4. Verify token deduction
5. Check database for transaction

### Post-Deployment

- [ ] Test all major features (chat, business collector, social media)
- [ ] Verify token deductions are logged
- [ ] Monitor for errors in logs (watch for 1 hour)
- [ ] Test purchase flow (if Stripe is configured)
- [ ] Send announcement to users (optional)
- [ ] Update documentation/help pages
- [ ] Monitor support channels for questions

### Rollback Plan (If Needed)

If something goes wrong, execute this SQL to rollback:

```sql
BEGIN;

DROP VIEW IF EXISTS token_usage_summary;
DROP TABLE IF EXISTS token_purchases;
DROP TABLE IF EXISTS token_transactions;
DROP FUNCTION IF EXISTS reset_monthly_tokens();

ALTER TABLE users
DROP COLUMN IF EXISTS tokens_balance,
DROP COLUMN IF EXISTS monthly_free_tokens,
DROP COLUMN IF EXISTS tokens_used_this_month,
DROP COLUMN IF EXISTS last_token_reset_date,
DROP COLUMN IF EXISTS low_token_warning_sent;

COMMIT;
```

Then redeploy previous version of code:
```bash
git revert HEAD
git push origin main
```

---

## 🔧 TROUBLESHOOTING GUIDE

### Issue 1: Token routes return 404

**Symptoms**:
```bash
curl https://aiagent.ringlypro.com/api/tokens/pricing
# Returns: 404 Not Found
```

**Cause**: Token routes not mounted in app.js

**Solution**:
1. Check if `app.use('/api/tokens', tokenRoutes);` exists in `src/app.js`
2. Verify `const tokenRoutes = require('./routes/tokens');` is present
3. Restart server
4. Check logs for "💰 Token API routes mounted"

### Issue 2: "tokens_balance column does not exist"

**Symptoms**:
```
Error: column "tokens_balance" does not exist
```

**Cause**: Database migration not run

**Solution**:
1. Run the migration SQL: `migrations/add-token-system.sql`
2. Verify with: `SELECT tokens_balance FROM users LIMIT 1;`
3. If still fails, check table name is correct (should be `users` not `Users`)

### Issue 3: Token deduction not happening

**Symptoms**:
- Balance doesn't decrease after operations
- No transactions in `token_transactions` table

**Cause**: Token deduction code not integrated

**Solution**:
1. Verify `tokenService.deductTokens()` is called after successful operations
2. Check logs for "💰 Deducted X tokens from user Y"
3. Add debug logging before/after deduction
4. Verify user ID is being passed correctly

### Issue 4: "User not found" errors

**Symptoms**:
```
[TOKENS] User not found: undefined
```

**Cause**: User ID not being extracted from session

**Solution**:
1. Check how session stores user ID
2. Verify: `const userId = session.userId || session.clientId;`
3. Add logging: `console.log('Session:', session);`
4. Verify authentication middleware sets user ID

### Issue 5: Tokens not resetting monthly

**Symptoms**:
- Users still have 0 tokens after month change
- `last_token_reset_date` not updating

**Cause**: Monthly reset function not scheduled

**Solution**:
1. Manually run reset: `SELECT reset_monthly_tokens();`
2. Schedule with cron or external scheduler
3. Add to deployment schedule (Render Cron Jobs)

### Issue 6: Purchase tokens not working

**Symptoms**:
- Stripe payment succeeds but tokens not added
- `token_purchases` table shows "pending"

**Cause**: Stripe webhook not configured or failing

**Solution**:
1. Check Stripe webhook endpoint is configured
2. Verify webhook secret in environment variables
3. Check webhook logs in Stripe Dashboard
4. Manually mark purchase as completed:
   ```sql
   UPDATE token_purchases
   SET status = 'completed', completed_at = NOW()
   WHERE stripe_payment_intent_id = 'pi_xxx';
   ```

### Issue 7: Balance display not updating

**Symptoms**:
- UI shows old balance
- Balance doesn't change after operations

**Cause**: Frontend not fetching updated balance

**Solution**:
1. Verify `updateTokenBalance()` is called after operations
2. Check browser console for errors
3. Verify API endpoint returns correct data
4. Add manual refresh button as fallback

### Issue 8: Performance issues

**Symptoms**:
- Slow response times
- Database queries timing out

**Cause**: Missing indexes or inefficient queries

**Solution**:
1. Verify indexes were created during migration
2. Check slow query logs
3. Add missing indexes:
   ```sql
   CREATE INDEX idx_users_tokens_balance ON users(tokens_balance);
   CREATE INDEX idx_token_transactions_user_id ON token_transactions(user_id);
   ```

---

## 📊 MONITORING & ANALYTICS

### Key Metrics to Track

#### Daily Metrics
- Total tokens deducted
- Average tokens per user
- Most popular services
- Users with low balance (<25 tokens)
- Failed token deductions

**Query**:
```sql
-- Daily token usage
SELECT
  DATE(created_at) as date,
  service_type,
  COUNT(*) as transaction_count,
  SUM(tokens_used) as total_tokens_used
FROM token_transactions
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), service_type
ORDER BY date DESC, total_tokens_used DESC;
```

#### Weekly Metrics
- Total tokens purchased
- Revenue from token sales
- User retention (active users)
- Token purchase conversion rate

**Query**:
```sql
-- Weekly token purchases
SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(*) as purchase_count,
  SUM(amount) as total_revenue,
  SUM(tokens_purchased) as total_tokens_sold,
  AVG(amount) as avg_purchase_amount
FROM token_purchases
WHERE status = 'completed'
  AND created_at >= CURRENT_DATE - INTERVAL '4 weeks'
GROUP BY DATE_TRUNC('week', created_at)
ORDER BY week DESC;
```

#### Monthly Metrics
- Monthly active users
- Average tokens per user per month
- Token purchase lifetime value
- Churn rate

**Query**:
```sql
-- Monthly active users with token usage
SELECT
  DATE_TRUNC('month', tt.created_at) as month,
  COUNT(DISTINCT tt.user_id) as active_users,
  SUM(tt.tokens_used) as total_tokens_used,
  AVG(tt.tokens_used) as avg_tokens_per_transaction,
  COUNT(*) as total_transactions
FROM token_transactions tt
WHERE tt.created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', tt.created_at)
ORDER BY month DESC;
```

### Alerts to Set Up

1. **Low Balance Users** (send weekly):
   ```sql
   SELECT email, tokens_balance, monthly_free_tokens
   FROM users
   WHERE tokens_balance < monthly_free_tokens * 0.25
   AND low_token_warning_sent = FALSE;
   ```

2. **Failed Token Deductions** (check daily):
   ```sql
   -- Check application logs for:
   -- "[TOKENS] FAILED TO DEDUCT - Manual reconciliation needed"
   ```

3. **Unusual Usage Patterns** (check daily):
   ```sql
   SELECT user_id, COUNT(*) as transaction_count, SUM(tokens_used) as total_used
   FROM token_transactions
   WHERE created_at >= CURRENT_DATE
   GROUP BY user_id
   HAVING SUM(tokens_used) > 100
   ORDER BY total_used DESC;
   ```

---

## 💰 PRICING & REVENUE MODEL

### Current Token Pricing

**Free Monthly Allocation**: 100 tokens per user

**Token Packages** (to be configured in Stripe):
- **Starter Pack**: 100 tokens = $10 ($0.10 per token)
- **Growth Pack**: 500 tokens = $40 ($0.08 per token) - 20% savings
- **Pro Pack**: 1000 tokens = $70 ($0.07 per token) - 30% savings
- **Enterprise Pack**: 5000 tokens = $300 ($0.06 per token) - 40% savings

### Service Costs (Token Value)

At $0.10 per token retail:

| Service | Token Cost | USD Value | Notes |
|---------|-----------|-----------|-------|
| AI Chat Message | 1 | $0.10 | Basic conversation |
| GHL Query | 2 | $0.20 | CRM data access |
| Business Collector (100 leads) | 20 | $2.00 | Lead generation |
| CSV Export | 5 | $0.50 | Data export |
| Social Media Post | 10 | $1.00 | Post creation |
| Outbound Call Campaign (100) | 50 | $5.00 | Bulk calling |
| Email Campaign | 50 | $5.00 | Up to 1000 emails |

### Revenue Projections

**Conservative (100 users, 10% purchase)**:
- Monthly free tokens: 10,000 tokens distributed
- Purchases: 10 users × $10 avg = $100/month
- Estimated MRR: $100

**Moderate (500 users, 20% purchase)**:
- Monthly free tokens: 50,000 tokens distributed
- Purchases: 100 users × $25 avg = $2,500/month
- Estimated MRR: $2,500

**Optimistic (1000 users, 30% purchase)**:
- Monthly free tokens: 100,000 tokens distributed
- Purchases: 300 users × $40 avg = $12,000/month
- Estimated MRR: $12,000

---

## 🔐 SECURITY CONSIDERATIONS

### Token Balance Manipulation Prevention

1. **Database Constraints**:
   - `tokens_balance` cannot be negative
   - All deductions use transactions with row-level locking
   - Transaction logs are immutable

2. **API Security**:
   - All token endpoints require authentication
   - Rate limiting on token operations
   - No direct balance modification via API

3. **Audit Trail**:
   - Every deduction logged in `token_transactions`
   - Stripe purchases logged in `token_purchases`
   - Timestamps and metadata for forensics

### Fraud Prevention

1. **Unusual Activity Detection**:
   ```sql
   -- Detect users with abnormal usage
   SELECT user_id, COUNT(*) as txn_count, SUM(tokens_used) as total_used
   FROM token_transactions
   WHERE created_at >= NOW() - INTERVAL '1 hour'
   GROUP BY user_id
   HAVING COUNT(*) > 100 OR SUM(tokens_used) > 500;
   ```

2. **Duplicate Transaction Prevention**:
   - Idempotency keys for all operations
   - Check for duplicate transactions within time window

3. **Rate Limiting**:
   - Max 100 tokens per hour per user
   - Max 10 purchases per day per user

---

## 📚 ADDITIONAL RESOURCES

### Documentation Files in Repo
- `TOKEN_SYSTEM_IMPLEMENTATION_STATUS.md` - Original status
- `MULTI_TENANT_TOKEN_BILLING_ARCHITECTURE.md` - Full architecture
- `MONDAY_DELIVERY_PLAN.md` - Original delivery timeline

### External Resources
- [Stripe API Documentation](https://stripe.com/docs/api)
- [PostgreSQL Row-Level Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [SendGrid Email API](https://docs.sendgrid.com/api-reference)

### Support Contacts
- **Technical Issues**: support@ringlypro.com
- **Billing Questions**: billing@ringlypro.com
- **Stripe Support**: https://support.stripe.com

---

## ✅ IMPLEMENTATION CHECKLIST

Use this checklist to track your progress:

### Phase 1: Foundation
- [ ] Mount token routes in app.js
- [ ] Run database migration on production
- [ ] Test /api/tokens/test endpoint
- [ ] Verify users have 100 initial tokens

### Phase 2: AI Copilot Integration
- [ ] Add token check before chat processing
- [ ] Add token deduction after successful chat
- [ ] Display token balance in copilot UI
- [ ] Test with sufficient tokens
- [ ] Test with insufficient tokens

### Phase 3: Business Collector Integration
- [ ] Add token check to lead collection
- [ ] Add token deduction after collection
- [ ] Add token check to CSV export
- [ ] Add token deduction after export
- [ ] Test end-to-end business collector flow

### Phase 4: Testing & Polish
- [ ] Run all test scripts
- [ ] Verify all transactions logged
- [ ] Test low balance warnings
- [ ] Test monthly reset function
- [ ] Document any issues found

### Phase 5: Deployment
- [ ] Create database backup
- [ ] Deploy code to production
- [ ] Run migration on production database
- [ ] Verify health check
- [ ] Test with real user account
- [ ] Monitor logs for 1 hour
- [ ] Send announcement (optional)

---

## 🎉 NEXT STEPS

After completing this implementation:

1. **Week 1**: Monitor usage and gather feedback
2. **Week 2**: Implement Stripe purchase flow
3. **Week 3**: Add analytics dashboard for users
4. **Week 4**: Optimize based on real usage patterns

---

## 📝 NOTES & TIPS

### Development Tips

1. **Use Test Users**: Create test users with different token balances (0, 10, 50, 100) to test all scenarios

2. **Add Debug Logging**: Temporarily add extra logging to track token flow:
   ```javascript
   console.log('🐛 Token Check:', { userId, serviceType, hasTokens });
   console.log('🐛 Token Deduction:', { before, after, cost });
   ```

3. **Database Queries**: Keep these handy for manual testing:
   ```sql
   -- Set test user to 0 tokens
   UPDATE users SET tokens_balance = 0 WHERE email = 'test@example.com';

   -- View recent transactions
   SELECT * FROM token_transactions ORDER BY created_at DESC LIMIT 10;

   -- Check user balance
   SELECT email, tokens_balance FROM users WHERE email = 'test@example.com';
   ```

### Common Pitfalls

1. **Forgetting to await**: Token operations are async - always use `await`
2. **Not checking for user ID**: Always verify userId exists before token operations
3. **Deducting before operation succeeds**: Only deduct tokens AFTER successful operation
4. **Not handling errors**: Token deduction failures shouldn't break the user experience

### Performance Optimization

1. **Cache token balances**: Consider caching in Redis for high-traffic scenarios
2. **Batch deductions**: For bulk operations, consider batching token deductions
3. **Async logging**: Token transaction logging can be async to not block responses

---

**Last Updated**: November 3, 2025
**Version**: 1.0
**Status**: Ready for Implementation

**Questions?** Open an issue or contact the development team.

🚀 **Ready to implement? Start with Phase 1!**
