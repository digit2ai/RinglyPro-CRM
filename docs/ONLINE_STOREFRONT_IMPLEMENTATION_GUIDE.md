# Online Storefront & Menu Module - Implementation Guide

## 🎯 Overview

The **Online Storefront & Menu Module** is a multi-tenant SaaS feature that allows RinglyPro clients to create embeddable online menus and storefronts powered by AI.

### Key Features
- **Multi-tenant architecture** - Each business gets `orders.ringlypro.com/{business_slug}`
- **AI-powered onboarding** - Scrape existing websites to extract branding and menu data
- **iframe embedding** - Clients paste one code snippet into their website
- **PixlyPro integration** - Automatic image enhancement for product photos
- **Fully customizable** - Adapt to each brand's colors and style

---

## 📁 Project Structure

```
ringlypro-crm/
├── migrations/
│   └── create-online-storefront-schema.sql  # Database schema
├── scripts/
│   └── run-storefront-migration.js          # Migration runner
├── src/
│   ├── routes/
│   │   └── storefront.js                    # API endpoints
│   ├── services/
│   │   ├── aiWebsiteScraper.js              # Website AI scraper
│   │   └── aiPhotoEnhancer.js               # PixlyPro integration
│   └── app.js                               # Main app (routes registered)
├── public/
│   └── storefront/                          # Frontend assets (to be created)
└── views/
    ├── storefront-public.ejs                # Public storefront page (to be created)
    └── storefront-admin.ejs                 # Admin management UI (to be created)
```

---

## 🗄️ Database Schema

### Tables Created

1. **`storefront_businesses`** - Main business storefronts
   - `business_slug` - URL identifier (unique)
   - `client_id` - Links to RinglyPro CRM clients
   - `original_website_url` - Source for AI scraping
   - Branding: logo, colors, fonts, brand_style
   - Contact info, hours, social media

2. **`storefront_categories`** - Menu sections
   - Links to storefront
   - Name, slug, description, icon, banner

3. **`storefront_items`** - Individual products/menu items
   - Links to category and storefront
   - Price, description, images, dietary tags
   - Variants/options support

4. **`storefront_ai_imports`** - AI scraping logs
   - Tracks website import jobs
   - Stores extracted and processed data

5. **`storefront_image_enhancements`** - PixlyPro processing
   - Tracks image enhancement jobs
   - Before/after URLs

6. **`storefront_analytics`** - Event tracking (future)

---

## 🚀 Deployment Steps

### Step 1: Run Database Migration

**Development:**
```bash
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM
node scripts/run-storefront-migration.js
```

**Production (Render):**
```bash
# Option 1: Create production migration script
node scripts/run-storefront-migration-prod.js

# Option 2: Direct psql
psql "postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require" -f migrations/create-online-storefront-schema.sql
```

### Step 2: Install Dependencies

```bash
npm install cheerio node-fetch
```

(OpenAI SDK already installed)

### Step 3: Configure Environment Variables

Add to `.env` (development) or Render dashboard (production):

```bash
# OpenAI API for AI scraping
OPENAI_API_KEY=sk-...

# Optional: Image enhancement APIs
REPLICATE_API_TOKEN=r8_...
STABILITY_API_KEY=sk-...
```

### Step 4: Deploy Backend

```bash
git add -A
git commit -m "Add Online Storefront & Menu module with AI scraping"
git push origin main
```

Render will automatically deploy (2-5 minutes).

### Step 5: Test API Endpoints

#### Create a storefront
```bash
POST https://aiagent.ringlypro.com/api/storefront/create
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "businessName": "Joe's Pizza",
  "businessSlug": "joes-pizza",
  "businessType": "restaurant",
  "websiteUrl": "https://joespizza.com",
  "clientId": 123
}
```

Response:
```json
{
  "success": true,
  "storefrontId": 1,
  "businessSlug": "joes-pizza",
  "embedCode": "<iframe src=\"https://orders.ringlypro.com/joes-pizza\" ... />",
  "publicUrl": "https://orders.ringlypro.com/joes-pizza",
  "message": "Storefront created. Website import started in background."
}
```

#### Get storefront details
```bash
GET https://aiagent.ringlypro.com/api/storefront/:storefrontId
Authorization: Bearer <JWT_TOKEN>
```

#### Get public storefront (no auth)
```bash
GET https://aiagent.ringlypro.com/api/storefront/public/joes-pizza
```

---

## 🤖 AI Website Scraper

### How It Works

1. **Fetch HTML** - Downloads website with user-agent
2. **Extract Data** - Uses Cheerio to parse:
   - Logo, favicon
   - Colors from CSS
   - Headings, paragraphs, lists
   - Images
   - Structured JSON-LD data
3. **AI Processing** - GPT-4 Turbo analyzes content:
   - Extracts menu items and categories
   - Detects brand style (modern, rustic, etc.)
   - Generates clean descriptions
   - Maps to normalized data model
4. **Store Results** - Saves to database with confidence scores

### Example AI Output

```json
{
  "businessInfo": {
    "name": "Joe's Pizza",
    "tagline": "Authentic NY-Style Pizza Since 1995",
    "description": "Family-owned pizzeria serving the best slices in Brooklyn",
    "brandStyle": "rustic"
  },
  "colors": {
    "primary": "#c92a2a",
    "secondary": "#ffd43b",
    "accent": "#2f9e44"
  },
  "categories": [
    {
      "name": "Classic Pizzas",
      "slug": "classic-pizzas",
      "description": "Traditional favorites",
      "items": [
        {
          "name": "Margherita",
          "description": "Fresh mozzarella, basil, tomato sauce",
          "price": 14.99,
          "image": "https://joespizza.com/images/margherita.jpg"
        }
      ]
    }
  ]
}
```

---

## 🎨 PixlyPro Integration

### Image Enhancement Flow

1. **Original image detected** during import
2. **Create enhancement job** in `storefront_image_enhancements`
3. **Call PixlyPro API** (via `aiPhotoEnhancer.js`)
   - Uses Real-ESRGAN for upscaling
   - Face enhancement enabled
4. **Poll for completion** (up to 2 minutes)
5. **Update item** with `enhanced_url`

### Manual Enhancement

Admin can trigger enhancement from UI:
```bash
POST /api/storefront/:storefrontId/item/:itemId/enhance-image
```

---

## 🌐 Frontend Implementation (TODO)

### Public Storefront Page

Create: `views/storefront-public.ejs`

Features needed:
- Hero section with business logo and tagline
- Category navigation (tabs or sidebar)
- Item grid/list with images, names, prices
- Item detail modal
- Basic cart UI (for future ordering)
- Responsive design (mobile-first)
- Dynamic theming based on brand colors

### Admin Management UI

Create: `views/storefront-admin.ejs`

Features needed:
- List all storefronts
- Create new storefront (with website URL input)
- View import status (pending/processing/completed)
- Edit storefront settings:
  - Business info
  - Colors and branding
  - Logo upload
- Manage categories:
  - Add/edit/delete categories
  - Reorder categories
- Manage items:
  - Add/edit/delete items
  - Upload/enhance images
  - Set prices and availability
- **iframe embed code** display with copy button
- Preview storefront button

---

## 🔗 iframe Embedding

### Generated Code

```html
<!-- RinglyPro Storefront Embed -->
<iframe
  src="https://orders.ringlypro.com/joes-pizza"
  style="width: 100%; min-height: 900px; border: none;"
  loading="lazy"
  title="joes-pizza Online Menu"
></iframe>
```

### Client Implementation

Clients paste this code into:
- WordPress (Custom HTML block)
- Wix (Embed code widget)
- Squarespace (Code block)
- GoHighLevel (Custom code element)
- Any HTML page

---

## 📊 API Endpoints Reference

### Admin Endpoints (Require JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/storefront/create` | Create new storefront |
| `GET` | `/api/storefront/list` | List all storefronts |
| `GET` | `/api/storefront/:id` | Get storefront details |
| `PUT` | `/api/storefront/:id` | Update storefront settings |
| `POST` | `/api/storefront/:id/import` | Trigger website re-import |

### Public Endpoints (No auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/storefront/public/:slug` | Get public storefront data |

---

## 🧪 Testing Workflow

### 1. Create Test Storefront

```bash
# As admin user (mstagg@digit2ai.com)
curl -X POST https://aiagent.ringlypro.com/api/storefront/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Cafe",
    "businessSlug": "test-cafe",
    "businessType": "cafe",
    "websiteUrl": "https://example-cafe.com"
  }'
```

### 2. Check Import Status

```bash
curl https://aiagent.ringlypro.com/api/storefront/1 \
  -H "Authorization: Bearer $TOKEN"
```

Look for `website_import_status`: `"completed"`

### 3. View Public Storefront

```bash
curl https://aiagent.ringlypro.com/api/storefront/public/test-cafe
```

Should return storefront data with categories and items.

### 4. Test iframe Embed

Create a test HTML file:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test Embed</title>
</head>
<body>
  <h1>Test Storefront Embed</h1>
  <iframe
    src="https://orders.ringlypro.com/test-cafe"
    style="width: 100%; min-height: 900px; border: none;"
    loading="lazy"
  ></iframe>
</body>
</html>
```

---

## 🔧 Troubleshooting

### Import Failed

Check `storefront_ai_imports` table:
```sql
SELECT * FROM storefront_ai_imports WHERE status = 'failed';
```

Common issues:
- Website blocks scraping (403/401)
- Invalid HTML structure
- AI processing timeout

**Solution:** Manually add menu items via admin UI

### Missing Images

Check `storefront_image_enhancements`:
```sql
SELECT * FROM storefront_image_enhancements WHERE pixlypro_status = 'failed';
```

**Solution:** Re-trigger enhancement or upload manually

### Slug Conflict

Error: "Business slug already exists"

**Solution:** Choose a different slug (e.g., `joes-pizza-brooklyn`)

---

## 🎯 Next Steps (Post-MVP)

1. **Full Ordering System**
   - Shopping cart persistence
   - Stripe checkout integration
   - Order management dashboard

2. **Delivery Integration**
   - DoorDash/UberEats API
   - Custom delivery zones
   - Delivery fee calculator

3. **Advanced Features**
   - Real-time inventory tracking
   - Time-based menu availability
   - Coupons and promotions
   - Customer accounts and order history

4. **Analytics**
   - View tracking
   - Popular items report
   - Conversion funnel

5. **Multi-language Support**
   - Auto-translate menus
   - Language switcher in UI

---

## 📞 Support

**Documentation:**
- This guide
- Database schema: `migrations/create-online-storefront-schema.sql`
- API routes: `src/routes/storefront.js`
- AI scraper: `src/services/aiWebsiteScraper.js`

**Questions?**
- Check server logs for errors
- Review `storefront_ai_imports` table for import details
- Test API endpoints with Postman/curl

---

## ✅ Summary

The Online Storefront module provides:
- ✅ Multi-tenant database schema
- ✅ AI-powered website scraping
- ✅ Backend API endpoints
- ✅ iframe embed code generation
- ✅ PixlyPro image enhancement integration
- ⏳ Frontend storefront page (pending)
- ⏳ Admin management UI (pending)

**MVP Status:** Backend complete, frontend in progress

**Deployment:** Ready for production use via API
