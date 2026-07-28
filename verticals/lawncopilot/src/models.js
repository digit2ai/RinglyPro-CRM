'use strict';

/**
 * Lawn Co-Pilot — Sequelize models
 *
 * The AI office for landscaping companies. Every table is multi-tenant
 * (tenant_id) and prefixed lc_.
 *
 * Rule: card data NEVER lands here. lc_payment_methods stores Stripe ids +
 * brand/last4/exp only. No PAN, no CVV, ever.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// Each of these MUST return a fresh object. Sequelize mutates attribute
// definitions in place (adding `field`/`fieldName`), so a shared literal makes
// the second column alias to the first — e.g. updated_at silently reading
// created_at.
const T = () => ({ type: DataTypes.INTEGER, allowNull: false }); // tenant_id
const NOW = () => ({ type: DataTypes.DATE, defaultValue: DataTypes.NOW });
const base = { timestamps: false };
// Same reason as above: Sequelize names indexes off the shared array, so a
// single literal would give every table the FIRST table's index name.
const tenantIdx = () => ({ ...base, indexes: [{ fields: ['tenant_id'] }] });

// ─── lc_tenants ─────────────────────────────────────────────────────────────
// One landscaping company. Franchise / multi-location = more rows, no migration.
const Tenant = sequelize.define('LcTenant', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  // The slug IS the company's web address. Printed on trucks, linked from
  // Google. Immutable after launch.
  slug: { type: DataTypes.STRING, unique: true },
  phone: { type: DataTypes.STRING },            // their AI receptionist number
  owner_phone: { type: DataTypes.STRING },      // where transfers ring
  email: { type: DataTypes.STRING },
  timezone: { type: DataTypes.STRING, defaultValue: 'America/New_York' },
  state: { type: DataTypes.STRING, defaultValue: 'FL' },
  counties: { type: DataTypes.JSONB, defaultValue: [] },
  business_hours: { type: DataTypes.JSONB, defaultValue: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] } },
  brand: { type: DataTypes.JSONB, defaultValue: {} },     // logo, color, copy, photos
  settings: { type: DataTypes.JSONB, defaultValue: {} },  // feature flags, enabled employees
  status: { type: DataTypes.STRING, defaultValue: 'active' }, // trialing|active|past_due|suspended
  plan: { type: DataTypes.STRING, defaultValue: 'starter' },
  trial_ends_at: { type: DataTypes.DATE },
  stripe_account_id: { type: DataTypes.STRING },   // Connect: money goes to THEM
  google_place_id: { type: DataTypes.STRING },
  short_code: { type: DataTypes.STRING },          // /l/<code>
  // First-touch attribution: which page and channel produced this trial.
  // Captured client-side at the first page view, persisted through signup.
  utm_source: { type: DataTypes.STRING },
  utm_medium: { type: DataTypes.STRING },
  utm_campaign: { type: DataTypes.STRING },
  utm_content: { type: DataTypes.STRING },
  utm_term: { type: DataTypes.STRING },
  first_touch_landing: { type: DataTypes.STRING },   // the path they first hit
  first_touch_referrer: { type: DataTypes.TEXT },    // the external referrer, if any
  first_touch_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_tenants', ...base, indexes: [{ fields: ['slug'] }] });

// ─── lc_tenant_aliases ──────────────────────────────────────────────────────
// A slug goes on a truck. If one ever must change, the old one keeps working.
const TenantAlias = sequelize.define('LcTenantAlias', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  created_at: NOW()
}, { tableName: 'lc_tenant_aliases', ...tenantIdx() });

// ─── lc_users ───────────────────────────────────────────────────────────────
// Staff. Roles: owner | admin | dispatcher | csr | tech
const User = sequelize.define('LcUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  password_hash: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING, defaultValue: 'csr' },
  phone: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  last_login_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_users', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['email'] }] });

// ─── lc_customers ───────────────────────────────────────────────────────────
const Customer = sequelize.define('LcCustomer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'active' }, // active|paused|cancelled|flagged
  stripe_customer_id: { type: DataTypes.STRING },
  balance_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  autopay_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  consent: { type: DataTypes.JSONB, defaultValue: { sms_transactional: true, sms_marketing: false, email_marketing: false } },
  referral_code: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
  created_at: NOW()
}, { tableName: 'lc_customers', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['phone'] }, { fields: ['email'] }] });

// ─── lc_leads ───────────────────────────────────────────────────────────────
// Written the moment the identity gate is satisfied — BEFORE the address,
// BEFORE the measurement. This row is the lead even if they leave immediately.
const Lead = sequelize.define('LcLead', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.TEXT },
  source: { type: DataTypes.STRING, defaultValue: 'web_orb' }, // web_orb|web_chat|web_form|phone
  channel_detail: { type: DataTypes.STRING },
  stage: { type: DataTypes.STRING, defaultValue: 'new' }, // new|measured|quoted|accepted|lost
  customer_id: { type: DataTypes.INTEGER },
  quote_id: { type: DataTypes.INTEGER },
  session_id: { type: DataTypes.STRING },
  consent: { type: DataTypes.JSONB, defaultValue: {} },
  meta: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: NOW(),
  updated_at: NOW()
}, { tableName: 'lc_leads', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['stage'] }, { fields: ['session_id'] }] });

// ─── lc_properties ──────────────────────────────────────────────────────────
const Property = sequelize.define('LcProperty', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER },
  address_raw: { type: DataTypes.TEXT },
  address: { type: DataTypes.TEXT },
  city: { type: DataTypes.STRING },
  county: { type: DataTypes.STRING },
  state: { type: DataTypes.STRING, defaultValue: 'FL' },
  zip: { type: DataTypes.STRING },
  lat: { type: DataTypes.DOUBLE },
  lng: { type: DataTypes.DOUBLE },
  parcel_id: { type: DataTypes.STRING },
  property_type: { type: DataTypes.STRING, defaultValue: 'residential' },
  lot_sqft: { type: DataTypes.INTEGER },
  building_footprint_sqft: { type: DataTypes.INTEGER },
  excluded_sqft: { type: DataTypes.INTEGER },
  serviceable_sqft: { type: DataTypes.INTEGER },
  approved_sqft: { type: DataTypes.INTEGER },      // human-approved source of truth
  approved_by: { type: DataTypes.INTEGER },
  approved_at: { type: DataTypes.DATE },
  confidence: { type: DataTypes.STRING, defaultValue: 'low' }, // low|medium|high
  is_estimate: { type: DataTypes.BOOLEAN, defaultValue: true },
  needs_review: { type: DataTypes.BOOLEAN, defaultValue: false },
  imagery_url: { type: DataTypes.TEXT },
  special_instructions: { type: DataTypes.TEXT },
  access_instructions: { type: DataTypes.TEXT },
  gate_code_enc: { type: DataTypes.TEXT },          // AES-256-GCM, never plaintext
  hazards: { type: DataTypes.TEXT },
  created_at: NOW(),
  updated_at: NOW()
}, { tableName: 'lc_properties', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['customer_id'] }] });

// ─── lc_property_geometry ───────────────────────────────────────────────────
const PropertyGeometry = sequelize.define('LcPropertyGeometry', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  property_id: { type: DataTypes.INTEGER, allowNull: false },
  parcel_geojson: { type: DataTypes.JSONB },
  building_geojson: { type: DataTypes.JSONB },
  excluded_geojson: { type: DataTypes.JSONB, defaultValue: [] },
  lawn_geojson: { type: DataTypes.JSONB },
  bbox: { type: DataTypes.JSONB },
  created_at: NOW()
}, { tableName: 'lc_property_geometry', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['property_id'] }] });

// ─── lc_measurements ────────────────────────────────────────────────────────
// Every measurement attempt, with the raw provider payload kept for audit.
const Measurement = sequelize.define('LcMeasurement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  property_id: { type: DataTypes.INTEGER },
  normalized_address: { type: DataTypes.TEXT },
  provider: { type: DataTypes.STRING },            // heuristic|parcel|imagery_ai
  lot_sqft: { type: DataTypes.INTEGER },
  building_footprint_sqft: { type: DataTypes.INTEGER },
  excluded_sqft: { type: DataTypes.INTEGER },
  excluded_breakdown: { type: DataTypes.JSONB, defaultValue: [] },
  serviceable_sqft: { type: DataTypes.INTEGER },
  confidence: { type: DataTypes.STRING, defaultValue: 'low' },
  is_estimate: { type: DataTypes.BOOLEAN, defaultValue: true },
  needs_review: { type: DataTypes.BOOLEAN, defaultValue: false },
  sources: { type: DataTypes.JSONB, defaultValue: [] },
  raw_payload: { type: DataTypes.JSONB, defaultValue: {} },
  expires_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_measurements', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['normalized_address'] }] });

// ─── lc_measurement_overrides ───────────────────────────────────────────────
const MeasurementOverride = sequelize.define('LcMeasurementOverride', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  property_id: { type: DataTypes.INTEGER, allowNull: false },
  measurement_id: { type: DataTypes.INTEGER },
  user_id: { type: DataTypes.INTEGER },
  old_sqft: { type: DataTypes.INTEGER },
  new_sqft: { type: DataTypes.INTEGER },
  reason: { type: DataTypes.TEXT },
  created_at: NOW()
}, { tableName: 'lc_measurement_overrides', ...tenantIdx() });

// ─── lc_pricing_rules ───────────────────────────────────────────────────────
// JSONB scope; most specific scope wins, ties broken by priority then recency.
const PricingRule = sequelize.define('LcPricingRule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING },
  scope: { type: DataTypes.JSONB, defaultValue: {} },  // {state,county,city,zip,property_type,frequency}
  rule_type: { type: DataTypes.STRING, allowNull: false }, // rate|minimum|tier|frequency|surcharge|discount|tax
  params: { type: DataTypes.JSONB, defaultValue: {} },
  priority: { type: DataTypes.INTEGER, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  active_from: { type: DataTypes.DATE },
  active_to: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_pricing_rules', ...tenantIdx() });

// ─── lc_service_plans ───────────────────────────────────────────────────────
const ServicePlan = sequelize.define('LcServicePlan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING, allowNull: false },
  frequency: { type: DataTypes.STRING, allowNull: false }, // weekly|biweekly|monthly|one_time
  description: { type: DataTypes.TEXT },
  included_services: { type: DataTypes.JSONB, defaultValue: [] },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: NOW()
}, { tableName: 'lc_service_plans', ...tenantIdx() });

// ─── lc_addon_services ──────────────────────────────────────────────────────
const AddonService = sequelize.define('LcAddonService', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING, allowNull: false },
  code: { type: DataTypes.STRING },
  price_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  price_per_sqft: { type: DataTypes.DOUBLE },
  description: { type: DataTypes.TEXT },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  coming_soon: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: NOW()
}, { tableName: 'lc_addon_services', ...tenantIdx() });

// ─── lc_quotes ──────────────────────────────────────────────────────────────
const Quote = sequelize.define('LcQuote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  lead_id: { type: DataTypes.INTEGER },
  customer_id: { type: DataTypes.INTEGER },
  property_id: { type: DataTypes.INTEGER },
  measurement_id: { type: DataTypes.INTEGER },
  token: { type: DataTypes.STRING, unique: true },
  frequency: { type: DataTypes.STRING },
  serviceable_sqft: { type: DataTypes.INTEGER },
  subtotal_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  tax_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  options: { type: DataTypes.JSONB, defaultValue: {} },   // price per frequency
  status: { type: DataTypes.STRING, defaultValue: 'issued' }, // issued|needs_review|approved|accepted|expired|rejected
  is_estimate: { type: DataTypes.BOOLEAN, defaultValue: true },
  confidence: { type: DataTypes.STRING, defaultValue: 'low' },
  expires_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_quotes', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['token'] }] });

// ─── lc_quote_line_items ────────────────────────────────────────────────────
const QuoteLineItem = sequelize.define('LcQuoteLineItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  quote_id: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.STRING },   // base|minimum|tier|frequency|surcharge|addon|discount|tax
  label: { type: DataTypes.STRING },
  detail: { type: DataTypes.TEXT },
  amount_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'lc_quote_line_items', ...tenantIdx() });

// ─── lc_subscriptions ───────────────────────────────────────────────────────
const Subscription = sequelize.define('LcSubscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  property_id: { type: DataTypes.INTEGER },
  plan_id: { type: DataTypes.INTEGER },
  frequency: { type: DataTypes.STRING },
  price_cents: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'active' }, // active|paused|cancelled
  next_service_date: { type: DataTypes.DATEONLY },
  pause_until: { type: DataTypes.DATEONLY },
  addons: { type: DataTypes.JSONB, defaultValue: [] },
  started_at: NOW(),
  cancelled_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_subscriptions', ...tenantIdx() });

// ─── lc_crews ───────────────────────────────────────────────────────────────
const Crew = sequelize.define('LcCrew', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING, allowNull: false },
  lead_name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  capacity_per_day: { type: DataTypes.INTEGER, defaultValue: 12 },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_at: NOW()
}, { tableName: 'lc_crews', ...tenantIdx() });

// ─── lc_appointments ────────────────────────────────────────────────────────
const Appointment = sequelize.define('LcAppointment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER },
  property_id: { type: DataTypes.INTEGER },
  subscription_id: { type: DataTypes.INTEGER },
  crew_id: { type: DataTypes.INTEGER },
  service_date: { type: DataTypes.DATEONLY, allowNull: false },
  window_start: { type: DataTypes.STRING, defaultValue: '08:00' },
  window_end: { type: DataTypes.STRING, defaultValue: '12:00' },
  route_order: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'scheduled' }, // scheduled|en_route|completed|skipped|cancelled|weather_hold|missed
  service_type: { type: DataTypes.STRING, defaultValue: 'mowing' },
  addons: { type: DataTypes.JSONB, defaultValue: [] },
  price_cents: { type: DataTypes.INTEGER },
  notes: { type: DataTypes.TEXT },
  tracking: { type: DataTypes.JSONB, defaultValue: {} },  // GPS seam
  created_at: NOW(),
  updated_at: NOW()
}, { tableName: 'lc_appointments', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['service_date'] }, { fields: ['customer_id'] }] });

// ─── lc_service_records ─────────────────────────────────────────────────────
const ServiceRecord = sequelize.define('LcServiceRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  appointment_id: { type: DataTypes.INTEGER },
  customer_id: { type: DataTypes.INTEGER },
  property_id: { type: DataTypes.INTEGER },
  crew_id: { type: DataTypes.INTEGER },
  service_date: { type: DataTypes.DATEONLY },
  completed_at: { type: DataTypes.DATE },
  service_type: { type: DataTypes.STRING },
  area_serviced_sqft: { type: DataTypes.INTEGER },
  completion_status: { type: DataTypes.STRING, defaultValue: 'completed' },
  technician_notes: { type: DataTypes.TEXT },
  customer_instructions: { type: DataTypes.TEXT },
  weather: { type: DataTypes.STRING },
  addons_performed: { type: DataTypes.JSONB, defaultValue: [] },
  charges_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: NOW()
}, { tableName: 'lc_service_records', ...tenantIdx() });

// ─── lc_service_photos ──────────────────────────────────────────────────────
const ServicePhoto = sequelize.define('LcServicePhoto', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  service_record_id: { type: DataTypes.INTEGER },
  property_id: { type: DataTypes.INTEGER },
  kind: { type: DataTypes.STRING, defaultValue: 'after' }, // before|after|issue
  url: { type: DataTypes.TEXT },
  caption: { type: DataTypes.STRING },
  created_at: NOW()
}, { tableName: 'lc_service_photos', ...tenantIdx() });

// ─── lc_invoices ────────────────────────────────────────────────────────────
const Invoice = sequelize.define('LcInvoice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  service_record_id: { type: DataTypes.INTEGER },
  number: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'open' }, // draft|open|paid|failed|void|uncollectible
  subtotal_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  tax_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  amount_paid_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  issued_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  due_at: { type: DataTypes.DATE },
  paid_at: { type: DataTypes.DATE },
  stripe_invoice_id: { type: DataTypes.STRING },
  dunning_stage: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: NOW()
}, { tableName: 'lc_invoices', ...tenantIdx() });

const InvoiceLineItem = sequelize.define('LcInvoiceLineItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  invoice_id: { type: DataTypes.INTEGER, allowNull: false },
  label: { type: DataTypes.STRING },
  detail: { type: DataTypes.TEXT },
  amount_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'lc_invoice_line_items', ...tenantIdx() });

// ─── lc_payments ────────────────────────────────────────────────────────────
const Payment = sequelize.define('LcPayment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER },
  invoice_id: { type: DataTypes.INTEGER },
  amount_cents: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending|succeeded|failed|refunded
  method: { type: DataTypes.STRING },
  failure_reason: { type: DataTypes.STRING },
  stripe_payment_intent_id: { type: DataTypes.STRING },
  stripe_event_id: { type: DataTypes.STRING },   // idempotency key for webhooks
  processed_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_payments', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['stripe_event_id'] }] });

// ─── lc_payment_methods ─────────────────────────────────────────────────────
// Stripe ids + display metadata ONLY. Never a PAN, never a CVV.
const PaymentMethod = sequelize.define('LcPaymentMethod', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  stripe_payment_method_id: { type: DataTypes.STRING },
  brand: { type: DataTypes.STRING },
  last4: { type: DataTypes.STRING },
  exp_month: { type: DataTypes.INTEGER },
  exp_year: { type: DataTypes.INTEGER },
  type: { type: DataTypes.STRING, defaultValue: 'card' },
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: NOW()
}, { tableName: 'lc_payment_methods', ...tenantIdx() });

// ─── lc_autopay_enrollments ─────────────────────────────────────────────────
const AutopayEnrollment = sequelize.define('LcAutopayEnrollment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  payment_method_id: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'active' }, // active|disabled
  terms_accepted_at: { type: DataTypes.DATE },
  next_charge_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_autopay_enrollments', ...tenantIdx() });

// ─── lc_tickets ─────────────────────────────────────────────────────────────
const Ticket = sequelize.define('LcTicket', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER },
  property_id: { type: DataTypes.INTEGER },
  type: { type: DataTypes.STRING, defaultValue: 'support' }, // support|measurement_dispute|billing|message|service_request
  subject: { type: DataTypes.STRING },
  body: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'open' }, // open|in_progress|resolved|closed
  priority: { type: DataTypes.STRING, defaultValue: 'normal' },
  assigned_to: { type: DataTypes.INTEGER },
  source: { type: DataTypes.STRING, defaultValue: 'portal' }, // portal|phone|orb|admin
  created_at: NOW(),
  updated_at: NOW()
}, { tableName: 'lc_tickets', ...tenantIdx() });

// ─── lc_messages ────────────────────────────────────────────────────────────
const Message = sequelize.define('LcMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER },
  ticket_id: { type: DataTypes.INTEGER },
  direction: { type: DataTypes.STRING, defaultValue: 'inbound' }, // inbound|outbound
  author: { type: DataTypes.STRING },
  body: { type: DataTypes.TEXT },
  read_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_messages', ...tenantIdx() });

// ─── lc_notifications ───────────────────────────────────────────────────────
const Notification = sequelize.define('LcNotification', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER },
  channel: { type: DataTypes.STRING },  // email|sms|portal|voice
  template: { type: DataTypes.STRING },
  to_address: { type: DataTypes.STRING },
  subject: { type: DataTypes.STRING },
  body: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'queued' }, // queued|sent|failed|suppressed
  provider_id: { type: DataTypes.STRING },
  reason: { type: DataTypes.STRING },
  created_at: NOW()
}, { tableName: 'lc_notifications', ...tenantIdx() });

// ─── lc_call_logs ───────────────────────────────────────────────────────────
const CallLog = sequelize.define('LcCallLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  call_sid: { type: DataTypes.STRING },
  from_number: { type: DataTypes.STRING },
  to_number: { type: DataTypes.STRING },
  customer_id: { type: DataTypes.INTEGER },
  intent: { type: DataTypes.STRING },
  outcome: { type: DataTypes.STRING },
  summary: { type: DataTypes.TEXT },
  transferred: { type: DataTypes.BOOLEAN, defaultValue: false },
  duration_seconds: { type: DataTypes.INTEGER },
  session_id: { type: DataTypes.STRING },
  created_at: NOW()
}, { tableName: 'lc_call_logs', ...tenantIdx() });

// ─── lc_agent_sessions ──────────────────────────────────────────────────────
// One row per orb / chat / phone conversation.
const AgentSession = sequelize.define('LcAgentSession', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  session_id: { type: DataTypes.STRING, allowNull: false },
  channel: { type: DataTypes.STRING },  // web_orb|web_chat|phone|admin
  employee: { type: DataTypes.STRING },
  lead_id: { type: DataTypes.INTEGER },
  customer_id: { type: DataTypes.INTEGER },
  identity: { type: DataTypes.JSONB, defaultValue: {} },  // name/phone/email captured by the gate
  identity_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  transcript: { type: DataTypes.JSONB, defaultValue: [] },
  outcome: { type: DataTypes.STRING },
  cost_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: NOW(),
  updated_at: NOW()
}, { tableName: 'lc_agent_sessions', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['session_id'] }] });

// ─── lc_agent_calls ─────────────────────────────────────────────────────────
// Every MCP tool call. This is what powers "what did my AI staff do today".
const AgentCall = sequelize.define('LcAgentCall', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  session_id: { type: DataTypes.STRING },
  employee: { type: DataTypes.STRING },
  tool: { type: DataTypes.STRING },
  channel: { type: DataTypes.STRING },
  actor: { type: DataTypes.STRING },
  arguments: { type: DataTypes.JSONB, defaultValue: {} },  // PII-redacted
  success: { type: DataTypes.BOOLEAN, defaultValue: true },
  error: { type: DataTypes.TEXT },
  requires_approval: { type: DataTypes.BOOLEAN, defaultValue: false },
  latency_ms: { type: DataTypes.INTEGER },
  cost_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: NOW()
}, { tableName: 'lc_agent_calls', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['employee'] }, { fields: ['created_at'] }] });

// ─── lc_agent_approvals ─────────────────────────────────────────────────────
const AgentApproval = sequelize.define('LcAgentApproval', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  session_id: { type: DataTypes.STRING },
  employee: { type: DataTypes.STRING },
  tool: { type: DataTypes.STRING },
  arguments: { type: DataTypes.JSONB, defaultValue: {} },
  reason: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending|approved|rejected|executed
  decided_by: { type: DataTypes.INTEGER },
  decided_at: { type: DataTypes.DATE },
  result: { type: DataTypes.JSONB },
  created_at: NOW()
}, { tableName: 'lc_agent_approvals', ...tenantIdx() });

// ─── lc_audit_log ───────────────────────────────────────────────────────────
const AuditLog = sequelize.define('LcAuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  user_id: { type: DataTypes.INTEGER },
  actor: { type: DataTypes.STRING },
  action: { type: DataTypes.STRING },
  entity: { type: DataTypes.STRING },
  entity_id: { type: DataTypes.INTEGER },
  old_value: { type: DataTypes.JSONB },
  new_value: { type: DataTypes.JSONB },
  reason: { type: DataTypes.TEXT },
  created_at: NOW()
}, { tableName: 'lc_audit_log', ...tenantIdx() });

// ════════════════════════════════════════════════════════════════════════════
// v2 — the rest of the office
// ════════════════════════════════════════════════════════════════════════════

// ─── lc_employees ───────────────────────────────────────────────────────────
const Employee = sequelize.define('LcEmployee', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  crew_id: { type: DataTypes.INTEGER },
  role: { type: DataTypes.STRING, defaultValue: 'crew' }, // crew|lead|foreman|office
  employment_type: { type: DataTypes.STRING, defaultValue: 'w2' }, // w2|1099
  pay_type: { type: DataTypes.STRING, defaultValue: 'hourly' },    // hourly|salary|per_job
  pay_rate_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  overtime_eligible: { type: DataTypes.BOOLEAN, defaultValue: true },
  hire_date: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING, defaultValue: 'active' },       // active|inactive|terminated
  emergency_contact: { type: DataTypes.JSONB, defaultValue: {} },
  documents: { type: DataTypes.JSONB, defaultValue: [] },
  provider_employee_id: { type: DataTypes.STRING },   // payroll provider ref
  notes: { type: DataTypes.TEXT },
  created_at: NOW(),
  updated_at: NOW()
}, { tableName: 'lc_employees', ...tenantIdx() });

// ─── lc_certifications ──────────────────────────────────────────────────────
const Certification = sequelize.define('LcCertification', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  employee_id: { type: DataTypes.INTEGER },
  kind: { type: DataTypes.STRING },      // pesticide|cdl|insurance|other
  name: { type: DataTypes.STRING },
  number: { type: DataTypes.STRING },
  issued_on: { type: DataTypes.DATEONLY },
  expires_on: { type: DataTypes.DATEONLY },
  reminded_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_certifications', ...tenantIdx() });

// ─── lc_availability ────────────────────────────────────────────────────────
const Availability = sequelize.define('LcAvailability', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  employee_id: { type: DataTypes.INTEGER },
  kind: { type: DataTypes.STRING, defaultValue: 'working_hours' }, // working_hours|time_off
  days: { type: DataTypes.JSONB, defaultValue: [1, 2, 3, 4, 5] },
  start_time: { type: DataTypes.STRING, defaultValue: '07:00' },
  end_time: { type: DataTypes.STRING, defaultValue: '16:00' },
  from_date: { type: DataTypes.DATEONLY },
  to_date: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING, defaultValue: 'approved' },
  reason: { type: DataTypes.STRING },
  created_at: NOW()
}, { tableName: 'lc_availability', ...tenantIdx() });

// ─── lc_time_entries ────────────────────────────────────────────────────────
// The single source of hours. Feeds payroll with no re-entry, ever.
const TimeEntry = sequelize.define('LcTimeEntry', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  employee_id: { type: DataTypes.INTEGER, allowNull: false },
  appointment_id: { type: DataTypes.INTEGER },
  crew_id: { type: DataTypes.INTEGER },
  work_date: { type: DataTypes.DATEONLY },
  clock_in: { type: DataTypes.DATE },
  clock_out: { type: DataTypes.DATE },
  break_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
  minutes: { type: DataTypes.INTEGER },
  clock_in_geo: { type: DataTypes.JSONB },
  clock_out_geo: { type: DataTypes.JSONB },
  geofence_ok: { type: DataTypes.BOOLEAN },
  status: { type: DataTypes.STRING, defaultValue: 'open' }, // open|submitted|approved|rejected|paid
  approved_by: { type: DataTypes.INTEGER },
  approved_at: { type: DataTypes.DATE },
  pay_run_id: { type: DataTypes.INTEGER },
  notes: { type: DataTypes.TEXT },
  created_at: NOW()
}, { tableName: 'lc_time_entries', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['employee_id'] }, { fields: ['work_date'] }] });

// ─── lc_job_checklists ──────────────────────────────────────────────────────
const JobChecklist = sequelize.define('LcJobChecklist', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  service_type: { type: DataTypes.STRING },
  items: { type: DataTypes.JSONB, defaultValue: [] },
  appointment_id: { type: DataTypes.INTEGER },
  completed: { type: DataTypes.JSONB, defaultValue: [] },
  completed_by: { type: DataTypes.INTEGER },
  completed_at: { type: DataTypes.DATE },
  is_template: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_at: NOW()
}, { tableName: 'lc_job_checklists', ...tenantIdx() });

// ─── lc_pay_runs / lc_pay_items ─────────────────────────────────────────────
const PayRun = sequelize.define('LcPayRun', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  period_start: { type: DataTypes.DATEONLY },
  period_end: { type: DataTypes.DATEONLY },
  pay_date: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING, defaultValue: 'draft' }, // draft|pending_approval|approved|submitted|paid|failed
  // Honesty flag: true only when a licensed provider filed it.
  filed: { type: DataTypes.BOOLEAN, defaultValue: false },
  provider: { type: DataTypes.STRING },
  provider_run_id: { type: DataTypes.STRING },
  gross_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  deductions_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  net_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  employer_tax_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  approved_by: { type: DataTypes.INTEGER },
  approved_at: { type: DataTypes.DATE },
  notes: { type: DataTypes.TEXT },
  created_at: NOW()
}, { tableName: 'lc_pay_runs', ...tenantIdx() });

const PayItem = sequelize.define('LcPayItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  pay_run_id: { type: DataTypes.INTEGER, allowNull: false },
  employee_id: { type: DataTypes.INTEGER, allowNull: false },
  regular_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
  overtime_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
  regular_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  overtime_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  reimbursement_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  gross_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  deductions_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  net_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  breakdown: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'lc_pay_items', ...tenantIdx() });

// ─── lc_expenses / lc_supplier_bills ────────────────────────────────────────
const Expense = sequelize.define('LcExpense', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  spent_on: { type: DataTypes.DATEONLY },
  vendor: { type: DataTypes.STRING },
  category: { type: DataTypes.STRING }, // fuel|materials|equipment|repairs|insurance|subscription|other
  amount_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  appointment_id: { type: DataTypes.INTEGER },
  crew_id: { type: DataTypes.INTEGER },
  employee_id: { type: DataTypes.INTEGER },
  receipt_url: { type: DataTypes.TEXT },
  reimbursable: { type: DataTypes.BOOLEAN, defaultValue: false },
  notes: { type: DataTypes.TEXT },
  created_at: NOW()
}, { tableName: 'lc_expenses', ...tenantIdx() });

const SupplierBill = sequelize.define('LcSupplierBill', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  vendor: { type: DataTypes.STRING },
  reference: { type: DataTypes.STRING },
  amount_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  due_on: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING, defaultValue: 'open' },
  paid_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_supplier_bills', ...tenantIdx() });

// ─── lc_job_costs ───────────────────────────────────────────────────────────
// Computed truth per job: what it actually cost vs what we charged.
const JobCost = sequelize.define('LcJobCost', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  appointment_id: { type: DataTypes.INTEGER },
  service_record_id: { type: DataTypes.INTEGER },
  customer_id: { type: DataTypes.INTEGER },
  crew_id: { type: DataTypes.INTEGER },
  labor_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
  labor_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  drive_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
  drive_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  material_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  overhead_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_cost_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  revenue_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  margin_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  margin_pct: { type: DataTypes.DOUBLE },
  computed_at: NOW()
}, { tableName: 'lc_job_costs', ...tenantIdx() });

// ─── lc_routes ──────────────────────────────────────────────────────────────
const Route = sequelize.define('LcRoute', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  crew_id: { type: DataTypes.INTEGER },
  service_date: { type: DataTypes.DATEONLY },
  stops: { type: DataTypes.JSONB, defaultValue: [] },
  stop_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  drive_minutes: { type: DataTypes.INTEGER },
  drive_miles: { type: DataTypes.DOUBLE },
  baseline_drive_minutes: { type: DataTypes.INTEGER },
  saved_minutes: { type: DataTypes.INTEGER },
  method: { type: DataTypes.STRING },
  distance_source: { type: DataTypes.STRING }, // provider|haversine
  created_at: NOW()
}, { tableName: 'lc_routes', ...tenantIdx() });

// ─── Marketing ──────────────────────────────────────────────────────────────
const Campaign = sequelize.define('LcCampaign', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  name: { type: DataTypes.STRING },
  kind: { type: DataTypes.STRING },  // seasonal|winback|upsell|announcement
  channel: { type: DataTypes.STRING, defaultValue: 'email' },
  subject: { type: DataTypes.STRING },
  body: { type: DataTypes.TEXT },
  audience: { type: DataTypes.JSONB, defaultValue: {} },
  status: { type: DataTypes.STRING, defaultValue: 'draft' }, // draft|pending_approval|sending|sent|cancelled
  scheduled_for: { type: DataTypes.DATE },
  recipients: { type: DataTypes.INTEGER, defaultValue: 0 },
  sent_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  suppressed_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: NOW()
}, { tableName: 'lc_campaigns', ...tenantIdx() });

const CampaignSend = sequelize.define('LcCampaignSend', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  campaign_id: { type: DataTypes.INTEGER },
  customer_id: { type: DataTypes.INTEGER },
  channel: { type: DataTypes.STRING },
  to_address: { type: DataTypes.STRING },
  // Proof of consent AT SEND TIME, not template time.
  consent_snapshot: { type: DataTypes.JSONB, defaultValue: {} },
  status: { type: DataTypes.STRING, defaultValue: 'queued' }, // queued|sent|suppressed|failed
  reason: { type: DataTypes.STRING },
  created_at: NOW()
}, { tableName: 'lc_campaign_sends', ...tenantIdx() });

const Review = sequelize.define('LcReview', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  customer_id: { type: DataTypes.INTEGER },
  service_record_id: { type: DataTypes.INTEGER },
  platform: { type: DataTypes.STRING, defaultValue: 'google' },
  status: { type: DataTypes.STRING, defaultValue: 'requested' }, // requested|clicked|left|declined
  rating: { type: DataTypes.INTEGER },
  text: { type: DataTypes.TEXT },
  author: { type: DataTypes.STRING },
  external_id: { type: DataTypes.STRING },
  requested_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_reviews', ...tenantIdx() });

const Referral = sequelize.define('LcReferral', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  code: { type: DataTypes.STRING },
  referrer_customer_id: { type: DataTypes.INTEGER },
  referee_customer_id: { type: DataTypes.INTEGER },
  referee_lead_id: { type: DataTypes.INTEGER },
  reward_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  status: { type: DataTypes.STRING, defaultValue: 'issued' }, // issued|clicked|converted|rewarded
  converted_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_referrals', ...tenantIdx() });

// ─── lc_site_content ────────────────────────────────────────────────────────
// Their page content, versioned and revertible.
const SiteContent = sequelize.define('LcSiteContent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  version: { type: DataTypes.INTEGER, defaultValue: 1 },
  content: { type: DataTypes.JSONB, defaultValue: {} },
  published: { type: DataTypes.BOOLEAN, defaultValue: true },
  published_by: { type: DataTypes.INTEGER },
  created_at: NOW()
}, { tableName: 'lc_site_content', ...tenantIdx() });

// ─── lc_short_links ─────────────────────────────────────────────────────────
// The link goes on trucks and into Google. Track how it travels.
const ShortLink = sequelize.define('LcShortLink', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  target: { type: DataTypes.TEXT },
  source: { type: DataTypes.STRING },   // truck|google|card|sms|bio
  clicks: { type: DataTypes.INTEGER, defaultValue: 0 },
  last_clicked_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_short_links', ...base, indexes: [{ fields: ['tenant_id'] }, { fields: ['code'] }] });

// ─── Platform layer (Digit2AI, above the tenants) ───────────────────────────
const PlatformUser = sequelize.define('LcPlatformUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING, defaultValue: 'admin' },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  last_login_at: { type: DataTypes.DATE },
  created_at: NOW()
}, { tableName: 'lc_platform_users', ...base });

const PlatformSubscription = sequelize.define('LcPlatformSubscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  plan: { type: DataTypes.STRING, defaultValue: 'starter' },
  status: { type: DataTypes.STRING, defaultValue: 'trialing' },
  price_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  stripe_subscription_id: { type: DataTypes.STRING },
  current_period_end: { type: DataTypes.DATE },
  limits: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: NOW()
}, { tableName: 'lc_platform_subscriptions', ...tenantIdx() });

// Audited support access into a tenant.
const ImpersonationLog = sequelize.define('LcImpersonationLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: T(),
  platform_user_id: { type: DataTypes.INTEGER },
  reason: { type: DataTypes.TEXT },
  started_at: NOW(),
  ended_at: { type: DataTypes.DATE }
}, { tableName: 'lc_impersonation_log', ...tenantIdx() });

module.exports = {
  sequelize,
  Tenant, TenantAlias, User, Customer, Lead,
  Property, PropertyGeometry, Measurement, MeasurementOverride,
  PricingRule, ServicePlan, AddonService,
  Quote, QuoteLineItem, Subscription,
  Crew, Appointment, ServiceRecord, ServicePhoto,
  Invoice, InvoiceLineItem, Payment, PaymentMethod, AutopayEnrollment,
  Ticket, Message, Notification, CallLog,
  AgentSession, AgentCall, AgentApproval, AuditLog,
  // v2
  Employee, Certification, Availability, TimeEntry, JobChecklist,
  PayRun, PayItem, Expense, SupplierBill, JobCost, Route,
  Campaign, CampaignSend, Review, Referral,
  SiteContent, ShortLink,
  PlatformUser, PlatformSubscription, ImpersonationLog
};
