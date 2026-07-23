-- Lawn Co-Pilot — canonical schema
-- The AI office for landscaping companies. Multi-tenant throughout (tenant_id).
--
-- Tables auto-create on boot via sync({alter:false}) in src/index.js. This file
-- is the checked-in record for provisioning a fresh database directly.
--
-- Card data NEVER lands here: lc_payment_methods holds Stripe ids plus
-- brand/last4/expiry only. No PAN, no CVV.
--
-- Generated 2026-07-23 from the live schema.

CREATE TABLE IF NOT EXISTS lc_addon_services (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(255),
  price_cents INTEGER DEFAULT 0,
  price_per_sqft DOUBLE PRECISION,
  description TEXT,
  active BOOLEAN DEFAULT true,
  coming_soon BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_addon_services_tenant_id ON public.lc_addon_services USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_agent_approvals (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  session_id VARCHAR(255),
  employee VARCHAR(255),
  tool VARCHAR(255),
  arguments JSONB DEFAULT '{}'::jsonb,
  reason VARCHAR(255),
  status VARCHAR(255) DEFAULT 'pending'::character varying,
  decided_by INTEGER,
  decided_at TIMESTAMPTZ,
  result JSONB,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_agent_approvals_tenant_id ON public.lc_agent_approvals USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_agent_calls (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  session_id VARCHAR(255),
  employee VARCHAR(255),
  tool VARCHAR(255),
  channel VARCHAR(255),
  actor VARCHAR(255),
  arguments JSONB DEFAULT '{}'::jsonb,
  success BOOLEAN DEFAULT true,
  error TEXT,
  requires_approval BOOLEAN DEFAULT false,
  latency_ms INTEGER,
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_agent_calls_created_at ON public.lc_agent_calls USING btree (created_at);
CREATE INDEX IF NOT EXISTS lc_agent_calls_employee ON public.lc_agent_calls USING btree (employee);
CREATE INDEX IF NOT EXISTS lc_agent_calls_tenant_id ON public.lc_agent_calls USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_agent_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  channel VARCHAR(255),
  employee VARCHAR(255),
  lead_id INTEGER,
  customer_id INTEGER,
  identity JSONB DEFAULT '{}'::jsonb,
  identity_verified BOOLEAN DEFAULT false,
  transcript JSONB DEFAULT '[]'::jsonb,
  outcome VARCHAR(255),
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_agent_sessions_session_id ON public.lc_agent_sessions USING btree (session_id);
CREATE INDEX IF NOT EXISTS lc_agent_sessions_tenant_id ON public.lc_agent_sessions USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_appointments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER,
  property_id INTEGER,
  subscription_id INTEGER,
  crew_id INTEGER,
  service_date DATE NOT NULL,
  window_start VARCHAR(255) DEFAULT '08:00'::character varying,
  window_end VARCHAR(255) DEFAULT '12:00'::character varying,
  route_order INTEGER,
  status VARCHAR(255) DEFAULT 'scheduled'::character varying,
  service_type VARCHAR(255) DEFAULT 'mowing'::character varying,
  addons JSONB DEFAULT '[]'::jsonb,
  price_cents INTEGER,
  notes TEXT,
  tracking JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_appointments_customer_id ON public.lc_appointments USING btree (customer_id);
CREATE INDEX IF NOT EXISTS lc_appointments_service_date ON public.lc_appointments USING btree (service_date);
CREATE INDEX IF NOT EXISTS lc_appointments_tenant_id ON public.lc_appointments USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_audit_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER,
  actor VARCHAR(255),
  action VARCHAR(255),
  entity VARCHAR(255),
  entity_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_audit_log_tenant_id ON public.lc_audit_log USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_autopay_enrollments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  payment_method_id INTEGER,
  status VARCHAR(255) DEFAULT 'active'::character varying,
  terms_accepted_at TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_autopay_enrollments_tenant_id ON public.lc_autopay_enrollments USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_call_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  call_sid VARCHAR(255),
  from_number VARCHAR(255),
  to_number VARCHAR(255),
  customer_id INTEGER,
  intent VARCHAR(255),
  outcome VARCHAR(255),
  summary TEXT,
  transferred BOOLEAN DEFAULT false,
  duration_seconds INTEGER,
  session_id VARCHAR(255),
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_call_logs_tenant_id ON public.lc_call_logs USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_crews (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  lead_name VARCHAR(255),
  phone VARCHAR(255),
  capacity_per_day INTEGER DEFAULT 12,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_crews_tenant_id ON public.lc_crews USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_customers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(255),
  password_hash VARCHAR(255),
  status VARCHAR(255) DEFAULT 'active'::character varying,
  stripe_customer_id VARCHAR(255),
  balance_cents INTEGER DEFAULT 0,
  autopay_enabled BOOLEAN DEFAULT false,
  consent JSONB DEFAULT '{"sms_marketing": false, "email_marketing": false, "sms_transactional": true}'::jsonb,
  referral_code VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_customers_email ON public.lc_customers USING btree (email);
CREATE INDEX IF NOT EXISTS lc_customers_phone ON public.lc_customers USING btree (phone);
CREATE INDEX IF NOT EXISTS lc_customers_tenant_id ON public.lc_customers USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_invoice_line_items (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  label VARCHAR(255),
  detail TEXT,
  amount_cents INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lc_invoice_line_items_tenant_id ON public.lc_invoice_line_items USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_invoices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  service_record_id INTEGER,
  number VARCHAR(255),
  status VARCHAR(255) DEFAULT 'open'::character varying,
  subtotal_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  amount_paid_cents INTEGER DEFAULT 0,
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  stripe_invoice_id VARCHAR(255),
  dunning_stage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_invoices_tenant_id ON public.lc_invoices USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_leads (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  address TEXT,
  source VARCHAR(255) DEFAULT 'web_orb'::character varying,
  channel_detail VARCHAR(255),
  stage VARCHAR(255) DEFAULT 'new'::character varying,
  customer_id INTEGER,
  quote_id INTEGER,
  session_id VARCHAR(255),
  consent JSONB DEFAULT '{}'::jsonb,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_leads_session_id ON public.lc_leads USING btree (session_id);
CREATE INDEX IF NOT EXISTS lc_leads_stage ON public.lc_leads USING btree (stage);
CREATE INDEX IF NOT EXISTS lc_leads_tenant_id ON public.lc_leads USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_measurement_overrides (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  measurement_id INTEGER,
  user_id INTEGER,
  old_sqft INTEGER,
  new_sqft INTEGER,
  reason TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_measurement_overrides_tenant_id ON public.lc_measurement_overrides USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_measurements (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  property_id INTEGER,
  normalized_address TEXT,
  provider VARCHAR(255),
  lot_sqft INTEGER,
  building_footprint_sqft INTEGER,
  excluded_sqft INTEGER,
  excluded_breakdown JSONB DEFAULT '[]'::jsonb,
  serviceable_sqft INTEGER,
  confidence VARCHAR(255) DEFAULT 'low'::character varying,
  is_estimate BOOLEAN DEFAULT true,
  needs_review BOOLEAN DEFAULT false,
  sources JSONB DEFAULT '[]'::jsonb,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_measurements_normalized_address ON public.lc_measurements USING btree (normalized_address);
CREATE INDEX IF NOT EXISTS lc_measurements_tenant_id ON public.lc_measurements USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_messages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER,
  ticket_id INTEGER,
  direction VARCHAR(255) DEFAULT 'inbound'::character varying,
  author VARCHAR(255),
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_messages_tenant_id ON public.lc_messages USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_notifications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER,
  channel VARCHAR(255),
  template VARCHAR(255),
  to_address VARCHAR(255),
  subject VARCHAR(255),
  body TEXT,
  status VARCHAR(255) DEFAULT 'queued'::character varying,
  provider_id VARCHAR(255),
  reason VARCHAR(255),
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_notifications_tenant_id ON public.lc_notifications USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_payment_methods (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  stripe_payment_method_id VARCHAR(255),
  brand VARCHAR(255),
  last4 VARCHAR(255),
  exp_month INTEGER,
  exp_year INTEGER,
  type VARCHAR(255) DEFAULT 'card'::character varying,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_payment_methods_tenant_id ON public.lc_payment_methods USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_payments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER,
  invoice_id INTEGER,
  amount_cents INTEGER,
  status VARCHAR(255) DEFAULT 'pending'::character varying,
  method VARCHAR(255),
  failure_reason VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  stripe_event_id VARCHAR(255),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_payments_stripe_event_id ON public.lc_payments USING btree (stripe_event_id);
CREATE INDEX IF NOT EXISTS lc_payments_tenant_id ON public.lc_payments USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_pricing_rules (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255),
  scope JSONB DEFAULT '{}'::jsonb,
  rule_type VARCHAR(255) NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  priority INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  active_from TIMESTAMPTZ,
  active_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_pricing_rules_tenant_id ON public.lc_pricing_rules USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_properties (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER,
  address_raw TEXT,
  address TEXT,
  city VARCHAR(255),
  county VARCHAR(255),
  state VARCHAR(255) DEFAULT 'FL'::character varying,
  zip VARCHAR(255),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  parcel_id VARCHAR(255),
  property_type VARCHAR(255) DEFAULT 'residential'::character varying,
  lot_sqft INTEGER,
  building_footprint_sqft INTEGER,
  excluded_sqft INTEGER,
  serviceable_sqft INTEGER,
  approved_sqft INTEGER,
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  confidence VARCHAR(255) DEFAULT 'low'::character varying,
  is_estimate BOOLEAN DEFAULT true,
  needs_review BOOLEAN DEFAULT false,
  imagery_url TEXT,
  special_instructions TEXT,
  access_instructions TEXT,
  gate_code_enc TEXT,
  hazards TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_properties_customer_id ON public.lc_properties USING btree (customer_id);
CREATE INDEX IF NOT EXISTS lc_properties_tenant_id ON public.lc_properties USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_property_geometry (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  parcel_geojson JSONB,
  building_geojson JSONB,
  excluded_geojson JSONB DEFAULT '[]'::jsonb,
  lawn_geojson JSONB,
  bbox JSONB,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_property_geometry_property_id ON public.lc_property_geometry USING btree (property_id);
CREATE INDEX IF NOT EXISTS lc_property_geometry_tenant_id ON public.lc_property_geometry USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_quote_line_items (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  quote_id INTEGER NOT NULL,
  kind VARCHAR(255),
  label VARCHAR(255),
  detail TEXT,
  amount_cents INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lc_quote_line_items_tenant_id ON public.lc_quote_line_items USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_quotes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  lead_id INTEGER,
  customer_id INTEGER,
  property_id INTEGER,
  measurement_id INTEGER,
  token VARCHAR(255),
  frequency VARCHAR(255),
  serviceable_sqft INTEGER,
  subtotal_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  options JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(255) DEFAULT 'issued'::character varying,
  is_estimate BOOLEAN DEFAULT true,
  confidence VARCHAR(255) DEFAULT 'low'::character varying,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_quotes_tenant_id ON public.lc_quotes USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS lc_quotes_token ON public.lc_quotes USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS lc_quotes_token_key ON public.lc_quotes USING btree (token);

CREATE TABLE IF NOT EXISTS lc_service_photos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  service_record_id INTEGER,
  property_id INTEGER,
  kind VARCHAR(255) DEFAULT 'after'::character varying,
  url TEXT,
  caption VARCHAR(255),
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_service_photos_tenant_id ON public.lc_service_photos USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_service_plans (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  frequency VARCHAR(255) NOT NULL,
  description TEXT,
  included_services JSONB DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_service_plans_tenant_id ON public.lc_service_plans USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_service_records (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  appointment_id INTEGER,
  customer_id INTEGER,
  property_id INTEGER,
  crew_id INTEGER,
  service_date DATE,
  completed_at TIMESTAMPTZ,
  service_type VARCHAR(255),
  area_serviced_sqft INTEGER,
  completion_status VARCHAR(255) DEFAULT 'completed'::character varying,
  technician_notes TEXT,
  customer_instructions TEXT,
  weather VARCHAR(255),
  addons_performed JSONB DEFAULT '[]'::jsonb,
  charges_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_service_records_tenant_id ON public.lc_service_records USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_subscriptions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  property_id INTEGER,
  plan_id INTEGER,
  frequency VARCHAR(255),
  price_cents INTEGER,
  status VARCHAR(255) DEFAULT 'active'::character varying,
  next_service_date DATE,
  pause_until DATE,
  addons JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_subscriptions_tenant_id ON public.lc_subscriptions USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  phone VARCHAR(255),
  email VARCHAR(255),
  timezone VARCHAR(255) DEFAULT 'America/New_York'::character varying,
  state VARCHAR(255) DEFAULT 'FL'::character varying,
  business_hours JSONB DEFAULT '{"end": "17:00", "days": [1, 2, 3, 4, 5], "start": "08:00"}'::jsonb,
  brand JSONB DEFAULT '{}'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(255) DEFAULT 'active'::character varying,
  created_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS lc_tenants_slug_key ON public.lc_tenants USING btree (slug);

CREATE TABLE IF NOT EXISTS lc_tickets (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER,
  property_id INTEGER,
  type VARCHAR(255) DEFAULT 'support'::character varying,
  subject VARCHAR(255),
  body TEXT,
  status VARCHAR(255) DEFAULT 'open'::character varying,
  priority VARCHAR(255) DEFAULT 'normal'::character varying,
  assigned_to INTEGER,
  source VARCHAR(255) DEFAULT 'portal'::character varying,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_tickets_tenant_id ON public.lc_tickets USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(255) DEFAULT 'csr'::character varying,
  phone VARCHAR(255),
  status VARCHAR(255) DEFAULT 'active'::character varying,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_users_email ON public.lc_users USING btree (email);
CREATE INDEX IF NOT EXISTS lc_users_tenant_id ON public.lc_users USING btree (tenant_id);

