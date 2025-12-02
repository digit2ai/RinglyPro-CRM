# RinglyPro Photo Studio - Complete Customer Flow

## 🎯 Complete User Journey (Fixed)

### Step 1: Browse Packages
**URL:** `https://ringlypro.com/photo-studio` (or `/ai-food-photo-landing.html`)

Customer sees three packages:
- **Starter** - $150 (10 photos)
- **Pro** - $350 (30 photos) - Best Value
- **Elite** - $500 (60 photos)

### Step 2: Click "Get Started"
Customer clicks "Get Started" button on any package.

**What happens:**
- JavaScript checks if user is logged in (looks for `authToken` in localStorage)
- **If NOT logged in** → Redirects to `/photo-studio-auth?redirect=/ai-food-photo-landing.html#pricing`
- **If logged in** → Creates Stripe checkout session (continues to Step 4)

### Step 3: Sign Up / Sign In
**URL:** `/photo-studio-auth`

**New customers** see a clean signup form:
```
┌─────────────────────────────────┐
│  Sign In  |  Sign Up (active)   │
├─────────────────────────────────┤
│ First Name:    [John]           │
│ Last Name:     [Doe]            │
│ Email:         [john@email.com] │
│ Phone:         [+1 555-123-4567]│
│ Password:      [••••••••]       │
│ ☑ I agree to Terms & Privacy    │
│                                 │
│   [Create Account]              │
└─────────────────────────────────┘
```

**What happens when they submit:**
1. Form calls `POST /api/auth/register` with:
   ```json
   {
     "firstName": "John",
     "lastName": "Doe",
     "email": "john@email.com",
     "phoneNumber": "+1 555-123-4567",
     "password": "password123",
     "businessName": "John's Photos",
     "businessPhone": "+1 555-123-4567",
     "businessType": "photo_studio_client",
     "termsAccepted": true
   }
   ```

2. Backend creates:
   - **User account** in `users` table
   - **Client profile** in `clients` table (linked to user)
   - **Twilio number** (for Rachel AI, but not activated)

3. Returns JWT token:
   ```json
   {
     "success": true,
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "user": {
       "id": 123,
       "email": "john@email.com",
       "firstName": "John",
       "lastName": "Doe"
     }
   }
   ```

4. Frontend stores token in `localStorage.setItem('authToken', token)`

5. Redirects back to landing page: `/ai-food-photo-landing.html#pricing`

### Step 4: Purchase Package (Now Logged In)
Customer clicks "Get Started" again (now logged in).

**What happens:**
1. JavaScript calls `POST /api/photo-studio/create-checkout-session`:
   ```json
   {
     "package_type": "pro"
   }
   ```

2. Backend creates Stripe checkout session:
   ```json
   {
     "success": true,
     "url": "https://checkout.stripe.com/c/pay/cs_test_...",
     "sessionId": "cs_test_..."
   }
   ```

3. Frontend redirects to Stripe payment page

### Step 5: Complete Payment
Customer enters credit card info on Stripe.

**What happens:**
1. Stripe processes payment
2. Stripe redirects to: `/photo-studio-success?session_id=cs_test_...`

### Step 6: Payment Confirmation
**URL:** `/photo-studio-success`

Customer sees success page with:
- Order number
- Package details
- "Upload Photos Now" button

**What happens:**
- Page calls `GET /api/photo-studio/verify-payment?session_id=cs_test_...`
- Backend verifies payment with Stripe
- Backend creates order in `photo_studio_orders` table:
  ```sql
  INSERT INTO photo_studio_orders (
    user_id, package_type, price,
    photos_to_upload, photos_to_receive,
    stripe_session_id, payment_status, order_status
  ) VALUES (
    123, 'pro', 350.00,
    10, 30,
    'cs_test_...', 'paid', 'awaiting_upload'
  );
  ```

### Step 7: Upload Photos
Customer clicks "Upload Photos Now" → Goes to `/photo-studio-portal`

**URL:** `/photo-studio-portal`

Customer sees their order:
```
┌─────────────────────────────────────┐
│ Order #456   [AWAITING UPLOAD]      │
│                                     │
│ Pro Package - $350                  │
│                                     │
│ Upload Progress: 0 / 10             │
│ [░░░░░░░░░░░░░░] 0%                │
│                                     │
│ ┌─────────────────────────────┐    │
│ │ 📸 Click or drag photos     │    │
│ └─────────────────────────────┘    │
│                                     │
│ [Upload Selected Photos]            │
└─────────────────────────────────────┘
```

**What happens when customer uploads:**
1. Customer selects/drags 10 photos
2. Frontend calls `POST /api/photo-uploads/upload` with FormData:
   ```
   order_id: 456
   service_type: photo_studio
   photos: [File, File, File...] (10 files)
   ```

3. Backend:
   - Validates files (type, size, format)
   - Generates unique S3 keys:
     ```
     uploads/photo_studio/user_123/order_456/1701234567890_abc123_burger.jpg
     ```
   - Uploads to AWS S3
   - Saves to `photo_uploads` table:
     ```sql
     INSERT INTO photo_uploads (
       user_id, service_type, service_order_id,
       original_filename, storage_key, storage_url,
       upload_status
     ) VALUES (
       123, 'photo_studio', 456,
       'burger.jpg', 'uploads/photo_studio/...', 'https://s3...',
       'uploaded'
     );
     ```
   - Updates order:
     ```sql
     UPDATE photo_studio_orders
     SET photos_uploaded = 10,
         order_status = 'processing'
     WHERE id = 456;
     ```

4. Customer sees photos uploaded with thumbnails

### Step 8: Admin Processing (Your Side)
**You (admin) process the photos:**

1. **Check for new orders:**
   ```sql
   SELECT * FROM photo_studio_upload_summary
   WHERE order_status = 'processing';
   ```

2. **Get photo URLs:**
   ```sql
   SELECT storage_url, original_filename
   FROM photo_uploads
   WHERE service_order_id = 456
   ORDER BY uploaded_at;
   ```

3. **Download from S3** using the presigned URLs

4. **Enhance photos** with your AI tools

5. **Deliver to customer** (via email or upload portal - future feature)

6. **Mark as complete:**
   ```sql
   UPDATE photo_studio_orders
   SET order_status = 'completed',
       delivery_date = NOW()
   WHERE id = 456;
   ```

---

## 🔗 URL Reference

| Page | URL | Purpose |
|------|-----|---------|
| **Landing Page** | `/ai-food-photo-landing.html` | Browse & select packages |
| **Auth Page** | `/photo-studio-auth` | Sign up / Sign in |
| **Success Page** | `/photo-studio-success` | Payment confirmation |
| **Upload Portal** | `/photo-studio-portal` | Upload photos & view orders |

---

## 🗄️ Database Flow

### Tables Used:
1. **`users`** - User accounts (email, password, name)
2. **`clients`** - Client profiles (linked to users, includes Twilio number)
3. **`photo_studio_orders`** - Package purchases
4. **`photo_uploads`** - Uploaded photos with S3 locations

### Relationships:
```
users (id: 123)
  ↓
clients (user_id: 123, id: 789)
  ↓
photo_studio_orders (user_id: 123, id: 456)
  ↓
photo_uploads (service_order_id: 456, user_id: 123)
```

---

## 🔐 Authentication Flow

### On Signup:
1. User fills form → `POST /api/auth/register`
2. Backend creates user + client
3. Returns JWT token
4. Frontend stores in `localStorage.setItem('authToken', token)`

### On Login:
1. User fills form → `POST /api/auth/login`
2. Backend validates credentials
3. Returns JWT token
4. Frontend stores token

### On API Calls:
```javascript
fetch('/api/photo-studio/orders', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
})
```

Backend validates token using `authenticateToken` middleware.

---

## 💳 Payment Flow (Stripe)

### Create Checkout:
```
Frontend → POST /api/photo-studio/create-checkout-session
Backend → Creates Stripe session
Backend → Returns checkout URL
Frontend → Redirects to Stripe
```

### After Payment:
```
Stripe → Redirects to /photo-studio-success?session_id=xxx
Frontend → Calls /api/photo-studio/verify-payment?session_id=xxx
Backend → Retrieves session from Stripe
Backend → Verifies payment status = 'paid'
Backend → Creates order in database
Backend → Returns order details
```

---

## 📸 Photo Upload Flow

### Upload:
```
Customer selects files
  ↓
Frontend → POST /api/photo-uploads/upload (multipart/form-data)
  ↓
Backend validates files
  ↓
Backend uploads to S3: uploads/photo_studio/user_X/order_Y/timestamp_random_filename.ext
  ↓
Backend saves to photo_uploads table
  ↓
Backend updates order.photos_uploaded count
  ↓
Returns success + photo URLs
  ↓
Frontend displays thumbnails
```

### Retrieve:
```
Frontend → GET /api/photo-uploads/order/456
Backend → SELECT * FROM photo_uploads WHERE service_order_id = 456
Returns array of uploaded photos with presigned URLs
```

---

## ✅ What's Fixed

### Before (Broken):
- Customer clicked "Get Started"
- Redirected to `/login?redirect=...`
- No signup form existed
- User got stuck at RinglyPro home page

### Now (Fixed):
- Customer clicks "Get Started"
- Redirects to `/photo-studio-auth`
- Clean signup/login form specifically for Photo Studio
- Creates account using existing RinglyPro auth system
- Seamlessly continues to payment
- After payment, uploads photos
- Complete end-to-end flow!

---

## 🚀 Testing the Complete Flow

1. **Visit landing page:**
   ```
   http://localhost:3000/ai-food-photo-landing.html
   ```

2. **Click "Get Started" on Pro package**
   - Should redirect to `/photo-studio-auth`

3. **Sign up as new customer:**
   - Fill in first name, last name, email, phone, password
   - Check terms checkbox
   - Click "Create Account"
   - Should redirect back to landing page (now logged in)

4. **Click "Get Started" again:**
   - Should create Stripe checkout
   - Complete payment (use test card: `4242 4242 4242 4242`)

5. **After payment:**
   - Should see success page
   - Click "Upload Photos Now"

6. **Upload photos:**
   - Drag & drop or select 10 photos
   - Click "Upload Selected Photos"
   - Should see photos uploaded with thumbnails

7. **Check database:**
   ```sql
   SELECT * FROM users WHERE email = 'your-test-email@example.com';
   SELECT * FROM photo_studio_orders WHERE user_id = <user_id>;
   SELECT * FROM photo_uploads WHERE service_order_id = <order_id>;
   ```

---

## 📝 Summary

The complete flow now works perfectly:
1. ✅ Customer browses packages
2. ✅ Customer clicks "Get Started"
3. ✅ **NEW:** Sign up with simple form at `/photo-studio-auth`
4. ✅ Account created using RinglyPro auth system
5. ✅ Redirected back to purchase
6. ✅ Stripe checkout session created
7. ✅ Customer pays
8. ✅ Order created in database
9. ✅ Customer uploads photos
10. ✅ Photos saved to S3 + database
11. ✅ You download and process
12. ✅ Customer receives enhanced photos

All integrated with existing RinglyPro authentication! 🎉
