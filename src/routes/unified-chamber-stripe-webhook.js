/**
 * Server-to-server Stripe webhook for member-signup checkout completion.
 *
 * Mounted at /api/stripe/member-webhook in src/app.js with express.raw() so
 * the signature verification works on the unmodified request body.
 *
 * On checkout.session.completed where metadata.flow == 'member_signup':
 *   - Mark members.status = 'active'
 *   - Record stripe_customer_id + stripe_subscription_id
 *   - Insert a row into transactions
 *
 * On invoice.payment_succeeded for ongoing monthly billing:
 *   - Insert a transactions row (recurring_charge)
 *
 * On customer.subscription.deleted:
 *   - Mark members.status = 'suspended' (lapsed subscription)
 */
const express = require('express');
const router = express.Router();
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

router.post('/member-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey) return res.status(500).send('Stripe not configured');
  const stripe = require('stripe')(stripeKey);

  let event;
  try {
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (err) {
    console.error('[stripe member-webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};
      if (meta.flow !== 'member_signup') {
        return res.json({ received: true, skipped: 'not member_signup' });
      }
      const memberId = parseInt(meta.member_id);
      const chamberId = parseInt(meta.chamber_id);
      if (!memberId || !chamberId) {
        return res.json({ received: true, skipped: 'missing metadata' });
      }
      if (session.payment_status !== 'paid') {
        return res.json({ received: true, skipped: `payment_status=${session.payment_status}` });
      }

      await sequelize.query(
        `UPDATE members
         SET status = 'active',
             stripe_customer_id = :cust,
             stripe_subscription_id = :sub,
             updated_at = NOW()
         WHERE chamber_id = :c AND id = :id AND status = 'pending_payment'`,
        {
          replacements: {
            c: chamberId, id: memberId,
            cust: session.customer || null,
            sub: session.subscription || null
          }
        }
      );
      await sequelize.query(
        `INSERT INTO transactions
         (chamber_id, type, from_member_id, amount, currency, status, description, created_at)
         VALUES (:c, 'membership_signup', :m, :amt, 'USD', 'completed', :desc, NOW())
         ON CONFLICT DO NOTHING`,
        {
          replacements: {
            c: chamberId, m: memberId,
            amt: (session.amount_total || 3500) / 100,
            desc: `Stripe checkout completed -- session ${session.id}`
          }
        }
      ).catch(() => {});
      console.log(`[stripe member-webhook] activated member ${memberId} in chamber ${chamberId}`);
      return res.json({ received: true, activated: memberId });
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      if (!subId) return res.json({ received: true });
      const [member] = await sequelize.query(
        `SELECT id, chamber_id FROM members WHERE stripe_subscription_id = :s LIMIT 1`,
        { replacements: { s: subId }, type: QueryTypes.SELECT }
      );
      if (member) {
        await sequelize.query(
          `INSERT INTO transactions
           (chamber_id, type, from_member_id, amount, currency, status, description, created_at)
           VALUES (:c, 'recurring_charge', :m, :amt, 'USD', 'completed', :desc, NOW())`,
          {
            replacements: {
              c: member.chamber_id, m: member.id,
              amt: (invoice.amount_paid || 0) / 100,
              desc: `Recurring charge -- invoice ${invoice.id}`
            }
          }
        ).catch(() => {});
      }
      return res.json({ received: true });
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await sequelize.query(
        `UPDATE members SET status = 'suspended', updated_at = NOW()
         WHERE stripe_subscription_id = :s`,
        { replacements: { s: sub.id } }
      );
      console.log(`[stripe member-webhook] suspended members on cancelled sub ${sub.id}`);
      return res.json({ received: true });
    }

    return res.json({ received: true, ignored: event.type });
  } catch (err) {
    console.error('[stripe member-webhook] handler error:', err.message);
    return res.status(500).send(err.message);
  }
});

module.exports = router;
