# Multi-Tenant Token System Enhancement Plan

**Created**: November 3, 2025
**Status**: Implementation Ready
**Priority**: High - Revenue Critical

---

## EXECUTIVE SUMMARY

RinglyPro CRM has a **90% complete token billing system** that needs:
1. Activation (mount routes)
2. Service integration for token deduction
3. Multi-tenant user consumption tracking
4. Low balance notifications
5. CRM lockout mechanism for zero balance
6. Enhanced monthly free token allocation (100 tokens/user)

**Current State**: Token system built but not active. Legacy credit system handles voice services.

**Goal**: Complete multi-tenant token billing with consumption tracking across all services and user protection mechanisms.

---

## I. CURRENT SYSTEM ANALYSIS

### What's Already Built

#### 1. Token Service (`src/services/tokenService.js`)
- ✅ Transaction-safe token deduction
- ✅ Monthly reset with rollover
- ✅ Usage analytics and history
- ✅ Low balance detection
- ✅ 100 free tokens per user/month

#### 2. Token API Routes (`src/routes/tokens.js`)
- ✅ Balance checking
- ✅ Usage history
- ✅ Stripe purchase integration
- ✅ Analytics endpoints
- ❌ **NOT MOUNTED IN APP.JS** (critical fix)

#### 3. Database Schema (`migrations/add-token-system.sql`)
- ✅ User token balance columns
- ✅ Transaction logging table
- ✅ Purchase history table
- ✅ Monthly reset automation
- ✅ Analytics views

#### 4. Multi-Tenant Architecture
```
User (JWT auth) → Token Balance
  ↓
Client → Voice Credits (legacy)
  ↓
GHL Integration → API calls
```

### What Needs Building

#### 1. Service Integration (Token Deduction)
- ❌ Inbound call handling
- ❌ Outbound call system
- ❌ MCP AI Agent (chat, queries)
- ❌ Social Media AI content generation
- ❌ Social Media AI image generation (DALL-E)
- ❌ Email Marketing (SendGrid)
- ❌ Business Collector
- ❌ Single outbound calls
- ❌ Prospect Manager Automated Calling

#### 2. Notification System
- ❌ Low balance CRM alerts (75%, 50%, 25%)
- ❌ Email notifications
- ❌ SMS notifications (critical only)
- ❌ In-app notification component

#### 3. CRM Lockout System
- ❌ Zero balance detection
- ❌ CRM UI lockout overlay
- ❌ Recharge prompt with Stripe
- ❌ Service whitelisting (read-only access)

#### 4. Frontend Token Display
- ❌ Dashboard balance widget
- ❌ Real-time usage updates
- ❌ Purchase modal
- ❌ Usage history page

---

## II. TOKEN DEDUCTION MAPPING

### Service-by-Service Token Costs

| Service | Action | Tokens | File Location | Integration Point |
|---------|--------|--------|---------------|-------------------|
| **Inbound Calls** | Per minute | 5 | `src/routes/twilio-voice.js` | `/voice` webhook |
| **Outbound Calls** | Per minute | 5 | `src/routes/twilio-voice.js` | `/outbound-call` endpoint |
| **Outbound Campaigns** | Per 100 calls | 50 | `src/services/outbound-caller.js` | `startCampaign()` |
| **Single Outbound** | Per call | 1 | `src/routes/outbound-caller.js` | POST `/start-campaign` |
| **MCP AI Chat** | Per message | 1 | `src/routes/mcp.js` (conditional) | Chat endpoint |
| **MCP GHL Query** | Per query | 2 | `src/routes/mcp.js` | Query endpoint |
| **Social AI Content** | Per post | 10 | `src/routes/ai.js` | POST `/generate-content` |
| **Social AI Image** | Per image | 10 | `src/routes/ai.js` | POST `/generate-image` |
| **Email Sent** | Per email | 2 | `src/services/emailService.js` | Future marketing emails |
| **Business Collector** | Per 100 leads | 20 | Integration needed | Collection endpoint |
| **CSV Export** | Per export | 5 | Integration needed | Export endpoint |
| **Prospect Manager** | Per 100 calls | 50 | Integration needed | Scheduler endpoint |

### Monthly Free Allocation
- **100 tokens per user** (already configured in `tokenService.js`)
- Resets automatically via `reset_monthly_tokens()` SQL function
- Rollover depends on package tier

---

## III. IMPLEMENTATION PHASES

### Phase 1: Foundation (Week 1)
**Goal**: Activate token system and test basic flow

#### Tasks
1. **Mount Token Routes** (30 minutes)
   - File: `src/app.js`
   - Add after line 127:
   ```javascript
   const tokenRoutes = require('./routes/tokens');
   app.use('/api/tokens', tokenRoutes);
   console.log('💰 Token API routes mounted at /api/tokens');
   ```

2. **Verify Database Migration** (1 hour)
   - Run `migrations/add-token-system.sql` on production DB
   - Verify all users have 100 initial tokens
   - Test monthly reset function

3. **Test Token API** (2 hours)
   - Test GET `/api/tokens/balance`
   - Test GET `/api/tokens/pricing`
   - Test POST `/api/tokens/purchase` (Stripe sandbox)
   - Verify transaction logging

4. **Create Token Middleware** (3 hours)
   - File: `src/middleware/tokenAuth.js` (new)
   - Functions:
     - `checkTokensForService(serviceType)` - Middleware to check balance
     - `deductTokensAfter(serviceType, getMetadata)` - Post-action deduction
     - `requireMinimumBalance(tokens)` - Route protection

### Phase 2: Core Service Integration (Week 2-3)
**Goal**: Integrate token deduction into high-usage services

#### Task 1: AI Image Generation (Priority 1)
- **File**: `src/routes/ai.js`
- **Endpoint**: POST `/generate-image`
- **Implementation**:
  ```javascript
  // Before DALL-E call
  const hasTokens = await tokenService.hasEnoughTokens(req.user.userId, 'ai_image_generation');
  if (!hasTokens.hasEnough) {
    return res.status(402).json({ error: 'Insufficient tokens' });
  }

  // Generate image...

  // After success
  await tokenService.deductTokens(req.user.userId, 'ai_image_generation', {
    prompt: prompt,
    imageUrl: imageUrl
  });
  ```

#### Task 2: AI Content Generation
- **File**: `src/routes/ai.js`
- **Endpoint**: POST `/generate-content`
- **Token Cost**: 10 tokens per post
- **Same pattern as image generation**

#### Task 3: Outbound Calling System
- **File**: `src/services/outbound-caller.js`
- **Method**: `startCampaign()`
- **Implementation**:
  ```javascript
  // Calculate token cost
  const callsToMake = leads.length;
  const tokensNeeded = Math.ceil(callsToMake / 100) * 50;

  // Check balance
  const hasTokens = await tokenService.hasEnoughTokens(userId, 'outbound_campaign_100', tokensNeeded);
  if (!hasTokens.hasEnough) {
    throw new Error(`Insufficient tokens. Need ${tokensNeeded}, have ${hasTokens.balance}`);
  }

  // Start campaign...

  // Deduct after completion
  await tokenService.deductTokens(userId, 'outbound_campaign_100', {
    campaign_id: campaignId,
    calls_made: callsCompleted,
    leads_count: leads.length
  });
  ```

#### Task 4: Single Outbound Calls
- **File**: `src/routes/outbound-caller.js`
- **Endpoint**: POST `/start-campaign` (single call mode)
- **Token Cost**: 1 token per call

#### Task 5: Inbound Call Tracking
- **File**: `src/routes/twilio-voice.js`
- **Webhook**: POST `/voice`
- **Implementation**:
  - Track call start time
  - Calculate duration on call end
  - Deduct tokens based on minutes (5 tokens/minute)
  - Handle partial minutes (round up)

#### Task 6: MCP AI Copilot (if exists)
- **File**: `src/routes/mcp.js` (conditionally loaded)
- **Endpoints**: Chat and query endpoints
- **Token Costs**:
  - Chat message: 1 token
  - GHL query: 2 tokens
  - Data analysis: 5 tokens

### Phase 3: Notification System (Week 3-4)
**Goal**: Alert users before and when tokens run low

#### Task 1: Create Notification Service
- **File**: `src/services/notificationService.js` (new)
- **Functions**:
  ```javascript
  class NotificationService {
    async sendLowBalanceAlert(userId, balance, threshold) {
      // Email via SendGrid
      // SMS via Twilio (if critical)
      // In-app notification
    }

    async sendZeroBalanceAlert(userId) {
      // Urgent notification
      // Lock CRM access
    }

    async sendTokenPurchaseConfirmation(userId, purchase) {
      // Email receipt
    }

    async sendMonthlyResetSummary(userId, stats) {
      // Monthly usage report
    }
  }
  ```

#### Task 2: Implement Low Balance Thresholds
- **File**: `src/services/tokenService.js` (enhance)
- **Thresholds**:
  - 75 tokens remaining (75%): Info notification
  - 50 tokens remaining (50%): Warning notification
  - 25 tokens remaining (25%): Critical notification
  - 10 tokens remaining: Urgent notification + email
  - 0 tokens: Lock CRM + SMS alert

- **Implementation**:
  ```javascript
  async deductTokens(userId, serviceType, metadata = {}) {
    // Existing deduction logic...

    // After deduction, check threshold
    const newBalance = user.tokens_balance;
    const thresholds = [75, 50, 25, 10, 0];

    for (const threshold of thresholds) {
      if (newBalance === threshold) {
        await notificationService.sendLowBalanceAlert(userId, newBalance, threshold);
      }
    }

    // If zero balance, trigger lockout
    if (newBalance === 0) {
      await this.lockUserAccess(userId);
    }
  }
  ```

#### Task 3: Email Templates
- **File**: `src/services/emailService.js` (enhance)
- **Templates**:
  1. Low balance warning (25 tokens)
  2. Critical balance (10 tokens)
  3. Zero balance lockout
  4. Purchase confirmation
  5. Monthly usage summary

#### Task 4: In-App Notification Component
- **File**: `public/js/notifications.js` (new)
- **Features**:
  - Real-time balance display
  - Alert badges
  - Toast notifications
  - Notification history

### Phase 4: CRM Lockout System (Week 4-5)
**Goal**: Gracefully lock CRM when tokens reach zero

#### Task 1: Lockout Middleware
- **File**: `src/middleware/tokenAuth.js` (enhance)
- **Function**:
  ```javascript
  async function requireTokens(req, res, next) {
    const userId = req.user.userId;
    const balance = await tokenService.getBalance(userId);

    if (balance.tokens_balance <= 0) {
      // Check if route is whitelisted (read-only)
      if (isWhitelistedRoute(req.path)) {
        return next();
      }

      // Block write operations
      return res.status(402).json({
        error: 'Token balance depleted',
        message: 'Please purchase tokens to continue using RinglyPro CRM',
        balance: 0,
        purchaseUrl: '/api/tokens/purchase'
      });
    }

    next();
  }

  function isWhitelistedRoute(path) {
    const readOnlyRoutes = [
      '/api/tokens/balance',
      '/api/tokens/pricing',
      '/api/tokens/purchase',
      '/api/users/profile',
      '/dashboard' // View only
    ];
    return readOnlyRoutes.some(route => path.startsWith(route));
  }
  ```

#### Task 2: Frontend Lockout Overlay
- **File**: `public/js/tokenLockout.js` (new)
- **Features**:
  - Full-screen modal when balance hits zero
  - Display current balance (0)
  - Show token packages
  - Direct Stripe purchase flow
  - Prevent modal dismissal until purchase
  - Disable all action buttons

- **Implementation**:
  ```javascript
  class TokenLockoutModal {
    constructor() {
      this.checkBalance();
      setInterval(() => this.checkBalance(), 60000); // Check every minute
    }

    async checkBalance() {
      const response = await fetch('/api/tokens/balance');
      const data = await response.json();

      if (data.tokens_balance <= 0) {
        this.showLockout();
      }
    }

    showLockout() {
      // Create modal overlay
      // Disable all CRM actions
      // Show purchase options
      // Handle Stripe payment
      // Refresh on success
    }
  }
  ```

#### Task 3: Service-Level Lockout
- **Files**: All service routes
- **Implementation**:
  - Apply `requireTokens` middleware to all write operations
  - Allow read-only access (view contacts, view dashboard)
  - Block:
    - Making calls
    - Sending emails/SMS
    - Using AI features
    - Creating/editing records
    - Exporting data

#### Task 4: Stripe Integration for Recharge
- **File**: `src/routes/tokens.js` (already exists)
- **Enhancements**:
  - Quick recharge button in lockout modal
  - One-click package selection
  - Instant balance update after payment
  - Auto-unlock CRM on successful purchase

### Phase 5: Frontend Token Display (Week 5-6)
**Goal**: Show token balance and usage throughout CRM

#### Task 1: Dashboard Balance Widget
- **File**: `public/dashboard.html` (enhance)
- **Widget Features**:
  ```html
  <div id="token-balance-widget">
    <div class="token-amount">
      <span class="balance">{{ tokens_balance }}</span>
      <span class="label">Tokens</span>
    </div>
    <div class="token-status">
      <div class="progress-bar" data-percentage="{{ percentage }}"></div>
    </div>
    <div class="token-actions">
      <button onclick="viewUsage()">Usage History</button>
      <button onclick="purchaseTokens()">Buy Tokens</button>
    </div>
  </div>
  ```

#### Task 2: Real-Time Balance Updates
- **File**: `public/js/tokenWidget.js` (new)
- **Features**:
  - WebSocket or polling for balance updates
  - Smooth number animations
  - Color-coded status (green/yellow/red)
  - Usage trend graph

#### Task 3: Token Purchase Modal
- **File**: `public/js/tokenPurchase.js` (new)
- **Features**:
  - Display all packages (Starter, Growth, Professional)
  - Stripe Checkout integration
  - Recommended package highlight
  - Savings calculator

#### Task 4: Usage History Page
- **File**: `public/token-usage.html` (new)
- **Features**:
  - Paginated transaction history
  - Filter by service type
  - Date range selector
  - Export to CSV
  - Usage analytics graphs

---

## IV. MULTI-TENANT CONSIDERATIONS

### User vs Client Architecture

**Current Design** (Recommended):
```
User (Token Owner)
  ↓
  Token Balance → Deductions across all services
  ↓
Client (Voice Services) → Legacy credit system (gradual migration)
```

**Benefits**:
- User-level billing aligns with authentication
- One token balance per user (simpler)
- Can support multiple clients per user (future)
- Clean separation from legacy voice credits

### Multi-Client Scenarios

**Case 1**: User manages multiple clients
- **Solution**: User's single token balance covers all clients
- **Benefit**: Simplified billing
- **Tracking**: Metadata in `token_transactions` includes `client_id`

**Case 2**: Multiple users per client (team accounts)
- **Solution**: Each user has own token balance
- **Future Enhancement**: Shared team token pool (Phase 6)

### Data Isolation
- ✅ User authentication via JWT
- ✅ Token balance tied to user ID
- ✅ Transaction history filtered by user ID
- ✅ Client-specific data segregated in queries

---

## V. TOKEN DEDUCTION IMPLEMENTATION PATTERNS

### Pattern 1: Pre-Check + Post-Deduct (Recommended)

**When to Use**: Operations that may fail or be long-running

```javascript
// Step 1: Check before operation
const hasTokens = await tokenService.hasEnoughTokens(userId, 'ai_image_generation');
if (!hasTokens.hasEnough) {
  return res.status(402).json({
    error: 'Insufficient tokens',
    required: hasTokens.required,
    balance: hasTokens.balance
  });
}

// Step 2: Perform operation
const result = await generateImage(prompt);

// Step 3: Deduct only on success
await tokenService.deductTokens(userId, 'ai_image_generation', {
  prompt: prompt,
  imageUrl: result.url
});

return res.json({ success: true, result });
```

**Use Cases**:
- AI image generation (may fail)
- Outbound calling campaigns (long-running)
- Email campaigns (may fail)

### Pattern 2: Immediate Deduct + Refund on Failure

**When to Use**: Operations that rarely fail

```javascript
// Step 1: Deduct immediately
const transaction = await tokenService.deductTokens(userId, 'email_sent', { to: email });

try {
  // Step 2: Perform operation
  await sendEmail(email, content);

  return res.json({ success: true });
} catch (error) {
  // Step 3: Refund on failure
  await tokenService.addTokens(userId, transaction.tokens_used, 'refund', {
    original_transaction_id: transaction.id,
    reason: error.message
  });

  throw error;
}
```

**Use Cases**:
- SMS sending (reliable)
- Simple API calls

### Pattern 3: Consumption-Based Deduction

**When to Use**: Services charged by usage amount (time, quantity)

```javascript
// Step 1: Track operation start
const startTime = Date.now();
const callStarted = await startPhoneCall(phoneNumber);

// Step 2: Track operation end
callStarted.on('completed', async (callData) => {
  const durationMinutes = Math.ceil(callData.duration / 60);
  const tokenCost = durationMinutes * 5; // 5 tokens per minute

  // Step 3: Deduct based on actual usage
  await tokenService.deductTokens(userId, 'voice_outbound_minute', {
    call_sid: callData.sid,
    duration_minutes: durationMinutes,
    tokens_per_minute: 5
  }, tokenCost); // Pass custom amount
});
```

**Use Cases**:
- Phone calls (per minute)
- API rate limiting (per request)
- Data processing (per record)

### Pattern 4: Batch Deduction

**When to Use**: Operations on multiple items

```javascript
// Calculate total cost
const leadCount = leads.length;
const batchSize = 100;
const batches = Math.ceil(leadCount / batchSize);
const totalTokens = batches * 50; // 50 tokens per 100 leads

// Check total before starting
const hasTokens = await tokenService.hasEnoughTokens(userId, 'outbound_campaign_100', totalTokens);
if (!hasTokens.hasEnough) {
  return res.status(402).json({ error: 'Insufficient tokens for campaign' });
}

// Process in batches
let processed = 0;
for (let i = 0; i < leads.length; i += batchSize) {
  const batch = leads.slice(i, i + batchSize);
  await processBatch(batch);
  processed += batch.length;

  // Deduct per batch
  await tokenService.deductTokens(userId, 'outbound_campaign_100', {
    batch_number: Math.floor(i / batchSize) + 1,
    leads_in_batch: batch.length,
    total_leads: leadCount
  });
}
```

**Use Cases**:
- Business collector (100 leads)
- Bulk email campaigns
- Mass SMS sending

---

## VI. NOTIFICATION IMPLEMENTATION DETAILS

### Notification Triggers

#### 1. Balance Thresholds
```javascript
const NOTIFICATION_THRESHOLDS = {
  INFO: 75,      // 75% of free tier (75 tokens)
  WARNING: 50,   // 50% remaining
  CRITICAL: 25,  // 25% remaining
  URGENT: 10,    // 10 tokens left
  LOCKOUT: 0     // Zero balance
};

async function checkAndNotify(userId, newBalance) {
  const user = await User.findByPk(userId);
  const lastNotified = user.last_balance_notification || 0;

  // Only notify once per threshold (don't spam)
  for (const [level, threshold] of Object.entries(NOTIFICATION_THRESHOLDS)) {
    if (newBalance === threshold && lastNotified !== threshold) {
      await sendNotification(userId, level, newBalance);
      await user.update({ last_balance_notification: threshold });
      break;
    }
  }
}
```

#### 2. Post-Deduction Check
```javascript
// In tokenService.deductTokens()
const newBalance = user.tokens_balance - tokensToDeduct;

// Update balance
await user.update({ tokens_balance: newBalance });

// Check for notifications
await checkAndNotify(userId, newBalance);
```

### Notification Channels

#### Email Notifications (SendGrid)

**Template: Low Balance Warning (25 tokens)**
```javascript
async function sendLowBalanceEmail(user, balance) {
  const template = {
    to: user.email,
    from: 'noreply@ringlypro.com',
    subject: `Token Balance Low: ${balance} tokens remaining`,
    html: `
      <h2>Your RinglyPro token balance is running low</h2>
      <p>Hi ${user.first_name},</p>
      <p>You have <strong>${balance} tokens</strong> remaining.</p>
      <p>To avoid service interruption, please purchase more tokens:</p>
      <a href="https://aiagent.ringlypro.com/purchase-tokens">Buy Tokens Now</a>
    `
  };

  await emailService.send(template);
}
```

**Template: Zero Balance Lockout**
```javascript
async function sendZeroBalanceEmail(user) {
  const template = {
    to: user.email,
    from: 'noreply@ringlypro.com',
    subject: 'URGENT: RinglyPro CRM Access Suspended - Token Balance Depleted',
    html: `
      <h2 style="color: red;">Your CRM access has been suspended</h2>
      <p>Hi ${user.first_name},</p>
      <p>Your token balance has reached zero and your CRM access is now limited to read-only mode.</p>
      <p><strong>Purchase tokens immediately to restore full access:</strong></p>
      <a href="https://aiagent.ringlypro.com/purchase-tokens" style="...">Recharge Now</a>
    `
  };

  await emailService.send(template);
}
```

#### SMS Notifications (Twilio - Critical Only)

**Only send SMS for zero balance lockout**:
```javascript
async function sendZeroBalanceSMS(user) {
  const message = `RinglyPro URGENT: Your token balance is depleted. CRM access limited. Recharge now: https://aiagent.ringlypro.com/purchase-tokens`;

  await twilioClient.messages.create({
    to: user.business_phone,
    from: process.env.TWILIO_PHONE_NUMBER,
    body: message
  });
}
```

#### In-App Notifications

**Notification Banner Component**:
```javascript
class TokenNotificationBanner {
  constructor() {
    this.container = document.getElementById('notification-banner');
  }

  show(level, balance) {
    const config = {
      INFO: { color: 'blue', icon: 'ℹ️', message: `You have ${balance} tokens remaining` },
      WARNING: { color: 'yellow', icon: '⚠️', message: `Token balance low: ${balance} tokens` },
      CRITICAL: { color: 'orange', icon: '🔥', message: `CRITICAL: Only ${balance} tokens left!` },
      URGENT: { color: 'red', icon: '🚨', message: `URGENT: ${balance} tokens remaining - Purchase now!` },
      LOCKOUT: { color: 'red', icon: '🔒', message: `CRM LOCKED: Zero tokens - Recharge required` }
    };

    const { color, icon, message } = config[level];

    this.container.innerHTML = `
      <div class="alert alert-${color}">
        <span class="icon">${icon}</span>
        <span class="message">${message}</span>
        <button onclick="window.location.href='/purchase-tokens'">Buy Tokens</button>
      </div>
    `;
    this.container.style.display = 'block';
  }
}
```

### Notification Frequency

**Rules to prevent spam**:
1. Only notify once per threshold level
2. Track last notification in `users.last_balance_notification`
3. Don't re-notify if balance increases then decreases to same level
4. Reset notification tracking on token purchase
5. Monthly summary email (not a warning)

---

## VII. CRM LOCKOUT IMPLEMENTATION

### Frontend Lockout Overlay

**File**: `public/js/tokenLockout.js`

```javascript
class CRMLockout {
  constructor() {
    this.modal = null;
    this.checkInterval = null;
    this.init();
  }

  init() {
    // Check balance every 30 seconds
    this.checkBalance();
    this.checkInterval = setInterval(() => this.checkBalance(), 30000);

    // Listen for token deduction events
    document.addEventListener('tokenDeducted', () => this.checkBalance());
  }

  async checkBalance() {
    try {
      const response = await fetch('/api/tokens/balance', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();

      if (data.tokens_balance <= 0) {
        this.showLockout();
      } else if (data.tokens_balance <= 10) {
        this.showWarning(data.tokens_balance);
      }
    } catch (error) {
      console.error('Failed to check token balance:', error);
    }
  }

  showLockout() {
    if (this.modal) return; // Already showing

    // Create overlay
    this.modal = document.createElement('div');
    this.modal.className = 'crm-lockout-overlay';
    this.modal.innerHTML = `
      <div class="lockout-modal">
        <div class="lockout-icon">🔒</div>
        <h1>CRM Access Suspended</h1>
        <p>Your token balance has reached zero.</p>
        <p>Purchase tokens to restore full access to RinglyPro CRM.</p>

        <div class="token-packages">
          ${this.renderPackages()}
        </div>

        <div class="lockout-info">
          <p>✅ You can still view your dashboard and contacts</p>
          <p>❌ All actions (calls, AI, emails) are disabled</p>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);
    this.disableActions();
  }

  renderPackages() {
    const packages = [
      { name: 'Starter', tokens: 500, price: 29, recommended: false },
      { name: 'Growth', tokens: 2000, price: 99, recommended: true },
      { name: 'Professional', tokens: 7500, price: 299, recommended: false }
    ];

    return packages.map(pkg => `
      <div class="package ${pkg.recommended ? 'recommended' : ''}">
        ${pkg.recommended ? '<span class="badge">RECOMMENDED</span>' : ''}
        <h3>${pkg.name}</h3>
        <div class="tokens">${pkg.tokens} Tokens</div>
        <div class="price">$${pkg.price}</div>
        <button onclick="crmLockout.purchase('${pkg.name}')">
          Purchase Now
        </button>
      </div>
    `).join('');
  }

  async purchase(packageName) {
    try {
      // Call Stripe purchase endpoint
      const response = await fetch('/api/tokens/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ package: packageName })
      });

      const data = await response.json();

      // Redirect to Stripe Checkout
      window.location.href = data.checkout_url;
    } catch (error) {
      alert('Failed to initiate purchase. Please try again.');
    }
  }

  disableActions() {
    // Disable all action buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.disabled = true;
      btn.title = 'Purchase tokens to enable this action';
    });

    // Disable form submissions
    document.querySelectorAll('form').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Purchase tokens to perform this action');
      });
    });
  }

  showWarning(balance) {
    // Show sticky warning banner
    const banner = document.getElementById('low-token-banner');
    if (banner) {
      banner.innerHTML = `
        ⚠️ Low Token Balance: ${balance} tokens remaining
        <button onclick="window.location.href='/purchase-tokens'">Buy More</button>
      `;
      banner.style.display = 'block';
    }
  }
}

// Initialize on page load
const crmLockout = new CRMLockout();
```

### Backend Lockout Enforcement

**Middleware**: `src/middleware/tokenAuth.js`

```javascript
const tokenService = require('../services/tokenService');

// List of routes that remain accessible with zero balance
const WHITELISTED_ROUTES = [
  // Token management
  '/api/tokens/balance',
  '/api/tokens/pricing',
  '/api/tokens/purchase',
  '/api/tokens/purchases',

  // User profile (read-only)
  '/api/users/profile',
  '/api/users/settings',

  // Dashboard (view only)
  '/api/dashboard/stats',

  // Auth
  '/api/auth/logout',
  '/api/auth/refresh'
];

async function requireTokens(req, res, next) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if route is whitelisted
    if (WHITELISTED_ROUTES.some(route => req.path.startsWith(route))) {
      return next();
    }

    // Check token balance
    const balance = await tokenService.getBalance(userId);

    if (balance.tokens_balance <= 0) {
      return res.status(402).json({
        error: 'Token balance depleted',
        message: 'Your token balance has reached zero. Please purchase tokens to continue.',
        balance: 0,
        packages: await tokenService.getPackagePricing(),
        purchaseUrl: '/api/tokens/purchase'
      });
    }

    // Attach balance to request for logging
    req.tokenBalance = balance.tokens_balance;
    next();

  } catch (error) {
    console.error('Token auth error:', error);
    next(error);
  }
}

// Check if user has enough tokens for specific service
function checkTokensForService(serviceType) {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const check = await tokenService.hasEnoughTokens(userId, serviceType);

      if (!check.hasEnough) {
        return res.status(402).json({
          error: 'Insufficient tokens',
          service: serviceType,
          required: check.required,
          balance: check.balance,
          shortfall: check.required - check.balance
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requireTokens,
  checkTokensForService
};
```

### Applying Lockout to Routes

**Example**: `src/routes/ai.js`

```javascript
const { requireTokens, checkTokensForService } = require('../middleware/tokenAuth');

// Apply to all AI routes
router.use(requireTokens);

// Check specific service tokens before operation
router.post('/generate-image',
  checkTokensForService('ai_image_generation'),
  async (req, res) => {
    // Generate image...
    // Deduct tokens...
  }
);

router.post('/generate-content',
  checkTokensForService('social_post'),
  async (req, res) => {
    // Generate content...
    // Deduct tokens...
  }
);
```

---

## VIII. TESTING STRATEGY

### Unit Tests

**File**: `tests/services/tokenService.test.js`

```javascript
describe('Token Service', () => {
  describe('hasEnoughTokens', () => {
    it('should return true when user has sufficient balance');
    it('should return false when user has insufficient balance');
    it('should calculate correct token cost for service');
  });

  describe('deductTokens', () => {
    it('should deduct tokens and create transaction record');
    it('should update tokens_used_this_month');
    it('should trigger low balance notification at threshold');
    it('should prevent negative balance');
    it('should rollback on transaction failure');
  });

  describe('addTokens', () => {
    it('should add tokens from purchase');
    it('should handle refunds correctly');
  });

  describe('monthly reset', () => {
    it('should reset tokens_used_this_month on new billing cycle');
    it('should apply rollover based on package');
  });
});
```

### Integration Tests

**File**: `tests/integration/tokenFlow.test.js`

```javascript
describe('Token Flow Integration', () => {
  it('should deduct tokens when generating AI image');
  it('should prevent operation when insufficient tokens');
  it('should send notification at 25 token threshold');
  it('should lock CRM when balance reaches zero');
  it('should restore access after token purchase');
  it('should track usage across multiple services');
});
```

### Manual Testing Checklist

#### Phase 1: Basic Flow
- [ ] Mount routes and verify endpoints respond
- [ ] Create test user with 100 tokens
- [ ] Check balance via API
- [ ] Purchase token package (sandbox)
- [ ] Verify transaction logged

#### Phase 2: Service Integration
- [ ] Generate AI image and verify token deduction
- [ ] Generate AI content and verify deduction
- [ ] Make outbound call and verify deduction
- [ ] Start call campaign and verify batch deduction
- [ ] Test insufficient balance rejection

#### Phase 3: Notifications
- [ ] Manually set balance to 25 and trigger notification
- [ ] Verify email received
- [ ] Set balance to 0 and verify SMS sent (if configured)
- [ ] Check in-app banner displays correctly

#### Phase 4: Lockout
- [ ] Set balance to 0
- [ ] Verify lockout modal appears
- [ ] Confirm all action buttons disabled
- [ ] Verify read-only routes still accessible
- [ ] Purchase tokens and verify unlock

#### Phase 5: Multi-Tenant
- [ ] Test with multiple users
- [ ] Verify token balances isolated per user
- [ ] Test concurrent token deductions
- [ ] Verify transaction history filtering

---

## IX. DEPLOYMENT PLAN

### Pre-Deployment

1. **Backup Database**
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   ```

2. **Review Migration**
   - Verify `migrations/add-token-system.sql` is correct
   - Test on staging environment first (if available)
   - Prepare rollback script

3. **Environment Variables**
   - Ensure `STRIPE_SECRET_KEY` is set
   - Ensure `SENDGRID_API_KEY` is set
   - Verify `JWT_SECRET` is set

### Deployment Steps

#### Step 1: Deploy Code (No Database Changes Yet)
```bash
git add .
git commit -m "Add multi-tenant token system with service integration"
git push origin main
```

#### Step 2: Run Database Migration (Render Dashboard)
1. Go to Render → Database
2. Click "Run SQL"
3. Paste contents of `migrations/add-token-system.sql`
4. Execute
5. Verify:
   ```sql
   SELECT COUNT(*) FROM users WHERE tokens_balance = 100;
   -- Should return count of all users
   ```

#### Step 3: Verify Token Routes
```bash
curl https://aiagent.ringlypro.com/api/tokens/pricing
# Should return package pricing
```

#### Step 4: Test with Real User
1. Log in as test user
2. Check balance: Should show 100 tokens
3. Generate AI image
4. Verify balance decreased by 10 tokens
5. Check transaction history

#### Step 5: Monitor Logs
```bash
# Watch Render logs for errors
# Monitor Stripe webhook events
# Check email delivery (SendGrid dashboard)
```

### Rollback Plan

If issues occur:

1. **Rollback Code**:
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Rollback Database** (if needed):
   ```sql
   -- Drop new tables
   DROP TABLE IF EXISTS token_transactions CASCADE;
   DROP TABLE IF EXISTS token_purchases CASCADE;
   DROP VIEW IF EXISTS token_usage_summary CASCADE;
   DROP FUNCTION IF EXISTS reset_monthly_tokens() CASCADE;

   -- Remove columns from users table
   ALTER TABLE users
     DROP COLUMN IF EXISTS tokens_balance,
     DROP COLUMN IF EXISTS tokens_used_this_month,
     DROP COLUMN IF EXISTS token_package,
     DROP COLUMN IF EXISTS tokens_rollover,
     DROP COLUMN IF EXISTS billing_cycle_start,
     DROP COLUMN IF EXISTS last_token_reset;
   ```

### Post-Deployment Monitoring

**Week 1**: Monitor closely
- Check error logs daily
- Monitor Stripe payment success rate
- Verify token deductions are accurate
- Check notification delivery

**Week 2-4**: Normal monitoring
- Weekly review of token usage analytics
- Customer feedback on pricing
- Adjust thresholds if needed

---

## X. MIGRATION FROM CREDIT SYSTEM

### Gradual Migration Strategy (Recommended)

#### Phase 1: Parallel Systems (Months 1-3)
- Keep credit system for voice/SMS
- Use token system for new services (AI, marketing)
- Users see both balances in dashboard
- No confusion: Clear labeling

#### Phase 2: Voice Migration (Months 4-6)
- Announce migration timeline
- Convert existing credits to tokens (1 credit = 1 token)
- Offer bonus tokens for early adopters
- Migrate inbound/outbound calls to tokens
- Keep SMS on credits temporarily

#### Phase 3: SMS Migration (Months 7-9)
- Migrate SMS to token system
- Deprecate credit system
- Remove credit-related code
- Single unified billing

#### Phase 4: Full Token System (Month 10+)
- All services on tokens
- Simplified user experience
- Enhanced analytics across all services

### Conversion Rate

**Recommended**: 1 credit minute = 5 tokens

Example:
- User has 50 credit minutes remaining
- Converts to 250 tokens
- Plus 50 bonus tokens (conversion incentive)
- Total: 300 tokens

---

## XI. COST ANALYSIS

### Token Pricing vs. Service Costs

#### Current Token Costs (to be adjusted based on actual costs)

| Service | Tokens | Est. Cost to RinglyPro | Token Value | Margin |
|---------|--------|------------------------|-------------|--------|
| AI Image (DALL-E) | 10 | ~$0.04 (1024x1024) | $1.00 | ~96% |
| AI Content (GPT-4) | 10 | ~$0.02 (500 tokens) | $1.00 | ~98% |
| AI Chat Message | 1 | ~$0.002 (100 tokens) | $0.10 | ~98% |
| Outbound Call (per min) | 5 | ~$0.02 (Twilio) | $0.50 | ~96% |
| Inbound Call (per min) | 5 | ~$0.01 (Twilio) | $0.50 | ~98% |
| SMS | 3 | ~$0.0079 | $0.30 | ~97% |
| Email | 2 | ~$0.001 (SendGrid) | $0.20 | ~99.5% |

**Token Value**: 1 token = $0.10 (based on Starter package $29/500 = $0.058, Growth $99/2000 = $0.0495)

**Margins are healthy** - System is profitable even with 100 free tokens/month

#### Monthly Free Tier Analysis

**100 Free Tokens = $10 value**

Usage scenarios:
- **Light User**: 10 AI chats + 5 calls = 60 tokens (within free tier)
- **Moderate User**: 5 images + 10 calls + 20 chats = 120 tokens (needs $2 purchase)
- **Heavy User**: 10 images + 50 calls + 50 chats = 400 tokens (needs Starter package)

**Recommendation**: 100 tokens is appropriate for free tier. Encourages usage without giving away too much.

---

## XII. SUCCESS METRICS

### Key Performance Indicators (KPIs)

#### Business Metrics
- **Token Purchase Rate**: % of users who purchase tokens
- **Average Revenue Per User (ARPU)**: Monthly token purchases
- **Conversion Rate**: Free tier → Paid tier
- **Churn Rate**: Users who stop using after hitting limit

#### Technical Metrics
- **Token Deduction Accuracy**: 100% (no missed deductions)
- **API Response Time**: <500ms for balance checks
- **Payment Success Rate**: >95% (Stripe)
- **Notification Delivery**: >98% (SendGrid)

#### User Experience Metrics
- **Time to Zero Balance**: Average days to hit 0 tokens
- **Lockout Recovery Time**: Time from lockout to purchase
- **Support Tickets**: Token-related issues
- **User Satisfaction**: Surveys on pricing clarity

### Monitoring Dashboard

Create admin dashboard showing:
- Total tokens in circulation
- Tokens purchased (daily/weekly/monthly)
- Top consuming services
- Users approaching zero balance
- Revenue from token sales
- Average tokens per user

---

## XIII. DOCUMENTATION REQUIREMENTS

### For Developers

1. **API Documentation**
   - File: `docs/TOKEN_API_REFERENCE.md`
   - All token endpoints
   - Request/response examples
   - Error codes
   - Rate limits

2. **Service Integration Guide**
   - File: `docs/INTEGRATING_TOKEN_DEDUCTION.md`
   - Patterns for adding token checks
   - Code examples
   - Testing guidelines

3. **Database Schema**
   - File: `docs/TOKEN_DATABASE_SCHEMA.md`
   - Table descriptions
   - Relationships
   - Indexes
   - Views

### For Users

1. **Token System Guide**
   - File: `docs/USER_TOKEN_GUIDE.md`
   - What are tokens?
   - How to purchase
   - Usage tracking
   - Monthly free allocation

2. **Pricing Page**
   - File: `public/pricing.html`
   - Clear token costs
   - Package comparison
   - FAQ section

3. **In-App Help**
   - Tooltips on token balance widget
   - Help link in lockout modal
   - Usage history explanations

---

## XIV. RISK MITIGATION

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race conditions in token deduction | High | Use database transactions, row-level locking |
| Failed Stripe payments | Medium | Webhook verification, manual reconciliation |
| Token calculation errors | High | Comprehensive unit tests, audit logs |
| Database migration failure | Critical | Backup before migration, rollback script ready |
| Service outage during deduction | Medium | Queue-based retry mechanism |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| User backlash on pricing | Medium | Communicate value clearly, generous free tier |
| Token abuse | Low | Rate limiting, anomaly detection |
| Support volume increase | Medium | Comprehensive documentation, clear error messages |
| Revenue cannibalization | Low | Price tokens to maintain margins |

### User Experience Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Surprise lockouts | High | Multiple warnings before lockout, email alerts |
| Confusing pricing | Medium | Clear pricing page, tooltips, examples |
| Difficult recharge | High | One-click purchase, saved payment methods |
| Lack of transparency | Medium | Detailed usage history, real-time balance updates |

---

## XV. FUTURE ENHANCEMENTS

### Phase 6: Advanced Features (3-6 months post-launch)

1. **Token Gifting**
   - Admin can grant promotional tokens
   - Referral bonuses
   - Contest rewards

2. **Team Token Pools**
   - Shared balance across team members
   - Usage attribution per user
   - Team admin controls

3. **Usage Forecasting**
   - Predict when user will run out
   - Recommend package based on usage patterns
   - Auto-recharge option

4. **Token API**
   - Allow third-party integrations
   - API keys with token allowances
   - Developer documentation

5. **Advanced Analytics**
   - Cost per customer acquired (tokens spent)
   - ROI calculations
   - Service usage trends

6. **Custom Packages**
   - Enterprise custom pricing
   - Annual contracts
   - Volume discounts

---

## XVI. IMPLEMENTATION TIMELINE

### Summary Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1: Foundation | Week 1 | Mount routes, test API, create middleware |
| Phase 2: Service Integration | Weeks 2-3 | Integrate AI, calling, email services |
| Phase 3: Notifications | Weeks 3-4 | Email, SMS, in-app alerts |
| Phase 4: Lockout System | Weeks 4-5 | Frontend overlay, backend enforcement |
| Phase 5: Frontend Display | Weeks 5-6 | Dashboard widget, purchase flow |
| Testing & Refinement | Week 6-7 | Full system testing, bug fixes |
| Deployment | Week 7 | Production deployment, monitoring |

**Total Timeline**: 7 weeks from start to production

### Quick Start (If Urgent)

If you need basic functionality ASAP:

**Week 1 Sprint**:
1. Day 1: Mount routes, test API
2. Day 2: Integrate AI image generation
3. Day 3: Integrate outbound calling
4. Day 4: Add basic email notifications
5. Day 5: Deploy and monitor

This gives you:
- Token system active
- Core services integrated
- Basic notifications
- Payment flow working

Then build out remaining features incrementally.

---

## XVII. QUESTIONS FOR CLIENT

Before implementation, clarify:

1. **Pricing Strategy**
   - Are current token costs appropriate?
   - Should free tier be 100 tokens or different?
   - Any promotional pricing for launch?

2. **Notification Preferences**
   - Send SMS for zero balance? (additional Twilio cost)
   - How many email notifications are acceptable?
   - In-app notifications sufficient for warnings?

3. **Lockout Behavior**
   - Should lockout be immediate or grace period?
   - Which features remain accessible (read-only)?
   - Can users make emergency calls even at zero balance?

4. **Migration Timeline**
   - Keep credit system indefinitely or migrate?
   - Conversion rate for existing credits?
   - Timeline for full migration?

5. **Payment Options**
   - Stripe only or other payment methods?
   - Allow invoicing for enterprise?
   - Auto-recharge option needed?

---

## XVIII. FINAL IMPLEMENTATION CHECKLIST

### Pre-Implementation
- [ ] Review and approve this plan
- [ ] Answer clarification questions
- [ ] Set up Stripe account (if not already)
- [ ] Configure SendGrid templates
- [ ] Backup production database
- [ ] Set up staging environment (recommended)

### Phase 1: Foundation
- [ ] Mount token routes in app.js
- [ ] Run database migration
- [ ] Test token API endpoints
- [ ] Create token middleware
- [ ] Verify Stripe integration

### Phase 2: Service Integration
- [ ] Integrate AI image generation
- [ ] Integrate AI content generation
- [ ] Integrate outbound calling
- [ ] Integrate single calls
- [ ] Integrate MCP AI Copilot (if exists)
- [ ] Integrate Business Collector (if exists)
- [ ] Integrate Prospect Manager (if exists)

### Phase 3: Notifications
- [ ] Create notification service
- [ ] Implement email templates
- [ ] Set up SMS alerts (optional)
- [ ] Build in-app notification component
- [ ] Test all notification triggers

### Phase 4: Lockout System
- [ ] Create lockout middleware
- [ ] Build frontend overlay
- [ ] Disable action buttons
- [ ] Configure route whitelist
- [ ] Test lockout and unlock flow

### Phase 5: Frontend Display
- [ ] Build token balance widget
- [ ] Implement purchase modal
- [ ] Create usage history page
- [ ] Add real-time updates
- [ ] Test all UI components

### Testing
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Perform manual testing
- [ ] Load testing (optional)
- [ ] Security audit

### Deployment
- [ ] Deploy code to production
- [ ] Run database migration
- [ ] Verify all services working
- [ ] Monitor logs for 24 hours
- [ ] Gather user feedback

### Post-Deployment
- [ ] Monitor KPIs daily (week 1)
- [ ] Review error logs
- [ ] Track payment success rate
- [ ] Adjust as needed
- [ ] Document lessons learned

---

## XIX. CONCLUSION

This plan provides a **comprehensive roadmap** for implementing a **multi-tenant token billing system** with:

1. ✅ **Multi-tenant architecture** (user-based tokens)
2. ✅ **Service consumption tracking** (all services covered)
3. ✅ **100 free tokens monthly** (per user)
4. ✅ **Low balance notifications** (email, SMS, in-app)
5. ✅ **CRM lockout mechanism** (zero balance protection)
6. ✅ **Stripe payment integration** (easy recharge)
7. ✅ **Detailed usage analytics** (transparency)
8. ✅ **Scalable architecture** (supports growth)

**The system is 90% built** - we just need to:
1. Mount the routes (1 line of code)
2. Integrate services (pattern-based, straightforward)
3. Build notifications (templates ready)
4. Add frontend UI (designs clear)

**Estimated time to production**: 6-7 weeks with testing, or 1 week for MVP.

**Next Steps**:
1. Review this plan
2. Answer clarification questions
3. Approve timeline
4. Begin Phase 1 implementation

---

**Questions? Ready to proceed?**
