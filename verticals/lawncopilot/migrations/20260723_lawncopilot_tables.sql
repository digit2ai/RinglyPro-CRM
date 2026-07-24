-- Lawn Co-Pilot — canonical schema
-- The AI office for landscaping companies. Multi-tenant throughout (tenant_id).
--
-- Tables auto-create on boot via sync({alter:false}) in src/index.js. This file
-- is the checked-in record for provisioning a fresh database directly.
--
-- Card data NEVER lands here: lc_payment_methods holds Stripe ids plus
-- brand/last4/expiry only. No PAN, no CVV.
--
-- Generated 2026-07-24 from the live schema.

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

CREATE TABLE IF NOT EXISTS lc_availability (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  employee_id INTEGER,
  kind VARCHAR(255) DEFAULT 'working_hours'::character varying,
  days JSONB DEFAULT '[1, 2, 3, 4, 5]'::jsonb,
  start_time VARCHAR(255) DEFAULT '07:00'::character varying,
  end_time VARCHAR(255) DEFAULT '16:00'::character varying,
  from_date DATE,
  to_date DATE,
  status VARCHAR(255) DEFAULT 'approved'::character varying,
  reason VARCHAR(255),
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_availability_tenant_id ON public.lc_availability USING btree (tenant_id);

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

CREATE TABLE IF NOT EXISTS lc_campaign_sends (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  campaign_id INTEGER,
  customer_id INTEGER,
  channel VARCHAR(255),
  to_address VARCHAR(255),
  consent_snapshot JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(255) DEFAULT 'queued'::character varying,
  reason VARCHAR(255),
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_campaign_sends_tenant_id ON public.lc_campaign_sends USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255),
  kind VARCHAR(255),
  channel VARCHAR(255) DEFAULT 'email'::character varying,
  subject VARCHAR(255),
  body TEXT,
  audience JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(255) DEFAULT 'draft'::character varying,
  scheduled_for TIMESTAMPTZ,
  recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  suppressed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_campaigns_tenant_id ON public.lc_campaigns USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_certifications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  employee_id INTEGER,
  kind VARCHAR(255),
  name VARCHAR(255),
  number VARCHAR(255),
  issued_on DATE,
  expires_on DATE,
  reminded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_certifications_tenant_id ON public.lc_certifications USING btree (tenant_id);

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

CREATE TABLE IF NOT EXISTS lc_employees (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(255),
  crew_id INTEGER,
  role VARCHAR(255) DEFAULT 'crew'::character varying,
  employment_type VARCHAR(255) DEFAULT 'w2'::character varying,
  pay_type VARCHAR(255) DEFAULT 'hourly'::character varying,
  pay_rate_cents INTEGER DEFAULT 0,
  overtime_eligible BOOLEAN DEFAULT true,
  hire_date DATE,
  status VARCHAR(255) DEFAULT 'active'::character varying,
  emergency_contact JSONB DEFAULT '{}'::jsonb,
  documents JSONB DEFAULT '[]'::jsonb,
  provider_employee_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_employees_tenant_id ON public.lc_employees USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_expenses (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  spent_on DATE,
  vendor VARCHAR(255),
  category VARCHAR(255),
  amount_cents INTEGER DEFAULT 0,
  appointment_id INTEGER,
  crew_id INTEGER,
  employee_id INTEGER,
  receipt_url TEXT,
  reimbursable BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_expenses_tenant_id ON public.lc_expenses USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_impersonation_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  platform_user_id INTEGER,
  reason TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_impersonation_log_tenant_id ON public.lc_impersonation_log USING btree (tenant_id);

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

CREATE TABLE IF NOT EXISTS lc_job_checklists (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  service_type VARCHAR(255),
  items JSONB DEFAULT '[]'::jsonb,
  appointment_id INTEGER,
  completed JSONB DEFAULT '[]'::jsonb,
  completed_by INTEGER,
  completed_at TIMESTAMPTZ,
  is_template BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_job_checklists_tenant_id ON public.lc_job_checklists USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_job_costs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  appointment_id INTEGER,
  service_record_id INTEGER,
  customer_id INTEGER,
  crew_id INTEGER,
  labor_minutes INTEGER DEFAULT 0,
  labor_cents INTEGER DEFAULT 0,
  drive_minutes INTEGER DEFAULT 0,
  drive_cents INTEGER DEFAULT 0,
  material_cents INTEGER DEFAULT 0,
  overhead_cents INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  margin_cents INTEGER DEFAULT 0,
  margin_pct DOUBLE PRECISION,
  computed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_job_costs_tenant_id ON public.lc_job_costs USING btree (tenant_id);

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

CREATE TABLE IF NOT EXISTS lc_pay_items (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  pay_run_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  regular_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  regular_cents INTEGER DEFAULT 0,
  overtime_cents INTEGER DEFAULT 0,
  reimbursement_cents INTEGER DEFAULT 0,
  gross_cents INTEGER DEFAULT 0,
  deductions_cents INTEGER DEFAULT 0,
  net_cents INTEGER DEFAULT 0,
  breakdown JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS lc_pay_items_tenant_id ON public.lc_pay_items USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_pay_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  period_start DATE,
  period_end DATE,
  pay_date DATE,
  status VARCHAR(255) DEFAULT 'draft'::character varying,
  filed BOOLEAN DEFAULT false,
  provider VARCHAR(255),
  provider_run_id VARCHAR(255),
  gross_cents INTEGER DEFAULT 0,
  deductions_cents INTEGER DEFAULT 0,
  net_cents INTEGER DEFAULT 0,
  employer_tax_cents INTEGER DEFAULT 0,
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_pay_runs_tenant_id ON public.lc_pay_runs USING btree (tenant_id);

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

CREATE TABLE IF NOT EXISTS lc_platform_subscriptions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  plan VARCHAR(255) DEFAULT 'starter'::character varying,
  status VARCHAR(255) DEFAULT 'trialing'::character varying,
  price_cents INTEGER DEFAULT 0,
  stripe_subscription_id VARCHAR(255),
  current_period_end TIMESTAMPTZ,
  limits JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_platform_subscriptions_tenant_id ON public.lc_platform_subscriptions USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_platform_users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(255) DEFAULT 'admin'::character varying,
  status VARCHAR(255) DEFAULT 'active'::character varying,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS lc_platform_users_email_key ON public.lc_platform_users USING btree (email);

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

CREATE TABLE IF NOT EXISTS lc_referrals (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  code VARCHAR(255),
  referrer_customer_id INTEGER,
  referee_customer_id INTEGER,
  referee_lead_id INTEGER,
  reward_cents INTEGER DEFAULT 0,
  status VARCHAR(255) DEFAULT 'issued'::character varying,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_referrals_tenant_id ON public.lc_referrals USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_reviews (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER,
  service_record_id INTEGER,
  platform VARCHAR(255) DEFAULT 'google'::character varying,
  status VARCHAR(255) DEFAULT 'requested'::character varying,
  rating INTEGER,
  text TEXT,
  author VARCHAR(255),
  external_id VARCHAR(255),
  requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_reviews_tenant_id ON public.lc_reviews USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_routes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  crew_id INTEGER,
  service_date DATE,
  stops JSONB DEFAULT '[]'::jsonb,
  stop_count INTEGER DEFAULT 0,
  drive_minutes INTEGER,
  drive_miles DOUBLE PRECISION,
  baseline_drive_minutes INTEGER,
  saved_minutes INTEGER,
  method VARCHAR(255),
  distance_source VARCHAR(255),
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_routes_tenant_id ON public.lc_routes USING btree (tenant_id);

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

CREATE TABLE IF NOT EXISTS lc_short_links (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  code VARCHAR(255) NOT NULL,
  target TEXT,
  source VARCHAR(255),
  clicks INTEGER DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_short_links_code ON public.lc_short_links USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS lc_short_links_code_key ON public.lc_short_links USING btree (code);
CREATE INDEX IF NOT EXISTS lc_short_links_tenant_id ON public.lc_short_links USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_site_content (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  version INTEGER DEFAULT 1,
  content JSONB DEFAULT '{}'::jsonb,
  published BOOLEAN DEFAULT true,
  published_by INTEGER,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_site_content_tenant_id ON public.lc_site_content USING btree (tenant_id);

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

CREATE TABLE IF NOT EXISTS lc_supplier_bills (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  vendor VARCHAR(255),
  reference VARCHAR(255),
  amount_cents INTEGER DEFAULT 0,
  due_on DATE,
  status VARCHAR(255) DEFAULT 'open'::character varying,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_supplier_bills_tenant_id ON public.lc_supplier_bills USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS lc_tenant_aliases (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS lc_tenant_aliases_slug_key ON public.lc_tenant_aliases USING btree (slug);
CREATE INDEX IF NOT EXISTS lc_tenant_aliases_tenant_id ON public.lc_tenant_aliases USING btree (tenant_id);

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
  created_at TIMESTAMPTZ,
  owner_phone VARCHAR(255),
  counties JSONB DEFAULT '[]'::jsonb,
  plan VARCHAR(255) DEFAULT 'starter'::character varying,
  trial_ends_at TIMESTAMPTZ,
  stripe_account_id VARCHAR(255),
  google_place_id VARCHAR(255),
  short_code VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS lc_tenants_slug ON public.lc_tenants USING btree (slug);
CREATE INDEX IF NOT EXISTS lc_tenants_slug_idx ON public.lc_tenants USING btree (slug);
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

CREATE TABLE IF NOT EXISTS lc_time_entries (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  appointment_id INTEGER,
  crew_id INTEGER,
  work_date DATE,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  break_minutes INTEGER DEFAULT 0,
  minutes INTEGER,
  clock_in_geo JSONB,
  clock_out_geo JSONB,
  geofence_ok BOOLEAN,
  status VARCHAR(255) DEFAULT 'open'::character varying,
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  pay_run_id INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lc_time_entries_employee_id ON public.lc_time_entries USING btree (employee_id);
CREATE INDEX IF NOT EXISTS lc_time_entries_tenant_id ON public.lc_time_entries USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS lc_time_entries_work_date ON public.lc_time_entries USING btree (work_date);

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

