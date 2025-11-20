# How to Test Token Purchase Without Spending Money

## Option 1: Use Stripe Test Mode (FREE - No real charges)

### Step 1: Switch to Stripe Test Keys
In your `.env` file or environment variables, temporarily use test keys instead of live keys:

```bash
# Replace live keys with test keys
STRIPE_SECRET_KEY=sk_test_... # Your test secret key
STRIPE_PUBLISHABLE_KEY=pk_test_... # Your test publishable key
```

### Step 2: Use Stripe Test Card Numbers
When checking out, use these test card numbers (they won't charge real money):

**Successful Payment:**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

**Failed Payment (to test error handling):**
- Card: `4000 0000 0000 0002`

**Requires Authentication (to test 3D Secure):**
- Card: `4000 0027 6000 3184`

### Step 3: Test Purchase Flow
1. Go to `/purchase-tokens`
2. Select any package
3. Enter test card details
4. Complete purchase
5. Verify tokens are added to your account

### Step 4: Switch Back to Live Keys
After testing, switch back to your live Stripe keys.

---

## Option 2: Manual Database Check (Current Status)

You already paid $10 and the tokens have been manually credited. To verify:

```bash
# Check your current token balance
node -e "
const { User } = require('./src/models');
User.findOne({ where: { email: 'mstagg@digit2ai.com' }})
  .then(user => console.log('Balance:', user.tokens_balance))
  .catch(err => console.error(err));
"
```

---

## Option 3: Check Server Logs

After making a purchase (test or live), check the server logs for:

```
[TOKENS] Creating checkout session for user X, amount: $XX, tokens: XXX
[TOKENS] Payment verified - adding XXX tokens to user X
[TOKENS] Successfully added XXX tokens to user X, new balance: XXX
```

If you see all three log messages, the fix is working!

---

## Your Current Status

✅ **$10 payment from earlier has been credited** - 100 tokens added
✅ **Bug has been fixed** - Future purchases will work automatically
✅ **No need to spend more money to test** - Use Stripe test mode instead

---

## Verification Commands

```bash
# Check current balance
psql "$DATABASE_URL" -c "SELECT email, tokens_balance FROM users WHERE email = 'mstagg@digit2ai.com';"

# View recent token transactions
psql "$DATABASE_URL" -c "SELECT * FROM token_transactions WHERE user_id = 7 ORDER BY created_at DESC LIMIT 5;"
```

Your 100 tokens should now be visible in the dashboard!
