# Business Collector Fix Guide - Zero Leads Issue

## Problem Summary

The Business Collector is returning **0 leads** for all searches because the external Render service at `https://ringlypro-public-business-collector.onrender.com` does not have a **Google Maps API key** configured.

**Current Response:**
```json
{
  "meta": {
    "total_found": 0,
    "sources_used": [],  // ← NO DATA SOURCES CONFIGURED!
    "execution_time_ms": 1037
  },
  "rows": []
}
```

## Root Cause

The Business Collector service (v2.0.0) was redesigned to use **real data sources** instead of LLM-generated data:

### Data Sources (In Priority Order):
1. **Google Places API** (Primary) - Requires `GOOGLE_MAPS_API_KEY`
2. **OpenCorporates API** (Backup) - Optional `OPENCORPORATES_API_KEY`

Without these API keys configured on the external Render service, it cannot collect any data.

## Solution: Configure Google Maps API Key

### Step 1: Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. **Enable APIs**:
   - Navigate to "APIs & Services" → "Library"
   - Search for and enable:
     - **Places API** (required)
     - **Places API (New)** (recommended)
     - **Maps JavaScript API** (optional, for map displays)

4. **Create API Key**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the API key (starts with `AIza...`)

5. **Restrict API Key** (Recommended):
   - Click on the created API key
   - Under "Application restrictions":
     - Select "HTTP referrers (web sites)"
     - Add: `https://ringlypro-public-business-collector.onrender.com/*`
   - Under "API restrictions":
     - Select "Restrict key"
     - Check: "Places API", "Places API (New)"
   - Click "Save"

### Step 2: Add API Key to Render Service

1. **Access Render Dashboard**:
   - Go to https://dashboard.render.com
   - Sign in to your account

2. **Find Business Collector Service**:
   - Look for service named: `ringlypro-public-business-collector`
   - Or search for URL: `ringlypro-public-business-collector.onrender.com`

3. **Add Environment Variable**:
   - Click on the service
   - Go to "Environment" tab
   - Click "Add Environment Variable"
   - **Key**: `GOOGLE_MAPS_API_KEY`
   - **Value**: `AIzaSy...` (your API key from Step 1)
   - Click "Save Changes"

4. **Wait for Auto-Deploy**:
   - Render will automatically redeploy the service
   - This takes about 2-3 minutes
   - Watch the "Events" tab for deployment completion

### Step 3: Verify It Works

Test the service after deployment:

```bash
# Test 1: Health check
curl https://ringlypro-public-business-collector.onrender.com/health

# Expected: {"status":"ok","service":"ringlypro-public-business-collector","version":"1.0.0"}
```

```bash
# Test 2: Real data collection
curl -X POST https://ringlypro-public-business-collector.onrender.com/run \
  -H "Content-Type: application/json" \
  -d '{
    "category": "Coffee Shop",
    "geography": "Seattle",
    "maxResults": 5
  }'

# Expected: Real business data with "sources_used": ["Google Places"]
```

### Step 4: Test in RinglyPro AI Copilot

1. Go to https://aiagent.ringlypro.com/mcp-copilot
2. Click "Business Collector" button
3. Try searching: "Lawn Care in Tampa, FL"
4. Should now return actual businesses with:
   - Business names
   - Phone numbers
   - Addresses
   - Websites
   - Confidence scores

## Cost Information

### Google Maps API Pricing

**Free Tier:**
- $200 monthly credit (good for ~28,000 searches)
- Costs only apply after free tier is exhausted

**Typical Costs (after free tier):**
- Place Search: $0.017 per request
- Place Details: $0.017 per request
- Example: 1,000 searches = ~$17

**Recommendations:**
- Start with free tier and monitor usage
- Set billing alerts in Google Cloud Console
- Enable budget limits to avoid unexpected charges

### OpenCorporates API (Optional)

**Free Tier:**
- 500 requests/month
- 5 requests/second
- No credit card required

**Paid Tier:**
- $99/month for 10,000 requests
- Only needed if Google Places alone isn't sufficient

## Alternative: Deploy Your Own Instance

If you prefer to manage your own Business Collector instance:

### Option 1: Local Development

```bash
# Clone the repository (already done)
cd /Users/manuelstagg/Documents/GitHub/ringlypro-public-business-collector

# Install dependencies
npm install

# Create .env file
cp .env.example .env
nano .env  # Add your GOOGLE_MAPS_API_KEY

# Start server
npm start

# Test locally
curl "http://localhost:3001/run?category=Coffee%20Shop&geo=Seattle&max=5"
```

### Option 2: Deploy to Your Own Render Account

1. Fork the repository to your own GitHub account
2. Create new Render service from your fork
3. Add `GOOGLE_MAPS_API_KEY` environment variable
4. Update `BUSINESS_COLLECTOR_URL` in RinglyPro CRM .env:
   ```
   BUSINESS_COLLECTOR_URL=https://your-business-collector.onrender.com
   ```

## Troubleshooting

### Issue: "Invalid API key"
**Solution:**
- Verify API key is correct in Render environment variables
- Check that Places API is enabled in Google Cloud Console
- Ensure API key restrictions allow Render domain

### Issue: "API quota exceeded"
**Solution:**
- Check Google Cloud Console billing dashboard
- Add billing account if needed
- Increase quota limits if using paid plan

### Issue: Still getting 0 results after configuration
**Solution:**
1. Check Render deployment logs for errors
2. Verify environment variable is saved correctly
3. Try redeploying the service manually
4. Check Google Cloud Console for API errors

### Issue: "Service is sleeping" (Render free tier)
**Solution:**
- Free tier services sleep after 15 minutes of inactivity
- First request will wake it up (takes 30-60 seconds)
- Consider upgrading to paid Render plan ($7/month) for always-on service

## Next Steps

1. ✅ Get Google Maps API key (Step 1)
2. ✅ Add to Render service (Step 2)
3. ✅ Wait for deployment
4. ✅ Test with curl (Step 3)
5. ✅ Test in AI Copilot (Step 4)
6. ✅ Monitor usage in Google Cloud Console
7. ✅ Set up billing alerts

## Support

**Business Collector Repository:**
- GitHub: https://github.com/digit2ai/ringlypro-public-business-collector
- Local copy: `/Users/manuelstagg/Documents/GitHub/ringlypro-public-business-collector/`

**Documentation:**
- README.md - General usage
- REAL_DATA_COLLECTION.md - Architecture details
- DEPLOYMENT.md - Deployment guide

**Google Cloud Resources:**
- [Places API Documentation](https://developers.google.com/maps/documentation/places/web-service/overview)
- [API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [Pricing Calculator](https://cloud.google.com/products/calculator)

---

**Summary:** The Business Collector is fully functional but requires a Google Maps API key to collect real data. Follow the steps above to configure it, and it will start returning real business leads immediately.
