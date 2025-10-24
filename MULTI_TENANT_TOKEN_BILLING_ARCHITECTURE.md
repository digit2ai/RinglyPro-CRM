# Multi-Tenant Token-Based Billing Architecture

## 🎯 Vision

**RinglyPro** - A complete AI-powered business ecosystem where clients pay only for what they use via a token-based system.

**Free Tier**: 100 tokens/month
**Pay-as-you-go**: Buy token packages when needed

---

## 📊 Service Token Pricing

### Voice Services
| Service | Token Cost | Notes |
|---------|------------|-------|
| Inbound call (per minute) | 5 tokens | Rachel/Lina AI + IVR + Twilio costs |
| Outbound call (per minute) | 5 tokens | Business Collector calling |
| Voicemail transcription | 3 tokens | AI transcription + storage |
| Call forwarding | 2 tokens | Per forwarded call |
| IVR menu interaction | 1 token | Press 1/2 navigation |

### Appointment & CRM
| Service | Token Cost | Notes |
|---------|------------|-------|
| Appointment booking | 2 tokens | Calendar integration + SMS notification |
| Contact create/update | 1 token | CRM database operation |
| Contact export | 5 tokens | Per 100 contacts |
| Calendar sync | 10 tokens | Per month (Google Calendar) |

### Marketing Services
| Service | Token Cost | Notes |
|---------|------------|-------|
| Email sent | 2 tokens | SendGrid + tracking + analytics |
| SMS sent | 3 tokens | Twilio SMS + delivery tracking |
| Social media post | 10 tokens | AI content generation + posting |
| Email campaign | 50 tokens | Up to 1000 contacts |

### Business Collector
| Service | Token Cost | Notes |
|---------|------------|-------|
| Lead collection | 20 tokens | Per 100 businesses (Google Places API) |
| CSV export | 5 tokens | Per export |
| Outbound calling campaign | 50 tokens | Auto-call 100 leads with AI voice |
| Single outbound call | 1 token | Individual call |

### AI Copilot
| Service | Token Cost | Notes |
|---------|------------|-------|
| Chat message | 1 token | MCP AI conversation |
| GoHighLevel query | 2 tokens | GHL CRM integration |
| Data analysis | 5 tokens | Complex queries |

### Premium Features (Future)
| Service | Token Cost | Notes |
|---------|------------|-------|
| AI voice cloning | 100 tokens | Clone client's voice for Rachel |
| Custom IVR script | 20 tokens | AI-generated custom script |
| White-label branding | 500 tokens/month | Remove RinglyPro branding |
| Priority support | 200 tokens/month | Dedicated support line |

---

## 💳 Token Packages

### Free Tier
- **100 tokens/month** (resets monthly)
- All features available
- Perfect for testing and light usage

**Example Usage:**
- 10 inbound calls (50 tokens)
- 5 appointments booked (10 tokens)
- 20 AI chat messages (20 tokens)
- 1 lead collection (20 tokens)
- **Total: 100 tokens**

### Starter Pack
- **$29/month = 500 tokens**
- $0.058 per token
- Rollover unused tokens (max 1000)

### Growth Pack
- **$99/month = 2000 tokens**
- $0.0495 per token
- Rollover unused tokens (max 5000)

### Professional Pack
- **$299/month = 7500 tokens**
- $0.0399 per token
- Rollover unused tokens (no limit)

### Enterprise
- **Custom pricing**
- Volume discounts
- Dedicated account manager
- Custom integrations

---

## 🗄️ Database Schema Changes

### 1. Add Token System to Users Table

```sql
-- Migration: Add token billing columns
ALTER TABLE users
  ADD COLUMN tokens_balance INTEGER DEFAULT 100,
  ADD COLUMN tokens_used_this_month INTEGER DEFAULT 0,
  ADD COLUMN token_package VARCHAR(50) DEFAULT 'free',
  ADD COLUMN tokens_rollover INTEGER DEFAULT 0,
  ADD COLUMN billing_cycle_start DATE DEFAULT CURRENT_DATE,
  ADD COLUMN last_token_reset DATE DEFAULT CURRENT_DATE;

-- Index for faster lookups
CREATE INDEX idx_users_tokens ON users(tokens_balance);
CREATE INDEX idx_users_billing_cycle ON users(billing_cycle_start);
```

### 2. Create Token Transactions Table

```sql
-- Track every token transaction for transparency
CREATE TABLE token_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Transaction details
  service_type VARCHAR(100) NOT NULL, -- 'voice_call', 'email_sent', 'lead_collection', etc.
  tokens_used INTEGER NOT NULL,
  tokens_balance_after INTEGER NOT NULL,

  -- Service metadata (JSONB for flexibility)
  metadata JSONB, -- {call_sid: 'CA123', duration: 120, phone: '+1234567890'}

  -- Related records
  call_id INTEGER REFERENCES calls(id),
  message_id INTEGER REFERENCES messages(id),
  appointment_id INTEGER REFERENCES appointments(id),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_token_trans_user (user_id),
  INDEX idx_token_trans_service (service_type),
  INDEX idx_token_trans_created (created_at)
);
```

### 3. Create Token Purchases Table

```sql
-- Track token package purchases
CREATE TABLE token_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Purchase details
  package_name VARCHAR(50) NOT NULL, -- 'starter', 'growth', 'professional'
  tokens_purchased INTEGER NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,

  -- Payment tracking
  stripe_payment_id VARCHAR(255),
  payment_status VARCHAR(50) DEFAULT 'completed',

  -- Timestamps
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_token_purchases_user (user_id),
  INDEX idx_token_purchases_date (purchased_at)
);
```

### 4. Update User Model (Sequelize)

```javascript
// src/models/User.js - Add token fields
tokens_balance: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 100, // Free tier
  validate: { min: 0 }
},
tokens_used_this_month: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 0,
  validate: { min: 0 }
},
token_package: {
  type: DataTypes.STRING(50),
  allowNull: false,
  defaultValue: 'free',
  validate: {
    isIn: [['free', 'starter', 'growth', 'professional', 'enterprise']]
  }
},
tokens_rollover: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 0,
  validate: { min: 0 }
},
billing_cycle_start: {
  type: DataTypes.DATEONLY,
  allowNull: false,
  defaultValue: DataTypes.NOW
},
last_token_reset: {
  type: DataTypes.DATEONLY,
  allowNull: false,
  defaultValue: DataTypes.NOW
}
```

---

## 🔧 Token Service Implementation

### Core Token Service

```javascript
// src/services/tokenService.js

class TokenService {
  constructor() {
    this.serviceCosts = {
      // Voice
      'voice_inbound_minute': 5,
      'voice_outbound_minute': 5,
      'voicemail_transcription': 3,
      'call_forward': 2,
      'ivr_interaction': 1,

      // CRM & Appointments
      'appointment_booking': 2,
      'contact_create': 1,
      'contact_update': 1,
      'contact_export_100': 5,
      'calendar_sync_month': 10,

      // Marketing
      'email_sent': 2,
      'sms_sent': 3,
      'social_post': 10,
      'email_campaign': 50,

      // Business Collector
      'lead_collection_100': 20,
      'csv_export': 5,
      'outbound_campaign_100': 50,
      'outbound_call_single': 1,

      // AI Copilot
      'ai_chat_message': 1,
      'ghl_query': 2,
      'data_analysis': 5
    };
  }

  /**
   * Check if user has enough tokens
   */
  async hasEnoughTokens(userId, serviceType) {
    const User = require('../models').User;
    const user = await User.findByPk(userId);

    if (!user) throw new Error('User not found');

    const cost = this.serviceCosts[serviceType] || 0;
    return user.tokens_balance >= cost;
  }

  /**
   * Deduct tokens and log transaction
   */
  async deductTokens(userId, serviceType, metadata = {}) {
    const { User, TokenTransaction } = require('../models');
    const sequelize = require('../config/database');

    const cost = this.serviceCosts[serviceType];
    if (!cost) throw new Error(`Unknown service type: ${serviceType}`);

    // Use transaction to ensure atomicity
    const result = await sequelize.transaction(async (t) => {
      // Get user with lock
      const user = await User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!user) throw new Error('User not found');

      // Check balance
      if (user.tokens_balance < cost) {
        throw new Error(`Insufficient tokens. Need ${cost}, have ${user.tokens_balance}`);
      }

      // Deduct tokens
      user.tokens_balance -= cost;
      user.tokens_used_this_month += cost;
      await user.save({ transaction: t });

      // Log transaction
      const transaction = await TokenTransaction.create({
        user_id: userId,
        service_type: serviceType,
        tokens_used: cost,
        tokens_balance_after: user.tokens_balance,
        metadata: metadata
      }, { transaction: t });

      return {
        success: true,
        tokens_deducted: cost,
        tokens_remaining: user.tokens_balance,
        transaction_id: transaction.id
      };
    });

    return result;
  }

  /**
   * Add tokens (purchase or refund)
   */
  async addTokens(userId, tokens, reason = 'purchase', metadata = {}) {
    const { User, TokenTransaction } = require('../models');

    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    user.tokens_balance += tokens;
    await user.save();

    await TokenTransaction.create({
      user_id: userId,
      service_type: reason,
      tokens_used: -tokens, // Negative = added
      tokens_balance_after: user.tokens_balance,
      metadata: metadata
    });

    return {
      success: true,
      tokens_added: tokens,
      new_balance: user.tokens_balance
    };
  }

  /**
   * Reset monthly tokens (cron job)
   */
  async resetMonthlyTokens() {
    const { User } = require('../models');
    const moment = require('moment');

    // Find users whose billing cycle has passed
    const users = await User.findAll({
      where: {
        billing_cycle_start: {
          [Op.lte]: moment().subtract(1, 'month').toDate()
        }
      }
    });

    for (const user of users) {
      // Reset tokens based on package
      const packageTokens = {
        'free': 100,
        'starter': 500,
        'growth': 2000,
        'professional': 7500
      };

      const monthlyAllocation = packageTokens[user.token_package] || 100;

      // Handle rollover
      let rollover = 0;
      const maxRollover = {
        'free': 0,
        'starter': 1000,
        'growth': 5000,
        'professional': Infinity
      };

      if (user.tokens_balance > 0) {
        rollover = Math.min(user.tokens_balance, maxRollover[user.token_package]);
      }

      // Reset
      user.tokens_balance = monthlyAllocation + rollover;
      user.tokens_used_this_month = 0;
      user.tokens_rollover = rollover;
      user.billing_cycle_start = moment().toDate();
      user.last_token_reset = moment().toDate();

      await user.save();

      console.log(`✅ Reset tokens for ${user.email}: ${monthlyAllocation} + ${rollover} rollover`);
    }
  }

  /**
   * Get token usage analytics
   */
  async getUsageAnalytics(userId, days = 30) {
    const { TokenTransaction } = require('../models');
    const moment = require('moment');

    const transactions = await TokenTransaction.findAll({
      where: {
        user_id: userId,
        created_at: {
          [Op.gte]: moment().subtract(days, 'days').toDate()
        }
      },
      order: [['created_at', 'DESC']]
    });

    // Group by service type
    const breakdown = {};
    let totalUsed = 0;

    for (const tx of transactions) {
      if (tx.tokens_used > 0) { // Exclude purchases/refunds
        breakdown[tx.service_type] = (breakdown[tx.service_type] || 0) + tx.tokens_used;
        totalUsed += tx.tokens_used;
      }
    }

    return {
      total_tokens_used: totalUsed,
      breakdown: breakdown,
      transactions: transactions.slice(0, 20), // Last 20 transactions
      period_days: days
    };
  }
}

module.exports = new TokenService();
```

---

## 🔌 Integration Points

### 1. Voice Call Handler (Middleware)

```javascript
// src/middleware/tokenDeduction.js

const tokenService = require('../services/tokenService');

/**
 * Deduct tokens for voice calls
 */
async function deductVoiceCallTokens(req, res, next) {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) return next(); // Skip if no user (webhook calls)

    const callDuration = req.body.CallDuration || 0;
    const minutes = Math.ceil(callDuration / 60);

    // Deduct tokens per minute
    for (let i = 0; i < minutes; i++) {
      await tokenService.deductTokens(userId, 'voice_inbound_minute', {
        call_sid: req.body.CallSid,
        minute: i + 1,
        total_duration: callDuration
      });
    }

    next();
  } catch (error) {
    if (error.message.includes('Insufficient tokens')) {
      // Return TwiML to inform caller
      res.type('text/xml');
      res.send(`
        <Response>
          <Say voice="alice">Your account has run out of tokens.
          Please purchase more tokens to continue using RinglyPro services.</Say>
          <Hangup/>
        </Response>
      `);
    } else {
      next(error);
    }
  }
}

module.exports = { deductVoiceCallTokens };
```

### 2. Business Collector Integration

```javascript
// src/routes/mcp.js - Add token deduction to Business Collector

// Before collecting leads
if (session.type === 'business-collector') {
  const hasTokens = await tokenService.hasEnoughTokens(
    req.session.userId,
    'lead_collection_100'
  );

  if (!hasTokens) {
    return res.json({
      success: false,
      response: '❌ Insufficient tokens! You need 20 tokens to collect 100 leads.\n\n' +
                'Your current balance: Check your account.\n' +
                'Purchase more tokens in your dashboard.',
      suggestions: ['View token balance', 'Purchase tokens']
    });
  }

  // Collect leads...
  const result = await session.proxy.collectBusinesses({...});

  // Deduct tokens after success
  await tokenService.deductTokens(
    req.session.userId,
    'lead_collection_100',
    { category, geography, results: result.summary.total }
  );
}
```

### 3. Outbound Caller Integration

```javascript
// src/services/outbound-caller.js

// Before making call
async makeCall(phoneNumber, leadData, userId) {
  // Check tokens
  const hasTokens = await tokenService.hasEnoughTokens(userId, 'outbound_call_single');

  if (!hasTokens) {
    throw new Error('Insufficient tokens for outbound calling');
  }

  // Make call...
  const call = await this.twilioClient.calls.create({...});

  // Deduct tokens
  await tokenService.deductTokens(userId, 'outbound_call_single', {
    call_sid: call.sid,
    phone: phoneNumber,
    lead_name: leadData.name
  });

  return call;
}
```

---

## 📈 User Dashboard - Token Display

### Token Balance Widget

```javascript
// Frontend component for token display

{
  "tokens_balance": 85,
  "tokens_used_this_month": 15,
  "token_package": "free",
  "monthly_allocation": 100,
  "reset_date": "2025-11-23",
  "days_until_reset": 8
}
```

**Display:**
```
🪙 Token Balance: 85 / 100
📊 Used this month: 15 tokens
📅 Resets in: 8 days
💳 Package: Free Tier

[Upgrade Plan] [View Usage]
```

---

## 🚨 Low Token Warnings

### Email Notification (75% used)
```
Subject: Token Alert - 75% Used

Hi [User],

You've used 75 tokens out of your 100 monthly allocation.
You have 25 tokens remaining.

Top services using tokens:
• Voice Calls: 50 tokens (67%)
• Business Collector: 20 tokens (27%)
• Appointments: 5 tokens (7%)

Consider upgrading to avoid service interruption:
👉 Starter Pack: $29/month (500 tokens)

[Upgrade Now]
```

### Critical Alert (90% used)
```
⚠️ Critical: Only 10 tokens remaining!

Your services may be interrupted. Purchase tokens now:
[Buy 500 tokens - $29]
```

---

## 🔄 Monthly Billing Cycle (Cron Job)

```javascript
// scripts/reset-monthly-tokens.js

const cron = require('node-cron');
const tokenService = require('../services/tokenService');

// Run every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('🔄 Checking for token resets...');
  await tokenService.resetMonthlyTokens();
});
```

---

## 🎯 Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [x] Outbound Caller working (global config)
- [ ] Create token database tables
- [ ] Implement TokenService class
- [ ] Add token fields to User model
- [ ] Create migration script

### Phase 2: Integration (Week 3-4)
- [ ] Add token middleware to voice routes
- [ ] Integrate with Business Collector
- [ ] Integrate with Outbound Caller
- [ ] Add token checks to all services

### Phase 3: User Experience (Week 5-6)
- [ ] Build token dashboard
- [ ] Add token purchase flow (Stripe)
- [ ] Email notifications for low tokens
- [ ] Usage analytics page

### Phase 4: Automation (Week 7-8)
- [ ] Monthly reset cron job
- [ ] Auto-billing for overages
- [ ] Token rollover logic
- [ ] Refund system

### Phase 5: Polish (Week 9-10)
- [ ] Token cost optimization
- [ ] A/B test pricing
- [ ] Analytics dashboard
- [ ] Documentation

---

## 💡 Benefits of Token System

### For Clients:
✅ **Pay only for what you use** - No wasted subscription fees
✅ **100 free tokens/month** - Test all features risk-free
✅ **Transparent pricing** - Know exactly what each action costs
✅ **Flexibility** - Use tokens across all services
✅ **Rollover unused tokens** - Don't lose what you paid for

### For RinglyPro:
✅ **Predictable revenue** - Recurring subscriptions + usage-based
✅ **Fair pricing** - Heavy users pay more, light users pay less
✅ **Encourages upgrades** - Free tier leads to paid tiers
✅ **Reduced churn** - Users keep some tokens, less likely to cancel
✅ **Scalable** - Can add new services without changing pricing model

---

## 🔒 Security Considerations

1. **Token Balance Locking**
   - Use database transactions to prevent race conditions
   - Lock user row during token deduction

2. **Fraud Prevention**
   - Rate limit token-heavy operations
   - Alert on suspicious usage patterns
   - Require email verification for purchases

3. **Audit Trail**
   - Log every token transaction
   - Immutable transaction records
   - User-accessible transaction history

4. **Refund Policy**
   - Unused tokens rollover (with limits)
   - Refund tokens on service failures
   - Clear refund policy in TOS

---

## 📞 Next Steps

1. **Test Outbound Caller** with current global config
2. **Gather usage data** to validate token costs
3. **Implement Phase 1** (database schema)
4. **Build token dashboard**
5. **Soft launch** with beta testers
6. **Iterate** based on feedback

---

**Created:** 2025-10-23
**Status:** 🏗️ Design Complete - Ready for Implementation
**Owner:** RinglyPro Development Team
