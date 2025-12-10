# 🏪 Vagaro Integration Guide

Complete guide for integrating Vagaro salon/spa scheduling platform with RinglyPro CRM.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Webhook Configuration](#webhook-configuration)
- [API Endpoints](#api-endpoints)
- [Features](#features)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The Vagaro integration provides **two-way synchronization** between Vagaro and RinglyPro:

### **What Gets Synced:**
- ✅ **Appointments** - Real-time booking, modifications, cancellations
- ✅ **Customers** - Contact information, profile updates
- ✅ **Employees** - Staff schedules and information
- ✅ **Locations** - Business location details
- ✅ **Transactions** - Payment processing events

### **Automatic Features:**
- 📱 **SMS Notifications** - Automatic appointment confirmations and reminders
- 🤖 **Rachel Voice AI** - Call customers with appointment reminders
- 📧 **Email Alerts** - Notify staff of new bookings
- 📊 **CRM Sync** - Keep contact database up-to-date
- 📅 **Calendar Integration** - View all appointments in RinglyPro

---

## ✅ Prerequisites

### 1. **Vagaro Account Requirements**
- ✓ Vagaro account with **Credit Card Processing** enabled
- ✓ **NOT** on free trial
- ✓ Using web version of Vagaro
- ✓ **Enterprise Sales Team approval** required

### 2. **Contact Vagaro**
Contact Vagaro Enterprise Sales to enable API & Webhooks:
- Email: enterprise@vagaro.com
- Phone: Check Vagaro support for latest contact
- Tell them: "I want to enable APIs & Webhooks for my account"

### 3. **Get API Credentials**
Once approved, navigate to:
1. Vagaro Dashboard → **Settings**
2. **Developers** → **APIs & Webhooks**
3. Copy your **API Key** and **Merchant ID**

---

## 🔧 Setup Instructions

### Step 1: Update Environment Variables

Add these to your `.env` file:

```bash
# Vagaro Salon/Spa Scheduling Integration
VAGARO_API_KEY=your_actual_api_key_here
VAGARO_MERCHANT_ID=your_actual_merchant_id_here
VAGARO_WEBHOOK_TOKEN=your_webhook_verification_token_here
VAGARO_API_URL=https://api.vagaro.com/v1
```

### Step 2: Run Database Migration

```bash
node scripts/migrate-vagaro.js
```

This adds `vagaro_id` fields to your database for tracking synced records.

### Step 3: Restart Your Server

```bash
npm start
```

You should see:
```
✅ Vagaro routes mounted at /api/vagaro
```

### Step 4: Verify Integration

Test the connection:

```bash
curl http://localhost:3000/api/vagaro/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "success": true,
  "configured": true,
  "connected": true,
  "message": "Vagaro integration is active"
}
```

---

## 🔗 Webhook Configuration

### Configure Webhooks in Vagaro

1. Go to Vagaro → **Settings** → **Developers** → **APIs & Webhooks**
2. Click **Create Webhook** (max 10 webhooks total)
3. Set up webhooks for each event type:

#### Webhook #1: Appointments
- **Event Type:** Appointments
- **Endpoint URL:** `https://your-domain.com/api/vagaro/webhooks/appointment`
- **Verification Token:** Copy from Vagaro → Add to your `.env` as `VAGARO_WEBHOOK_TOKEN`

#### Webhook #2: Customers
- **Event Type:** Customers
- **Endpoint URL:** `https://your-domain.com/api/vagaro/webhooks/customer`
- **Verification Token:** (same token as above)

#### Webhook #3: Transactions
- **Event Type:** Transactions
- **Endpoint URL:** `https://your-domain.com/api/vagaro/webhooks/transaction`
- **Verification Token:** (same token as above)

### Webhook Security

All webhooks are verified using the `X-Vagaro-Verification-Token` header. Make sure your token in `.env` matches the one shown in Vagaro dashboard.

---

## 🌐 API Endpoints

### Authentication
All API endpoints require JWT authentication. Include header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Appointments

#### Get All Appointments
```bash
GET /api/vagaro/appointments?startDate=2025-01-01&endDate=2025-12-31&status=confirmed
```

#### Get Single Appointment
```bash
GET /api/vagaro/appointments/:appointmentId
```

#### Create Appointment
```bash
POST /api/vagaro/appointments
Content-Type: application/json

{
  "customerId": "12345",
  "employeeId": "67890",
  "serviceId": "111",
  "date": "2025-12-15",
  "time": "14:00",
  "notes": "First time client"
}
```

#### Update Appointment
```bash
PUT /api/vagaro/appointments/:appointmentId
Content-Type: application/json

{
  "date": "2025-12-16",
  "time": "15:00"
}
```

#### Cancel Appointment
```bash
DELETE /api/vagaro/appointments/:appointmentId
```

### Customers

#### Get All Customers
```bash
GET /api/vagaro/customers
```

#### Get Single Customer
```bash
GET /api/vagaro/customers/:customerId
```

### Employees

#### Get All Employees
```bash
GET /api/vagaro/employees
```

### Locations

#### Get All Locations
```bash
GET /api/vagaro/locations
```

### Manual Sync

#### Sync All Appointments
```bash
POST /api/vagaro/sync/appointments
```

Response:
```json
{
  "success": true,
  "message": "Synced 47 of 47 appointments",
  "synced": 47,
  "total": 47
}
```

#### Sync All Customers
```bash
POST /api/vagaro/sync/customers
```

---

## ⚡ Features

### 1. **Automatic SMS Notifications**

When appointments are created/cancelled via Vagaro, customers automatically receive SMS:

**New Appointment:**
> "Your appointment has been confirmed for Dec 15, 2025 at 2:00 PM. Thank you!"

**Cancellation:**
> "Your appointment for Dec 15, 2025 at 2:00 PM has been cancelled."

**New Customer:**
> "Welcome to our salon! We're excited to serve you. Book your appointment anytime!"

### 2. **Rachel Voice AI Integration**

Combine with Rachel Voice AI for automated appointment reminders:

```javascript
// Rachel will call customers 24 hours before appointment
const rachelService = require('./services/rachelVoiceService');

await rachelService.makeCall(customer.phone, {
  message: `Hi ${customer.firstName}, this is Rachel calling from ${businessName}.
           Just a friendly reminder about your appointment tomorrow at ${appointmentTime}.
           If you need to reschedule, please give us a call. Have a great day!`
});
```

### 3. **Two-Way Sync**

- **Vagaro → RinglyPro:** Webhooks push changes instantly
- **RinglyPro → Vagaro:** API calls create/update Vagaro records

### 4. **Duplicate Prevention**

The integration uses `vagaro_id` fields to prevent duplicate records:
- Checks for existing contacts by Vagaro ID or phone number
- Updates existing records instead of creating duplicates
- Maintains data integrity across both systems

---

## 🧪 Testing

### Test Webhook Locally with ngrok

1. Install ngrok:
```bash
npm install -g ngrok
```

2. Start your local server:
```bash
npm start
```

3. Expose your localhost:
```bash
ngrok http 3000
```

4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

5. Update Vagaro webhooks to use:
```
https://abc123.ngrok.io/api/vagaro/webhooks/appointment
https://abc123.ngrok.io/api/vagaro/webhooks/customer
https://abc123.ngrok.io/api/vagaro/webhooks/transaction
```

6. Test by creating an appointment in Vagaro

7. Check your terminal for webhook logs:
```
[INFO] [VAGARO] Received appointment webhook: appointment.created for appointment 12345
[INFO] [VAGARO] Created new RinglyPro appointment for Vagaro ID 12345
```

### Test API Endpoints

```bash
# Get integration status
curl http://localhost:3000/api/vagaro/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get appointments
curl http://localhost:3000/api/vagaro/appointments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get customers
curl http://localhost:3000/api/vagaro/customers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Manual sync
curl -X POST http://localhost:3000/api/vagaro/sync/appointments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🔍 Troubleshooting

### Issue: "Vagaro API credentials not configured"

**Solution:**
- Check `.env` file has `VAGARO_API_KEY` and `VAGARO_MERCHANT_ID`
- Restart your server after updating `.env`
- Verify credentials are correct in Vagaro dashboard

### Issue: Webhooks not receiving events

**Solution:**
1. Check webhook URLs are correct in Vagaro dashboard
2. Verify `VAGARO_WEBHOOK_TOKEN` in `.env` matches Vagaro
3. Check Vagaro webhook status shows "Active"
4. Use ngrok for local testing
5. Check server logs for webhook attempts

### Issue: "Connection error" in status check

**Solution:**
- Verify API key is valid (not expired)
- Check internet connection
- Confirm Vagaro API is accessible: `curl https://api.vagaro.com/v1`
- Contact Vagaro support if API is down

### Issue: Duplicate contacts/appointments

**Solution:**
- Run migration again: `node scripts/migrate-vagaro.js`
- Check `vagaro_id` fields exist: `SELECT vagaro_id FROM contacts LIMIT 5;`
- Clear duplicates and re-sync

### Issue: SMS notifications not sending

**Solution:**
- Verify Twilio credentials in `.env`
- Check `smsService` is properly configured
- Ensure phone numbers are in E.164 format (+1234567890)
- Check Twilio logs for delivery status

---

## 📚 Additional Resources

### Official Documentation
- [Vagaro API Documentation](https://docs.vagaro.com/)
- [Set Up Webhooks From Vagaro](https://support.vagaro.com/hc/en-us/articles/29521637950875-Set-Up-Webhooks-From-Vagaro)
- [Vagaro APIs & Webhooks](https://www.vagaro.com/pro/updates/webhooks)
- [Developer Features](https://support.vagaro.com/hc/en-us/categories/34949493949851-Developer-Features)

### RinglyPro Resources
- [Rachel Voice AI Setup](/docs/RACHEL_VOICE.md)
- [SMS Service Configuration](/docs/SMS_SETUP.md)
- [Authentication Guide](/docs/AUTH.md)

---

## 💬 Support

Need help with Vagaro integration?

- **Vagaro Support:** support@vagaro.com
- **RinglyPro Issues:** Open a GitHub issue
- **Enterprise Sales:** Contact Vagaro for API access

---

## ✨ What's Next?

After setting up Vagaro integration, consider:

1. **Automated Reminders** - Set up Rachel Voice AI to call customers
2. **Email Campaigns** - Use SendGrid integration for email marketing
3. **Analytics Dashboard** - Track appointment trends and revenue
4. **Multi-Location Support** - Sync multiple salon locations
5. **Custom Workflows** - Build custom automation with webhooks

---

**🎉 Congratulations! Your Vagaro integration is complete.**

Your RinglyPro CRM now seamlessly syncs with Vagaro for powerful salon/spa management.
