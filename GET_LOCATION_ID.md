# How to Get Your GoHighLevel Location ID

## The Issue

The MCP integration is now working correctly with the proper JSON-RPC 2.0 format! 🎉

However, you need your **correct Location ID** to authenticate. The current Location ID (`09Hhp9oai`) is incorrect.

**Error message:**
```
The token does not have access to this location.
```

## How to Find Your Location ID

### Method 1: GoHighLevel Settings (Easiest)

1. Log into your GoHighLevel account
2. Go to **Settings** → **Business Profile** or **Company Settings**
3. Look for **Location ID** or **Sub-Account ID**
4. Copy the ID (it's usually a long string like `ve9EPM428h8vShlRW1KT` or similar)

### Method 2: From the URL

1. Log into GoHighLevel
2. Look at your browser URL bar
3. The URL will look like: `https://app.gohighlevel.com/v2/location/YOUR_LOCATION_ID/...`
4. Copy the Location ID from the URL

### Method 3: API Inspector

1. Go to **Settings** → **Integrations** → **Private Integrations**
2. Click on your integration: `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
3. The Location ID should be displayed there

### Method 4: Test API Call

You can also find it by checking which locations your token has access to:

```bash
curl -X GET 'https://services.leadconnectorhq.com/locations/' \
  -H 'Authorization: Bearer pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe' \
  -H 'Version: 2021-07-28'
```

This will return all locations your token can access.

## Once You Have the Location ID

### Update in Render

1. Go to https://dashboard.render.com/
2. Find your **RinglyPro-CRM** service
3. Go to **Environment** tab
4. Update or add:
   ```
   GHL_LOCATION_ID=YOUR_ACTUAL_LOCATION_ID
   ```
5. Click **Save Changes** (triggers auto-redeploy)

### Test the Integration

After redeploying (~2 minutes), go to:
https://ringlypro-crm.onrender.com/mcp-copilot/

Connect with:
- **API Key:** `pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe`
- **Location ID:** `YOUR_ACTUAL_LOCATION_ID`

Then try:
```
Search for contacts named John
```

Should work perfectly! ✅

## What Location ID Looks Like

Location IDs are typically:
- 20-25 characters long
- Mix of letters and numbers
- Case-sensitive

**Examples of valid formats:**
- `ve9EPM428h8vShlRW1KT`
- `ocQHyuzHvysMo5N5VsXc`
- `C2QujeCh8ZnC7al2InWR`

**NOT valid (these are examples of what it's NOT):**
- `09Hhp9oai` ← Too short (this is what we had, it was wrong)
- `pit-acf324ce...` ← That's the API key, not Location ID

## Current Status

✅ **MCP Protocol Format:** Fixed and working!
✅ **API Key:** Valid and has correct scopes
✅ **MCP Server:** Accessible and responding
❌ **Location ID:** Incorrect - needs to be updated

## Next Steps

1. **Find your Location ID** using one of the methods above
2. **Update it in Render** environment variables
3. **Wait 2 minutes** for redeploy
4. **Test the MCP Copilot** - should work perfectly!

---

Once you provide the correct Location ID, your MCP Copilot will have full access to all 21 official GoHighLevel MCP tools! 🚀
