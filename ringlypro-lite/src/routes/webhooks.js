'use strict';

/**
 * Stripe webhook (raw body required for signature verification).
 * Mounted with express.raw in app.js BEFORE the JSON body parser.
 * Payment-state → tenant.subscription_status; failed payment suspends answering
 * (fallback voicemail) but never releases the DID.
 */
const express = require('express');
const router = express.Router();
const { Tenant, Recharge } = require('../models');
const minutesSvc = require('../services/minutes');

function stripe() {
  const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  return require('stripe')(key);
}

async function tenantFromEvent(obj) {
  const tid = obj.metadata && obj.metadata.tenant_id;
  if (tid) return Tenant.findByPk(Number(tid));
  if (obj.customer) return Tenant.findOne({ where: { stripe_customer_id: obj.customer } });
  return null;
}

/**
 * Credit the outbound add-on. Idempotent on Stripe's own EVENT id via a
 * unique index: a webhook retry — which Stripe does routinely — must credit
 * once. The INSERT is what claims the event, so two concurrent deliveries
 * cannot both get past it.
 *
 * The amount is read from the PAYMENT ROW we created, not from the event, and
 * cross-checked against it. A session whose metadata names another tenant
 * therefore credits nobody.
 */
async function handleOutbound(tenant, obj, event, kind) {
  const billing = require('../services/outboundBilling');
  const notify = require('../services/notify');
  const { sequelize } = require('../models');

  const [claimed] = await sequelize.query(
    `UPDATE lite_outbound_payments
        SET status = 'paid', confirmed_at = NOW(), stripe_event_id = :e
      WHERE stripe_session_id = :s AND tenant_id = :t AND status <> 'paid'
      RETURNING id, kind, amount_cents`,
    { replacements: { s: obj.id, t: tenant.id, e: event.id } }
  ).catch((e) => {
    // The unique index on stripe_event_id fired: this event already applied.
    if (/uq_lite_ob_pay_event|duplicate key/i.test(String(e.message || e))) return [[]];
    throw e;
  });
  if (!claimed || !claimed.length) { console.log('[lite:webhook] outbound payment already applied'); return; }

  const row = claimed[0];
  const amount = Number(row.amount_cents) || 0;
  // Belt and braces: Stripe's own figure must match what we asked for.
  if (Number(obj.amount_total) && Number(obj.amount_total) !== amount) {
    console.warn('[lite:webhook] outbound amount mismatch', obj.amount_total, 'vs', amount);
  }

  if (kind === 'lite_outbound_topup' || row.kind === 'credit') {
    await billing.credit(tenant.id, amount);
    await notify.notify(tenant.id, 'outbound_funded', 'Funds added',
      `$${(amount / 100).toFixed(2)} added to your outbound balance.`);
    return;
  }

  // Setup fee. Move the state, promise a time, tell both sides.
  const due = new Date(Date.now() + billing.slaHours() * 3600 * 1000);
  const moved = await billing.transition(tenant.id,
    ['off', 'awaiting_setup_payment', 'failed_setup'], 'pending_setup',
    { outbound_setup_paid_at: new Date(), outbound_setup_due_at: due, outbound_state_reason: null });
  if (!moved.moved) {
    // A SECOND SETUP FEE IS MONEY WE ARE HOLDING FOR NOTHING. Two tabs, or a
    // double tap, can mint two Checkout sessions; if both get paid the first
    // moves the state and the second used to return here silently, keeping
    // the $20. It is raised on both surfaces so it is refunded, not found in
    // an audit months later.
    console.warn('[lite:webhook] DUPLICATE outbound setup fee for tenant', tenant.id, '— refund due');
    await notify.notify(tenant.id, 'outbound_duplicate_fee', 'Duplicate setup fee',
      'You were charged the setup fee twice. We have been notified and will refund it.');
    await notify.email({ to: notify.ownerEmail(),
      subject: `[RinglyPro Lite] REFUND DUE — duplicate setup fee, tenant ${tenant.id}`,
      text: `Tenant ${tenant.id} paid the outbound setup fee twice.\nStripe session: ${obj.id}\nAmount: ${amount}c\nRefund it in Stripe.` }).catch(() => {});
    return;
  }

  // THE DASHBOARD ROW FIRST. It cannot fail, so the client always learns
  // where they stand even with no mail transport configured.
  await notify.notify(tenant.id, 'outbound_setup_paid', 'Outbound setup paid',
    `Your outbound caller will be ready by ${due.toISOString()}. We will let you know the moment it is live.`);

  // Then the owner's email, best effort and OUTSIDE anything transactional:
  // a mail failure must never undo a payment Stripe has already taken.
  await notify.ownerSetupPaid(tenant, due).catch(() => {});
}

router.post('/stripe', async (req, res) => {
  const secret = process.env.LITE_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (secret) {
      const sig = req.headers['stripe-signature'];
      event = stripe().webhooks.constructEvent(req.body, sig, secret);
    } else {
      event = JSON.parse(req.body.toString('utf8'));  // dev only
      event.__unsigned = true;
    }
  } catch (e) {
    console.error('[lite:webhook] signature error:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        const tenant = await tenantFromEvent(obj);
        if (!tenant) break;

        // OUTBOUND ADD-ON. The ONLY place 'paid' is ever written for it — the
        // Stripe return URL says "confirming" and nothing more.
        const kind = obj.metadata && obj.metadata.kind;
        if (kind === 'lite_outbound_setup' || kind === 'lite_outbound_topup') {
          // AN UNSIGNED EVENT MAY NEVER MOVE MONEY.
          // With no webhook secret set, this endpoint is unauthenticated: a
          // client can open a Checkout session, never pay it, POST a forged
          // "completed" event naming their own session id, and credit
          // themselves any amount. The subscription branch below predates
          // this change and is left alone, but the wallet is new and refuses.
          if (event.__unsigned) {
            console.error('[lite:webhook] REFUSED an unsigned outbound payment event — set STRIPE_WEBHOOK_SECRET');
            return res.status(503).json({ error: 'webhook_signature_required' });
          }
          // A delayed-payment session can complete UNPAID. Treating that as
          // paid credits a wallet for money that has not arrived.
          if (obj.payment_status !== 'paid') { console.log('[lite:webhook] outbound session not paid yet'); break; }
          await handleOutbound(tenant, obj, event, kind);
          break;
        }

        // Recharge (one-time minutes top-up) — credit prepaid minutes once.
        if (obj.metadata && obj.metadata.kind === 'recharge') {
          tenant.stripe_customer_id = obj.customer || tenant.stripe_customer_id;
          const rid = Number(obj.metadata.recharge_id);
          const rec = rid ? await Recharge.findByPk(rid) : null;
          if (rec && rec.status !== 'succeeded') {
            rec.status = 'succeeded';
            rec.stripe_payment_intent = obj.payment_intent || rec.stripe_payment_intent;
            await rec.save();
            await minutesSvc.creditMinutes(tenant, Number(rec.minutes) || 0);
          } else if (!rec) {
            await minutesSvc.creditMinutes(tenant, Number(obj.metadata.minutes) || 0);
            await tenant.save();
          }
          break;
        }
        // Subscription checkout.
        tenant.stripe_customer_id = obj.customer || tenant.stripe_customer_id;
        tenant.stripe_subscription_id = obj.subscription || tenant.stripe_subscription_id;
        tenant.subscription_status = 'active';
        tenant.suspended_at = null;
        await tenant.save();
        break;
      }
      // A DELAYED PAYMENT (ACH, some wallets) completes UNPAID and succeeds
      // later. Without this the client pays and is never credited, with
      // nothing recording that they are owed anything.
      case 'checkout.session.async_payment_succeeded': {
        const tenant = await tenantFromEvent(obj);
        const kind2 = obj.metadata && obj.metadata.kind;
        if (tenant && (kind2 === 'lite_outbound_setup' || kind2 === 'lite_outbound_topup')) {
          if (event.__unsigned) return res.status(503).json({ error: 'webhook_signature_required' });
          if (obj.payment_status === 'paid') await handleOutbound(tenant, obj, event, kind2);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const tenant = await tenantFromEvent(obj);
        if (tenant) {
          tenant.subscription_status = obj.status;  // trialing|active|past_due|canceled|unpaid
          if (obj.status === 'active' || obj.status === 'trialing') tenant.suspended_at = null;
          await tenant.save();
        }
        break;
      }
      case 'invoice.payment_failed': {
        const tenant = await tenantFromEvent(obj);
        if (tenant) {
          tenant.subscription_status = 'past_due';
          tenant.suspended_at = new Date();  // suspend answering; keep DID
          await tenant.save();
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const tenant = await tenantFromEvent(obj);
        if (tenant) {
          tenant.subscription_status = 'canceled';
          tenant.suspended_at = new Date();
          // DID retained for 30 days per policy — a scheduled job (not v1) releases it.
          await tenant.save();
        }
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error('[lite:webhook] handler error:', e.message);
  }
  res.json({ received: true });
});

module.exports = router;
