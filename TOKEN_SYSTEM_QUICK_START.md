# Token System - Quick Start Guide

**Created**: November 3, 2025
**For**: Implementing token billing on laptop

---

## 🎯 WHAT YOU NEED TO KNOW

### Current Status
- ✅ Token service is built (`src/services/tokenService.js`)
- ✅ Token API routes exist (`src/routes/tokens.js`)
- ✅ Database migration is ready (`migrations/add-token-system.sql`)
- ❌ Routes NOT mounted yet
- ❌ Database migration NOT run yet
- ❌ Services NOT integrated yet

### What's Working
- Foundation code is complete
- All service costs defined
- Transaction logging ready
- Analytics ready

### What's Not Working
- Can't access `/api/tokens/*` endpoints (404)
- No token columns in database yet
- Services don't check/deduct tokens
- UI doesn't show balance

---

## 🚀 QUICK START (30 minutes)

### Step 1: Mount Routes (5 min)

Edit `src/app.js` and add:

```javascript
// After line ~170 (after email/outbound-caller routes)
const tokenRoutes = require('./routes/tokens');
app.use('/api/tokens', tokenRoutes);
console.log('💰 Token API routes mounted at /api/tokens');
```

Restart server and test:
```bash
curl https://aiagent.ringlypro.com/api/tokens/pricing
```

### Step 2: Run Migration (10 min)

**Via Render Dashboard**:
1. Go to Render → RinglyPro Database
2. Click "Run SQL"
3. Copy/paste contents of `migrations/add-token-system.sql`
4. Execute

**Verify**:
```sql
SELECT email, tokens_balance FROM users LIMIT 5;
-- Should show 100 tokens for each user
```

### Step 3: Test (5 min)

```bash
curl https://aiagent.ringlypro.com/api/tokens/test
```

Expected:
```json
{
  "success": true,
  "message": "Token system is working!",
  "sample_user": {
    "tokens_balance": 100,
    ...
  }
}
```

---

## 📝 IMPLEMENTATION PRIORITY

### High Priority (Do First)
1. Mount routes
2. Run migration
3. Test basic functionality

### Medium Priority (Do Next)
4. Integrate AI Copilot (most used feature)
5. Show balance in UI
6. Test with real usage

### Low Priority (Do Later)
7. Integrate Business Collector
8. Add purchase flow (Stripe)
9. Analytics dashboard

---

## 🔗 KEY FILES

### Files to Edit
- `src/app.js` - Mount token routes
- `src/routes/mcp.js` - Add token checks/deductions
- `public/mcp-copilot/copilot.js` - Display balance

### Files Already Done
- `src/services/tokenService.js` - Token service (complete)
- `src/routes/tokens.js` - API routes (complete)
- `migrations/add-token-system.sql` - Database migration (ready)

### Reference Docs
- `TOKEN_SYSTEM_COMPLETE_IMPLEMENTATION_GUIDE.md` - Full guide (this file's companion)
- `TOKEN_SYSTEM_IMPLEMENTATION_STATUS.md` - Original status
- `MULTI_TENANT_TOKEN_BILLING_ARCHITECTURE.md` - Architecture

---

## 🧪 TESTING COMMANDS

```bash
# Test pricing endpoint
curl https://aiagent.ringlypro.com/api/tokens/pricing

# Test balance endpoint (need auth)
curl https://aiagent.ringlypro.com/api/tokens/balance \
  -H "Authorization: Bearer YOUR_SESSION"

# Check database
psql YOUR_DB_URL -c "SELECT COUNT(*) FROM users WHERE tokens_balance = 100;"

# View recent transactions
psql YOUR_DB_URL -c "SELECT * FROM token_transactions ORDER BY created_at DESC LIMIT 5;"
```

---

## 💡 TOKEN COSTS REFERENCE

Quick reference for service costs:

| Service | Tokens | USD Value |
|---------|--------|-----------|
| AI Chat | 1 | $0.10 |
| GHL Query | 2 | $0.20 |
| Lead Collection (100) | 20 | $2.00 |
| CSV Export | 5 | $0.50 |
| Social Post | 10 | $1.00 |
| Call Campaign (100) | 50 | $5.00 |

Free monthly allocation: **100 tokens per user**

---

## ⚠️ IMPORTANT NOTES

1. **Always backup database before migration**
2. **Test locally first if possible**
3. **Deploy code before running migration** (safer)
4. **Monitor logs after deployment**
5. **Have rollback SQL ready** (in migration file)

---

## 🆘 QUICK TROUBLESHOOTING

**Problem**: Routes return 404
**Fix**: Check if routes are mounted in app.js

**Problem**: "tokens_balance column does not exist"
**Fix**: Run database migration

**Problem**: Tokens not deducting
**Fix**: Check if deductTokens() is called after operations

**Problem**: UI not showing balance
**Fix**: Check browser console for errors

---

## 📞 HELP

Full detailed guide: `TOKEN_SYSTEM_COMPLETE_IMPLEMENTATION_GUIDE.md`

Issues? Check the Troubleshooting section in the complete guide.

---

**Ready to start? Begin with Step 1: Mount Routes** 🚀
