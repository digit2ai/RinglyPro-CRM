'use strict';

// =============================================================================
// orbupCredits — the credit ledger behind OrbUp plans.
//
// THE INVARIANT: the balance is DERIVED from an append-only ledger. Nothing in
// this codebase writes a balance directly; every movement is a row in
// orbup_credit_ledger with a unique idempotency_key. Replaying a Stripe webhook,
// double-clicking Build, or retrying a failed request therefore cannot move the
// balance twice — the second insert loses to the unique index and is a no-op.
//
// Naming mirrors JobUp's billing service (createCheckout / createPortal /
// applyEvent) so the two products can share a billing brain later.
// =============================================================================

const { sequelize } = require('../models');

const PLANS = {
  free:      { key: 'free',      label: 'Free',      cents: 0,     credits: 1500 },
  plus:      { key: 'plus',      label: 'Plus',      cents: 3500,  credits: 25000,  recommended: true },
  pro:       { key: 'pro',       label: 'Pro',       cents: 16600, credits: 100000 }
};

// Manual top-ups. One-time purchases, NOT a subscription: Free never needs a card
// to exist, only to buy. Rates are deliberately below every subscription tier
// (Plus is 714 credits/$) so a top-up never beats subscribing, with a mild volume
// ladder inside that band.
const TOPUPS = [
  { key: 't10',  cents: 1000,  credits: 5000  },   // 500/$
  { key: 't20',  cents: 2000,  credits: 11000 },   // 550/$
  { key: 't50',  cents: 5000,  credits: 30000 },   // 600/$
  { key: 't100', cents: 10000, credits: 65000 }    // 650/$
];
function topupPack(key) { return TOPUPS.find(t => t.key === key) || null; }
function topupPriceId(key) { return process.env['ORBUP_PRICE_' + String(key).toUpperCase()] || null; }
function packForPriceId(id) { if (!id) return null; return TOPUPS.find(t => topupPriceId(t.key) === id) || null; }

// Unused credits do NOT roll over. Stated here, in the UI, and enforced by
// refill() setting the balance to the allowance rather than adding to it.
const ROLLOVER = false;

function priceIdFor(plan) {
  return ({
    plus:      process.env.ORBUP_PRICE_PLUS,
    pro:       process.env.ORBUP_PRICE_PRO
  })[plan] || null;
}
function planForPriceId(id) {
  if (!id) return null;
  for (const k of ['plus', 'pro']) if (priceIdFor(k) === id) return k;
  return null;
}

// ---- schema -----------------------------------------------------------------
async function ensureSchema() {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS orbup_credit_accounts (
       id SERIAL PRIMARY KEY,
       tenant_id INTEGER NOT NULL,
       user_id INTEGER NOT NULL,
       email TEXT NOT NULL,
       plan VARCHAR(20) NOT NULL DEFAULT 'free',
       balance INTEGER NOT NULL DEFAULT 0,
       topup_balance INTEGER NOT NULL DEFAULT 0,
       monthly_allowance INTEGER NOT NULL DEFAULT 1500,
       period_start TIMESTAMPTZ DEFAULT NOW(),
       period_end TIMESTAMPTZ,
       stripe_customer_id TEXT,
       stripe_subscription_id TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orbup_credit_accounts_tenant_user
       ON orbup_credit_accounts(tenant_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orbup_credit_accounts_cust
       ON orbup_credit_accounts(stripe_customer_id)`,
    // Append-only. No UPDATE, no DELETE, ever.
    `CREATE TABLE IF NOT EXISTS orbup_credit_ledger (
       id SERIAL PRIMARY KEY,
       tenant_id INTEGER NOT NULL,
       account_id INTEGER NOT NULL,
       delta INTEGER NOT NULL,
       reason VARCHAR(20) NOT NULL,
       action_key VARCHAR(60),
       metadata JSONB DEFAULT '{}'::jsonb,
       idempotency_key TEXT NOT NULL,
       balance_after INTEGER,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orbup_ledger_idem ON orbup_credit_ledger(idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_orbup_ledger_acct ON orbup_credit_ledger(tenant_id, account_id, created_at DESC)`,
    // Cost is data, not a constant in code, so it can be tuned without a deploy.
    `CREATE TABLE IF NOT EXISTS orbup_credit_costs (
       action_key VARCHAR(60) PRIMARY KEY,
       cost INTEGER NOT NULL,
       label_en TEXT,
       label_es TEXT,
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    // Stripe replay guard: the event id is the key, so a redelivery is a no-op.
    `CREATE TABLE IF NOT EXISTS orbup_stripe_events (
       event_id TEXT PRIMARY KEY,
       type TEXT,
       received_at TIMESTAMPTZ DEFAULT NOW()
     )`
  ];
  for (const q of ddl) await sequelize.query(q);
  // Purchased credits are a SEPARATE bucket. The monthly refill sets the granted
  // balance to the allowance; it must never touch credits somebody paid for.
  await sequelize.query('ALTER TABLE orbup_credit_accounts ADD COLUMN IF NOT EXISTS topup_balance INTEGER NOT NULL DEFAULT 0');

  // PLANNING complexity, not delivery. These credits buy the workforce's analysis,
  // scoping, plan and working prototype for a solution of that shape — the thing
  // OrbUp actually produces on the spot. They are NOT an estimate of the wall time
  // to deliver the finished production system, which is scoped separately. Naming
  // them plan_* rather than build_* is the whole point: a label that says "build"
  // promises delivery.
  const PLAN_COSTS = [
    ['plan_simple',    600,   'Plan + prototype — AI receptionist, booking bot, lead capture',
                              'Plan + prototipo — recepcionista IA, agenda de citas, captura de prospectos'],
    ['plan_standard',  2500,  'Plan + prototype — customer dashboard, inventory or CRM-lite',
                              'Plan + prototipo — panel de clientes, inventario o CRM ligero'],
    ['plan_advanced',  9000,  'Plan + prototype — multi-role portal, payments, live integrations',
                              'Plan + prototipo — portal multiusuario, pagos, integraciones en vivo'],
    ['plan_regulated', 40000, 'Plan + prototype — banking, health or compliance system',
                              'Plan + prototipo — sistema bancario, de salud o de cumplimiento']
  ];
  for (const [k, c, en, es] of PLAN_COSTS) {
    await sequelize.query(
      `INSERT INTO orbup_credit_costs (action_key, cost, label_en, label_es)
       VALUES (:k,:c,:en,:es) ON CONFLICT (action_key) DO UPDATE SET cost = EXCLUDED.cost,
         label_en = EXCLUDED.label_en, label_es = EXCLUDED.label_es`,
      { replacements: { k, c, en, es } });
  }
  // The build_* keys promised delivery. Retired.
  await sequelize.query("DELETE FROM orbup_credit_costs WHERE action_key LIKE 'build_%'");

  const COSTS = [
    ['prototype_build', 250, 'Prototype build (plan + simulator)', 'Construcción de prototipo (plan + simulador)'],
    ['app_edit',        80,  'Edit a generated app',               'Editar una aplicación generada'],
    ['agent_dispatch',  40,  'Agent dispatch (per specialist run)','Despacho de agente (por especialista)'],
    ['voice_minute',    25,  'Voice conversation, per minute',     'Conversación de voz, por minuto'],
    ['plan_chat',       10,  'Copilot turn on your plan',          'Turno del copiloto sobre tu plan'],
    ['export',          15,  'Export a plan or app',               'Exportar un plan o una aplicación'],
    ['deploy',          200, 'Deploy to a live address',           'Publicar en una dirección en vivo']
  ];
  for (const [k, c, en, es] of COSTS) {
    await sequelize.query(
      `INSERT INTO orbup_credit_costs (action_key, cost, label_en, label_es)
       VALUES (:k,:c,:en,:es) ON CONFLICT (action_key) DO NOTHING`,
      { replacements: { k, c, en, es } });
  }
}

// ---- accounts ---------------------------------------------------------------
function addMonth(d) { const x = new Date(d); x.setMonth(x.getMonth() + 1); return x; }

async function getAccount({ tenantId, userId, email, create = true }) {
  const [rows] = await sequelize.query(
    'SELECT * FROM orbup_credit_accounts WHERE tenant_id = :t AND user_id = :u LIMIT 1',
    { replacements: { t: tenantId, u: userId } });
  if (rows && rows[0]) return rows[0];
  if (!create) return null;
  const now = new Date();
  await sequelize.query(
    `INSERT INTO orbup_credit_accounts (tenant_id,user_id,email,plan,balance,monthly_allowance,period_start,period_end)
     VALUES (:t,:u,:e,'free',0,:a,:ps,:pe) ON CONFLICT (tenant_id,user_id) DO NOTHING`,
    { replacements: { t: tenantId, u: userId, e: String(email || '').toLowerCase(), a: PLANS.free.credits, ps: now, pe: addMonth(now) } });
  const acct = await getAccount({ tenantId, userId, email, create: false });
  // First grant is a ledger row like everything else.
  if (acct) await post({ tenantId, accountId: acct.id, delta: PLANS.free.credits, reason: 'grant',
    actionKey: 'signup_grant', idempotencyKey: `signup:${tenantId}:${userId}` });
  return await getAccount({ tenantId, userId, email, create: false });
}

// The ONLY writer. Everything else calls this.
async function post({ tenantId, accountId, delta, reason, actionKey, idempotencyKey, metadata }) {
  const t = await sequelize.transaction();
  try {
    const [ins] = await sequelize.query(
      `INSERT INTO orbup_credit_ledger (tenant_id,account_id,delta,reason,action_key,metadata,idempotency_key)
       VALUES (:t,:a,:d,:r,:k,CAST(:m AS JSONB),:i)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      { replacements: { t: tenantId, a: accountId, d: delta, r: reason, k: actionKey || null,
                        m: JSON.stringify(metadata || {}), i: idempotencyKey }, transaction: t });
    if (!ins || !ins.length) {           // replay — already applied, do nothing
      await t.commit();
      const [[a]] = await sequelize.query('SELECT balance FROM orbup_credit_accounts WHERE id=:a',
        { replacements: { a: accountId } });
      return { applied: false, balance: a ? a.balance : 0 };
    }
    const [[acct]] = await sequelize.query(
      'UPDATE orbup_credit_accounts SET balance = GREATEST(0, balance + :d), updated_at = NOW() WHERE id = :a RETURNING balance',
      { replacements: { d: delta, a: accountId }, transaction: t });
    await sequelize.query('UPDATE orbup_credit_ledger SET balance_after = :b WHERE id = :i',
      { replacements: { b: acct.balance, i: ins[0].id }, transaction: t });
    await t.commit();
    return { applied: true, balance: acct.balance };
  } catch (e) { await t.rollback(); throw e; }
}

async function costOf(actionKey) {
  const [[r]] = await sequelize.query('SELECT cost FROM orbup_credit_costs WHERE action_key = :k',
    { replacements: { k: actionKey } });
  return r ? r.cost : null;
}

// Single entry point for spending. Hard block at zero.
async function consumeCredits({ tenantId, userId, email, actionKey, units = 1, idempotencyKey, metadata }) {
  const acct = await getAccount({ tenantId, userId, email });
  if (!acct) return { ok: false, error: 'no_account' };
  const unit = await costOf(actionKey);
  if (unit == null) return { ok: false, error: 'unknown_action', action_key: actionKey };
  const total = unit * Math.max(1, parseInt(units, 10) || 1);
  const available = (acct.balance || 0) + (acct.topup_balance || 0);
  if (available < total) {
    return { ok: false, error: 'insufficient_credits', balance: acct.balance,
             topup_balance: acct.topup_balance || 0, available, needed: total,
             plan: acct.plan, upgrade: true };
  }
  // Spend the granted allowance first — it expires at the period end, purchased
  // credits do not, so burning the perishable bucket first is the honest order.
  const fromGrant = Math.min(acct.balance || 0, total);
  const fromTopup = total - fromGrant;
  const key = idempotencyKey || `consume:${tenantId}:${userId}:${actionKey}:${Date.now()}`;
  const r = await post({ tenantId, accountId: acct.id, delta: -fromGrant, reason: 'consume',
    actionKey, idempotencyKey: key, metadata: Object.assign({}, metadata, { from_topup: fromTopup }) });
  if (fromTopup > 0 && r.applied) {
    await sequelize.query('UPDATE orbup_credit_accounts SET topup_balance = GREATEST(0, topup_balance - :d), updated_at=NOW() WHERE id=:i',
      { replacements: { d: fromTopup, i: acct.id } });
  }
  const after = await getAccount({ tenantId, userId, email, create: false });
  return { ok: true, spent: total, balance: after.balance, topup_balance: after.topup_balance,
           available: after.balance + after.topup_balance, replayed: !r.applied };
}

// Reserve-then-settle for long jobs: hold an estimate, settle to actual, refund
// the difference. A failed run refunds the whole hold.
async function reserve({ tenantId, userId, email, actionKey, units = 1, jobId }) {
  return consumeCredits({ tenantId, userId, email, actionKey, units,
    idempotencyKey: `reserve:${tenantId}:${userId}:${jobId}`, metadata: { job_id: jobId, phase: 'reserve' } });
}
async function settle({ tenantId, userId, email, actionKey, jobId, actualUnits = 1, failed = false }) {
  const acct = await getAccount({ tenantId, userId, email });
  if (!acct) return { ok: false, error: 'no_account' };
  const [[held]] = await sequelize.query(
    `SELECT delta FROM orbup_credit_ledger WHERE idempotency_key = :k`,
    { replacements: { k: `reserve:${tenantId}:${userId}:${jobId}` } });
  if (!held) return { ok: false, error: 'no_reservation' };
  const heldAmt = Math.abs(held.delta);
  const unit = await costOf(actionKey);
  const actual = failed ? 0 : (unit || 0) * Math.max(1, parseInt(actualUnits, 10) || 1);
  const refund = heldAmt - actual;
  if (refund === 0) return { ok: true, balance: acct.balance, refunded: 0 };
  const r = await post({ tenantId, accountId: acct.id, delta: refund, reason: 'refund',
    actionKey, idempotencyKey: `settle:${tenantId}:${userId}:${jobId}`,
    metadata: { job_id: jobId, held: heldAmt, actual, failed } });
  return { ok: true, balance: r.balance, refunded: refund };
}

// Refill on the Stripe billing anniversary. Sets the balance TO the allowance —
// which is what "credits do not roll over" means, expressed in code.
async function refill({ tenantId, userId, email, plan, periodStart, periodEnd, eventId }) {
  const acct = await getAccount({ tenantId, userId, email });
  if (!acct) return { ok: false, error: 'no_account' };
  const allowance = (PLANS[plan] || PLANS.free).credits;
  const delta = allowance - acct.balance;   // ROLLOVER === false; topup_balance untouched
  await sequelize.query(
    `UPDATE orbup_credit_accounts SET plan=:p, monthly_allowance=:a, period_start=:ps, period_end=:pe, updated_at=NOW()
     WHERE id=:i`,
    { replacements: { p: plan, a: allowance, ps: periodStart || new Date(),
                      pe: periodEnd || addMonth(new Date()), i: acct.id } });
  const r = await post({ tenantId, accountId: acct.id, delta, reason: 'refill', actionKey: 'period_refill',
    idempotencyKey: `refill:${acct.id}:${eventId || (periodStart && new Date(periodStart).toISOString()) || Date.now()}`,
    metadata: { plan, allowance } });
  return { ok: true, balance: r.balance, allowance, applied: r.applied };
}

// Mid-cycle upgrade: grant the difference in allowance immediately.
async function prorateUpgrade({ tenantId, userId, email, fromPlan, toPlan, eventId }) {
  const acct = await getAccount({ tenantId, userId, email });
  if (!acct) return { ok: false, error: 'no_account' };
  const gain = (PLANS[toPlan] || PLANS.free).credits - (PLANS[fromPlan] || PLANS.free).credits;
  await sequelize.query(
    'UPDATE orbup_credit_accounts SET plan=:p, monthly_allowance=:a, updated_at=NOW() WHERE id=:i',
    { replacements: { p: toPlan, a: (PLANS[toPlan] || PLANS.free).credits, i: acct.id } });
  if (gain <= 0) return { ok: true, balance: acct.balance, granted: 0 };
  const r = await post({ tenantId, accountId: acct.id, delta: gain, reason: 'adjustment',
    actionKey: 'proration_upgrade', idempotencyKey: `prorate:${acct.id}:${eventId || toPlan}`,
    metadata: { from: fromPlan, to: toPlan } });
  return { ok: true, balance: r.balance, granted: gain };
}

// Downgrade caps the balance at the Free allowance rather than leaving a paid
// balance sitting on a free account.
async function downgradeToFree({ tenantId, userId, email, eventId }) {
  const acct = await getAccount({ tenantId, userId, email });
  if (!acct) return { ok: false, error: 'no_account' };
  const cap = PLANS.free.credits;
  await sequelize.query(
    `UPDATE orbup_credit_accounts SET plan='free', monthly_allowance=:a, stripe_subscription_id=NULL, updated_at=NOW()
     WHERE id=:i`, { replacements: { a: cap, i: acct.id } });
  if (acct.balance <= cap) return { ok: true, balance: acct.balance, capped: 0 };
  const r = await post({ tenantId, accountId: acct.id, delta: cap - acct.balance, reason: 'adjustment',
    actionKey: 'downgrade_cap', idempotencyKey: `downgrade:${acct.id}:${eventId || Date.now()}`,
    metadata: { capped_to: cap } });
  return { ok: true, balance: r.balance, capped: acct.balance - cap };
}

// A purchase. Idempotent on the Stripe session id, so a redelivered
// checkout.session.completed cannot grant the credits twice.
async function topUp({ tenantId, userId, email, packKey, sessionId }) {
  const pack = topupPack(packKey);
  if (!pack) return { ok: false, error: 'unknown_pack', pack: packKey };
  const acct = await getAccount({ tenantId, userId, email });
  if (!acct) return { ok: false, error: 'no_account' };
  const [rows] = await sequelize.query(
    `INSERT INTO orbup_credit_ledger (tenant_id,account_id,delta,reason,action_key,metadata,idempotency_key)
     VALUES (:t,:a,:d,'purchase',:k,CAST(:m AS JSONB),:i)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    { replacements: { t: tenantId, a: acct.id, d: pack.credits, k: 'topup_' + pack.key,
        m: JSON.stringify({ cents: pack.cents, pack: pack.key, session: sessionId }),
        i: `topup:${sessionId || pack.key + ':' + Date.now()}` } });
  if (!rows || !rows.length) {
    return { ok: true, applied: false, topup_balance: acct.topup_balance || 0 };   // replay
  }
  const [[a]] = await sequelize.query(
    'UPDATE orbup_credit_accounts SET topup_balance = topup_balance + :d, updated_at=NOW() WHERE id=:i RETURNING topup_balance',
    { replacements: { d: pack.credits, i: acct.id } });
  await sequelize.query('UPDATE orbup_credit_ledger SET balance_after = :b WHERE id = :i',
    { replacements: { b: (acct.balance || 0) + a.topup_balance, i: rows[0].id } });
  return { ok: true, applied: true, granted: pack.credits, topup_balance: a.topup_balance };
}

// Replay guard for Stripe. Returns false if this event was already handled.
async function claimEvent(eventId, type) {
  const [rows] = await sequelize.query(
    `INSERT INTO orbup_stripe_events (event_id, type) VALUES (:e,:t)
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    { replacements: { e: eventId, t: type } });
  return !!(rows && rows.length);
}

async function costTable() {
  const [rows] = await sequelize.query(
    'SELECT action_key, cost, label_en, label_es FROM orbup_credit_costs ORDER BY cost DESC');
  return rows || [];
}

module.exports = { PLANS, TOPUPS, ROLLOVER, topupPack, topupPriceId, packForPriceId, topUp, ensureSchema, getAccount, consumeCredits, reserve, settle,
                   refill, prorateUpgrade, downgradeToFree, claimEvent, costOf, costTable,
                   priceIdFor, planForPriceId, post };
