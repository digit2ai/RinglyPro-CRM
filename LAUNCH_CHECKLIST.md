# 🚀 RinglyPro Tuesday Launch - Final Checklist

## ⏰ Timeline: Complete by Monday EOD

---

## 1️⃣ Stripe Production Setup (Critical)

### Get Live API Keys:
- [ ] Log into https://dashboard.stripe.com
- [ ] Switch to **Live Mode** (toggle top-right)
- [ ] Go to: Developers → API Keys
- [ ] Copy **Secret Key** (`sk_live_...`)
- [ ] Copy **Publishable Key** (`pk_live_...`)

### Configure Webhook:
- [ ] Go to: Developers → Webhooks
- [ ] Add endpoint: `https://aiagent.ringlypro.com/api/credits/webhooks/stripe`
- [ ] Select events:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.succeeded`
  - `charge.failed`
- [ ] Copy **Webhook Secret** (`whsec_...`)

### Update Render Environment:
- [ ] Go to https://dashboard.render.com
- [ ] Navigate to: Environment → Environment Variables
- [ ] Add/Update:
  ```
  STRIPE_SECRET_KEY=sk_live_...
  STRIPE_PUBLISHABLE_KEY=pk_live_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  NODE_ENV=production
  ```
- [ ] Save and redeploy

### Update Mobile App:
- [ ] Replace test key with live publishable key
- [ ] Build production version
- [ ] Test payment flow

---

## 2️⃣ Credit System Verification

### Test Live Payment:
- [ ] Make $1.00 test payment with real card
- [ ] Verify webhook fires in Stripe dashboard
- [ ] Confirm credits added to account
- [ ] Test service unlock after payment

### Test Scenarios:
- [ ] Low balance alert (balance ≤ $1)
- [ ] Service block (balance = $0)
- [ ] Payment success → immediate unlock
- [ ] Free minutes tracking (100/month)
- [ ] Monthly reset logic

---

## 3️⃣ Code Cleanup (Important)

### Remove Test Endpoints:
- [ ] Remove lines 288-403 from [src/routes/credits.js](src/routes/credits.js:288-403)
  - `/api/credits/test/client/:clientId`
  - `/api/credits/test/simulate-usage`
  - `/api/credits/test/add-credits`
- [ ] Remove line 384-403: `/api/credits/admin/fix-pricing`
- [ ] Redeploy after removal

### Security:
- [ ] Verify no API keys in code
- [ ] Check `.env` in `.gitignore`
- [ ] Confirm JWT authentication on all credit endpoints

---

## 4️⃣ Database Verification

### Check Tables:
- [ ] `clients` - All have `per_minute_rate = 0.200`
- [ ] `credit_accounts` - All have correct balances
- [ ] `payment_transactions` - Table exists and ready
- [ ] `usage_records` - Tracking enabled
- [ ] `notifications` - System functional

### Run This Query:
```sql
SELECT id, business_name, per_minute_rate, monthly_free_minutes
FROM clients;
```
Expected: All clients should have $0.20/min rate

---

## 5️⃣ Rachel AI Call Forwarding

### Verify Setup:
- [ ] Test carrier codes working (AT&T, Verizon, T-Mobile)
- [ ] Mobile UI shows forwarding options
- [ ] Status tracking operational
- [ ] Multi-tenant routing works

### Test Flow:
- [ ] Enable Rachel for test client
- [ ] Make test call to business number
- [ ] Verify Rachel answers after 3 rings
- [ ] Confirm appointment booking works

---

## 6️⃣ Mobile App Pre-Launch

### UI Alerts Implemented:
- [ ] Low balance warning banner
- [ ] Out-of-credits full-screen modal
- [ ] Payment reload buttons ($10, $20, $50, $100)
- [ ] Success/failure notifications
- [ ] Balance display on dashboard

### Navigation:
- [ ] Credits/balance screen accessible
- [ ] Usage history displays correctly
- [ ] Transaction list shows payments
- [ ] Settings → Auto-reload configuration

---

## 7️⃣ Monitoring Setup

### Stripe Dashboard:
- [ ] Bookmark: https://dashboard.stripe.com/payments
- [ ] Enable email notifications for:
  - Failed payments
  - Disputes
  - Webhook failures

### Server Monitoring:
- [ ] Check Render logs accessible
- [ ] Error tracking configured
- [ ] Uptime monitoring active

### Key Metrics to Watch:
- [ ] Payment success rate
- [ ] Webhook delivery rate
- [ ] Credit usage per client
- [ ] Free tier consumption

---

## 8️⃣ Documentation Review

### Created Docs:
- [ ] Review [CREDIT_SYSTEM_UI_FLOW.md](CREDIT_SYSTEM_UI_FLOW.md)
- [ ] Review [STRIPE_PRODUCTION_SETUP.md](STRIPE_PRODUCTION_SETUP.md)
- [ ] Share with team if needed

---

## 🧪 Final Testing (Monday)

### End-to-End Test:
1. [ ] New user signup
2. [ ] Use 100 free minutes
3. [ ] Run out of credits
4. [ ] See "Service Blocked" alert
5. [ ] Add $10 via Stripe
6. [ ] Verify service unlocked
7. [ ] Make successful call
8. [ ] Check balance deducted correctly

### Edge Cases:
- [ ] Test payment failure (declined card)
- [ ] Test webhook retry logic
- [ ] Test auto-reload trigger
- [ ] Test monthly reset (simulate date change)

---

## 🚀 Launch Day (Tuesday)

### Morning Checks:
- [ ] All services running (Render, Stripe, DB)
- [ ] Mobile app deployed to stores
- [ ] Stripe live mode active
- [ ] Webhook endpoint responding

### Monitor Throughout Day:
- [ ] First customer payment
- [ ] Webhook success rate
- [ ] Error logs
- [ ] Customer support requests

### Have Ready:
- [ ] Stripe dashboard open
- [ ] Render logs accessible
- [ ] Database access for quick fixes
- [ ] Contact info for urgent issues

---

## ⚠️ Rollback Plan

### If Critical Issues:
1. Switch Stripe back to test mode
2. Revert mobile app to previous version
3. Notify customers of maintenance
4. Fix issues in staging
5. Re-deploy when stable

---

## 📊 Success Metrics

### Day 1 Goals:
- [ ] 0 payment failures due to system errors
- [ ] 100% webhook delivery rate
- [ ] < 1 second payment processing time
- [ ] No credit calculation errors

### Week 1 Goals:
- [ ] 95%+ payment success rate
- [ ] Smooth monthly reset (Nov 1)
- [ ] Positive customer feedback
- [ ] Auto-reload adoption

---

## 🎯 Quick Reference

### Critical URLs:
- Production: `https://aiagent.ringlypro.com`
- Stripe Dashboard: `https://dashboard.stripe.com`
- Render Dashboard: `https://dashboard.render.com`

### Support Contacts:
- Stripe Support: https://support.stripe.com
- Render Support: https://render.com/support

### Emergency Commands:
```bash
# Check service status
curl https://aiagent.ringlypro.com/api/credits/balance

# Verify Stripe webhook
curl -X POST https://aiagent.ringlypro.com/api/credits/webhooks/stripe

# Check database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM clients;"
```

---

## ✅ Final Sign-Off

**System Tests:** ✅ Complete
**Stripe Setup:** ⏳ Awaiting live keys
**Mobile App:** ⏳ Needs live key update
**Documentation:** ✅ Complete

**Ready for Launch:** 🟡 Pending Stripe production setup

---

## 📞 Monday Night Final Check

- [ ] All checkboxes above completed
- [ ] Test payment successful with live keys
- [ ] Team briefed on launch plan
- [ ] Sleep well - you got this! 😊

**Tuesday Morning:** GO LIVE! 🚀
