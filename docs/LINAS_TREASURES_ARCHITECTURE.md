# Lina's Treasures - Technical Architecture

## Overview
Lina's Treasures is a B2B e-commerce platform integrated with RinglyPro CRM, enabling boutique retailers to browse products, place orders, and manage partnership agreements.

## Technology Stack
- **Backend**: Node.js + Express (existing RinglyPro backend)
- **Database**: PostgreSQL (existing RinglyPro database)
- **Payment Processing**: Stripe (shared with RinglyPro)
- **Frontend**: HTML/CSS/JavaScript (potentially React for dynamic features)
- **Digital Signatures**: DocuSign API or custom solution
- **Authentication**: JWT (existing RinglyPro auth system)

## Database Schema

### New Tables

#### 1. `lt_products` (Lina's Treasures Products)
```sql
CREATE TABLE lt_products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  subcategory VARCHAR(100),

  -- Pricing
  retail_price DECIMAL(10, 2) NOT NULL,
  wholesale_price DECIMAL(10, 2) NOT NULL,
  partner_tier_1_price DECIMAL(10, 2), -- Bronze partners
  partner_tier_2_price DECIMAL(10, 2), -- Silver partners
  partner_tier_3_price DECIMAL(10, 2), -- Gold partners

  -- Inventory
  stock_quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,

  -- Product details
  images JSONB, -- Array of image URLs
  specifications JSONB, -- Product specs (materials, dimensions, etc.)
  tags TEXT[], -- Searchable tags

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);
```

#### 2. `lt_partnerships` (Partnership Agreements)
```sql
CREATE TABLE lt_partnerships (
  id SERIAL PRIMARY KEY,

  -- Business Information
  business_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(100), -- boutique, spa, gift shop, etc.
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),

  -- Address
  address_line_1 VARCHAR(255),
  address_line_2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',

  -- Tax Information
  tax_id VARCHAR(50), -- EIN or SSN
  resale_certificate_number VARCHAR(100),
  resale_certificate_url TEXT, -- Uploaded document

  -- Partnership Details
  tier VARCHAR(20) DEFAULT 'bronze', -- bronze, silver, gold
  discount_percentage DECIMAL(5, 2),
  minimum_order_amount DECIMAL(10, 2),

  -- Agreement
  agreement_signed BOOLEAN DEFAULT false,
  agreement_signed_at TIMESTAMP,
  agreement_ip_address INET,
  agreement_document_url TEXT, -- Signed PDF
  docusign_envelope_id VARCHAR(255), -- If using DocuSign

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, suspended
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,

  -- Linked User Account
  user_id INTEGER REFERENCES users(id), -- Created after approval

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
```

#### 3. `lt_orders` (Customer & Partner Orders)
```sql
CREATE TABLE lt_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL, -- LT-2024-00001

  -- Customer Information
  customer_type VARCHAR(20) NOT NULL, -- 'retail' or 'partner'
  partnership_id INTEGER REFERENCES lt_partnerships(id), -- NULL for retail
  user_id INTEGER REFERENCES users(id), -- NULL for guest checkout

  -- Shipping Information
  ship_to_name VARCHAR(255) NOT NULL,
  ship_to_email VARCHAR(255) NOT NULL,
  ship_to_phone VARCHAR(50),
  ship_to_address_line_1 VARCHAR(255) NOT NULL,
  ship_to_address_line_2 VARCHAR(255),
  ship_to_city VARCHAR(100) NOT NULL,
  ship_to_state VARCHAR(50) NOT NULL,
  ship_to_zip VARCHAR(20) NOT NULL,
  ship_to_country VARCHAR(100) DEFAULT 'USA',

  -- Order Totals
  subtotal DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  shipping_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,

  -- Payment
  payment_status VARCHAR(50) DEFAULT 'pending', -- pending, paid, failed, refunded
  payment_method VARCHAR(50), -- card, wire_transfer, net_30
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  paid_at TIMESTAMP,

  -- Fulfillment
  fulfillment_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, shipped, delivered, cancelled
  tracking_number VARCHAR(100),
  shipping_carrier VARCHAR(100),
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,

  -- Notes
  customer_notes TEXT,
  internal_notes TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. `lt_order_items` (Order Line Items)
```sql
CREATE TABLE lt_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES lt_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES lt_products(id),

  -- Product snapshot (in case product changes)
  sku VARCHAR(50) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_description TEXT,

  -- Pricing
  unit_price DECIMAL(10, 2) NOT NULL, -- Price at time of purchase
  quantity INTEGER NOT NULL,
  line_total DECIMAL(10, 2) NOT NULL, -- unit_price * quantity

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 5. `lt_product_categories` (Product Categories)
```sql
CREATE TABLE lt_product_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_category_id INTEGER REFERENCES lt_product_categories(id),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 6. `lt_cart_items` (Shopping Cart)
```sql
CREATE TABLE lt_cart_items (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255), -- For guest users
  user_id INTEGER REFERENCES users(id), -- For logged-in users
  product_id INTEGER REFERENCES lt_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(session_id, product_id),
  UNIQUE(user_id, product_id)
);
```

#### 7. `lt_product_reviews` (Optional - Future)
```sql
CREATE TABLE lt_product_reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES lt_products(id) ON DELETE CASCADE,
  partnership_id INTEGER REFERENCES lt_partnerships(id),
  user_id INTEGER REFERENCES users(id),

  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(255),
  review_text TEXT,

  is_verified_purchase BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints Structure

### Public Endpoints (No Auth Required)
- `GET /api/linas-treasures/products` - List all products
- `GET /api/linas-treasures/products/:id` - Get product details
- `GET /api/linas-treasures/categories` - List categories
- `POST /api/linas-treasures/partnership/apply` - Submit partnership application
- `POST /api/linas-treasures/cart` - Add to cart (session-based)
- `GET /api/linas-treasures/cart/:sessionId` - Get cart

### Partner Endpoints (Auth Required - Partner Role)
- `GET /api/linas-treasures/partner/dashboard` - Partner dashboard data
- `GET /api/linas-treasures/partner/products` - Products with partner pricing
- `POST /api/linas-treasures/partner/orders` - Create partner order
- `GET /api/linas-treasures/partner/orders` - List partner orders
- `GET /api/linas-treasures/partner/orders/:id` - Get order details

### Admin Endpoints (Auth Required - Admin Role)
- `POST /api/linas-treasures/admin/products` - Create product
- `PUT /api/linas-treasures/admin/products/:id` - Update product
- `DELETE /api/linas-treasures/admin/products/:id` - Delete product
- `GET /api/linas-treasures/admin/partnerships` - List all partnerships
- `PUT /api/linas-treasures/admin/partnerships/:id/approve` - Approve partnership
- `PUT /api/linas-treasures/admin/partnerships/:id/reject` - Reject partnership
- `GET /api/linas-treasures/admin/orders` - List all orders
- `PUT /api/linas-treasures/admin/orders/:id/fulfill` - Update fulfillment

### Stripe Integration
- `POST /api/linas-treasures/checkout/create-payment-intent` - Create Stripe payment
- `POST /api/linas-treasures/checkout/confirm` - Confirm order after payment
- `POST /api/linas-treasures/webhooks/stripe` - Stripe webhook handler

## Frontend Pages Structure

### Public Pages
1. **Home/Landing** - `/linas-treasures`
2. **Product Catalog** - `/linas-treasures/products`
3. **Product Detail** - `/linas-treasures/products/:id`
4. **Shopping Cart** - `/linas-treasures/cart`
5. **Checkout** - `/linas-treasures/checkout`
6. **Partnership Application** - `/linas-treasures/become-a-partner`
7. **About/Story** - `/linas-treasures/about`

### Partner Portal (Auth Required)
1. **Partner Dashboard** - `/linas-treasures/partner/dashboard`
2. **Partner Product Catalog** - `/linas-treasures/partner/products`
3. **Partner Order History** - `/linas-treasures/partner/orders`
4. **Partner Profile** - `/linas-treasures/partner/profile`

### Admin Portal (Admin Only)
1. **Admin Dashboard** - `/linas-treasures/admin/dashboard`
2. **Product Management** - `/linas-treasures/admin/products`
3. **Order Management** - `/linas-treasures/admin/orders`
4. **Partnership Management** - `/linas-treasures/admin/partnerships`
5. **Analytics** - `/linas-treasures/admin/analytics`

## Integration with RinglyPro

### Shared Resources
- **Users Table**: Extend existing users table with `is_lt_partner` flag
- **Stripe Account**: Use same Stripe account with product prefix 'LT-'
- **Authentication**: Reuse JWT auth middleware
- **Email Service**: Use same email service for order confirmations

### Separation of Concerns
- All Lina's Treasures routes prefixed with `/api/linas-treasures`
- Separate frontend folder: `/public/linas-treasures`
- Database tables prefixed with `lt_`

## Partnership Tiers

### Bronze (Entry Level)
- 20% off wholesale pricing
- Minimum order: $250
- Net 30 payment terms after 3 orders

### Silver (Established)
- 30% off wholesale pricing
- Minimum order: $500
- Net 30 payment terms
- Free shipping on orders over $1000

### Gold (Premium)
- 40% off wholesale pricing
- Minimum order: $1000
- Net 45 payment terms
- Free shipping on all orders
- Exclusive early access to new products
- Dedicated account manager

## Next Steps

1. Create database migrations
2. Build backend API routes
3. Integrate Stripe payments
4. Build frontend catalog and cart
5. Create partnership application form
6. Build partner dashboard
7. Create admin management panel
