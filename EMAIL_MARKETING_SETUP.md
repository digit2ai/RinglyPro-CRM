# Email Marketing Setup Guide

## Overview
The Email Marketing tool integrates SendGrid for transactional and marketing emails with webhook tracking and analytics.

## ✅ Completed Setup
- [x] SendGrid service layer (`src/services/sendgrid.js`)
- [x] Email API routes (`src/routes/email.js`)
- [x] Email Marketing UI (`public/mcp-copilot/email-marketing.html`)
- [x] Database schema (`db/email_events.sql`)
- [x] Routes registered in app.js
- [x] @sendgrid/mail package already installed
- [x] Button added to MCP Copilot

## 🔧 Required Configuration

### 1. Database Migration
Run the SQL migration to create the `email_events` table:

```bash
# If using psql directly
psql $DATABASE_URL < db/email_events.sql

# Or connect to your database and run:
\i db/email_events.sql
```

The table stores email events (delivered, opened, clicked, bounced, etc.) from SendGrid webhooks.

### 2. Environment Variables
Add these variables to your `.env` file:

```bash
# ==========================================
# SENDGRID EMAIL MARKETING CONFIGURATION
# ==========================================

# SendGrid API Key (get from https://app.sendgrid.com/settings/api_keys)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx

# From Addresses
SENDGRID_FROM_NAME=RinglyPro
SENDGRID_FROM_EMAIL=notify@ringlypro.com
SENDGRID_MARKETING_FROM=updates@ringlypro.com
SENDGRID_REPLY_TO=info@digit2ai.com

# Webhook Verification (optional but recommended)
# Get public key from SendGrid webhook settings
SENDGRID_EVENT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nYOUR_PUBLIC_KEY_HERE\n-----END PUBLIC KEY-----"

# Tracking Domain (configure in SendGrid first)
SENDGRID_TRACKING_DOMAIN=track.ringlypro.com

# Unsubscribe Group ID (create in SendGrid > Marketing > Unsubscribe Groups)
SENDGRID_UNSUBSCRIBE_GROUP_ID=12345

# Dynamic Template IDs (create templates in SendGrid dashboard)
SENDGRID_TEMPLATE_MISSED_CALL=d-XXXXXXXXXXXXXXX
SENDGRID_TEMPLATE_APPOINTMENT=d-XXXXXXXXXXXXXXX
SENDGRID_TEMPLATE_PASSWORD_RESET=d-XXXXXXXXXXXXXXX
SENDGRID_TEMPLATE_CHAMBER=d-XXXXXXXXXXXXXXX
SENDGRID_TEMPLATE_MARKETING=d-XXXXXXXXXXXXXXX

# App Base URL (for unsubscribe links)
APP_BASE_URL=https://ringlypro-crm.onrender.com
```

### 3. SendGrid Dashboard Setup

#### A. Create API Key
1. Go to https://app.sendgrid.com/settings/api_keys
2. Click "Create API Key"
3. Name it "RinglyPro CRM"
4. Select "Full Access" (or at minimum: Mail Send, Template Engine, Webhooks, Suppressions)
5. Copy the key and add to `.env` as `SENDGRID_API_KEY`

#### B. Domain Authentication (SPF/DKIM/DMARC)
1. Go to Settings > Sender Authentication > Domain Authentication
2. Add `ringlypro.com` domain
3. Follow instructions to add DNS records:
   - **SPF Record**: Proves emails come from authorized servers
   - **DKIM Record**: Cryptographically signs your emails
   - **DMARC Policy**: Tells receivers what to do with failed emails
4. Verify domain after DNS propagation (can take 24-48 hours)

**Example DNS Records:**
```
Type: TXT
Host: @
Value: v=spf1 include:sendgrid.net ~all

Type: CNAME
Host: s1._domainkey
Value: s1.domainkey.u12345.wl123.sendgrid.net

Type: TXT
Host: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@ringlypro.com
```

#### C. Click Tracking Domain (Optional)
1. Go to Settings > Sender Authentication > Link Branding
2. Add subdomain: `track.ringlypro.com`
3. Add DNS CNAME record:
   ```
   Type: CNAME
   Host: track
   Value: sendgrid.net
   ```
4. Add to `.env` as `SENDGRID_TRACKING_DOMAIN`

#### D. Create Dynamic Templates
1. Go to Email API > Dynamic Templates
2. Create templates for each email type:

**Template: Missed Call Follow-up**
```
Name: missed_call_followup
Subject: We Missed Your Call - {{business_name}}
Content:
  Hi {{contact_name}},

  We noticed you tried to reach us at {{business_name}} but we were unable to answer.
  We'd love to connect with you!

  {{#if callback_requested}}
  We'll call you back at {{phone}} shortly.
  {{/if}}

  Or schedule a time: {{appointment_link}}

  Best regards,
  {{business_name}} Team
```

**Template: Appointment Confirmation**
```
Name: appointment_confirm
Subject: Appointment Confirmed - {{appointment_date}}
Content:
  Hi {{contact_name}},

  Your appointment is confirmed!

  📅 Date: {{appointment_date}}
  🕐 Time: {{appointment_time}}
  📍 Location: {{location}}

  Need to reschedule? Call us at {{business_phone}}

  See you soon!
  {{business_name}}
```

**Template: Chamber of Commerce Invite**
```
Name: chamber_invite
Subject: Join {{chamber_name}} - Exclusive Business Opportunity
Content:
  Hello {{contact_name}},

  We're reaching out from {{chamber_name}} to invite your business to join our thriving community!

  Benefits include:
  - Networking events
  - Business directory listing
  - Marketing opportunities
  - Community support

  Learn more: {{chamber_website}}

  Best regards,
  {{chamber_name}}
```

3. Copy template IDs (format: `d-XXXXXXXXXXXXXXX`) and add to `.env`

#### E. Configure Event Webhooks
1. Go to Settings > Mail Settings > Event Webhooks
2. Click "Create new webhook"
3. **Webhook URL**: `https://ringlypro-crm.onrender.com/api/email/webhooks/sendgrid`
4. Select events to track:
   - ✅ Delivered
   - ✅ Opens
   - ✅ Clicks
   - ✅ Bounces
   - ✅ Spam Reports
   - ✅ Unsubscribes
   - ✅ Dropped
5. **Event Webhook Signature**: Enable (optional but recommended)
6. Copy public key and add to `.env` as `SENDGRID_EVENT_PUBLIC_KEY`
7. Click "Save"

#### F. Create Unsubscribe Group (for Marketing Emails)
1. Go to Marketing > Unsubscribe Groups
2. Click "Create New Group"
3. Name: "RinglyPro Marketing Emails"
4. Description: "Promotional and marketing emails from RinglyPro"
5. Copy Group ID and add to `.env` as `SENDGRID_UNSUBSCRIBE_GROUP_ID`

### 4. Test the Integration

#### Test Email Sending
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<h1>Hello from RinglyPro!</h1><p>This is a test email.</p>",
    "category": "transactional"
  }'
```

#### Test Webhook Reception
SendGrid will send test events to your webhook URL. Monitor server logs:
```bash
# Should see logs like:
📬 Received 3 SendGrid webhook events
  ✓ delivered - test@example.com
  ✓ open - test@example.com
  ✓ click - test@example.com
```

#### Check Email Stats
```bash
curl https://ringlypro-crm.onrender.com/api/email/stats?range=7d
```

## 📊 Available API Endpoints

All mounted at `/api/email`:

### POST `/api/email/send`
Send single email
```json
{
  "to": "user@example.com",
  "template": "missed_call_followup",
  "data": {
    "contact_name": "John Smith",
    "business_name": "RinglyPro"
  },
  "category": "transactional"
}
```

### POST `/api/email/send-bulk`
Send batch emails
```json
{
  "emails": [
    {
      "to": "user1@example.com",
      "template": "chamber_invite",
      "data": { "contact_name": "Jane" },
      "category": "marketing"
    }
  ]
}
```

### POST `/api/email/preview`
Preview email in sandbox mode (no delivery)
```json
{
  "template": "appointment_confirm",
  "data": {
    "contact_name": "Test User",
    "appointment_date": "2025-10-25"
  }
}
```

### GET `/api/email/stats?range=7d&category=marketing`
Get email analytics
- `range`: 24h, 7d, 30d
- `category`: transactional, marketing, chamber_outreach (optional)

### GET `/api/email/templates`
List available templates

### GET `/api/email/events?limit=50&event=open`
Query stored webhook events
- `limit`: Number of events (default 50)
- `event`: delivered, open, click, bounce, etc. (optional)
- `email`: Filter by recipient (optional)
- `category`: Filter by category (optional)

### POST `/api/email/webhooks/sendgrid`
SendGrid event webhook (configured in SendGrid dashboard)

## 🎯 Email Marketing UI

Access the Email Marketing tool at:
```
https://ringlypro-crm.onrender.com/mcp-copilot/email-marketing.html?client_id=YOUR_CLIENT_ID
```

Or click the "📧 Email Marketing" button in the MCP Copilot sidebar.

### Features:
- **Template Selection**: Custom, Chamber Invite, Follow-up
- **Single & Bulk Email Modes**: Send to one recipient or upload email lists
- **CSV/TXT Upload**: Upload files with email addresses
- **Email List Validation**: Automatically detect and validate email addresses
- **Batch Processing**: Sends bulk emails in batches of 100 (SendGrid best practice)
- **Compose Emails**: Rich text editor with character counter
- **Category Selection**: Marketing, Chamber Outreach, Transactional
- **Email Stats**: Sent, delivered, open rate, click rate
- **Recent Emails**: View last 10 emails sent
- **Real-time Updates**: Auto-refresh stats and history

### How to Send Bulk Emails:

1. **Click "Bulk Email List" button** at the top of the compose form
2. **Upload a file** (CSV or TXT format):
   - Click "Choose CSV/TXT File"
   - Select your file with one email per line
   - File will be automatically loaded and parsed
3. **Or paste email list directly**:
   - One email per line
   - Supports CSV format with commas
   - Automatically removes duplicates
4. **Validate emails** (optional):
   - Click "Validate Emails" button
   - View any invalid emails found
   - Invalid emails will be filtered out before sending
5. **Compose your message**:
   - Select a template or use custom HTML
   - Write subject and message
   - Choose email category
6. **Send**:
   - Click "Send Bulk Emails"
   - Progress shown for large batches
   - Success/failure count displayed

**Example CSV format:**
```csv
john@example.com
jane@company.com
"contact@business.com"
sales@startup.com, support@startup.com
```

**Example TXT format:**
```
john@example.com
jane@company.com
contact@business.com
sales@startup.com
```

## 🔐 Security Best Practices

1. **Never commit API keys** - Keep `.env` in `.gitignore`
2. **Enable webhook signature verification** - Validates events from SendGrid
3. **Use HTTPS only** - Required for webhook callbacks
4. **Implement rate limiting** - Prevent abuse of email sending endpoints
5. **Validate email addresses** - Use validator.js before sending
6. **Monitor bounce rates** - High bounce rates hurt sender reputation
7. **Honor unsubscribes** - Always include unsubscribe links in marketing emails

## 📈 Deliverability Tips

1. **Warm up your domain** - Start with low volume, gradually increase
2. **Maintain clean lists** - Remove bounced/invalid emails
3. **Avoid spam triggers** - Don't use ALL CAPS, excessive punctuation!!!
4. **Authenticate your domain** - Complete SPF, DKIM, DMARC setup
5. **Monitor sender reputation** - Use tools like Google Postmaster
6. **Test before sending** - Use preview mode to check rendering
7. **Segment your audience** - Send relevant content to targeted groups

## 🆘 Troubleshooting

### Emails not sending
- Check `SENDGRID_API_KEY` is set correctly
- Verify domain authentication is complete
- Check SendGrid dashboard for errors
- Review server logs for error messages

### Webhooks not received
- Verify webhook URL is publicly accessible (HTTPS)
- Check webhook signature verification (disable for testing)
- Review SendGrid webhook activity logs
- Ensure `email_events` table exists in database

### Low open/click rates
- Improve subject lines (A/B test)
- Send at optimal times (9-11 AM, Tue-Thu)
- Personalize content with dynamic data
- Ensure mobile-responsive templates
- Verify tracking domain is configured

### Bounces/Spam reports
- Validate email addresses before sending
- Remove bounced emails from lists
- Include clear unsubscribe links
- Avoid purchased/scraped email lists
- Monitor sender reputation score

## 📚 Resources

- **SendGrid Docs**: https://docs.sendgrid.com/
- **Email Marketing Best Practices**: https://sendgrid.com/marketing/email-marketing-best-practices/
- **Dynamic Templates Guide**: https://docs.sendgrid.com/ui/sending-email/how-to-send-an-email-with-dynamic-templates
- **Webhook Event Reference**: https://docs.sendgrid.com/for-developers/tracking-events/event
- **Sender Authentication**: https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication

## ✨ Next Steps

1. Run database migration (`db/email_events.sql`)
2. Add SendGrid environment variables to `.env`
3. Create SendGrid API key
4. Authenticate domain (SPF/DKIM/DMARC)
5. Create dynamic templates
6. Configure event webhook
7. Test email sending
8. Deploy and monitor

---

**Questions or issues?** Contact RinglyPro support or check SendGrid documentation.
