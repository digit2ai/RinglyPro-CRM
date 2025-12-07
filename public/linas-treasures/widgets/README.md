# Lina's Treasures - Embeddable Widgets for GoHighLevel

## 🎯 Overview

These are standalone, embeddable widgets that you can integrate into your GoHighLevel (GHL) website at **linastreasures.com**.

All widgets are self-contained HTML files that connect to your backend API and work independently.

## 📦 Available Widgets

### 1. Product Catalog Widget
**File:** `product-catalog.html`

**Features:**
- Browse all products
- Search functionality
- Category filtering
- Sort by price/name/newest
- Add to cart
- Pagination
- Stock status display
- Responsive design

**How to Embed in GHL:**
```html
<iframe src="https://yourdomain.com/linas-treasures/widgets/product-catalog.html"
        width="100%"
        height="1200px"
        frameborder="0"
        style="border: none;">
</iframe>
```

**Direct Link:**
```
https://yourdomain.com/linas-treasures/widgets/product-catalog.html
```

---

### 2. Shopping Cart Widget
**File:** `shopping-cart.html`

**Features:**
- View cart items
- Update quantities
- Remove items
- See subtotal, tax, shipping
- Proceed to checkout
- Empty cart state
- Real-time updates

**How to Embed in GHL:**
```html
<iframe src="https://yourdomain.com/linas-treasures/widgets/shopping-cart.html"
        width="100%"
        height="800px"
        frameborder="0"
        style="border: none;">
</iframe>
```

**Direct Link:**
```
https://yourdomain.com/linas-treasures/widgets/shopping-cart.html
```

---

## 🔗 Integration Methods

### Method 1: iFrame Embed (Recommended for GHL)

Add this to your GHL custom code section:

```html
<!-- Product Catalog on Shop Page -->
<iframe
  id="product-catalog"
  src="https://yourdomain.com/linas-treasures/widgets/product-catalog.html"
  width="100%"
  height="1200px"
  frameborder="0"
  scrolling="auto"
  style="border: none; display: block;">
</iframe>

<!-- Shopping Cart on Cart Page -->
<iframe
  id="shopping-cart"
  src="https://yourdomain.com/linas-treasures/widgets/shopping-cart.html"
  width="100%"
  height="800px"
  frameborder="0"
  style="border: none; display: block;">
</iframe>
```

### Method 2: Direct Link

Create buttons/links in GHL that open the widgets in a new tab or full page:

```html
<a href="https://yourdomain.com/linas-treasures/widgets/product-catalog.html"
   class="btn">
  Shop Now
</a>
```

### Method 3: Pop-up/Modal

Use GHL's modal/popup feature with these URLs as the content source.

---

## 🛠️ Setup Instructions

### Step 1: Update Domain References

Before deploying, you need to update the domain in your server configuration.

The widgets currently use:
```javascript
const API_URL = window.location.origin + '/api/linas-treasures';
```

This means:
- If widgets are at `https://linastreasures.com/widgets/...`
- API calls will go to `https://linastreasures.com/api/linas-treasures/...`

**Make sure your domain points to your RinglyPro server!**

### Step 2: Deploy Widgets

These widgets are already at:
```
/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/public/linas-treasures/widgets/
```

They're served automatically by your Express server at:
```
https://yourdomain.com/linas-treasures/widgets/product-catalog.html
https://yourdomain.com/linas-treasures/widgets/shopping-cart.html
```

### Step 3: Test Locally First

1. Start your server:
```bash
npm start
```

2. Open in browser:
```
http://localhost:3000/linas-treasures/widgets/product-catalog.html
http://localhost:3000/linas-treasures/widgets/shopping-cart.html
```

### Step 4: Embed in GHL

1. Go to your GHL site editor
2. Add a "Custom HTML" element
3. Paste the iframe code
4. Adjust height as needed
5. Save and publish

---

## 🎨 Customization

### Changing Colors

The gold theme color is `#d4af37`. To change it, search and replace in the HTML files:

```css
/* Find: */
#d4af37

/* Replace with your color, e.g.: */
#YOUR_HEX_COLOR
```

### Adjusting Layout

Each widget has inline CSS that you can modify:
- Grid columns: `grid-template-columns`
- Spacing: `gap`, `padding`, `margin`
- Sizes: `width`, `height`, `font-size`

---

## 💬 Communication Between Widgets

The widgets use `postMessage` to communicate with the parent window (your GHL page).

### Events Sent by Widgets:

```javascript
// When item added to cart
{
  type: 'CART_UPDATED',
  action: 'added',
  productId: 123
}

// When proceeding to checkout
{
  type: 'PROCEED_TO_CHECKOUT',
  sessionId: 'session_123',
  cartData: {...}
}
```

### Listening in GHL:

Add this to your GHL page to listen for events:

```html
<script>
window.addEventListener('message', function(event) {
  if (event.data.type === 'CART_UPDATED') {
    // Update cart count badge
    console.log('Cart updated!', event.data);
  }

  if (event.data.type === 'PROCEED_TO_CHECKOUT') {
    // Redirect to checkout page
    window.location.href = '/checkout';
  }
});
</script>
```

---

## 🔒 Session Management

The widgets use localStorage to maintain a shopping session:

```javascript
// Session ID stored as:
localStorage.getItem('lt_session_id')

// Format: session_timestamp_randomstring
// Example: session_1234567890_abc123xyz
```

This allows cart persistence across page refreshes and different widgets.

---

## 📱 Mobile Responsive

All widgets are mobile-responsive and will automatically adjust for:
- Desktop (1200px+)
- Tablet (768px - 1199px)
- Mobile (< 768px)

---

## 🚀 Going Live Checklist

- [ ] Server deployed and accessible at your domain
- [ ] DNS pointing linastreasures.com to your server
- [ ] SSL certificate installed (HTTPS)
- [ ] Test all widgets on your domain
- [ ] Add products to database (via admin panel)
- [ ] Test add to cart functionality
- [ ] Test checkout flow with Stripe
- [ ] Embed widgets in GHL pages
- [ ] Test on mobile devices
- [ ] Set up Stripe webhook for payment confirmations

---

## 🆘 Troubleshooting

### Products Don't Load
- Check if server is running
- Verify API endpoint is accessible
- Check browser console for errors
- Make sure products exist in database

### Cart Doesn't Work
- Check localStorage is enabled in browser
- Verify session ID is being created
- Check network tab for API call errors

### Styling Looks Off in GHL
- Adjust iframe height
- Check for CSS conflicts with GHL theme
- Try adding `!important` to widget styles if needed

---

## 📚 Next Steps

**Need more widgets?** I can create:
1. ✅ Product Catalog (Done)
2. ✅ Shopping Cart (Done)
3. ⏳ Checkout with Stripe
4. ⏳ Partnership Application Form
5. ⏳ Partner Login/Dashboard
6. ⏳ Admin Product Management Panel

Let me know which one you want next!
