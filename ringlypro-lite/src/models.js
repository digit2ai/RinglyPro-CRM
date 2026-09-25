'use strict';

/**
 * RinglyPro Lite — data model (ISOLATED, tenant-scoped).
 * All tables carry the `lite_` prefix so they can never collide with the
 * full-RinglyPro schema even if pointed at a shared Postgres instance.
 * Every business table is scoped by tenant_id (= lite_tenants.id).
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

/* ── Tenant (the small business) ───────────────────────────────────── */
const Tenant = sequelize.define('LiteTenant', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  business_name: { type: DataTypes.STRING, allowNull: false },
  owner_name: { type: DataTypes.STRING },
  owner_phone: { type: DataTypes.STRING },          // where message/booking SMS is sent (E.164)
  owner_email: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING(2), defaultValue: 'US' },   // US | CO
  locale: { type: DataTypes.STRING(2), defaultValue: 'en' },    // en | es (greeting + transcript language)
  timezone: { type: DataTypes.STRING, defaultValue: 'America/New_York' },
  greeting: { type: DataTypes.TEXT },               // optional custom opening; else generated
  transfer_number: { type: DataTypes.STRING },      // optional live-transfer target
  // billing
  stripe_customer_id: { type: DataTypes.STRING },
  stripe_subscription_id: { type: DataTypes.STRING },
  subscription_status: { type: DataTypes.STRING, defaultValue: 'trialing' }, // trialing|active|past_due|canceled|suspended
  trial_ends_at: { type: DataTypes.DATE },
  suspended_at: { type: DataTypes.DATE },           // answering suspended (failed payment)
  // Minute banking:
  //  rollover_minutes = unused INCLUDED minutes carried from prior periods.
  //  purchased_minutes = prepaid overage minutes bought via recharge (do not expire).
  //  rollover_period_start = the period start these balances were reconciled against.
  rollover_minutes: { type: DataTypes.DECIMAL(8, 2), defaultValue: 0 },
  purchased_minutes: { type: DataTypes.DECIMAL(8, 2), defaultValue: 0 },
  rollover_period_start: { type: DataTypes.DATE },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  // GoHighLevel wiring, PER TENANT. A HighLevel Private Integration token is
  // issued per sub-account, so these can never live in env once there is more
  // than one client. The env vars remain only as the fallback for a tenant
  // that has none (the pilot), which is what keeps the upgrade data entry.
  ghl_location_id: { type: DataTypes.STRING },
  ghl_token_enc: { type: DataTypes.TEXT },          // AES-256-GCM, services/secretbox
  ghl_agent_id: { type: DataTypes.STRING },
  ghl_calendar_id: { type: DataTypes.STRING },
  // Provisioning is resumable, so the step reached is recorded rather than
  // inferred: pending|claimed|number|calendar|agent|ready|failed
  provisioning_state: { type: DataTypes.STRING, defaultValue: 'pending' },
  provisioning_error: { type: DataTypes.TEXT },
  forwarding_confirmed_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_tenants', timestamps: false, indexes: [{ fields: ['stripe_customer_id'] }] });

/* ── Owner login accounts ──────────────────────────────────────────── */
const User = sequelize.define('LiteUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_users', timestamps: false, indexes: [{ fields: ['tenant_id'] }] });

/* ── Lite DID (the forwarding target number) ───────────────────────── */
const Number = sequelize.define('LiteNumber', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  did: { type: DataTypes.STRING, allowNull: false, unique: true },   // E.164
  country: { type: DataTypes.STRING(2), defaultValue: 'US' },
  provider: { type: DataTypes.STRING, defaultValue: 'twilio' },       // twilio | telnyx
  provider_sid: { type: DataTypes.STRING },                           // e.g. Twilio PN sid
  status: { type: DataTypes.STRING, defaultValue: 'active' },         // active | releasing | released
  monthly_cost_usd: { type: DataTypes.DECIMAL(6, 2) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_numbers', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['did'] }] });

/* ── Calls (one row per answered call) ─────────────────────────────── */
const Call = sequelize.define('LiteCall', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  call_sid: { type: DataTypes.STRING },
  caller: { type: DataTypes.STRING },                // caller ID (E.164)
  did: { type: DataTypes.STRING },                   // the Lite DID that was dialed
  language: { type: DataTypes.STRING(2), defaultValue: 'en' },
  started_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  ended_at: { type: DataTypes.DATE },
  duration: { type: DataTypes.INTEGER, defaultValue: 0 },   // seconds
  disposition: { type: DataTypes.STRING, defaultValue: 'in_progress' }, // message|appointment|transferred|abandoned|in_progress
  recording_url: { type: DataTypes.STRING },
  transcript: { type: DataTypes.TEXT },              // flattened transcript
  llm_input_tokens: { type: DataTypes.INTEGER, defaultValue: 0 },
  llm_output_tokens: { type: DataTypes.INTEGER, defaultValue: 0 },
  turns: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'lite_calls', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['call_sid'] }] });

/* ── Messages (message-taking path) ────────────────────────────────── */
const Message = sequelize.define('LiteMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  call_id: { type: DataTypes.INTEGER },
  caller_name: { type: DataTypes.STRING },
  callback_number: { type: DataTypes.STRING },
  body: { type: DataTypes.TEXT },
  read_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_messages', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['call_id'] }] });

/* ── Availability rules (weekly template) ──────────────────────────── */
const AvailabilityRule = sequelize.define('LiteAvailabilityRule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  weekday: { type: DataTypes.INTEGER, allowNull: false },   // 0=Sun .. 6=Sat
  start: { type: DataTypes.STRING(5), allowNull: false },   // 'HH:MM' local
  end: { type: DataTypes.STRING(5), allowNull: false },     // 'HH:MM' local
  slot_minutes: { type: DataTypes.INTEGER, defaultValue: 30 },
  timezone: { type: DataTypes.STRING, defaultValue: 'America/New_York' },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_availability_rules', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'weekday'] }] });

/* ── Appointments (booking path) ───────────────────────────────────── */
const Appointment = sequelize.define('LiteAppointment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  call_id: { type: DataTypes.INTEGER },
  caller_name: { type: DataTypes.STRING },
  callback_number: { type: DataTypes.STRING },
  starts_at: { type: DataTypes.DATE, allowNull: false },    // UTC instant of the slot
  ends_at: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'confirmed' }, // confirmed|cancelled|completed
  // WHICH SIDE THIS ROW WAS BORN ON. 'ringlypro' = booked here (public booking
  // page, dashboard, our own relay agent) and therefore PUSHED to HighLevel;
  // 'ai' = mirrored in from HighLevel and NEVER pushed back, which is the only
  // thing standing between a two-way sync and an echo loop. No default on
  // purpose: rows written before this column existed are NULL, i.e. provenance
  // unknown, and unknown never pushes.
  origin: { type: DataTypes.STRING(16) },
  // HighLevel's own event id, set when the push succeeds or when the mirror
  // reports one. It is what lets a cancellation reach both calendars.
  ghl_event_id: { type: DataTypes.STRING },
  // Set when the LOCAL cancel succeeded but the remote one did not. Without it
  // the failure lived only in an aggregate counter behind the admin key, so the
  // slot stayed blocked in HighLevel and nobody who could act on it could see.
  ghl_cancel_failed_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_appointments', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'starts_at'] }] });

/* ── Transcript turns (per-turn log) ───────────────────────────────── */
const Transcript = sequelize.define('LiteTranscript', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER },
  call_sid: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING(16), allowNull: false },   // caller|agent|tool
  text: { type: DataTypes.TEXT },
  tool_name: { type: DataTypes.STRING(64) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_call_transcripts', timestamps: false, indexes: [{ fields: ['call_sid'] }] });

/* ── Recharges (prepaid overage-minute top-ups) ────────────────────────── */
const Recharge = sequelize.define('LiteRecharge', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  amount_cents: { type: DataTypes.INTEGER, allowNull: false },
  minutes: { type: DataTypes.DECIMAL(8, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), defaultValue: 'usd' },
  stripe_payment_intent: { type: DataTypes.STRING },
  stripe_checkout_session: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },  // pending|succeeded|failed
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_recharges', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['stripe_payment_intent'] }, { fields: ['stripe_checkout_session'] }] });


/* ── GoHighLevel sub-account pool ──────────────────────────────────────
 * Creating a sub-account by API needs HighLevel's $497 Agency Pro plan. Below
 * that the owner makes them by hand — so signup CLAIMS a free one from this
 * pool instead of creating one, and the customer cannot tell the difference.
 * On $497 `agencyCreate` fills the pool automatically and the table keeps
 * working unchanged; that is why the claim path, not the create path, is what
 * provisioning calls.
 * Platform-level rows (no tenant_id until claimed).
 */
const GhlAccount = sequelize.define('LiteGhlAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  location_id: { type: DataTypes.STRING, allowNull: false, unique: true },
  token_enc: { type: DataTypes.TEXT, allowNull: false },     // AES-256-GCM
  label: { type: DataTypes.STRING },                          // owner's own note
  status: { type: DataTypes.STRING, defaultValue: 'free' },   // free|claimed|disabled
  claimed_by_tenant: { type: DataTypes.INTEGER },
  claimed_at: { type: DataTypes.DATE },
  source: { type: DataTypes.STRING, defaultValue: 'manual' }, // manual|agency_api
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'lite_ghl_accounts', timestamps: false,
     indexes: [{ fields: ['status'] }, { fields: ['claimed_by_tenant'] }] });

/* associations (loose — tenant_id scoping is enforced in queries) */
Call.hasMany(Message, { foreignKey: 'call_id' });
Message.belongsTo(Call, { foreignKey: 'call_id' });
Call.hasMany(Appointment, { foreignKey: 'call_id' });

module.exports = {
  sequelize,
  Tenant, User, Number, Call, Message, AvailabilityRule, Appointment, Transcript, Recharge, GhlAccount
};
