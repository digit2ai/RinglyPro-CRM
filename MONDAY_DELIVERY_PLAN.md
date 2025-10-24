# 🚀 MONDAY DELIVERY PLAN - Token-Based Service Billing

## 📋 Current System Analysis

### ✅ What You Already Have (GOOD NEWS!)

1. **CreditAccount Model** - Tracks balance and usage
2. **Credit System Service** (`creditSystem.js`) - Full billing logic
3. **Usage Tracking** - `trackUsage()` method for voice/SMS
4. **Payment Integration** - Stripe webhooks working
5. **User Model** - Has `free_trial_minutes` field
6. **Client Model** - Has `monthly_free_minutes` and `per_minute_rate`
7. **Multi-tenant Architecture** - Client-based isolation

### 🔄 What Needs to Change

**Current**: Minutes-based billing (voice calls only)
**New**: Token-based billing (all services)

---

## 🎯 Implementation Strategy

### **Approach: EXTEND, Don't Replace**

We'll **ADD** token system **alongside** existing credit system:
- Keep voice calls using existing credit system (stable, proven)
- Add token deductions for new services (Business Collector, Email, AI Chat)
- Gradually migrate all services to tokens over time

**Benefits:**
✅ Zero downtime - existing clients unaffected
✅ Low risk - existing billing continues working
✅ Quick delivery - focus only on new services
✅ Incremental migration - move services gradually

---

## 📅 IMPLEMENTATION SCHEDULE

### **FRIDAY (Today - After Hours)**
**Goal**: Database schema + Token service core
**Time**: 3-4 hours

- [ ] Create `token_transactions` table
- [ ] Create `token_packages` table
- [ ] Add token fields to `users` table
- [ ] Create TokenService class
- [ ] Test token deduction logic locally

### **SATURDAY**
**Goal**: Integrate tokens with Business Collector
**Time**: 4-5 hours

- [ ] Add token check before lead collection
- [ ] Add token deduction after successful collection
- [ ] Add token check for CSV export
- [ ] Add token check for outbound calling
- [ ] Test entire Business Collector flow

### **SUNDAY**
**Goal**: User dashboard + Token display
**Time**: 4-5 hours

- [ ] Create token balance API endpoint
- [ ] Create token usage history endpoint
- [ ] Add token balance to user dashboard
- [ ] Add "low token" warnings
- [ ] Test token purchase flow (Stripe)

### **MONDAY MORNING**
**Goal**: Final testing + Deployment
**Time**: 2-3 hours

- [ ] End-to-end testing
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Update documentation

---

## 🗄️ DATABASE CHANGES (FRIDAY)

### Migration 1: Add Token Tables

```sql
-- Token Transactions (every token usage logged here)
CREATE TABLE IF NOT EXISTS token_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Transaction details
  service_type VARCHAR(100) NOT NULL,
  tokens_used INTEGER NOT NULL,
  tokens_balance_after INTEGER NOT NULL,

  -- Service metadata
  metadata JSONB DEFAULT '{}',

  -- Related records
  call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_trans_user ON token_transactions(user_id);
CREATE INDEX idx_token_trans_service ON token_transactions(service_type);
CREATE INDEX idx_token_trans_created ON token_transactions(created_at DESC);

-- Token Packages (track purchases)
CREATE TABLE IF NOT EXISTS token_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Purchase details
  package_name VARCHAR(50) NOT NULL,
  tokens_purchased INTEGER NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,

  -- Payment tracking
  stripe_payment_id VARCHAR(255),
  payment_status VARCHAR(50) DEFAULT 'completed',

  -- Timestamps
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_purchases_user ON token_purchases(user_id);
CREATE INDEX idx_token_purchases_date ON token_purchases(purchased_at DESC);
```

### Migration 2: Add Token Fields to Users

```sql
-- Add token columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tokens_balance INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS tokens_used_this_month INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_package VARCHAR(50) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS tokens_rollover INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_cycle_start DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_token_reset DATE DEFAULT CURRENT_DATE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_users_tokens ON users(tokens_balance);
CREATE INDEX IF NOT EXISTS idx_users_billing_cycle ON users(billing_cycle_start);
```

---

## 💻 CODE IMPLEMENTATION

### 1. Token Service (FRIDAY)

**File**: `src/services/tokenService.js`

```javascript
class TokenService {
  constructor() {
    this.serviceCosts = {
      // Business Collector
      'business_collector_100': 20,
      'business_collector_csv': 5,
      'outbound_campaign_100': 50,
      'outbound_call_single': 1,

      // AI Copilot
      'ai_chat_message': 1,
      'ghl_query': 2,

      // Marketing (future)
      'email_sent': 2,
      'sms_sent': 3,
      'social_post': 10,

      // CRM (future)
      'appointment_booking': 2,
      'contact_create': 1
    };
  }

  async hasEnoughTokens(userId, serviceType) {
    const { User } = require('../models');
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    const cost = this.serviceCosts[serviceType] || 0;
    return user.tokens_balance >= cost;
  }

  async deductTokens(userId, serviceType, metadata = {}) {
    const { User, sequelize } = require('../models');
    const cost = this.serviceCosts[serviceType];

    if (!cost) throw new Error(`Unknown service: ${serviceType}`);

    return await sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!user) throw new Error('User not found');
      if (user.tokens_balance < cost) {
        throw new Error(`Insufficient tokens. Need ${cost}, have ${user.tokens_balance}`);
      }

      // Deduct tokens
      user.tokens_balance -= cost;
      user.tokens_used_this_month += cost;
      await user.save({ transaction: t });

      // Log transaction
      await sequelize.query(`
        INSERT INTO token_transactions (user_id, service_type, tokens_used, tokens_balance_after, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, {
        bind: [userId, serviceType, cost, user.tokens_balance, JSON.stringify(metadata)],
        transaction: t
      });

      return {
        success: true,
        tokens_deducted: cost,
        tokens_remaining: user.tokens_balance
      };
    });
  }
}

module.exports = new TokenService();
```

### 2. Integrate with Business Collector (SATURDAY)

**File**: `src/routes/mcp.js`

```javascript
const tokenService = require('../services/tokenService');

// BEFORE collecting leads
if (session.type === 'business-collector') {
  if (/collect|find|get/i.test(message)) {
    // Check tokens BEFORE collecting
    const userId = req.session.userId || req.user?.id;

    if (userId) {
      const hasTokens = await tokenService.hasEnoughTokens(userId, 'business_collector_100');

      if (!hasTokens) {
        return res.json({
          success: false,
          response: '❌ Insufficient Tokens!\n\n' +
                    'You need 20 tokens to collect 100 leads.\n\n' +
                    '💳 Purchase more tokens or wait for monthly reset.',
          suggestions: ['View token balance', 'Purchase tokens']
        });
      }
    }

    // Collect leads...
    const result = await session.proxy.collectBusinesses({...});

    // AFTER successful collection - deduct tokens
    if (userId && result.success) {
      await tokenService.deductTokens(userId, 'business_collector_100', {
        category,
        geography,
        results_count: result.summary.total
      });

      // Show updated balance
      const { User } = require('../models');
      const user = await User.findByPk(userId);
      response += `\n\n💰 Tokens: ${user.tokens_balance} remaining`;
    }
  }
}
```

### 3. Token Balance API (SUNDAY)

**File**: `src/routes/tokens.js` (NEW)

```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// GET /api/tokens/balance
router.get('/balance', authenticateToken, async (req, res) => {
  const { User } = require('../models');
  const user = await User.findByPk(req.user.id);

  res.json({
    success: true,
    tokens_balance: user.tokens_balance,
    tokens_used_this_month: user.tokens_used_this_month,
    token_package: user.token_package,
    billing_cycle_start: user.billing_cycle_start
  });
});

// GET /api/tokens/usage
router.get('/usage', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');

  const [transactions] = await sequelize.query(`
    SELECT * FROM token_transactions
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `, { bind: [req.user.id] });

  res.json({
    success: true,
    transactions
  });
});

module.exports = router;
```

**Mount in** `src/app.js`:
```javascript
const tokenRoutes = require('./routes/tokens');
app.use('/api/tokens', tokenRoutes);
```

---

## 📊 Service Token Costs (Starting)

| Service | Tokens | Notes |
|---------|--------|-------|
| **Business Collector** (100 leads) | 20 | Google Places API cost |
| **CSV Export** | 5 | Data processing |
| **Outbound Campaign** (100 calls) | 50 | High-value automated calling |
| **Single Outbound Call** | 1 | Per lead called |
| **AI Chat Message** | 1 | MCP conversation |
| **GHL Query** | 2 | GoHighLevel integration |

### Free Tier
- **100 tokens/month** (already in User model as `free_trial_minutes`)
- Convert `free_trial_minutes` → `tokens_balance` (1:1 mapping for now)

---

## 🧪 TESTING CHECKLIST

### Friday Night (Database)
- [ ] Run migrations on local database
- [ ] Verify tables created
- [ ] Test TokenService.deductTokens() locally
- [ ] Test TokenService.hasEnoughTokens() locally

### Saturday (Business Collector)
- [ ] Test: User with 100 tokens collects leads → Success, 80 tokens remain
- [ ] Test: User with 10 tokens tries to collect → Blocked with error message
- [ ] Test: Export CSV costs 5 tokens
- [ ] Test: Outbound calling campaign costs 50 tokens
- [ ] Test: Token balance shown in UI

### Sunday (Dashboard)
- [ ] Test: /api/tokens/balance returns correct data
- [ ] Test: /api/tokens/usage shows transaction history
- [ ] Test: Low token warning appears at <25 tokens
- [ ] Test: Token purchase flow (Stripe)

### Monday (Production)
- [ ] Deploy database migrations
- [ ] Deploy code changes
- [ ] Monitor error logs for 2 hours
- [ ] Test with real user account
- [ ] Verify no disruption to existing voice/SMS billing

---

## ⚠️ SAFETY MEASURES (Zero Downtime)

### 1. Graceful Degradation
```javascript
// If token service fails, allow operation and log error
try {
  await tokenService.deductTokens(...);
} catch (error) {
  console.error('Token deduction failed:', error);
  // Don't block the operation - just log it
  // Fix billing manually if needed
}
```

### 2. Feature Flags
```javascript
const TOKENS_ENABLED = process.env.TOKENS_ENABLED === 'true';

if (TOKENS_ENABLED) {
  // Check and deduct tokens
}
```

### 3. Rollback Plan
- Keep all existing credit system code untouched
- Token system is additive only
- Can disable tokens with environment variable
- Database migrations are non-destructive (ADD COLUMN, not DROP)

### 4. Monitoring
```javascript
// Log every token transaction
console.log(`[TOKENS] User ${userId} - ${serviceType} - ${cost} tokens`);

// Alert on errors
if (error) {
  // Send to monitoring service
  console.error(`[TOKENS ERROR]`, error);
}
```

---

## 📈 MIGRATION TIMELINE (Post-Monday)

### Week 1: New Services Only
- ✅ Business Collector uses tokens
- ✅ AI Copilot uses tokens
- ⏳ Voice calls still use existing credit system

### Week 2: Add More Services
- Email marketing uses tokens
- SMS campaigns use tokens
- Social media posts use tokens

### Week 3: Migrate Voice Calls
- Convert voice call billing to tokens
- Keep existing credit system as fallback
- 1 minute = 5 tokens

### Week 4: Full Token System
- All services use tokens
- Deprecate old credit_accounts table (keep as backup)
- Launch token packages

---

## 💰 TOKEN PACKAGES (Launch with System)

### Free Tier
- **100 tokens/month**
- Resets monthly
- No rollover

### Starter Pack
- **$29/month = 500 tokens**
- 400 tokens + 100 free
- Rollover up to 1000 tokens

### Growth Pack
- **$99/month = 2000 tokens**
- 1900 tokens + 100 free
- Rollover up to 5000 tokens

### Professional Pack
- **$299/month = 7500 tokens**
- 7400 tokens + 100 free
- Unlimited rollover

---

## 🚨 BLOCKERS & SOLUTIONS

### Blocker 1: User doesn't have user_id in session
**Solution**: Get user_id from authenticateToken middleware
```javascript
const userId = req.user?.id || req.session?.userId;
if (!userId) {
  // Allow operation but don't charge tokens
  console.warn('No user_id - token deduction skipped');
}
```

### Blocker 2: Token service is slow
**Solution**: Make token checks async, don't block user experience
```javascript
// Don't await - fire and forget
tokenService.deductTokens(userId, serviceType, metadata)
  .catch(err => console.error('Token deduction failed:', err));
```

### Blocker 3: Stripe integration for token purchases
**Solution**: Reuse existing Stripe code from credit system
```javascript
// src/routes/credits.js already has Stripe integration
// Just adapt it for token purchases
```

---

## 📝 DOCUMENTATION UPDATES

### User-Facing
- [ ] Update pricing page with token costs
- [ ] Add token balance to dashboard
- [ ] Create "How Tokens Work" FAQ
- [ ] Update email templates for low token warnings

### Developer-Facing
- [ ] Update API docs with token endpoints
- [ ] Document TokenService methods
- [ ] Add migration instructions
- [ ] Update architecture diagram

---

## ✅ MONDAY DELIVERY CHECKLIST

### Before Deploy
- [ ] All migrations tested locally
- [ ] TokenService fully tested
- [ ] Business Collector integration tested
- [ ] Token balance API tested
- [ ] No errors in console

### Deploy Steps
1. [ ] Run database migrations on production
2. [ ] Deploy code to Render
3. [ ] Verify deployment successful
4. [ ] Test with your account
5. [ ] Monitor logs for 1 hour

### Post-Deploy
- [ ] Send announcement email to users
- [ ] Monitor for support requests
- [ ] Track token usage in first 24 hours
- [ ] Iterate based on feedback

---

## 🎯 SUCCESS METRICS

### Monday (Launch Day)
- ✅ Zero downtime
- ✅ Existing voice/SMS billing unaffected
- ✅ Business Collector tokens working
- ✅ Token balance visible in dashboard

### Week 1
- 50+ users see token balance
- 10+ users use Business Collector with tokens
- 5+ users purchase token packages
- <5 support tickets related to tokens

### Week 2
- All new services using tokens
- $500+ in token package sales
- Positive user feedback

---

## 🚀 LET'S GO!

**Start Time**: Friday Evening (after hours)
**Delivery**: Monday Morning
**Total Hours**: ~12-15 hours
**Risk Level**: ⚠️ LOW (additive only, no breaking changes)

**Your job**: Database migrations + Code review + Testing
**My job**: Write all the code + Documentation

**Communication**:
- I'll commit after each major milestone
- You review and test
- We iterate quickly
- Monday morning = launch ready

---

**Ready to start? Let's build this! 💪**
