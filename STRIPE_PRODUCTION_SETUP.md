# RinglyPro - Stripe Production Setup Guide

## 🎯 Switching from Test Mode to Live Payments

**Current Status:** Stripe configured in TEST mode
**Goal:** Enable real credit card payments for Tuesday launch

---

## 📋 Step-by-Step Production Setup

### Step 1: Get Live Stripe API Keys

1. **Log into Stripe Dashboard:** https://dashboard.stripe.com
2. **Switch to Live Mode** (toggle in top-right corner)
3. **Go to:** Developers → API Keys
4. **Copy these keys:**
   - ✅ **Publishable key** (starts with `pk_live_...`) - For mobile app
   - ✅ **Secret key** (starts with `sk_live_...`) - For backend

⚠️ **IMPORTANT:** Never commit live keys to Git or share them publicly!

---

### Step 2: Create Webhook Endpoint in Stripe

1. **Go to:** Developers → Webhooks
2. **Click:** Add endpoint
3. **Endpoint URL:** `https://aiagent.ringlypro.com/api/credits/webhooks/stripe`
4. **Events to listen for:**
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`
   - ✅ `payment_intent.canceled`
   - ✅ `charge.succeeded`
   - ✅ `charge.failed`

5. **Copy Webhook Signing Secret** (starts with `whsec_...`)

---

### Step 3: Update Render Environment Variables

**In Render Dashboard:**

1. Go to your service: https://dashboard.render.com
2. Navigate to: Environment → Environment Variables
3. **Update these variables:**

```bash
# Stripe Production Keys
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_PUBLISHABLE_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Make sure these are also set
NODE_ENV=production
APP_URL=https://aiagent.ringlypro.com
```

4. **Click:** Save Changes
5. **Render will automatically redeploy** with new variables

---

### Step 4: Update Mobile App with Live Keys

**In your mobile app code:**

```javascript
// Before (Test Mode)
const STRIPE_PUBLISHABLE_KEY = 'pk_test_...';

// After (Production)
const STRIPE_PUBLISHABLE_KEY = 'pk_live_...'; // From Step 1
```

**Or use environment-based config:**
```javascript
const STRIPE_PUBLISHABLE_KEY = __DEV__
  ? 'pk_test_...'  // Development
  : 'pk_live_...'; // Production
```

---

## 🔐 Security Checklist

- [ ] Live API keys stored ONLY in Render environment variables
- [ ] Webhook secret configured in Render
- [ ] SSL/HTTPS enabled (already done ✅)
- [ ] Test keys removed from mobile app for production builds
- [ ] `.env` files added to `.gitignore` (never commit keys!)

---

## 🧪 Testing Live Payments (Before Launch)

### Test with Real Card (Small Amount)

1. **Use the reload endpoint:**
```bash
curl -X POST https://aiagent.ringlypro.com/api/credits/reload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1.00}'
```

2. **Response will include:**
```json
{
  "success": true,
  "clientSecret": "pi_xxx_secret_xxx",
  "transactionId": 123,
  "amount": 1.00
}
```

3. **In mobile app:**
   - Use Stripe SDK to confirm payment with `clientSecret`
   - Use your real credit card for $1.00 test
   - Verify payment succeeds

4. **Check Stripe Dashboard:**
   - Payment should appear in Live mode
   - Status: Succeeded
   - Webhook should fire

5. **Verify in RinglyPro:**
```bash
# Check balance updated
curl https://aiagent.ringlypro.com/api/credits/balance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected: Balance increased by $1.00

---

## 🔔 Webhook Verification

### How Webhooks Work:

1. **Customer pays** via mobile app
2. **Stripe sends webhook** to: `https://aiagent.ringlypro.com/api/credits/webhooks/stripe`
3. **Backend verifies signature** using `STRIPE_WEBHOOK_SECRET`
4. **Credits added** to customer account automatically
5. **Service unlocked** if it was blocked

### Test Webhook:

1. In Stripe Dashboard → Webhooks
2. Find your webhook endpoint
3. Click "Send test webhook"
4. Select event: `payment_intent.succeeded`
5. Verify backend logs show: "Webhook received and processed"

---

## 💳 Payment Flow Architecture

### Frontend (Mobile App):
```javascript
// 1. User taps "Add $10"
const amount = 10.00;

// 2. Call backend to create payment intent
const response = await fetch('https://aiagent.ringlypro.com/api/credits/reload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ amount })
});

const { clientSecret } = await response.json();

// 3. Use Stripe SDK to confirm payment
const { error, paymentIntent } = await stripe.confirmPayment({
  clientSecret,
  paymentMethodType: 'Card',
  // Payment details from user
});

// 4. If success, show confirmation
if (paymentIntent.status === 'succeeded') {
  alert('Payment successful! Credits added.');
  // Refresh balance
}
```

### Backend Flow:
```
1. POST /api/credits/reload → Create Stripe PaymentIntent
2. Return clientSecret to mobile app
3. Mobile app collects payment → Stripe processes
4. Stripe sends webhook → POST /api/credits/webhooks/stripe
5. Backend adds credits → Updates database
6. Service unlocked automatically
```

---

## 📊 Stripe Dashboard Monitoring

### After Going Live, Monitor:

1. **Payments Tab:**
   - Check successful transactions
   - Monitor failed payments
   - Review refund requests

2. **Webhooks Tab:**
   - Ensure 100% delivery rate
   - Check for failed webhooks
   - Review retry attempts

3. **Customers Tab:**
   - View customer payment history
   - Manage saved payment methods (for auto-reload)

4. **Disputes Tab:**
   - Handle chargebacks
   - Respond to customer disputes

---

## 🚨 Common Issues & Solutions

### Issue 1: Webhook Not Firing
**Cause:** Wrong endpoint URL or signing secret
**Solution:**
- Verify URL: `https://aiagent.ringlypro.com/api/credits/webhooks/stripe`
- Check `STRIPE_WEBHOOK_SECRET` in Render matches Stripe
- Test with "Send test webhook" in Stripe Dashboard

### Issue 2: Payment Succeeds but Credits Not Added
**Cause:** Webhook signature verification fails
**Solution:**
- Check backend logs for "Webhook signature verification failed"
- Ensure `STRIPE_WEBHOOK_SECRET` is correct
- Verify webhook endpoint is using `express.raw()` middleware

### Issue 3: "Stripe not configured" Error
**Cause:** Environment variables not loaded
**Solution:**
- Verify `STRIPE_SECRET_KEY` set in Render
- Redeploy service after adding variables
- Check logs: Should see "Stripe configured" on startup

### Issue 4: Payment Intent Creation Fails
**Cause:** Using test key with live data (or vice versa)
**Solution:**
- Ensure using `sk_live_...` key in production
- Mobile app uses `pk_live_...` key
- Both must be from same mode (test/live)

---

## 🔄 Auto-Reload Configuration

### Enable Auto-Reload for Customers:

**Endpoint:** `POST /api/credits/auto-reload`

```json
{
  "enabled": true,
  "amount": 20.00,
  "threshold": 5.00,
  "paymentMethodId": "pm_xxx" // From Stripe SDK
}
```

**How it works:**
1. Customer saves payment method in Stripe
2. When balance < $5.00, auto-charge $20.00
3. Credits added immediately
4. Customer receives notification

**Mobile UI Flow:**
```javascript
// 1. Save payment method with Stripe
const { paymentMethod } = await stripe.createPaymentMethod({
  type: 'card',
  card: cardElement,
});

// 2. Configure auto-reload
await fetch('/api/credits/auto-reload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    enabled: true,
    amount: 20.00,
    threshold: 5.00,
    paymentMethodId: paymentMethod.id
  })
});
```

---

## 📈 Pricing Configuration

### Current Settings:
- **Free Tier:** 100 minutes/month (resets 1st of month)
- **Per-Minute Rate:** $0.20
- **Reload Options:** $10, $20, $50, $100, Custom

### To Change Pricing:
```sql
-- Update per-minute rate
UPDATE clients SET per_minute_rate = 0.25 WHERE id = ALL;

-- Update free tier
UPDATE clients SET monthly_free_minutes = 150 WHERE id = ALL;
```

---

## 🔍 Testing Checklist (Before Tuesday)

### Pre-Launch Tests:

- [ ] Get live Stripe API keys
- [ ] Configure webhook in Stripe
- [ ] Update Render environment variables
- [ ] Update mobile app with live publishable key
- [ ] Test $1.00 payment with real card
- [ ] Verify webhook fires successfully
- [ ] Confirm credits added to account
- [ ] Test service unlock after payment
- [ ] Test all reload amounts ($10, $20, $50, $100)
- [ ] Test payment failure handling
- [ ] Verify transaction history displays correctly
- [ ] Test auto-reload configuration
- [ ] Monitor Stripe dashboard for test payment

### Production Verification:

- [ ] Remove test endpoints from [src/routes/credits.js](src/routes/credits.js:288-403)
- [ ] Verify `NODE_ENV=production` in Render
- [ ] SSL certificate valid (already ✅)
- [ ] Error logging configured
- [ ] Backup/monitoring systems active

---

## 📞 Support Resources

### Stripe Support:
- **Docs:** https://stripe.com/docs
- **Support:** https://support.stripe.com
- **API Status:** https://status.stripe.com

### RinglyPro Endpoints:
- **Reload:** `POST /api/credits/reload`
- **Webhook:** `POST /api/credits/webhooks/stripe`
- **Balance:** `GET /api/credits/balance`
- **Transactions:** `GET /api/credits/transactions`

---

## 🚀 Launch Day Checklist

### Monday (Day Before Launch):

1. [ ] Switch Stripe to live mode
2. [ ] Update all environment variables
3. [ ] Deploy mobile app with live keys
4. [ ] Run complete payment test
5. [ ] Monitor webhooks for 24 hours

### Tuesday (Launch Day):

1. [ ] Verify all systems operational
2. [ ] Monitor Stripe dashboard actively
3. [ ] Watch for failed payments
4. [ ] Be ready to respond to webhook issues
5. [ ] Track first customer payments

### Post-Launch:

1. [ ] Review payment success rate
2. [ ] Check webhook delivery rate
3. [ ] Monitor customer credit usage
4. [ ] Collect payment-related feedback
5. [ ] Adjust pricing if needed

---

## ✅ Production Ready Status

**Current:** Test mode configured ✅
**Next Step:** Get live API keys from Stripe
**Timeline:** Complete by Monday for Tuesday launch

**Status:** READY TO SWITCH TO PRODUCTION 🚀

---

## 📝 Quick Reference

### Environment Variables Needed:
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NODE_ENV=production
APP_URL=https://aiagent.ringlypro.com
```

### Key Files:
- Backend: [src/routes/credits.js](src/routes/credits.js)
- Service: [src/services/creditSystem.js](src/services/creditSystem.js)
- Webhook: Line 221 in credits.js

### Test Command:
```bash
curl -X POST https://aiagent.ringlypro.com/api/credits/reload \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1.00}'
```

---

**Questions? Check Stripe docs or test in sandbox first!** 🎯
