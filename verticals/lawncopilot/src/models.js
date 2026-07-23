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
  slug: { type: DataTypes.STRING, unique: true },
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  timezone: { type: DataTypes.STRING, defaultValue: 'America/New_York' },
  state: { type: DataTypes.STRING, defaultValue: 'FL' },
  business_hours: { type: DataTypes.JSONB, defaultValue: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] } },
  brand: { type: DataTypes.JSONB, defaultValue: {} },
  settings: { type: DataTypes.JSONB, defaultValue: {} },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  created_at: NOW()
}, { tableName: 'lc_tenants', ...base });

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

module.exports = {
  sequelize,
  Tenant, User, Customer, Lead,
  Property, PropertyGeometry, Measurement, MeasurementOverride,
  PricingRule, ServicePlan, AddonService,
  Quote, QuoteLineItem, Subscription,
  Crew, Appointment, ServiceRecord, ServicePhoto,
  Invoice, InvoiceLineItem, Payment, PaymentMethod, AutopayEnrollment,
  Ticket, Message, Notification, CallLog,
  AgentSession, AgentCall, AgentApproval, AuditLog
};
