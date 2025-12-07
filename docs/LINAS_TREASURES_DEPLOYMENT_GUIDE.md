# Lina's Treasures - Deployment Guide

## Deploying Your Wholesale Marketplace to linastreasures.com

You have your domain in GoHighLevel. Here are your deployment options:

---

## Option 1: Deploy Full Platform (RECOMMENDED)

This deploys the entire Node.js application with backend, database, and all functionality.

### What You Need:
- A server/hosting provider (DigitalOcean, AWS, Render, etc.)
- Your domain: `linastreasures.com`
- This codebase

### Steps:

#### 1. Choose a Hosting Provider

**Recommended: Render.com (Easiest)**
- Free tier available
- Automatic deployments from GitHub
- Built-in PostgreSQL database
- SSL certificates included
- Go to: https://render.com

**Alternative: DigitalOcean**
- $6/month droplet
- Full server control
- More setup required
- Go to: https://digitalocean.com

#### 2. Deploy to Render.com (Step by Step)

1. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub

2. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select this repo: `RinglyPro-CRM`

3. **Configure Service**
   ```
   Name: linas-treasures
   Environment: Node
   Build Command: npm install
   Start Command: npm start
   ```

4. **Add Environment Variables**
   ```
   DATABASE_URL=<your-postgres-url>
   STRIPE_SECRET_KEY=<your-stripe-key>
   STRIPE_PUBLISHABLE_KEY=<your-stripe-publishable-key>
   JWT_SECRET=<random-secret-string>
   NODE_ENV=production
   PORT=3000
   ```

5. **Add PostgreSQL Database**
   - In Render dashboard, click "New +" → "PostgreSQL"
   - Name: `linas-treasures-db`
   - Copy the database URL
   - Add it to your web service environment variables

6. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy automatically
   - You'll get a URL like: `https://linas-treasures.onrender.com`

#### 3. Point Your Domain

**In GoHighLevel:**
1. Go to your domain settings
2. Find DNS/Custom Domain section
3. Add CNAME record:
   ```
   Type: CNAME
   Name: @ (or www)
   Value: linas-treasures.onrender.com
   ```

**In Render:**
1. Go to your web service settings
2. Click "Custom Domain"
3. Add: `linastreasures.com` and `www.linastreasures.com`
4. Render will provide DNS instructions
5. Add SSL certificate (automatic)

#### 4. Update Your URLs

After deployment, update these files to use your domain:

**File:** `public/linas-treasures/wholesale/js/catalog.js`
Change:
```javascript
const API_URL = window.location.origin + '/api/linas-treasures';
```
To:
```javascript
const API_URL = 'https://linastreasures.com/api/linas-treasures';
```

Same for:
- `js/product-detail.js`
- `js/cart-page.js`
- `js/checkout.js` (when created)

#### 5. Run Database Migrations

After deployment, run the migration to create tables:

```bash
# SSH into your server or use Render shell
node scripts/run-linas-treasures-migration.js
node scripts/seed-linas-treasures-products.js
```

---

## Option 2: Static Files in GHL (Limited Functionality)

If you only want to host the HTML pages in GHL without backend:

### What Works:
- Static HTML pages
- CSS styling
- Basic JavaScript

### What Doesn't Work:
- Product catalog (needs API)
- Shopping cart (needs database)
- Checkout (needs payment processing)
- User accounts (needs authentication)

### Steps:

1. **Export Static Files**
   Copy these folders:
   ```
   public/linas-treasures/wholesale/
   ├── index.html
   ├── catalog.html (won't work without API)
   ├── signup.html (form can submit to external API)
   ├── login.html (won't work without API)
   ├── css/
   └── js/
   ```

2. **Upload to GHL**
   - Go to GHL → Sites → Custom Code
   - Upload HTML files
   - Upload CSS/JS as assets

3. **Point API Calls to External Server**
   You'd still need Option 1's backend hosted somewhere, then update the API URLs in JavaScript files.

**Limitation:** This is NOT recommended because most features won't work.

---

## Option 3: Hybrid Approach (GHL Landing + External App)

Use GHL for marketing pages, external server for the app:

### Setup:
1. **In GHL (linastreasures.com):**
   - Homepage/About/Marketing pages
   - Contact forms
   - Lead capture

2. **On External Server (shop.linastreasures.com or app.linastreasures.com):**
   - Full wholesale marketplace
   - Product catalog
   - Shopping cart
   - Checkout
   - User accounts

### Steps:
1. Deploy full app to Render/DigitalOcean (Option 1)
2. Point subdomain to your server:
   ```
   shop.linastreasures.com → your-server-ip
   ```
3. Use GHL for main domain marketing
4. Link from GHL to shop subdomain for catalog

---

## Recommended Path: Full Platform on Render

**Why Render:**
- ✅ Free tier to start
- ✅ Automatic SSL certificates
- ✅ PostgreSQL database included
- ✅ Automatic deployments from GitHub
- ✅ Easy custom domain setup
- ✅ Scales as you grow
- ✅ No server management needed

**Cost:**
- Free tier: $0/month (with limitations)
- Starter tier: $7/month web service + $7/month database
- Total: $14/month for professional hosting

---

## Quick Start: Deploy in 30 Minutes

### 1. Push to GitHub (5 min)
```bash
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM
git add .
git commit -m "Lina's Treasures wholesale marketplace ready for deployment"
git push origin main
```

### 2. Create Render Account (2 min)
- Go to https://render.com
- Sign in with GitHub

### 3. Create PostgreSQL Database (3 min)
- New → PostgreSQL
- Name: `linas-treasures-db`
- Region: Choose closest to you
- Create Database
- Copy Internal Database URL

### 4. Create Web Service (5 min)
- New → Web Service
- Connect repository
- Configure:
  ```
  Name: linas-treasures
  Build Command: npm install
  Start Command: npm start
  ```
- Add environment variables (DATABASE_URL, etc.)
- Create Web Service

### 5. Run Migrations (5 min)
- Wait for deployment to complete
- Open Shell in Render dashboard
- Run:
  ```bash
  node scripts/run-linas-treasures-migration.js
  node scripts/seed-linas-treasures-products.js
  ```

### 6. Add Custom Domain (10 min)
- In Render: Settings → Custom Domain
- Add: `linastreasures.com`
- In GHL: Update DNS records as instructed
- Wait for SSL certificate (automatic)

### 7. Test Your Site
```
https://linastreasures.com/linas-treasures/wholesale/index.html
```

---

## Environment Variables You Need

```bash
# Database (from Render PostgreSQL)
DATABASE_URL=postgresql://user:pass@host/database

# Stripe Payment (get from https://stripe.com)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# JWT for authentication
JWT_SECRET=your-random-secret-string-here-make-it-long-and-random

# App settings
NODE_ENV=production
PORT=3000

# Email (optional - for order confirmations)
SENDGRID_API_KEY=your-sendgrid-key

# Twilio (optional - for SMS notifications)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
```

---

## Testing Locally First

Before deploying, test everything works locally:

```bash
# Start server
npm start

# Visit site
open http://localhost:3000/linas-treasures/wholesale/index.html

# Test features:
1. Browse products ✅
2. View product details ✅
3. Add to cart ✅
4. View cart ✅
5. Checkout (needs JavaScript)
6. Signup (needs JavaScript)
7. Login (needs JavaScript)
```

---

## Post-Deployment Checklist

After deployment:

- [ ] Database migrations run successfully
- [ ] Products seeded (12 sample products)
- [ ] SSL certificate active (https://)
- [ ] Homepage loads
- [ ] Catalog shows products
- [ ] Product details work
- [ ] Cart functionality works
- [ ] Checkout form displays
- [ ] Signup form displays
- [ ] Login form displays
- [ ] Custom domain points correctly
- [ ] Email notifications work (if configured)
- [ ] Payment processing works (Stripe configured)

---

## Troubleshooting

### Products Not Showing
```bash
# Check database connection
node -e "require('./src/models').sequelize.authenticate().then(() => console.log('DB OK')).catch(e => console.error('DB Error:', e))"

# Run migrations again
node scripts/run-linas-treasures-migration.js

# Seed products
node scripts/seed-linas-treasures-products.js
```

### API Errors
- Check environment variables are set
- Verify DATABASE_URL is correct
- Check server logs in Render dashboard

### Domain Not Working
- DNS can take 24-48 hours to propagate
- Verify CNAME record in GHL DNS settings
- Check custom domain settings in Render

---

## Support Resources

**Render Documentation:**
- https://render.com/docs

**Deploy from GitHub:**
- https://render.com/docs/deploy-node-express-app

**Custom Domains:**
- https://render.com/docs/custom-domains

**PostgreSQL:**
- https://render.com/docs/databases

---

## Cost Breakdown

### Render.com (Recommended)
- **Free Tier:** $0/month (750 hours, sleeps after inactivity)
- **Starter Plan:** $7/month web + $7/month database = **$14/month**
- **Pro Plan:** $25/month web + $20/month database = **$45/month**

### DigitalOcean
- **Basic Droplet:** $6/month
- **Managed Database:** $15/month
- **Total:** **$21/month**

### AWS
- **EC2 t2.micro:** Free tier 1 year, then ~$10/month
- **RDS PostgreSQL:** ~$15/month
- **Total:** **$25/month**

---

## Next Steps

1. **Choose hosting** (I recommend Render for ease)
2. **Create accounts** (Render + Stripe)
3. **Push code to GitHub**
4. **Deploy to Render**
5. **Run migrations**
6. **Point domain**
7. **Test everything**
8. **Launch!** 🚀

---

## Need Help?

If you need assistance with any step:
1. Share which hosting provider you chose
2. Let me know where you're stuck
3. I can provide specific commands/config

**Your wholesale marketplace is ready to go live!** 🎉
