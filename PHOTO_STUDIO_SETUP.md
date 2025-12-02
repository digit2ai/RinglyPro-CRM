# RinglyPro Photo Studio - Integration Setup Guide

## Overview
The Photo Studio payment system is now integrated with your RinglyPro CRM, using the same Stripe account but **completely independent** from the token system. Users can purchase photo enhancement packages without affecting their RinglyPro tokens.

---

## Files Created

### 1. Database Migration
- **File:** `migrations/create-photo-studio-orders.sql`
- **Purpose:** Creates `photo_studio_orders` table to track all photo studio package purchases

### 2. API Routes
- **File:** `src/routes/photo-studio.js`
- **Endpoints:**
  - `GET /api/photo-studio/packages` - Get available packages (public)
  - `POST /api/photo-studio/create-checkout-session` - Create Stripe checkout (authenticated)
  - `GET /api/photo-studio/verify-payment` - Verify payment and create order (authenticated)
  - `GET /api/photo-studio/orders` - Get user's orders (authenticated)
  - `GET /api/photo-studio/order/:orderId` - Get specific order (authenticated)

### 3. Landing Page
- **File:** `ai-food-photo-landing.html`
- **Features:**
  - Professional landing page with RinglyPro branding
  - Three pricing tiers (Starter, Pro, Elite)
  - Integrated Stripe checkout buttons
  - Before/after image comparisons

### 4. Success Page
- **File:** `views/photo-studio-success.ejs`
- **Purpose:** Confirms payment and shows next steps

### 5. App Integration
- **File:** `src/app.js` (modified)
- **Changes:**
  - Added Photo Studio routes import
  - Mounted routes at `/api/photo-studio`
  - Added success page route at `/photo-studio-success`

---

## Setup Instructions

### Step 1: Run Database Migration

```bash
# Connect to your PostgreSQL database
psql -U your_username -d your_database

# Run the migration
\i migrations/create-photo-studio-orders.sql
```

Or using npm:
```bash
npm run migrate:photo-studio
```

### Step 2: Verify Stripe Configuration

Your existing Stripe configuration will work automatically. Ensure these environment variables are set:

```bash
STRIPE_SECRET_KEY=sk_live_... # Your existing Stripe secret key
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com # Your domain
```

### Step 3: Deploy the Landing Page

Place the landing page in your public directory or set up a route:

**Option A: Static File**
```bash
# Copy to public directory
cp ai-food-photo-landing.html public/
```

**Option B: Express Route** (Recommended)
```javascript
// Already configured in src/app.js
app.get('/photo-studio', (req, res) => {
  res.sendFile('ai-food-photo-landing.html', { root: './public' });
});
```

### Step 4: Test the Integration

1. **Start your server:**
   ```bash
   npm run dev
   ```

2. **Visit the landing page:**
   ```
   http://localhost:3000/ai-food-photo-landing.html
   ```

3. **Test a purchase (requires login):**
   - Click "Get Started" on any package
   - You'll be redirected to login if not authenticated
   - Complete Stripe checkout (use test card: `4242 4242 4242 4242`)
   - Verify order creation in database

---

## Package Pricing

| Package | Price | Photos to Upload | Photos Received | Description |
|---------|-------|------------------|-----------------|-------------|
| **Starter** | $150 | 10 | 10 | Basic enhancement |
| **Pro** | $350 | 10 | 30 | 10 photos + 2 variations each (Best Value) |
| **Elite** | $500 | 20 | 60 | 20 photos + 2 variations each |

---

## Database Schema

### photo_studio_orders Table

```sql
CREATE TABLE photo_studio_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  package_type VARCHAR(50) NOT NULL, -- 'starter', 'pro', 'elite'
  price DECIMAL(10,2) NOT NULL,
  photos_to_upload INTEGER NOT NULL,
  photos_to_receive INTEGER NOT NULL,
  photos_uploaded INTEGER DEFAULT 0,
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  payment_status VARCHAR(50) DEFAULT 'pending',
  order_status VARCHAR(50) DEFAULT 'awaiting_upload',
  order_date TIMESTAMP DEFAULT NOW(),
  payment_date TIMESTAMP,
  upload_completed_date TIMESTAMP,
  delivery_date TIMESTAMP,
  customer_notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## User Flow

1. **User visits landing page** → `/ai-food-photo-landing.html`
2. **Clicks "Get Started"** on a package
3. **System checks authentication:**
   - If logged in → Create Stripe checkout session
   - If not logged in → Redirect to `/login?redirect=...`
4. **User completes Stripe checkout**
5. **Stripe redirects to** → `/photo-studio-success?session_id=...`
6. **Success page verifies payment** → Calls `/api/photo-studio/verify-payment`
7. **Backend creates order** in `photo_studio_orders` table
8. **User sees order confirmation** with next steps

---

## API Authentication

All Photo Studio API endpoints (except `/packages`) require authentication using the same JWT token system as RinglyPro:

```javascript
// Example authenticated request
const token = localStorage.getItem('authToken');

fetch('/api/photo-studio/create-checkout-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    package_type: 'pro'
  })
});
```

---

## Separation from Token System

### What's SHARED:
- ✅ Same Stripe account
- ✅ Same authentication system (JWT)
- ✅ Same user database (`users` table)
- ✅ Same payment processing infrastructure

### What's SEPARATE:
- ❌ **Different database table** (`photo_studio_orders` vs `token_purchases`)
- ❌ **Different API endpoints** (`/api/photo-studio` vs `/api/tokens`)
- ❌ **No token deduction** (photo orders don't affect token balance)
- ❌ **Different order tracking** (separate from token usage)
- ❌ **Different fulfillment process** (photo delivery vs token credit)

---

## Monitoring & Admin

### View All Photo Studio Orders

```sql
SELECT
  o.id,
  u.email,
  o.package_type,
  o.price,
  o.photos_to_upload,
  o.photos_uploaded,
  o.order_status,
  o.payment_status,
  o.order_date
FROM photo_studio_orders o
JOIN users u ON o.user_id = u.id
ORDER BY o.order_date DESC;
```

### Check Payment Status

```sql
SELECT
  id,
  package_type,
  stripe_session_id,
  payment_status,
  order_status
FROM photo_studio_orders
WHERE payment_status = 'pending'
OR order_status = 'awaiting_upload';
```

### Get Revenue Stats

```sql
SELECT
  package_type,
  COUNT(*) as orders,
  SUM(price) as total_revenue
FROM photo_studio_orders
WHERE payment_status = 'paid'
GROUP BY package_type;
```

---

## Next Steps (Future Enhancements)

1. **Photo Upload Portal:**
   - Create upload interface for customers
   - S3 or GCS bucket integration
   - Track upload progress

2. **Admin Dashboard:**
   - View all orders
   - Update order status
   - Upload processed photos

3. **Email Notifications:**
   - Order confirmation
   - Upload instructions
   - Delivery notifications
   - Use existing SendGrid integration

4. **Webhook Handling:**
   - Add Stripe webhook endpoint for real-time updates
   - Handle payment failures
   - Refund processing

---

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Landing page loads correctly
- [ ] User can log in/sign up
- [ ] "Get Started" buttons redirect to Stripe checkout
- [ ] Stripe checkout accepts test payments
- [ ] Success page verifies payment
- [ ] Order appears in database
- [ ] User can view their orders via API

---

## Support

For questions or issues:
- Email: support@ringlypro.com
- Check logs: `logs/app.log`
- Database issues: Check PostgreSQL logs

---

## Security Notes

- All payments processed through Stripe (PCI compliant)
- Authentication required for all purchase endpoints
- Orders tied to authenticated user only
- Session validation prevents unauthorized access
- Uses same security middleware as RinglyPro token system
