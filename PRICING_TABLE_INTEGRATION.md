# RinglyPro Pricing Table Integration Guide

## Overview

This pricing table system integrates with Stripe Checkout Sessions to handle subscription payments for RinglyPro's token-based billing system.

## Files Created

### 1. **Full-Page Pricing Table**
- **File:** `views/pricing-table.html`
- **Purpose:** Standalone pricing page with gradient background
- **Features:**
  - 4 pricing tiers (Free, Starter, Growth, Professional)
  - Monthly/Annual billing toggle with 15% discount
  - Stripe Checkout integration
  - Responsive design
  - Loading states

### 2. **Embeddable Pricing Component**
- **File:** `public/js/pricing-component.js`
- **Purpose:** JavaScript component that can be embedded anywhere
- **Features:**
  - Self-contained with inline styles
  - Auto-initializes
  - Customizable container
  - Same Stripe integration as full page

### 3. **Simple Embed Page**
- **File:** `views/pricing-embed.html`
- **Purpose:** Minimal HTML page using the JS component
- **Use Case:** Embed in existing website layouts

## Updated Pricing (14% Increase)

| Tier | Monthly Price | Annual Price | Tokens | Cost/Token |
|------|---------------|--------------|--------|------------|
| Free | $0 | $0 | 100 | N/A |
| Starter | $33 | $336 | 500 | $0.066 |
| Growth | $113 | $1,153 | 2,000 | $0.0565 |
| Professional | $341 | $3,477 | 7,500 | $0.0455 |

## Integration Methods

### Method 1: Full-Page Pricing Table

**Route to add to your Express app:**

```javascript
// In app.js or routes file
app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'pricing-table.html'));
});
```

**Access:** Navigate to `/pricing` on your website.

---

### Method 2: Embeddable Component

**Add to any EJS or HTML file:**

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Page</title>
</head>
<body>
    <!-- Your existing content -->

    <!-- Pricing Component Container -->
    <div id="ringlypro-pricing"></div>

    <!-- Load Component Script -->
    <script src="/js/pricing-component.js"></script>
</body>
</html>
```

**The component auto-initializes when it finds the `#ringlypro-pricing` container.**

---

### Method 3: Custom Container ID

```html
<div id="my-custom-pricing"></div>

<script src="/js/pricing-component.js"></script>
<script>
  // Initialize with custom container
  new RinglyProPricing({
    containerId: 'my-custom-pricing',
    apiBaseUrl: 'https://aiagent.ringlypro.com' // Optional
  });
</script>
```

---

## How the Stripe Integration Works

### 1. **User Clicks Subscribe Button**

The button triggers `handleSubscribe(tier, monthlyPrice, tokens)`:

```javascript
// Example: User clicks "Subscribe" on Growth tier
handleSubscribe('growth', 113, 2000)
```

### 2. **Calculate Final Amount**

```javascript
// Monthly billing
finalAmount = 113
finalTokens = 2000

// Annual billing (15% discount)
finalAmount = Math.floor(113 * 12 * 0.85) = 1153
finalTokens = 2000 * 12 = 24000
```

### 3. **Call Create Checkout Session API**

```javascript
POST /api/tokens/create-checkout-session
Headers: {
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
Body: {
  amount: 113,
  tokens: 2000,
  package: 'growth',
  billing: 'monthly'
}
```

### 4. **API Creates Stripe Session**

```javascript
// In src/routes/tokens.js (line 681-748)
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'usd',
      product_data: {
        name: `2000 RinglyPro Tokens`,
        description: `Add 2000 tokens to your account`
      },
      unit_amount: 11300 // $113 in cents
    },
    quantity: 1
  }],
  mode: 'payment',
  success_url: `${BASE_URL}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${BASE_URL}/purchase-tokens?canceled=true`,
  metadata: {
    userId: '123',
    tokens: '2000',
    amount: '113'
  }
});
```

### 5. **Redirect to Stripe Checkout**

```javascript
window.location.href = session.url;
// Example: https://checkout.stripe.com/c/pay/cs_test_abc123...
```

### 6. **User Completes Payment**

- User enters card details on Stripe's hosted page
- Stripe processes payment securely
- On success: redirects to `/purchase-success?session_id=cs_abc123`
- On cancel: redirects to `/purchase-tokens?canceled=true`

### 7. **Verify Payment & Add Tokens**

```javascript
GET /api/tokens/verify-payment?session_id=cs_abc123
```

Backend:
- Retrieves Stripe session
- Verifies payment status = 'paid'
- Adds tokens to user account
- Records purchase in database

---

## Authentication Requirements

The pricing table requires **JWT authentication** for paid tiers:

```javascript
// Token is retrieved from:
localStorage.getItem('token') || getCookie('token')

// If no token found:
window.location.href = '/login?redirect=/pricing'
```

**Free tier** redirects to registration without authentication.

---

## API Endpoints Used

### 1. **Create Checkout Session**
```
POST /api/tokens/create-checkout-session
Auth: Required (JWT Bearer token)
Body: { amount, tokens, package, billing }
Response: { success: true, url: "stripe_checkout_url", sessionId: "cs_abc" }
```

### 2. **Verify Payment**
```
GET /api/tokens/verify-payment?session_id=cs_abc123
Auth: Required
Response: { success: true, tokens_added: 2000, new_balance: 2500 }
```

### 3. **Get Pricing Info**
```
GET /api/tokens/pricing
Auth: Not required (public)
Response: { success: true, pricing: {...}, packages: {...} }
```

---

## Customization

### Change Colors

Edit CSS variables in `pricing-table.html` or `pricing-component.js`:

```css
:root {
  --primary: #6366f1;        /* Purple */
  --primary-dark: #4f46e5;   /* Darker purple */
  --secondary: #10b981;       /* Green */
  --success: #10b981;         /* Green checkmarks */
  --warning: #f59e0b;         /* Orange badges */
}
```

### Change Annual Discount

```javascript
// In pricing-component.js (line 12)
this.annualDiscount = 0.15; // 15% discount

// To change to 20%:
this.annualDiscount = 0.20;
```

### Add More Tiers

```javascript
// In pricing-component.js, add to this.pricingPlans object:
enterprise: {
  name: 'Enterprise',
  description: 'For large organizations',
  monthlyPrice: 999,
  tokens: 30000,
  costPerToken: 0.0333,
  features: [
    'Everything in Professional',
    'Unlimited everything',
    'White glove onboarding'
  ],
  buttonText: 'Contact Sales'
}
```

---

## Testing

### Test with Stripe Test Mode

1. Use test API keys in `.env`:
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

2. Test card numbers:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires 3D Secure: `4000 0027 6000 3184`

3. Any future expiry date (e.g., 12/34)
4. Any 3-digit CVC (e.g., 123)

### Test Flow

1. Click "Subscribe Now" on any tier
2. Should redirect to Stripe Checkout
3. Enter test card: 4242 4242 4242 4242
4. Complete payment
5. Redirects back to your site
6. Tokens added to account

---

## Environment Variables Required

```bash
# Required for Stripe integration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Base URL for redirects
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com

# Or for local testing
WEBHOOK_BASE_URL=http://localhost:3000
```

---

## Success/Cancel Pages

You need to create these pages:

### `/purchase-success` Page
```html
<!-- Shown after successful payment -->
<h1>Payment Successful!</h1>
<p>Your tokens have been added to your account.</p>
<a href="/dashboard">Go to Dashboard</a>
```

### `/purchase-tokens` Page (with ?canceled=true)
```html
<!-- Shown if user cancels payment -->
<h1>Payment Canceled</h1>
<p>Your payment was canceled. No charges were made.</p>
<a href="/pricing">Try Again</a>
```

---

## Features

### ✅ Included
- 4 pricing tiers with token allocations
- Monthly/Annual billing toggle (15% discount)
- Stripe Checkout integration
- Responsive design (mobile-friendly)
- Loading states during checkout
- "Most Popular" badge on Growth tier
- Feature comparison table
- Cost per token calculations
- Annual savings display

### 🚀 Future Enhancements
- Add-on token packages
- Referral discounts
- Team plans
- Volume discounts
- Custom enterprise quotes

---

## Troubleshooting

### "Please log in to subscribe"
**Issue:** User not authenticated
**Solution:** Ensure JWT token is stored in localStorage or cookies after login

### "Failed to create checkout session"
**Issue:** Stripe API error
**Solution:** Check STRIPE_SECRET_KEY in .env file

### Prices not updating when toggling billing
**Issue:** JavaScript not loaded
**Solution:** Ensure `/js/pricing-component.js` is accessible

### Component not rendering
**Issue:** Container not found
**Solution:** Ensure `<div id="ringlypro-pricing"></div>` exists in HTML

---

## Support

For issues or questions:
- Check browser console for errors
- Verify JWT token is present
- Test with Stripe test mode first
- Check server logs for API errors

## License

© 2025 RinglyPro. All rights reserved.
