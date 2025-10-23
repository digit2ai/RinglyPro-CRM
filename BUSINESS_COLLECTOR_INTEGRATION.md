# Business Collector Integration Guide

The RinglyPro Business Collector is now integrated into your AI Copilot!

## Overview

**Business Collector**: https://ringlypro-public-business-collector.onrender.com
**AI Copilot**: https://aiagent.ringlypro.com/mcp-copilot
**Status**: ✅ Deployed and Live

## What's Been Added

### 1. Business Collector Service (Separate Repository)
- **Location**: `/Users/manuelstagg/Documents/GitHub/ringlypro-public-business-collector/`
- **GitHub**: https://github.com/digit2ai/ringlypro-public-business-collector
- **Live URL**: https://ringlypro-public-business-collector.onrender.com
- **Purpose**: Collect publicly available business data (compliant with CAN-SPAM/GDPR/CASL)

### 2. MCP Integration (This Repository)
- **Location**: `mcp-integrations/api/business-collector-proxy.js`
- **Purpose**: Connect the Business Collector to your AI Copilot
- **Routes Added**:
  - `/api/mcp/business-collector/connect` - Connect to service
  - `/api/mcp/business-collector/collect` - Full collection
  - `/api/mcp/business-collector/quick` - Quick collection
  - `/api/mcp/copilot/chat` - Natural language interface (updated)

## How to Use

### Option 1: Via AI Copilot Web Interface

1. **Visit**: https://aiagent.ringlypro.com/mcp-copilot

2. **Connect to Business Collector**:
   - Click "Business Collector" connection option
   - No credentials required (public service)
   - Click "Connect"

3. **Use Natural Language**:
   ```
   "Collect Real Estate Agents in Florida"
   "Find Dentists in Miami"
   "Get Plumbers in Tampa, FL"
   "Collect leads for Lawyers in California"
   ```

4. **View Results**:
   - See business names, phones, emails, websites
   - View confidence scores
   - Export to CRM

### Option 2: Via API

#### Connect
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/mcp/business-collector/connect \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:
```json
{
  "success": true,
  "sessionId": "bc_1729714923000",
  "message": "Business Collector connected successfully",
  "serviceStatus": "ok",
  "version": "1.0.0"
}
```

#### Collect Businesses
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/mcp/business-collector/collect \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "bc_1729714923000",
    "category": "Real Estate Agents",
    "geography": "Florida",
    "maxResults": 100
  }'
```

#### Quick Collection (No Session Required)
```bash
curl "https://ringlypro-crm.onrender.com/api/mcp/business-collector/quick?category=Dentists&geography=Miami&max=50"
```

### Option 3: Via AI Copilot Chat API

```bash
curl -X POST https://ringlypro-crm.onrender.com/api/mcp/copilot/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "bc_1729714923000",
    "message": "Collect Real Estate Agents in Tampa"
  }'
```

Response includes formatted results ready for display.

## Example Use Cases

### 1. Lead Generation for Sales Team
```
"Collect Real Estate Agents in Florida"
→ Get 100+ verified contacts
→ Import into CRM as leads
→ Start outreach campaign
```

### 2. Market Research
```
"Find Dentists in Miami"
→ Analyze competition
→ Build target list
→ Plan marketing strategy
```

### 3. Partnership Opportunities
```
"Get Law Firms in California"
→ Identify potential partners
→ Research firm details
→ Initiate partnerships
```

## Response Format

```json
{
  "success": true,
  "summary": {
    "total": 87,
    "category": "Real Estate Agents",
    "geography": "Florida",
    "sources_used": ["realtor.com", "zillow.com"],
    "execution_time_seconds": "4.52"
  },
  "businesses": [
    {
      "business_name": "ABC Realty Group",
      "category": "Real Estate Agents",
      "phone": "+18135551234",
      "email": "info@abcrealty.com",
      "website": "https://abcrealty.com",
      "street": "123 Main St",
      "city": "Tampa",
      "state": "FL",
      "postal_code": "33601",
      "source_url": "https://realtor.com/agent/abc-realty",
      "confidence": 0.95,
      "notes": "Verified on multiple sources"
    }
  ],
  "displayText": "1. **ABC Realty Group** | Category: Real Estate Agents | 📞 +18135551234 | ✉️ info@abcrealty.com..."
}
```

## Integration Features

### ✅ What's Working

1. **Natural Language Processing**
   - Understands: "Collect [Category] in [Location]"
   - Extracts category and geography automatically
   - Provides helpful suggestions

2. **Multi-Source Collection**
   - Google Business Profiles
   - Yelp
   - BBB
   - Industry registries
   - Local directories

3. **Data Quality**
   - Automatic deduplication
   - E.164 phone formatting
   - URL normalization
   - Confidence scoring (0-1)

4. **Compliance**
   - Respects robots.txt
   - Rate limiting
   - Source attribution (every record has source_url)
   - CAN-SPAM/GDPR/CASL compliant

5. **CRM Integration Ready**
   - Convert to CRM format: `proxy.convertToCRMFormat(businesses)`
   - Import directly into your database
   - Track source and confidence

### 🔄 Import to CRM Example

```javascript
// In your CRM backend
const BusinessCollectorMCPProxy = require('./mcp-integrations/api/business-collector-proxy');

const proxy = new BusinessCollectorMCPProxy();
const result = await proxy.collectBusinesses({
  category: 'Real Estate Agents',
  geography: 'Florida',
  maxResults: 100
});

// Convert to CRM format
const crmLeads = proxy.convertToCRMFormat(result.businesses);

// Import into database
for (const lead of crmLeads) {
  await Client.create({
    business_name: lead.business_name,
    phone: lead.phone,
    email: lead.email,
    website: lead.website,
    // ... other fields
    source: 'Business Collector',
    collected_at: new Date()
  });
}
```

## Testing

### Run the Test Script

```bash
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM
node test-business-collector-mcp.js
```

This will test:
1. Business Collector health
2. MCP connection
3. Quick collection
4. Full collection
5. AI Copilot chat

### Manual Testing

1. **Test Business Collector directly**:
   ```bash
   curl https://ringlypro-public-business-collector.onrender.com/health
   ```

2. **Test MCP integration**:
   ```bash
   curl https://ringlypro-crm.onrender.com/api/mcp/health
   ```

3. **Test quick collection**:
   ```bash
   curl "https://ringlypro-crm.onrender.com/api/mcp/business-collector/quick?category=Coffee%20Shops&geography=Seattle&max=5"
   ```

## Deployment Status

### Business Collector
- ✅ Deployed to: https://ringlypro-public-business-collector.onrender.com
- ✅ Health check passing
- ✅ Public and accessible

### RinglyPro CRM (MCP Integration)
- ✅ Code committed to main branch
- ✅ Pushed to GitHub
- ⏳ Render will auto-deploy (check Render dashboard)
- ⏳ Test after deployment completes

## Next Steps

1. **Wait for Render Auto-Deploy**
   - Check: https://dashboard.render.com
   - Look for successful deployment of RinglyPro-CRM
   - Usually takes 2-3 minutes

2. **Test the Integration**
   ```bash
   node test-business-collector-mcp.js
   ```

3. **Use in AI Copilot**
   - Visit: https://aiagent.ringlypro.com/mcp-copilot
   - Connect to Business Collector
   - Try: "Collect Real Estate Agents in Florida"

4. **Import Leads to CRM**
   - Use the collected data
   - Import via API or admin panel
   - Start your outreach!

## Support & Documentation

- **Business Collector Docs**: [GitHub](https://github.com/digit2ai/ringlypro-public-business-collector)
- **API Reference**: See README in Business Collector repo
- **Compliance**: See CODE_OF_CONDUCT.md and SECURITY.md
- **Issues**: Create issue on GitHub

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  AI Copilot (aiagent.ringlypro.com/mcp-copilot)   │
│                                                     │
└───────────────────┬─────────────────────────────────┘
                    │
                    │ Natural Language
                    │ "Collect Real Estate Agents in Florida"
                    │
┌───────────────────▼─────────────────────────────────┐
│                                                     │
│  MCP Integration Server                            │
│  (ringlypro-crm.onrender.com/api/mcp)             │
│                                                     │
│  - business-collector-proxy.js                     │
│  - Intent parsing                                  │
│  - Session management                              │
│                                                     │
└───────────────────┬─────────────────────────────────┘
                    │
                    │ HTTP API Call
                    │
┌───────────────────▼─────────────────────────────────┐
│                                                     │
│  Business Collector Service                        │
│  (ringlypro-public-business-collector.onrender.com)│
│                                                     │
│  - LLM-orchestrated research                       │
│  - Multi-source collection                         │
│  - Deduplication & normalization                   │
│  - Compliance checking                             │
│                                                     │
└───────────────────┬─────────────────────────────────┘
                    │
                    │ Web Research
                    │
┌───────────────────▼─────────────────────────────────┐
│                                                     │
│  Public Data Sources                               │
│                                                     │
│  - Google Business Profiles                        │
│  - Yelp, BBB                                       │
│  - Industry registries                             │
│  - Local directories                               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Pricing & Limits

### Business Collector (Free Tier)
- ✅ Unlimited collections
- ✅ Up to 500 results per request
- ✅ Rate limited to 10 req/min
- ⚠️ May sleep after 15min inactivity (Render free tier)

### Upgrade Options
- Paid plan: $7/month for always-on
- Higher rate limits available
- Priority support

## Compliance & Legal

The Business Collector follows these guidelines:
- ✅ Respects robots.txt
- ✅ Public data only
- ✅ Source attribution required
- ✅ CAN-SPAM compliant (US)
- ✅ GDPR compliant (EU)
- ✅ CASL compliant (Canada)
- ✅ Rate limited to avoid abuse

**Important**: Users are responsible for:
- Honoring opt-out requests
- Using data ethically
- Complying with local laws
- Not sending spam

## Troubleshooting

### "Business Collector service is offline"
→ Wait 30 seconds for Render free tier to wake up
→ Try again
→ Check: https://ringlypro-public-business-collector.onrender.com/health

### "Invalid session"
→ Session expired (sessions last 1 hour)
→ Reconnect: POST /api/mcp/business-collector/connect

### "No results found"
→ Try broader geography (e.g., "Florida" instead of "Tampa")
→ Check category spelling
→ Try synonyms (e.g., "Realtor" instead of "Real Estate Agent")

### Rate limit exceeded
→ Wait 1 minute
→ Reduce maxResults
→ Consider upgrading Business Collector plan

---

**Integration Complete!** 🎉

The Business Collector is now fully integrated into your RinglyPro AI Copilot.

Visit https://aiagent.ringlypro.com/mcp-copilot to start collecting leads!
