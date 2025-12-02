# Photo Studio - URL Structure & Flow

## 🌐 URL Mapping

### External URLs (Public-Facing)
| URL | Hosted On | Purpose |
|-----|-----------|---------|
| **`https://ringlypro.com/photo-studio`** | RinglyPro Website | Landing page (static HTML) |

### Internal URLs (Backend/API)
| URL | Server | Purpose |
|-----|--------|---------|
| **`https://aiagent.ringlypro.com/photo-studio-auth`** | CRM Backend | Sign up / Sign in page |
| **`https://aiagent.ringlypro.com/photo-studio-portal`** | CRM Backend | Upload portal |
| **`https://aiagent.ringlypro.com/photo-studio-success`** | CRM Backend | Payment confirmation |
| **`https://aiagent.ringlypro.com/api/auth/register`** | CRM Backend | Create account API |
| **`https://aiagent.ringlypro.com/api/auth/login`** | CRM Backend | Login API |
| **`https://aiagent.ringlypro.com/api/photo-studio/*`** | CRM Backend | Photo Studio APIs |
| **`https://aiagent.ringlypro.com/api/photo-uploads/*`** | CRM Backend | Photo upload APIs |

---

## 🔄 Complete Customer Flow (Updated)

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Customer Visits Landing Page                            │
│ URL: https://ringlypro.com/photo-studio                         │
│                                                                  │
│ Hosted on: RinglyPro Marketing Website                          │
│ File: ai-food-photo-landing.html                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Customer clicks "Get Started"
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: JavaScript Checks Authentication                        │
│                                                                  │
│ Checks: localStorage.getItem('authToken')                       │
│                                                                  │
│ IF NO TOKEN → Redirects to Sign Up/In Page                     │
│ IF HAS TOKEN → Creates Stripe Checkout                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                         (No Token)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Sign Up / Sign In Page                                  │
│ URL: https://aiagent.ringlypro.com/photo-studio-auth           │
│      ?redirect=https://ringlypro.com/photo-studio#pricing       │
│                                                                  │
│ Hosted on: CRM Backend (EJS Template)                           │
│ File: views/photo-studio-auth.ejs                               │
│                                                                  │
│ Customer fills form:                                            │
│ - First Name, Last Name                                         │
│ - Email, Phone                                                  │
│ - Password                                                      │
│                                                                  │
│ Form submits to:                                                │
│ POST https://aiagent.ringlypro.com/api/auth/register           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Account Created Successfully
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Backend Creates Account                                 │
│                                                                  │
│ Creates:                                                         │
│ - User record (users table)                                     │
│ - Client profile (clients table)                                │
│ - Twilio number (for Rachel AI)                                 │
│                                                                  │
│ Returns:                                                         │
│ - JWT token                                                     │
│ - User info                                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Token Stored in localStorage
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Redirect Back to Landing Page                           │
│ URL: https://ringlypro.com/photo-studio#pricing                 │
│                                                                  │
│ Customer now logged in with authToken                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Customer clicks "Get Started" again
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Create Stripe Checkout (Now Authenticated)              │
│                                                                  │
│ POST https://aiagent.ringlypro.com/api/photo-studio/           │
│      create-checkout-session                                    │
│                                                                  │
│ Headers: Authorization: Bearer <token>                          │
│ Body: { package_type: "pro" }                                   │
│                                                                  │
│ Backend creates Stripe session and returns checkout URL         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
              Redirect to Stripe Checkout Page
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 7: Customer Completes Payment on Stripe                    │
│ URL: https://checkout.stripe.com/c/pay/cs_...                  │
│                                                                  │
│ Customer enters credit card info                                │
│ Stripe processes payment                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Payment Successful
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 8: Success Page                                            │
│ URL: https://aiagent.ringlypro.com/photo-studio-success        │
│      ?session_id=cs_test_...                                    │
│                                                                  │
│ Page verifies payment:                                          │
│ GET https://aiagent.ringlypro.com/api/photo-studio/            │
│     verify-payment?session_id=cs_test_...                       │
│                                                                  │
│ Backend:                                                         │
│ - Retrieves Stripe session                                      │
│ - Verifies payment status = 'paid'                             │
│ - Creates order in photo_studio_orders table                    │
│ - Returns order details                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
              Customer clicks "Upload Photos Now"
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 9: Upload Portal                                           │
│ URL: https://aiagent.ringlypro.com/photo-studio-portal         │
│                                                                  │
│ Hosted on: CRM Backend (EJS Template)                           │
│ File: views/photo-studio-portal.ejs                             │
│                                                                  │
│ Loads orders:                                                   │
│ GET https://aiagent.ringlypro.com/api/photo-studio/orders      │
│                                                                  │
│ Customer uploads photos:                                        │
│ POST https://aiagent.ringlypro.com/api/photo-uploads/upload    │
│                                                                  │
│ Photos saved to AWS S3 and database                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 API Endpoints (All on aiagent.ringlypro.com)

### Authentication APIs
```
POST /api/auth/register
  - Create new account
  - Body: { firstName, lastName, email, phoneNumber, password }
  - Returns: { token, user }

POST /api/auth/login
  - Sign in existing user
  - Body: { email, password }
  - Returns: { token, user }
```

### Photo Studio APIs
```
GET /api/photo-studio/packages
  - Get available packages (public)
  - Returns: { starter, pro, elite }

POST /api/photo-studio/create-checkout-session
  - Create Stripe checkout session (authenticated)
  - Headers: Authorization: Bearer <token>
  - Body: { package_type: 'starter'|'pro'|'elite' }
  - Returns: { url, sessionId }

GET /api/photo-studio/verify-payment?session_id=xxx
  - Verify Stripe payment and create order (authenticated)
  - Headers: Authorization: Bearer <token>
  - Returns: { orderId, packageType, photosToUpload, photosToReceive }

GET /api/photo-studio/orders
  - Get user's orders (authenticated)
  - Headers: Authorization: Bearer <token>
  - Returns: { orders: [...] }

GET /api/photo-studio/order/:orderId
  - Get specific order (authenticated)
  - Headers: Authorization: Bearer <token>
  - Returns: { order: {...} }
```

### Photo Upload APIs
```
POST /api/photo-uploads/upload
  - Upload photos (authenticated, multipart/form-data)
  - Headers: Authorization: Bearer <token>
  - Body: FormData with photos, order_id, service_type
  - Returns: { uploads: [...], order: {...} }

GET /api/photo-uploads/order/:orderId
  - Get uploads for order (authenticated)
  - Headers: Authorization: Bearer <token>
  - Returns: { uploads: [...] }

DELETE /api/photo-uploads/:uploadId
  - Delete uploaded photo (authenticated)
  - Headers: Authorization: Bearer <token>
  - Returns: { success: true }
```

---

## 🔐 Cross-Domain Authentication

### How It Works:
1. **Landing page** (`ringlypro.com/photo-studio`) is static HTML
2. **Auth/Upload pages** (`aiagent.ringlypro.com`) are dynamic (EJS)
3. **Token is stored in localStorage** - accessible across subdomains if same parent domain
4. **All API calls** go to `aiagent.ringlypro.com` with Bearer token

### Important Notes:
- ✅ `localStorage` persists across page reloads
- ✅ `localStorage` works even when navigating between different pages
- ⚠️ Make sure CORS is configured on backend to accept requests from `ringlypro.com`
- ⚠️ Token has domain: `.ringlypro.com` (with dot) to work on all subdomains

---

## 🚀 Deployment Checklist

### On RinglyPro Website (ringlypro.com)
- [ ] Upload `ai-food-photo-landing.html` to `/photo-studio` path
- [ ] Ensure file is publicly accessible
- [ ] Test: Visit `https://ringlypro.com/photo-studio`

### On CRM Backend (aiagent.ringlypro.com)
- [ ] Deploy latest code with new routes
- [ ] Run database migration: `migrations/create-photo-uploads.sql`
- [ ] Configure AWS S3 credentials in `.env`
- [ ] Install dependencies: `npm install`
- [ ] Restart server: `npm run dev` or `pm2 restart`
- [ ] Test endpoints:
  - `/photo-studio-auth`
  - `/photo-studio-portal`
  - `/photo-studio-success`
  - `/api/photo-studio/*`
  - `/api/photo-uploads/*`

### CORS Configuration
Ensure backend allows requests from `ringlypro.com`:

```javascript
// In src/app.js or CORS config
app.use(cors({
  origin: [
    'https://ringlypro.com',
    'https://www.ringlypro.com',
    'https://aiagent.ringlypro.com'
  ],
  credentials: true
}));
```

---

## 🧪 Testing the Complete Flow

1. **Visit landing page:**
   ```
   https://ringlypro.com/photo-studio
   ```

2. **Click "Get Started" on Pro package**
   - Should redirect to: `https://aiagent.ringlypro.com/photo-studio-auth?redirect=...`

3. **Sign up as new customer:**
   - Fill in form
   - Click "Create Account"
   - Should redirect back to: `https://ringlypro.com/photo-studio#pricing`
   - Should have `authToken` in localStorage

4. **Click "Get Started" again:**
   - Should create Stripe checkout
   - Should redirect to Stripe payment page

5. **Complete payment:**
   - Use test card: `4242 4242 4242 4242`
   - Should redirect to: `https://aiagent.ringlypro.com/photo-studio-success?session_id=...`

6. **Click "Upload Photos Now":**
   - Should go to: `https://aiagent.ringlypro.com/photo-studio-portal`
   - Should see order with upload interface

7. **Upload photos:**
   - Select/drag 10 photos
   - Click "Upload Selected Photos"
   - Should see photos uploaded successfully

---

## 📝 Summary

| Component | Location | URL |
|-----------|----------|-----|
| **Landing Page** | RinglyPro Website | `ringlypro.com/photo-studio` |
| **Auth Page** | CRM Backend | `aiagent.ringlypro.com/photo-studio-auth` |
| **Portal** | CRM Backend | `aiagent.ringlypro.com/photo-studio-portal` |
| **Success** | CRM Backend | `aiagent.ringlypro.com/photo-studio-success` |
| **APIs** | CRM Backend | `aiagent.ringlypro.com/api/*` |
| **Database** | PostgreSQL | `photo_studio_orders`, `photo_uploads` |
| **Storage** | AWS S3 | `ringlypro-uploads` bucket |

**The flow is now complete with proper cross-domain integration!** 🎉
