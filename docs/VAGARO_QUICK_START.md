# 🚀 Vagaro Integration - Quick Start Guide

## For RinglyPro Clients (Multitenant Setup)

### ⚡ 5-Minute Setup

#### 1. Get Vagaro API Access (One-Time)
Contact Vagaro Enterprise Sales: **enterprise@vagaro.com**
Say: *"I want to enable OAuth API access & Webhooks for my RinglyPro integration"*

**What you'll receive from Vagaro:**
- **Client ID** (OAuth application ID)
- **Client Secret Key** (OAuth secret for authentication)
- **Merchant ID** (your Vagaro business ID)
- **Webhook Verification Token** (for security)
- **Region** (e.g., us01, us02, us03, us04, us05)

**Cost:** $10/month (Vagaro Enterprise API add-on)

#### 2. Configure Your Vagaro Credentials in RinglyPro (2 minutes)
1. Log in to RinglyPro: **https://aiagent.ringlypro.com**
2. Go to: **Settings → Integrations → Vagaro**
3. Enter YOUR Vagaro OAuth credentials:
   - **Client ID** (OAuth application ID from step 1)
   - **Client Secret Key** (OAuth secret from step 1)
   - **Merchant ID** (from step 1)
   - **Webhook Token** (from step 1)
   - **Region** (e.g., us01 - default)
4. Toggle **Enable Integration** to ON
5. Click **"Save Settings"**
6. Click **"Test Connection"** ✅

**Note:** Each salon/spa business has their own Vagaro account with their own OAuth credentials. This is a multitenant system where each client uses their own Vagaro integration.

#### 3. Set Up Webhooks in YOUR Vagaro Dashboard (2 minutes)
Log in to your Vagaro account and copy these URLs into Vagaro → Settings → Developer → Webhooks:

```
Appointments: https://aiagent.ringlypro.com/api/vagaro/webhooks/appointment
Customers:    https://aiagent.ringlypro.com/api/vagaro/webhooks/customer
Transactions: https://aiagent.ringlypro.com/api/vagaro/webhooks/transaction
```

**Important:** Use YOUR webhook verification token from step 2

#### 4. Test It! (1 minute)
Call your RinglyPro number → Say "I need an appointment" → Lina/Rachel books it in YOUR Vagaro account → Done! ✅

---

## What You Get

✅ **Lina/Rachel** books appointments automatically
✅ **Vagaro** sends SMS/email confirmations
✅ **Real-time** calendar sync
✅ **No manual work** - fully automated
✅ **HIPAA compliant** - secure & private

---

## Need Help?

📖 [Full Documentation](VAGARO_INTEGRATION.md)
📖 [Lina + Vagaro Guide](LINA_VAGARO_INTEGRATION.md)
📧 support@ringlypro.com
📞 Vagaro Support: support@vagaro.com

---

**That's it! Your voice assistant + Vagaro integration is live.** 🎉
