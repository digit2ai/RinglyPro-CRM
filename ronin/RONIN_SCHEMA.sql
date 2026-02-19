-- ============================================================================
-- RONIN BROTHERHOOD ECOSYSTEM - Database Schema
-- Martial Arts Federation | Online Store | RPDTA Training | Membership
-- ============================================================================
-- Tables are auto-created by Sequelize sync on first startup.
-- This file is for reference and manual migration if needed.
-- ============================================================================

-- Members / Black Belt Registry
CREATE TABLE IF NOT EXISTS ronin_members (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  country VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(100),
  rank VARCHAR(50),
  dan_level INTEGER DEFAULT 1,
  title VARCHAR(20) DEFAULT 'Student',
  group_affiliation JSONB DEFAULT '[]',
  dojo_name VARCHAR(255),
  dojo_address TEXT,
  instructor_name VARCHAR(255),
  years_training INTEGER,
  styles JSONB DEFAULT '[]',
  membership_tier VARCHAR(20) DEFAULT 'basic',
  membership_status VARCHAR(20) DEFAULT 'pending',
  membership_expires_at TIMESTAMP,
  is_law_enforcement BOOLEAN DEFAULT FALSE,
  agency VARCHAR(255),
  badge_number VARCHAR(100),
  clearance_level VARCHAR(50),
  bio TEXT,
  profile_image VARCHAR(500),
  achievements JSONB DEFAULT '[]',
  email_subscribed BOOLEAN DEFAULT TRUE,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Products (Online Store)
CREATE TABLE IF NOT EXISTS ronin_products (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  short_description VARCHAR(500),
  price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2),
  cost_price DECIMAL(10,2),
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  tags JSONB DEFAULT '[]',
  images JSONB DEFAULT '[]',
  sku VARCHAR(100),
  inventory_quantity INTEGER DEFAULT 0,
  track_inventory BOOLEAN DEFAULT TRUE,
  allow_backorder BOOLEAN DEFAULT FALSE,
  weight DECIMAL(8,2),
  has_variants BOOLEAN DEFAULT FALSE,
  variant_options JSONB DEFAULT '[]',
  featured BOOLEAN DEFAULT FALSE,
  member_only BOOLEAN DEFAULT FALSE,
  group_exclusive VARCHAR(100),
  status VARCHAR(20) DEFAULT 'draft',
  sort_order INTEGER DEFAULT 0,
  total_sold INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

-- Product Variants
CREATE TABLE IF NOT EXISTS ronin_product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES ronin_products(id),
  tenant_id INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  price DECIMAL(10,2),
  inventory_quantity INTEGER DEFAULT 0,
  options JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS ronin_orders (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  member_id INTEGER REFERENCES ronin_members(id),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'pending',
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  shipping_address JSONB,
  shipping_method VARCHAR(100),
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tracking_number VARCHAR(255),
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(50),
  payment_status VARCHAR(20) DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order Items
CREATE TABLE IF NOT EXISTS ronin_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES ronin_orders(id),
  product_id INTEGER NOT NULL REFERENCES ronin_products(id),
  variant_id INTEGER REFERENCES ronin_product_variants(id),
  tenant_id INTEGER NOT NULL DEFAULT 1,
  product_name VARCHAR(255) NOT NULL,
  variant_name VARCHAR(255),
  sku VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cart Items
CREATE TABLE IF NOT EXISTS ronin_cart_items (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  member_id INTEGER REFERENCES ronin_members(id),
  session_id VARCHAR(255),
  product_id INTEGER NOT NULL REFERENCES ronin_products(id),
  variant_id INTEGER REFERENCES ronin_product_variants(id),
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Training Courses (RPDTA + General)
CREATE TABLE IF NOT EXISTS ronin_training_courses (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  short_description VARCHAR(500),
  category VARCHAR(100) NOT NULL,
  "group" VARCHAR(100),
  duration_hours INTEGER DEFAULT 40,
  price DECIMAL(10,2) DEFAULT 0,
  max_enrollment INTEGER,
  current_enrollment INTEGER DEFAULT 0,
  prerequisites JSONB DEFAULT '[]',
  requires_clearance BOOLEAN DEFAULT FALSE,
  certification_awarded VARCHAR(255),
  syllabus JSONB DEFAULT '[]',
  schedule JSONB,
  location VARCHAR(255),
  instructor_name VARCHAR(255),
  images JSONB DEFAULT '[]',
  featured BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'upcoming',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enrollments
CREATE TABLE IF NOT EXISTS ronin_enrollments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  member_id INTEGER NOT NULL REFERENCES ronin_members(id),
  course_id INTEGER NOT NULL REFERENCES ronin_training_courses(id),
  status VARCHAR(20) DEFAULT 'enrolled',
  payment_status VARCHAR(20) DEFAULT 'pending',
  amount_paid DECIMAL(10,2) DEFAULT 0,
  completion_date TIMESTAMP,
  certificate_number VARCHAR(100),
  grade VARCHAR(10),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(member_id, course_id)
);

-- Events (Championships, Seminars, etc.)
CREATE TABLE IF NOT EXISTS ronin_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  event_type VARCHAR(30) DEFAULT 'seminar',
  "group" VARCHAR(100),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  location VARCHAR(255),
  address TEXT,
  country VARCHAR(100),
  max_attendees INTEGER,
  current_attendees INTEGER DEFAULT 0,
  registration_fee DECIMAL(10,2) DEFAULT 0,
  member_discount_pct INTEGER DEFAULT 0,
  images JSONB DEFAULT '[]',
  featured BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'upcoming',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sponsors
CREATE TABLE IF NOT EXISTS ronin_sponsors (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  website VARCHAR(500),
  logo_url VARCHAR(500),
  tier VARCHAR(20) DEFAULT 'supporter',
  sponsorship_amount DECIMAL(12,2) DEFAULT 0,
  sponsorship_type VARCHAR(100),
  benefits JSONB DEFAULT '[]',
  contract_start TIMESTAMP,
  contract_end TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Groups (The 5 Organizations)
CREATE TABLE IF NOT EXISTS ronin_groups (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(500),
  description TEXT,
  mission TEXT,
  founded_year INTEGER,
  focus VARCHAR(255),
  requirements JSONB DEFAULT '[]',
  leadership JSONB DEFAULT '[]',
  countries_active INTEGER DEFAULT 0,
  member_count INTEGER DEFAULT 0,
  logo_url VARCHAR(500),
  images JSONB DEFAULT '[]',
  website_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- Press Releases / News
CREATE TABLE IF NOT EXISTS ronin_press_releases (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  excerpt VARCHAR(500),
  category VARCHAR(100),
  author VARCHAR(255),
  featured_image VARCHAR(500),
  images JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  featured BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'draft',
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ronin_members_tenant ON ronin_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ronin_members_email ON ronin_members(email);
CREATE INDEX IF NOT EXISTS idx_ronin_products_tenant ON ronin_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ronin_products_category ON ronin_products(category);
CREATE INDEX IF NOT EXISTS idx_ronin_orders_tenant ON ronin_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ronin_orders_member ON ronin_orders(member_id);
CREATE INDEX IF NOT EXISTS idx_ronin_training_group ON ronin_training_courses("group");
CREATE INDEX IF NOT EXISTS idx_ronin_events_date ON ronin_events(start_date);
CREATE INDEX IF NOT EXISTS idx_ronin_sponsors_tier ON ronin_sponsors(tier);
CREATE INDEX IF NOT EXISTS idx_ronin_groups_code ON ronin_groups(code);
CREATE INDEX IF NOT EXISTS idx_ronin_press_status ON ronin_press_releases(status);
