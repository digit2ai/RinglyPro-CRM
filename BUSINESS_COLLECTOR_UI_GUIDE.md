# Business Collector UI Guide

## How to Access and Use the Business Collector

### Step 1: Open AI Copilot

Visit: **https://aiagent.ringlypro.com/mcp-copilot**

### Step 2: Look for the Business Collector Button

In the left sidebar, you'll see:
- 📱 Social Media Marketing (pink gradient button)
- 📧 Email Marketing (purple gradient button)
- **🔍 Business Collector** ← **NEW!** (green gradient button)

### Step 3: Click "🔍 Business Collector"

The button will:
1. Change to "🔄 Connecting..."
2. Then to "✅ Connected"
3. Show status below: "Connected (v1.0.0)"

### Step 4: See Welcome Messages

The chat will display:
```
✅ Connected to Business Collector! Try: "Collect Real Estate Agents in Florida"

💡 Example commands:
• "Collect [Category] in [Location]"
• "Find Dentists in Miami"
• "Get Plumbers in Tampa, FL"
```

### Step 5: Start Collecting!

Type any of these commands in the chat:

#### Example 1: Real Estate Agents
```
Collect Real Estate Agents in Florida
```

**Response:**
```
Found 87 Real Estate Agents in Florida!

1. **ABC Realty Group** | Category: Real Estate Agents | 📞 +18135551234 | ✉️ info@abcrealty.com | 🌐 https://abcrealty.com | 📍 123 Main St, Tampa, FL 33601 | Confidence: 95%

2. **Tampa Bay Homes** | Category: Real Estate Agents | 📞 +18135555678 | ✉️ contact@tampabayhomes.com | 🌐 https://tampabayhomes.com | 📍 456 Oak Ave, Tampa, FL 33602 | Confidence: 92%

3. **Sunshine Realty** | Category: Real Estate Agents | 📞 +17275559012 | ✉️ sales@sunshinerealty.com | 🌐 https://sunshinerealty.com | 📍 789 Beach Blvd, Clearwater, FL 33755 | Confidence: 90%

4. **Florida Dream Homes** | Category: Real Estate Agents | 📞 +18135553456 | ✉️ info@floridadreamhomes.com | 🌐 https://floridadreamhomes.com | 📍 321 Palm Dr, St Petersburg, FL 33701 | Confidence: 88%

5. **Premier Properties FL** | Category: Real Estate Agents | 📞 +18135557890 | ✉️ team@premierpropertiesfl.com | 🌐 https://premierpropertiesfl.com | 📍 654 Bay St, Tampa, FL 33603 | Confidence: 95%

...and 82 more.
```

#### Example 2: Dentists
```
Find Dentists in Miami
```

#### Example 3: Plumbers
```
Get Plumbers in Tampa, FL
```

#### Example 4: Lawyers
```
Collect leads for Lawyers in California
```

## What You Get

Each business record includes:
- ✅ Business Name
- ✅ Phone Number (E.164 formatted)
- ✅ Email Address (when available)
- ✅ Website URL
- ✅ Full Address (street, city, state, ZIP)
- ✅ Confidence Score (0-100%)
- ✅ Source URL (for compliance)

## Button States

### Not Connected
```
🔍 Business Collector
[Status: Not connected]
```

### Connecting
```
🔄 Connecting...
[Status: Connecting to Business Collector...]
```

### Connected
```
✅ Connected
[Status: Connected (v1.0.0)]
```

### Error
```
❌ Connection Failed
[Status: Error: Service unavailable]
```
*(Button resets after 3 seconds)*

## Disconnecting

To disconnect:
1. Click the "✅ Connected" button
2. It will change back to "🔍 Business Collector"
3. Status will show "Not connected"

## Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────┐  ┌─────────────────────────────────────┐ │
│  │              │  │  RinglyPro AI Copilot               │ │
│  │  SIDEBAR     │  │                                     │ │
│  │              │  │  ┌───────────────────────────────┐  │ │
│  │  GoHighLevel │  │  │ System: Connected to Business │  │ │
│  │  Status:     │  │  │ Collector! Try: "Collect      │  │ │
│  │  Not connected  │  │ Real Estate Agents in Florida"│  │ │
│  │              │  │  └───────────────────────────────┘  │ │
│  │  ┌────────┐  │  │                                     │ │
│  │  │📱 Social│  │  │  ┌───────────────────────────────┐  │ │
│  │  │Media    │  │  │  │ User: Collect Real Estate     │  │ │
│  │  └────────┘  │  │  │ Agents in Florida             │  │ │
│  │              │  │  └───────────────────────────────┘  │ │
│  │  ┌────────┐  │  │                                     │ │
│  │  │📧 Email │  │  │  ┌───────────────────────────────┐  │ │
│  │  │Marketing│  │  │  │ AI: Found 87 Real Estate      │  │ │
│  │  └────────┘  │  │  │ Agents in Florida!            │  │ │
│  │              │  │  │                                 │  │ │
│  │  ┌────────┐  │  │  │ 1. **ABC Realty** | 📞...     │  │ │
│  │  │✅       │  │  │  │ 2. **Tampa Bay** | 📞...      │  │ │
│  │  │Connected│  │  │  │ ...                           │  │ │
│  │  └────────┘  │  │  └───────────────────────────────┘  │ │
│  │  Connected   │  │                                     │ │
│  │  (v1.0.0)    │  │  ┌───────────────────────────────┐  │ │
│  │              │  │  │ Type your message...          │  │ │
│  │              │  │  └───────────────────────────────┘  │ │
│  └──────────────┘  └─────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. One-Click Connection
- No credentials needed
- Connects to public service
- Instant availability

### 2. Natural Language
- Type commands naturally
- AI extracts category and location
- Smart pattern matching

### 3. Rich Results
- Formatted display
- Emojis for readability
- Full contact information

### 4. Compliance Built-In
- Source attribution
- Public data only
- GDPR/CAN-SPAM compliant

### 5. Import Ready
- Copy/paste contacts
- Export to CSV (coming soon)
- Direct CRM import (coming soon)

## Troubleshooting

### Button Not Appearing
**Solution:**
1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Wait for Render auto-deploy to complete (2-3 minutes)
4. Check: https://dashboard.render.com

### "Business Collector service is offline"
**Solution:**
1. Wait 30 seconds (Render free tier wakes up)
2. Click the button again
3. Check service: https://ringlypro-public-business-collector.onrender.com/health

### "Connection failed"
**Solution:**
1. Check your internet connection
2. Try again in 1 minute
3. Check browser console for errors (F12)

### No Results Found
**Solution:**
1. Try broader location ("Florida" instead of "Small Town, FL")
2. Check category spelling
3. Try synonyms ("Realtor" vs "Real Estate Agent")

## Deployment Status

### Check if UI is Live

Visit: **https://aiagent.ringlypro.com/mcp-copilot**

You should see:
- ✅ 📱 Social Media Marketing button
- ✅ 📧 Email Marketing button
- ✅ **🔍 Business Collector button** ← NEW!

If you don't see the Business Collector button:
1. Check Render dashboard for deployment status
2. Wait for auto-deploy (usually 2-3 minutes)
3. Hard refresh your browser
4. Check GitHub for latest commit: https://github.com/digit2ai/RinglyPro-CRM

### Verify Backend Integration

Test API directly:
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/mcp/business-collector/connect \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response:
```json
{
  "success": true,
  "sessionId": "bc_1729...",
  "message": "Business Collector connected successfully",
  "serviceStatus": "ok",
  "version": "1.0.0"
}
```

## Advanced Usage

### Collect Multiple Categories
```
1. "Collect Real Estate Agents in Florida"
2. Wait for results
3. "Find Dentists in Miami"
4. Wait for results
5. "Get Plumbers in Tampa"
```

### Specify Max Results
```
"Collect 200 Real Estate Agents in California"
```

### Use Synonyms
```
"Find Realtors in Florida"  (same as Real Estate Agents)
"Get Attorneys in Texas"    (same as Lawyers)
"Collect Physicians in NY"  (same as Doctors)
```

### Filter by Metro Area
```
"Collect Dentists in Tampa Bay, FL"
"Find Lawyers in Silicon Valley, CA"
"Get Restaurants in Greater Boston"
```

## Next Features (Coming Soon)

- [ ] Export to CSV button
- [ ] Import to CRM button
- [ ] Save collection results
- [ ] Schedule automated collections
- [ ] Filter by confidence score
- [ ] Sort by location/category
- [ ] Bulk actions (email, call)

---

## Summary

**The Business Collector button is now live!**

1. Visit: https://aiagent.ringlypro.com/mcp-copilot
2. Click: 🔍 Business Collector
3. Type: "Collect [Category] in [Location]"
4. Get: Instant business leads!

**No setup required. Start collecting now!** 🚀
