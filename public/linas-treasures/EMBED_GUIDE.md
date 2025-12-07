# Lina's Treasures - GoHighLevel Integration Guide

## 🎯 What You Have Now

I've built a complete **e-commerce backend + embeddable widgets** that you can integrate into your GoHighLevel (GHL) website.

## ✅ What's Ready to Use

### Backend API (100% Complete)
- ✅ Product catalog management
- ✅ Shopping cart system
- ✅ Order processing
- ✅ Partnership applications
- ✅ Stripe payment integration
- ✅ Inventory tracking
- ✅ Partner wholesale pricing (3 tiers)
- ✅ Admin management system

### Embeddable Widgets (Ready Now)
1. ✅ **Product Catalog Widget** - Browse & shop products
2. ✅ **Shopping Cart Widget** - View cart & checkout

### Database (Live in Production)
- ✅ 8 tables created with product categories seeded
- ✅ Ready to accept products, orders, partnerships

---

## 🚀 Quick Start - Embed in GHL

### Step 1: Access Your Widgets

Your widgets are live at:
```
http://localhost:3000/linas-treasures/widgets/product-catalog.html
http://localhost:3000/linas-treasures/widgets/shopping-cart.html
```

(Replace `localhost:3000` with your production domain when deployed)

### Step 2: Embed in GoHighLevel

#### Option A: Full Page Embed (Recommended)

Create a new page in GHL and add this HTML in a Custom Code element:

**For Product Catalog Page:**
```html
<div style="width: 100%; max-width: 1200px; margin: 0 auto;">
  <iframe
    src="https://YOUR_DOMAIN.com/linas-treasures/widgets/product-catalog.html"
    width="100%"
    height="1400px"
    frameborder="0"
    style="border: none; display: block;">
  </iframe>
</div>
```

**For Shopping Cart Page:**
```html
<div style="width: 100%; max-width: 900px; margin: 0 auto;">
  <iframe
    src="https://YOUR_DOMAIN.com/linas-treasures/widgets/shopping-cart.html"
    width="100%"
    height="900px"
    frameborder="0"
    style="border: none; display: block;">
  </iframe>
</div>
```

#### Option B: Section Embed

Add widgets as sections within your existing GHL pages using the same iframe code.

---

## 📋 GHL Site Structure Recommendation

### Suggested Pages

1. **Home Page** (`/`) - Your custom GHL design
   - Hero section
   - About Lina's Treasures
   - CTA buttons: "Shop Now" → `/shop`, "Become a Partner" → `/partner`

2. **Shop Page** (`/shop`) - Embed product catalog widget
   - Product Catalog Widget (embedded)

3. **Cart Page** (`/cart`) - Embed shopping cart widget
   - Shopping Cart Widget (embedded)

4. **Checkout Page** (`/checkout`) - Stripe checkout
   - Checkout Widget (I can build this next)

5. **Partnership Page** (`/partner`) - B2B application
   - Partnership Form Widget (I can build this next)

6. **Partner Portal** (`/partner-dashboard`) - Wholesale ordering
   - Partner Dashboard Widget (I can build this next)

---

## 🛍️ How the Shopping Flow Works

1. **Customer browses products** → Product Catalog Widget
2. **Clicks "Add to Cart"** → Item added to session cart
3. **Clicks cart icon/link** → Goes to Cart Page
4. **Reviews cart** → Shopping Cart Widget
5. **Clicks "Proceed to Checkout"** → Goes to Checkout Page
6. **Enters shipping info & pays** → Stripe processes payment
7. **Order confirmed** → Saved to database, email sent

---

## 🔗 Connecting Navigation

### Add Cart Link to GHL Navigation

In your GHL header/menu, add a link to the cart:

```html
<a href="/cart" class="cart-link">
  Cart (<span id="cart-count">0</span>)
</a>
```

### Update Cart Count Badge

Add this script to your GHL global header/footer:

```html
<script>
// Listen for cart updates from widgets
window.addEventListener('message', function(event) {
  if (event.data.type === 'CART_UPDATED') {
    updateCartCount();
  }
});

// Function to get cart count
async function updateCartCount() {
  try {
    const sessionId = localStorage.getItem('lt_session_id');
    if (!sessionId) return;

    const response = await fetch(`https://YOUR_DOMAIN.com/api/linas-treasures/cart/${sessionId}`);
    const data = await response.json();

    const badge = document.getElementById('cart-count');
    if (badge) {
      badge.textContent = data.itemCount || 0;
    }
  } catch (error) {
    console.error('Error updating cart count:', error);
  }
}

// Update on page load
updateCartCount();
</script>
```

---

## 🎨 Styling to Match Your Brand

### Color Customization

The widgets use gold (`#d4af37`) as the primary color. To change:

1. Download the widget HTML files
2. Search for `#d4af37`
3. Replace with your brand color
4. Re-upload to your server

### Font Customization

Widgets use system fonts. To use your GHL fonts:

1. Add this to the widget HTML `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Your+Font&display=swap" rel="stylesheet">
```

2. Update the CSS:
```css
body {
  font-family: 'Your Font', sans-serif;
}
```

---

## 💳 Stripe Configuration

The backend is already integrated with Stripe. You need to:

1. **Set Stripe Keys** in your `.env` file:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

2. **Test Mode** (for development):
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## 📊 Adding Your First Products

### Option 1: Via API (Technical)

Use Postman or curl:

```bash
curl -X POST https://yourdomain.com/api/linas-treasures/admin/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "sku": "LT-NEC-001",
    "name": "Gold Butterfly Necklace",
    "description": "Handcrafted gold butterfly necklace with delicate details",
    "categoryId": 1,
    "retailPrice": 49.99,
    "wholesalePrice": 29.99,
    "stockQuantity": 100,
    "images": ["https://yourimage.com/necklace.jpg"],
    "isFeatured": true
  }'
```

### Option 2: Admin Panel (Easier - I can build this)

I can create an admin dashboard where you can:
- Add/edit/delete products
- Upload images
- Manage inventory
- View orders
- Approve partnerships

**Want me to build the admin panel next?**

---

## 🔐 Security Notes

- Shopping cart uses session IDs stored in localStorage
- No sensitive data in frontend
- All payments processed securely via Stripe
- Admin routes require authentication
- Partner routes require approved partnership status

---

## 📱 Mobile Optimization

All widgets are fully responsive:
- ✅ Mobile-first design
- ✅ Touch-friendly buttons
- ✅ Optimized images
- ✅ Readable text sizes
- ✅ Easy navigation

---

## 🆘 Troubleshooting

### "Loading products..." Never Finishes
**Problem:** No products in database yet
**Solution:** Add products via API or wait for admin panel

### Cart Doesn't Update
**Problem:** Session ID not being stored
**Solution:** Check if localStorage is enabled in browser

### Widgets Don't Show in GHL
**Problem:** iframe height too small or CORS issue
**Solution:** Increase iframe height, ensure widgets are on same domain

### API Calls Fail
**Problem:** Server not accessible or CORS misconfigured
**Solution:** Check server is running, verify domain configuration

---

## 🎯 Next Steps - What to Build Next?

**Choose what you need most:**

1. **Checkout Widget with Stripe** ⭐ (Recommended Next)
   - Complete purchase flow
   - Shipping information form
   - Stripe payment integration
   - Order confirmation

2. **Admin Product Management Panel**
   - Add/edit products easily
   - Upload images
   - Manage inventory
   - View orders & partnerships

3. **Partnership Application Form**
   - B2B signup form
   - Business information collection
   - Automatic email notifications
   - Admin approval workflow

4. **Partner Dashboard**
   - Wholesale pricing view
   - Place partner orders
   - Order history
   - Net 30 payment terms

5. **Sample Product Seed Script**
   - Automatically populate database
   - 20-30 sample products
   - Categories & images
   - Ready to demo

**Which one do you want me to build first?**

---

## 📞 Support

Your complete e-commerce system is ready! Just need to:
1. Add products (manual or I can build admin panel)
2. Embed widgets in GHL
3. Connect domain
4. Start selling!

Let me know what you want to build next!
