# Monthly Token Reset System

## Overview

Every RinglyPro user gets a monthly token allocation based on their package:
- **Free**: 100 tokens/month
- **Starter**: 500 tokens/month
- **Growth**: 2,000 tokens/month
- **Professional**: 7,500 tokens/month

Tokens reset on the 1st of each month with rollover rules based on package tier.

## Rollover Rules

| Package | Rollover Limit |
|---------|----------------|
| Free | No rollover (0 tokens) |
| Starter | Up to 1,000 tokens |
| Growth | Up to 5,000 tokens |
| Professional | Unlimited rollover |

## How It Works

### Monthly Reset Process

1. **Calculate Unused Tokens**: `unusedTokens = currentBalance`
2. **Apply Rollover Limit**: `rolloverTokens = min(unusedTokens, rolloverLimit)`
3. **Set New Balance**: `newBalance = monthlyAllocation + rolloverTokens`
4. **Reset Usage Counter**: `tokens_used_this_month = 0`
5. **Update Timestamps**: Set `last_token_reset` and `billing_cycle_start`

### Example

User on **Growth** plan (2,000 tokens/month, 5,000 rollover limit):
- Current balance: 1,200 tokens
- Unused tokens: 1,200
- Rollover allowed: 1,200 (under 5,000 limit)
- New balance after reset: 2,000 + 1,200 = **3,200 tokens**

## Setup Instructions

### Option 1: Render.com Cron Job (Recommended)

1. Go to your Render dashboard
2. Select your RinglyPro service
3. Go to "Cron Jobs" tab
4. Click "Add Cron Job"
5. Configure:
   - **Name**: Monthly Token Reset
   - **Schedule**: `0 0 1 * *` (runs at midnight on 1st of each month)
   - **Command**: `node scripts/monthly-token-reset.js`
   - **Region**: Same as your service

### Option 2: External Cron Service (e.g., cron-job.org)

1. Sign up at https://cron-job.org or similar service
2. Create new cron job:
   - **Title**: RinglyPro Monthly Token Reset
   - **URL**: `https://aiagent.ringlypro.com/api/tokens/monthly-reset`
   - **Method**: POST
   - **Schedule**: `0 0 1 * *` (1st of month at midnight)
   - **Headers**:
     - `Content-Type: application/json`
   - **Body**: `{}` (empty JSON to reset all users)

### Option 3: Linux Cron (If Self-Hosting)

Add to crontab (`crontab -e`):

```bash
# Reset tokens on 1st of each month at 12:00 AM
0 0 1 * * cd /path/to/RinglyPro-CRM && node scripts/monthly-token-reset.js >> /var/log/ringlypro-token-reset.log 2>&1
```

## API Endpoints

### POST /api/tokens/monthly-reset

Manually trigger monthly reset (admin only)

**Request:**
```bash
# Reset all users
curl -X POST https://aiagent.ringlypro.com/api/tokens/monthly-reset \
  -H "Content-Type: application/json" \
  -d '{}'

# Reset specific user
curl -X POST https://aiagent.ringlypro.com/api/tokens/monthly-reset \
  -H "Content-Type: application/json" \
  -d '{"userId": 7}'
```

**Response:**
```json
{
  "success": true,
  "message": "Monthly token reset completed",
  "totalUsers": 50,
  "resetCount": 48,
  "errors": [
    {
      "userId": 10,
      "email": "test@example.com",
      "error": "User not found"
    }
  ]
}
```

### GET /api/tokens/reset-status/:userId

Check if user needs reset

**Request:**
```bash
curl https://aiagent.ringlypro.com/api/tokens/reset-status/7
```

**Response:**
```json
{
  "success": true,
  "userId": 7,
  "email": "mstagg@digit2ai.com",
  "needsReset": false,
  "lastReset": "2025-01-01T00:00:00.000Z",
  "daysSinceReset": 15,
  "currentBalance": 200,
  "package": "free"
}
```

## Testing the System

### Test Monthly Reset

```bash
# Test reset for your account (user 7)
curl -X POST https://aiagent.ringlypro.com/api/tokens/monthly-reset \
  -H "Content-Type: application/json" \
  -d '{"userId": 7}'
```

Expected result:
- Your balance should be set to 100 tokens (free plan)
- Plus any rollover tokens (if on paid plan)
- `tokens_used_this_month` reset to 0
- `last_token_reset` updated to now

### Check Reset Status

```bash
curl https://aiagent.ringlypro.com/api/tokens/reset-status/7
```

Should show:
- `needsReset: false` (just reset)
- `daysSinceReset: 0`
- New balance reflecting reset

## Monitoring

### Logs to Check

**Server logs:**
```
[MONTHLY RESET] User 7 (mstagg@digit2ai.com): 200 → 100 (allocation: 100, rollover: 0)
[MONTHLY RESET] Completed: 48/50 users reset successfully
```

**Reset script logs:**
```
🗓️  MONTHLY TOKEN RESET - Starting...
Date: 2025-02-01T00:00:00.000Z
============================================================
📊 RESULTS:
✅ Successfully reset: 48/50 users
============================================================
✅ Monthly token reset completed successfully
```

## Webhook Integration (Future)

To automatically trigger resets after Stripe subscription renewals:

1. Configure Stripe webhook for `customer.subscription.renewed`
2. Add handler in `src/routes/credits.js`:
```javascript
case 'customer.subscription.renewed':
  const userId = event.data.object.metadata.userId;
  await tokenService.resetMonthlyTokens(userId);
  break;
```

## Troubleshooting

### Reset Not Running

1. Check cron job is active in Render dashboard
2. Check server logs for errors
3. Manually trigger via API to test

### Users Not Getting Tokens

1. Check `last_token_reset` field is updating
2. Verify package allocation is correct
3. Check for errors in reset results

### Rollover Not Working

1. Verify user's `token_package` is set correctly
2. Check `tokens_balance` before reset
3. Ensure rollover limits are configured properly

## Database Fields

Token system uses these fields in `users` table:

- `tokens_balance` - Current token balance
- `tokens_used_this_month` - Tokens used in current cycle
- `token_package` - Package tier (free/starter/growth/professional)
- `tokens_rollover` - Tokens rolled over from previous month
- `billing_cycle_start` - When current cycle started
- `last_token_reset` - Last time tokens were reset

## Security Notes

⚠️ **IMPORTANT**: The `/api/tokens/monthly-reset` endpoint should be protected in production:

1. Add authentication middleware
2. Require admin role
3. Add IP whitelist for cron job service
4. Log all reset attempts

Example protection:
```javascript
router.post('/monthly-reset', authenticateToken, requireAdmin, async (req, res) => {
  // ... reset logic
});
```

---

**Last Updated**: January 2025
**Version**: 1.0
