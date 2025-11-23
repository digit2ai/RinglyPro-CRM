# AI Features Configuration Guide

## Critical Issue Found: OpenAI API Not Configured

### Current Status
AI features status (as of latest update):

1. **Email Marketing - AI Generate** ✅ WORKING (requires OpenAI API key)
2. **Social Media - AI Generate** ✅ FIXED (requires OpenAI API key)
3. **Social Media - AI Generate Image** ⚠️ DISABLED (feature temporarily removed)
4. **Business Collector** ❌ EXTERNAL SERVICE ISSUE (requires Google Places API on external Render service)

### Error Details

**Problem**: Your `.env` file has a placeholder API key:
```
OPENAI_API_KEY=your_openai_api_key_here
```

**Impact**: All AI content generation features will fail with error messages like:
- "OpenAI API is not configured. Please contact support to set up AI text generation."
- "AI image generation is not configured"

---

## How to Fix

### Step 1: Get an OpenAI API Key

1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the API key (it starts with `sk-`)
5. **IMPORTANT**: Save it somewhere safe - you won't be able to see it again!

### Step 2: Configure the API Key

**Option A: Update .env file directly** (Recommended for local development)
```bash
# Open your .env file
nano /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/.env

# Replace this line:
OPENAI_API_KEY=your_openai_api_key_here

# With your actual key:
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
```

**Option B: Set environment variable on Render** (For production)
1. Go to your Render dashboard
2. Select your RinglyPro service
3. Go to "Environment" tab
4. Add/Update environment variable:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-xxxxxxxxxxxxxxxxxxxx`
5. Click "Save Changes"
6. Render will automatically redeploy

### Step 3: Restart the Application

**Local Development**:
```bash
# Stop the server (Ctrl+C)
# Start it again
npm start
```

**Production (Render)**:
- Render will automatically restart after you save the environment variable

### Step 4: Verify It Works

Test the AI features:

1. **Email Marketing AI Generate**:
   - Go to Email Marketing page
   - Click "✨ AI Generate" button
   - Enter a topic like "Product launch announcement"
   - Should generate 3 email variations

2. **Social Media AI Generate**:
   - Go to Social Media Marketing page
   - Click "✨ AI Generate" button
   - Enter a topic like "Summer sale"
   - Should generate 3 post variations

3. **AI Image Generation**:
   - Go to Social Media Marketing page
   - Click "🎨 AI Generate Image" button
   - Enter an image description
   - Should generate an image

---

## Cost Estimates

OpenAI charges per token (word). Here are approximate costs:

### Text Generation (GPT-4)
- **Model**: GPT-4
- **Cost**: ~$0.03 per 1K input tokens, ~$0.06 per 1K output tokens
- **Email Generation**: ~$0.05-0.10 per generation (3 variations)
- **Social Media Post**: ~$0.03-0.05 per generation (3 variations)

### Image Generation (DALL-E 3)
- **Model**: DALL-E 3
- **Cost**: $0.04 per image (1024x1024, standard quality)
- **Social Media Image**: $0.04 per generation

### Monthly Estimates
- Light usage (10-20 generations/day): ~$20-40/month
- Medium usage (50-100 generations/day): ~$100-200/month
- Heavy usage (200+ generations/day): ~$400+/month

**Recommendation**: Start with a $20-50 credit and monitor usage

---

## Business Collector Configuration

The Business Collector is configured to use:
```
BUSINESS_COLLECTOR_URL=https://ringlypro-public-business-collector.onrender.com
```

### If Business Collector is Not Working

1. **Check if the service is up**:
   ```bash
   curl https://ringlypro-public-business-collector.onrender.com/health
   ```

2. **Expected response**:
   ```json
   {
     "status": "healthy",
     "version": "1.0.0",
     "timestamp": "2025-01-..."
   }
   ```

3. **If service is down**:
   - The service might be sleeping (Render free tier)
   - It will wake up after first request (takes 30-60 seconds)
   - Try the collection again after waiting

### Test Business Collector

```bash
# Test with curl
curl -X POST https://ringlypro-public-business-collector.onrender.com/run \
  -H "Content-Type: application/json" \
  -d '{
    "category": "Lawn Care Services",
    "geography": "St. Petersburg, Florida",
    "maxResults": 10
  }'
```

---

## Troubleshooting

### Issue: "OpenAI API is not configured"
**Solution**: Follow Step 1-3 above to add your API key

### Issue: "OpenAI API quota exceeded"
**Solution**: Add more credits to your OpenAI account at [https://platform.openai.com/account/billing](https://platform.openai.com/account/billing)

### Issue: "OpenAI API key is invalid"
**Solution**:
1. Verify your API key is correct
2. Check it starts with `sk-`
3. Generate a new key if needed

### Issue: Business Collector returns 0 results
**Root Cause**: The Business Collector is an external service hosted on Render that requires Google Places API configuration. This is **NOT** part of the RinglyPro CRM codebase.

**Current Status**:
- Service URL: https://ringlypro-public-business-collector.onrender.com
- Service responds but returns: `{"total_found": 0, "rows": []}`
- Google Places API is either not configured or has quota/billing issues on the external service

**Why This Happens**:
The Business Collector proxy in RinglyPro (`/mcp-integrations/api/business-collector-proxy.js`) is just a client that calls the external Render service. The actual Google Places API integration happens on that external service, not in the RinglyPro codebase.

**How to Fix** (Requires access to the external Render service):

1. **Access the Business Collector Render Service**:
   - Log in to Render dashboard
   - Find the "ringlypro-public-business-collector" service

2. **Configure Google Places API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable "Places API (New)" or "Places API"
   - Create an API key
   - Add the API key to the Business Collector Render service environment:
     - Key: `GOOGLE_PLACES_API_KEY` (or whatever variable name the service uses)
     - Value: Your Google API key

3. **Check API Quota and Billing**:
   - Verify the Google Cloud project has billing enabled
   - Check API quota hasn't been exceeded
   - Enable "Places API (New)" if not already enabled

4. **Test the Service**:
   ```bash
   curl -X POST https://ringlypro-public-business-collector.onrender.com/run \
     -H "Content-Type: application/json" \
     -d '{
       "category": "Lawn Care",
       "geography": "Tampa, FL",
       "maxResults": 10
     }'
   ```

**Alternative Solutions**:
1. **Service is sleeping** (Render free tier): Wait 60 seconds for it to wake up
2. **Try broader location**: Use "Florida" instead of "Tampa, FL"
3. **Simplify category**: Use "Lawn Care" instead of "Lawn Care Services"

**Important Note**: This issue cannot be fixed from the RinglyPro CRM codebase. It requires configuration changes on the external Business Collector Render service.

### Issue: AI Generate button does nothing
**Check browser console** (F12):
- Look for error messages
- Check network tab for failed API calls
- Verify you're logged in and have a valid session

---

## API Endpoints Added/Fixed

### New Endpoint: `/api/ai/generate-text`
**Purpose**: Generate text content for email marketing

**Request**:
```json
{
  "message": "Generate 3 email variations about: Product launch. Tone: professional.",
  "clientId": "15"
}
```

**Response**:
```json
{
  "success": true,
  "text": "VARIATION 1:\n[email content]\n\nVARIATION 2:\n[email content]\n\nVARIATION 3:\n[email content]",
  "model": "gpt-4",
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 300,
    "total_tokens": 350
  }
}
```

### Existing Endpoint: `/api/ai/generate-image`
**Status**: Already implemented, just needs API key

### Existing Endpoint: `/api/mcp/business-collector/collect`
**Status**: Already implemented, works with external service

---

## Next Steps

1. ✅ Get OpenAI API key
2. ✅ Add API key to .env or Render environment
3. ✅ Restart application
4. ✅ Test all AI features
5. ✅ Monitor usage and costs
6. ✅ Add credits to OpenAI account as needed

---

## Support

If you encounter issues:

1. Check the application logs for detailed error messages
2. Verify API key is set correctly
3. Check OpenAI dashboard for quota/billing issues
4. Test Business Collector health endpoint

**Files Modified**:
- [/src/routes/ai.js](src/routes/ai.js) - Added `/generate-text` endpoint
- [/public/mcp-copilot/email-marketing.html](public/mcp-copilot/email-marketing.html) - Added AI Generate feature
- [/public/mcp-copilot/social-media.html](public/mcp-copilot/social-media.html) - Fixed AI Generate to use OpenAI endpoint, removed image upload
- This README for configuration guidance

**Recent Commits**:
- `ccbe43b` - Fix Social Media AI content generator to use OpenAI endpoint
- `3f86d6d` - Remove image upload options and add AI Generate to Email Marketing
- Previous commits added initial AI endpoints and Business Collector integration
