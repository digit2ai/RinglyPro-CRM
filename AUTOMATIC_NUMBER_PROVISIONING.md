# 🤖 Automatic Twilio Number Provisioning

**Status:** ✅ **READY TO USE**
**Date:** October 6, 2025

---

## 🎯 Overview

When a new client signs up, the system now **automatically**:
1. ✅ Purchases a new Twilio phone number
2. ✅ Configures webhooks for bilingual voice bot (Rachel/Lina)
3. ✅ Assigns the number to the client in the database
4. ✅ Enables Rachel voice bot automatically

**No manual configuration needed!** 🎉

---

## 🚀 Quick Start

### **Create a New Client with Auto-Provisioning:**

```bash
curl -X POST https://aiagent.ringlypro.com/api/clients/provision \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "Acme Corp",
    "email": "contact@acmecorp.com",
    "user_id": 123,
    "areaCode": "888",
    "tollFree": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Client provisioned successfully",
  "client": {
    "id": 18,
    "business_name": "Acme Corp",
    "email": "contact@acmecorp.com",
    "ringlypro_number": "+18885551234",
    "twilio_number_sid": "PN1234567890abcdef",
    "rachel_enabled": true,
    "active": true,
    "voice_webhook": "https://aiagent.ringlypro.com/voice/rachel/",
    "sms_webhook": "https://aiagent.ringlypro.com/webhook/twilio/sms"
  },
  "number_details": {
    "phoneNumber": "+18885551234",
    "friendlyName": "Acme Corp - RinglyPro",
    "locality": "NATIONWIDE",
    "region": "US",
    "capabilities": {
      "voice": true,
      "sms": true,
      "mms": true
    }
  }
}
```

---

## 📡 API Endpoints

### **1. Provision New Client**
```
POST /api/clients/provision
```

**Request Body:**
```json
{
  "business_name": "Business Name",      // Required
  "email": "email@example.com",          // Required
  "user_id": 123,                        // Optional
  "areaCode": "888",                     // Optional (any area code)
  "tollFree": true,                      // Optional (true for 1-800/888 numbers)
  "custom_greeting": "Welcome message"   // Optional
}
```

**What It Does:**
- Searches for available Twilio numbers
- Purchases the first available number
- Configures webhooks automatically:
  - Voice: `https://aiagent.ringlypro.com/voice/rachel/`
  - SMS: `https://aiagent.ringlypro.com/webhook/twilio/sms`
  - Fallback: `https://aiagent.ringlypro.com/voice/rachel/`
- Creates client in database with `rachel_enabled = true`
- Returns complete client and number details

---

### **2. Search Available Numbers**
```
POST /api/clients/search-numbers
```

**Request Body:**
```json
{
  "areaCode": "212",      // Optional
  "country": "US",        // Optional (default: US)
  "tollFree": false,      // Optional (default: false)
  "limit": 10             // Optional (default: 10)
}
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "numbers": [
    {
      "phoneNumber": "+12125551234",
      "friendlyName": "(212) 555-1234",
      "locality": "NEW YORK",
      "region": "NY",
      "postalCode": "10001",
      "capabilities": {
        "voice": true,
        "sms": true,
        "mms": true
      }
    }
  ]
}
```

---

### **3. Get Client Number Details**
```
GET /api/clients/:clientId/number
```

**Response:**
```json
{
  "client": {
    "id": 18,
    "business_name": "Acme Corp",
    "ringlypro_number": "+18885551234"
  },
  "number": {
    "sid": "PN1234567890abcdef",
    "phoneNumber": "+18885551234",
    "friendlyName": "Acme Corp - RinglyPro",
    "voiceUrl": "https://aiagent.ringlypro.com/voice/rachel/",
    "smsUrl": "https://aiagent.ringlypro.com/webhook/twilio/sms",
    "capabilities": {
      "voice": true,
      "sms": true,
      "mms": false
    },
    "status": "in-use"
  }
}
```

---

### **4. Update Webhooks**
```
PUT /api/clients/:clientId/number/webhooks
```

**What It Does:**
- Updates the client's Twilio number webhooks
- Ensures webhooks point to latest Rachel endpoint
- Useful for fixing misconfigured numbers

**Response:**
```json
{
  "success": true,
  "message": "Webhooks updated successfully",
  "number": {
    "sid": "PN1234567890abcdef",
    "phoneNumber": "+18885551234",
    "voiceUrl": "https://aiagent.ringlypro.com/voice/rachel/",
    "smsUrl": "https://aiagent.ringlypro.com/webhook/twilio/sms"
  }
}
```

---

### **5. List All Numbers**
```
GET /api/clients/numbers/all
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "numbers": [
    {
      "sid": "PN1234567890abcdef",
      "phoneNumber": "+18886103810",
      "friendlyName": "RinglyPro Test - RinglyPro",
      "voiceUrl": "https://aiagent.ringlypro.com/voice/rachel/",
      "smsUrl": "https://aiagent.ringlypro.com/webhook/twilio/sms"
    }
  ]
}
```

---

## 🔧 Service Methods

The `TwilioNumberProvisioning` service provides these methods:

### **searchAvailableNumbers(options)**
```javascript
const numbers = await provisioning.searchAvailableNumbers({
    areaCode: '888',
    country: 'US',
    tollFree: true,
    limit: 10
});
```

### **purchaseAndConfigureNumber(phoneNumber, options)**
```javascript
const number = await provisioning.purchaseAndConfigureNumber(
    '+18885551234',
    { friendlyName: 'Acme Corp - RinglyPro' }
);
```

### **provisionNumberForClient(options)**
```javascript
const number = await provisioning.provisionNumberForClient({
    businessName: 'Acme Corp',
    areaCode: '888',
    tollFree: true
});
```

### **updateWebhooks(phoneNumberSid)**
```javascript
await provisioning.updateWebhooks('PN1234567890abcdef');
```

### **releaseNumber(phoneNumberSid)**
```javascript
await provisioning.releaseNumber('PN1234567890abcdef');
```

---

## 💡 Usage Examples

### **Example 1: Create Client with Toll-Free Number**

```javascript
const response = await fetch('https://aiagent.ringlypro.com/api/clients/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        business_name: 'Tech Startup Inc',
        email: 'hello@techstartup.com',
        tollFree: true
    })
});

const data = await response.json();
console.log(`New number: ${data.client.ringlypro_number}`);
```

### **Example 2: Create Client with Specific Area Code**

```javascript
const response = await fetch('https://aiagent.ringlypro.com/api/clients/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        business_name: 'NYC Law Firm',
        email: 'contact@nylaw.com',
        areaCode: '212',
        custom_greeting: 'Thank you for calling NYC Law Firm'
    })
});
```

### **Example 3: Search for Numbers Before Provisioning**

```javascript
// Step 1: Search for available numbers
const searchResponse = await fetch('https://aiagent.ringlypro.com/api/clients/search-numbers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ areaCode: '415', limit: 5 })
});

const { numbers } = await searchResponse.json();
console.log(`Found ${numbers.length} available numbers in 415 area code`);

// Step 2: Provision with desired area code
const provisionResponse = await fetch('https://aiagent.ringlypro.com/api/clients/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        business_name: 'SF Coffee Shop',
        email: 'hello@sfcoffee.com',
        areaCode: '415'
    })
});
```

---

## 🎯 What Gets Configured Automatically

When you provision a new client, the system automatically configures:

### **Webhooks:**
- ✅ Voice URL: `https://aiagent.ringlypro.com/voice/rachel/`
- ✅ Voice Method: POST
- ✅ Voice Fallback URL: `https://aiagent.ringlypro.com/voice/rachel/`
- ✅ Voice Fallback Method: POST
- ✅ SMS URL: `https://aiagent.ringlypro.com/webhook/twilio/sms`
- ✅ SMS Method: POST
- ✅ Status Callback: `https://aiagent.ringlypro.com/webhook/twilio/status`

### **Database Record:**
- ✅ business_name
- ✅ email
- ✅ ringlypro_number
- ✅ twilio_number_sid
- ✅ rachel_enabled = true
- ✅ active = true
- ✅ created_at / updated_at timestamps

### **Voice Bot Features:**
- ✅ Bilingual greeting (English/Spanish)
- ✅ DTMF language selection
- ✅ Rachel (English) voice
- ✅ Lina (Spanish) voice
- ✅ Appointment booking
- ✅ Name/phone/datetime collection
- ✅ Premium ElevenLabs TTS
- ✅ Fallback to Polly voices

---

## 🔐 Environment Variables Required

Make sure these are set in your environment:

```bash
# Twilio Credentials
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...

# Webhook Base URL
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com

# Database
DATABASE_URL=postgresql://...

# ElevenLabs (for voice)
ELEVENLABS_API_KEY=sk_...
```

---

## 💰 Cost Considerations

### **Twilio Number Costs:**
- Local numbers: ~$1/month
- Toll-free numbers: ~$2/month
- Usage: $0.0085/minute for voice calls

### **Provisioning Process:**
- Searching: Free
- Purchasing: One-time setup + monthly fee
- Webhook configuration: Free

---

## 🧪 Testing

### **Test Number Provisioning:**

```bash
# Run the test script
node test-number-provisioning.js
```

### **Manual Test:**

```bash
# 1. Provision a test client
curl -X POST http://localhost:3000/api/clients/provision \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "Test Business",
    "email": "test@example.com"
  }'

# 2. Call the provisioned number
# Should hear bilingual greeting

# 3. Check database
node check-and-add-clients.js
```

---

## 🚨 Troubleshooting

### **"No available numbers found"**
- Try a different area code
- Try toll-free numbers
- Check Twilio account has credit

### **"Failed to purchase number"**
- Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
- Check Twilio account balance
- Ensure account is verified

### **"Webhooks not working"**
- Verify WEBHOOK_BASE_URL is correct
- Check number is in database
- Run: `PUT /api/clients/:clientId/number/webhooks`

### **"Number purchased but not in database"**
- Check database connection
- Verify DATABASE_URL is correct
- Manually add to database if needed

---

## 📋 Database Schema

```sql
-- Columns added to clients table:
ALTER TABLE clients ADD COLUMN twilio_number_sid VARCHAR(255);
ALTER TABLE clients ADD COLUMN email VARCHAR(255);
ALTER TABLE clients ADD COLUMN user_id INTEGER;

-- Indexes for performance:
CREATE INDEX idx_clients_ringlypro_number ON clients(ringlypro_number);
CREATE INDEX idx_clients_twilio_sid ON clients(twilio_number_sid);
```

---

## 🎉 Benefits

### **For Your Business:**
✅ **Zero Manual Setup** - No more Twilio console configuration
✅ **Instant Activation** - Clients can receive calls immediately
✅ **Scalable** - Handle hundreds of clients easily
✅ **Consistent** - Every number configured identically
✅ **Time Savings** - Minutes instead of hours per client

### **For Clients:**
✅ **Professional Numbers** - Get dedicated business line
✅ **Immediate Service** - Voice bot works instantly
✅ **Bilingual Support** - English and Spanish out of the box
✅ **Premium Experience** - ElevenLabs voices enabled

---

## 🔮 Next Steps

1. **Deploy to Production** - Push code to Render
2. **Test End-to-End** - Provision a test client
3. **Integrate with Signup** - Add to your signup flow
4. **Monitor Usage** - Track Twilio costs
5. **Add UI** - Create admin dashboard for number management

---

## 📞 Support

Need help? Check these resources:
- [Twilio Phone Numbers API](https://www.twilio.com/docs/phone-numbers/api)
- [Bilingual Voice Setup](./BILINGUAL_VOICE_SETUP.md)
- [Update Twilio Webhooks](./UPDATE_TWILIO_WEBHOOKS.md)

---

**Last Updated:** October 6, 2025
**Status:** Production Ready
**Auto-Provision Away!** 🚀
