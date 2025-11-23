# Business Collector Troubleshooting - Zero Results Issue

## Current Status

**Problem**: Business Collector returns 0 results despite Google Maps API key being configured.

**Evidence**:
```json
{
  "meta": {
    "total_found": 0,
    "sources_used": [],
    "debug": {
      "api_key_configured": true,
      "results_before_dedup": 0
    }
  }
}
```

## Diagnostics Completed

### ✅ API Key is Configured
- Diagnostics endpoint confirms: `/diagnostics` shows `"google_maps": true`
- API key prefix visible: `"AIzaSyC1lw..."`
- Environment variable is properly loaded

### ✅ Service is Healthy
- Health endpoint working: `/health` returns `status: ok`
- Render deployment successful
- Auto-deploy triggered after code changes

### ❌ Google Places API Not Returning Data
- `sources_used: []` indicates Google Places is not being used
- `results_before_dedup: 0` means no data from any source
- No errors reported in response

## Possible Root Causes

### 1. **Google Cloud API Not Enabled**
The Places API might not be enabled in Google Cloud Console.

**Check**:
- Go to https://console.cloud.google.com/apis/library
- Search for "Places API"
- Verify both are **ENABLED**:
  - Places API
  - Places API (New)

**Fix**:
```
1. Open Google Cloud Console
2. Select your project
3. Go to "APIs & Services" → "Library"
4. Search "Places API" → Click → Enable
5. Search "Places API (New)" → Click → Enable
6. Wait 5 minutes for propagation
```

### 2. **API Key Restrictions Blocking Render**
The API key might have HTTP referrer restrictions that block the Render service.

**Check**:
- Go to https://console.cloud.google.com/apis/credentials
- Click on your API key
- Check "Application restrictions" section

**Fix**:
```
Option A - Remove Restrictions (for testing):
1. Set "Application restrictions" to "None"
2. Click "Save"
3. Wait 5 minutes
4. Test Business Collector

Option B - Add Render Domain:
1. Set "Application restrictions" to "HTTP referrers"
2. Add: https://ringlypro-public-business-collector.onrender.com/*
3. Add: *.onrender.com/*
4. Click "Save"
5. Wait 5 minutes
```

### 3. **Billing Not Enabled**
Google Maps Platform requires billing to be enabled (even for free tier usage).

**Check**:
- Go to https://console.cloud.google.com/billing
- Verify a billing account is linked to your project

**Fix**:
```
1. Open Google Cloud Console
2. Go to "Billing" in left menu
3. Link a billing account (or create one)
4. Add credit/debit card
5. Enable billing for your project
6. Wait 10-15 minutes for activation
```

**Note**: Google provides $200/month free credit, so you won't be charged unless you exceed that.

### 4. **API Quota Exceeded**
Daily quota might be exhausted.

**Check**:
- Go to https://console.cloud.google.com/apis/api/places-backend.googleapis.com/quotas
- Check "Requests per day" quota
- View usage graphs

**Fix**:
```
1. Check quota limits
2. Request quota increase if needed
3. Wait 24 hours for quota reset
4. Consider upgrading plan
```

### 5. **Wrong API Key Format or Typo**
The API key in Render might have extra spaces or wrong format.

**Check**:
- Go to Render Dashboard
- Find `ringlypro-public-business-collector` service
- Check environment variables
- Look for `GOOGLE_MAPS_API_KEY`

**Fix**:
```
1. Copy API key from Google Cloud Console
2. In Render, edit GOOGLE_MAPS_API_KEY
3. Delete old value completely
4. Paste new value (no spaces, no quotes)
5. Save changes
6. Wait for auto-redeploy (2-3 minutes)
```

### 6. **Service Account or OAuth Being Used Instead**
The collector expects a simple API key, not OAuth or service account credentials.

**Check**:
- Verify you created an "API Key" not "OAuth 2.0 Client ID" or "Service Account"

**Fix**:
```
1. Go to https://console.cloud.google.com/apis/credentials
2. Click "Create Credentials" → "API Key"
3. Copy the new API key (starts with AIza...)
4. Use this key in Render
```

## Testing Steps

### Step 1: Test API Key Directly

Open a terminal and test the Google Places API directly:

```bash
# Replace YOUR_API_KEY with your actual key
curl "https://maps.googleapis.com/maps/api/place/textsearch/json?query=coffee+shop+Seattle&key=YOUR_API_KEY"
```

**Expected Good Response**:
```json
{
  "status": "OK",
  "results": [ ... businesses ... ]
}
```

**Common Error Responses**:

```json
// API not enabled
{
  "status": "REQUEST_DENIED",
  "error_message": "This API project is not authorized to use this API."
}

// Billing not enabled
{
  "status": "REQUEST_DENIED",
  "error_message": "You must enable Billing on the Google Cloud Project"
}

// Invalid API key
{
  "status": "REQUEST_DENIED",
  "error_message": "The provided API key is invalid."
}

// Quota exceeded
{
  "status": "OVER_QUERY_LIMIT",
  "error_message": "You have exceeded your daily request quota"
}

// Restrictions blocking
{
  "status": "REQUEST_DENIED",
  "error_message": "This API key is not authorized to use this service or API."
}
```

### Step 2: Check Render Logs

```bash
1. Go to https://dashboard.render.com
2. Find "ringlypro-public-business-collector" service
3. Click "Logs" tab
4. Look for errors related to "Google Places"
5. Look for "REQUEST_DENIED" or "API error"
```

### Step 3: Test Business Collector After Fix

```bash
# Test with diagnostics
curl https://ringlypro-public-business-collector.onrender.com/diagnostics

# Test collection
curl -X POST https://ringlypro-public-business-collector.onrender.com/run \
  -H "Content-Type: application/json" \
  -d '{"category": "Coffee Shop", "geography": "Seattle", "maxResults": 5}'
```

**Expected Working Response**:
```json
{
  "meta": {
    "total_found": 5,
    "sources_used": ["Google Places"],
    "debug": {
      "api_key_configured": true,
      "results_before_dedup": 5
    }
  },
  "rows": [ ... businesses ... ]
}
```

## Most Likely Fix

Based on the symptoms (API key configured but no results), the **most likely issue** is:

**#3: Billing Not Enabled**

Even with $200/month free credit, Google requires a billing account to be linked. This is the most common reason for `REQUEST_DENIED` errors that aren't being exposed.

**Quick Fix**:
1. Go to https://console.cloud.google.com/billing
2. Link billing account (add credit card)
3. Go to https://console.cloud.google.com/apis/library
4. Enable "Places API" and "Places API (New)"
5. Wait 10 minutes
6. Test again

## Next Steps

1. **Test API Key Directly** - This will reveal the actual error message from Google
2. **Check Google Cloud Console** - Verify billing and API enablement
3. **Check Render Logs** - Look for specific error messages
4. **Fix the Root Cause** - Based on the error message from Step 1
5. **Verify Fix** - Test Business Collector after fixing

## Support Resources

- **Google Maps Platform Console**: https://console.cloud.google.com/google/maps-apis
- **Places API Documentation**: https://developers.google.com/maps/documentation/places/web-service
- **Billing Setup**: https://cloud.google.com/billing/docs/how-to/modify-project
- **API Key Best Practices**: https://cloud.google.com/docs/authentication/api-keys

---

**Status**: Investigation in progress. Need user to test API key directly and check Google Cloud Console settings.
