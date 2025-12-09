# Photo Studio Shopping Cart Implementation Plan

## Overview
Transform the Photo Studio from a fixed-package model to a dynamic shopping cart model where users upload photos first and pay based on quantity with volume discounts.

## New Pricing Logic (Option B: Volume Discount)

```javascript
function calculatePrice(photoCount) {
  if (photoCount <= 0) return 0;
  if (photoCount <= 10) return 150; // Base: $150 for 1-10 photos

  let price = 150; // Base price for first 10
  let remaining = photoCount - 10;

  // Photos 11-20: $12/photo
  if (remaining > 0) {
    const tier1 = Math.min(remaining, 10);
    price += tier1 * 12;
    remaining -= tier1;
  }

  // Photos 21-40: $10/photo
  if (remaining > 0) {
    const tier2 = Math.min(remaining, 20);
    price += tier2 * 10;
    remaining -= tier2;
  }

  // Photos 41+: $8/photo
  if (remaining > 0) {
    price += remaining * 8;
  }

  return price;
}
```

**Price Examples:**
| Photos | Calculation | Total |
|--------|-------------|-------|
| 1-10   | $150 base   | $150  |
| 15     | $150 + (5 × $12) | $210 |
| 20     | $150 + (10 × $12) | $270 |
| 30     | $150 + (10 × $12) + (10 × $10) | $370 |
| 40     | $150 + (10 × $12) + (20 × $10) | $470 |
| 50     | $150 + (10 × $12) + (20 × $10) + (10 × $8) | $550 |
| 60     | $150 + (10 × $12) + (20 × $10) + (20 × $8) | $630 |

## New User Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. Landing Page (/photo-studio)                        │
│     - Show pricing tiers info (informational)           │
│     - Big CTA: "Start Uploading" button                 │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────▼────────┐
         │ User logged in?│
         └───────┬────────┘
                 │
    ┌────────────┴────────────┐
    │ NO                      │ YES
    ▼                         ▼
┌──────────────┐      ┌──────────────────────────┐
│ Auth Page    │      │ Photo Upload Page        │
│ (Sign In/Up) │      │ (Shopping Cart Model)    │
└──────┬───────┘      └──────────────────────────┘
       │                         │
       └─────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│  2. NEW: Photo Upload & Cart Page                      │
│     ┌─────────────────────┬──────────────────────────┐ │
│     │  Upload Area        │  Shopping Cart Sidebar   │ │
│     │  - Drag & drop      │  - Photo thumbnails      │ │
│     │  - Click to browse  │  - Running total         │ │
│     │  - Photos stored    │  - Price breakdown       │ │
│     │    in browser cache │  - Remove photo buttons  │ │
│     │                     │  - "Checkout" button     │ │
│     └─────────────────────┴──────────────────────────┘ │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼ (Click Checkout)
┌────────────────────────────────────────────────────────┐
│  3. Stripe Checkout                                    │
│     - Dynamic line item based on photo count           │
│     - Total price calculated by algorithm              │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼ (Payment Success)
┌────────────────────────────────────────────────────────┐
│  4. Upload Photos to S3 (POST-PAYMENT)                 │
│     - Transfer from browser cache to AWS S3            │
│     - Create order record in database                  │
│     - Show upload progress                             │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│  5. Portal (existing)                                  │
│     - View order status                                │
│     - Download enhanced photos when ready              │
└────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create New Upload & Cart Page
**File:** `views/photo-studio-upload.ejs` (NEW)

- Split layout: Upload area (left 60%) + Cart sidebar (right 40%)
- Upload area with drag-and-drop
- Photos stored in browser memory (File objects / object URLs)
- Cart displays thumbnails with remove buttons
- Dynamic pricing display updated on every add/remove
- Price breakdown showing tier calculations
- Checkout button (disabled if no photos)

### Step 2: Update Landing Page
**File:** `views/photo-studio-landing.ejs`

- Remove package selection cards
- Add pricing tier information (informational, not selectable)
- Change CTA to "Start Uploading" → redirects to auth (if needed) then upload page
- Keep testimonials and other marketing content

### Step 3: Update Auth Flow
**File:** `views/photo-studio-auth.ejs`

- Remove `selectedPackage` logic
- After auth, redirect to `/photo-studio-upload` instead of creating checkout

### Step 4: Add Backend Endpoints
**File:** `src/routes/photo-studio.js`

New endpoints:
```
POST /api/photo-studio/calculate-price
  Body: { photo_count: number }
  Returns: { price, breakdown: [...] }

POST /api/photo-studio/create-cart-checkout
  Body: { photo_count: number }
  Returns: { checkout_url, session_id }
  - Creates Stripe session with dynamic price
  - Stores photo_count in session metadata

POST /api/photo-studio/complete-upload
  Body: { session_id, photos: File[] (multipart) }
  - Verifies payment
  - Uploads photos to S3
  - Creates order record
```

### Step 5: Update Database Schema
**File:** `migrations/XXXXXX-update-photo-studio-for-cart.js`

- Modify `package_type` to allow 'custom' or make it nullable
- Add `pricing_model` field: 'package' | 'cart'
- Ensure `photos_to_upload` and `photos_to_receive` support custom counts
- For cart model: `photos_to_receive = photos_to_upload` (1:1 ratio)

### Step 6: Update Success Page
**File:** `views/photo-studio-success.ejs`

- Detect if coming from cart checkout
- Trigger S3 upload of cached photos
- Show upload progress
- Redirect to portal when complete

### Step 7: Update Portal
**File:** `views/photo-studio-portal.ejs`

- Handle orders with `package_type = 'custom'`
- Display photo count instead of package name

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `views/photo-studio-upload.ejs` | CREATE | New upload & cart page |
| `views/photo-studio-landing.ejs` | MODIFY | Remove packages, add pricing info |
| `views/photo-studio-auth.ejs` | MODIFY | Remove package selection logic |
| `views/photo-studio-success.ejs` | MODIFY | Handle S3 upload post-payment |
| `src/routes/photo-studio.js` | MODIFY | Add cart endpoints, pricing logic |
| `migrations/XXXXXX-update-photo-studio-for-cart.js` | CREATE | Schema updates |
| `views/photo-studio-portal.ejs` | MODIFY | Support custom package display |

## Technical Considerations

### Browser Photo Storage
- Use `File` objects stored in JavaScript array
- Create `URL.createObjectURL()` for thumbnails
- Revoke object URLs when photos removed
- Consider IndexedDB for larger photo sets (optional)

### Stripe Integration
- Create checkout session with single line item
- Line item name: "Professional Photo Enhancement"
- Line item description: "X photos at $Y"
- Use `unit_amount` calculated by pricing algorithm
- Store `photo_count` in session metadata

### S3 Upload Post-Payment
- After Stripe redirect, retrieve photos from browser cache
- Upload sequentially or in parallel (with limit)
- Show progress bar
- Handle failures gracefully (retry logic)
- Clear browser cache after successful upload

### Cart Persistence (Optional Enhancement)
- Store cart state in localStorage
- Restore on page refresh
- Clear after successful checkout

## Rollback Plan
- Keep existing package endpoints working
- Add feature flag to switch between models
- Can revert by changing flag
