'use strict';

/**
 * Lawn Co-Pilot — inbound webhooks
 * Stripe (signature-verified, idempotent on event id) and Twilio SMS
 * (STOP/HELP updates consent immediately).
 */

const express = require('express');
const router = express.Router();

const { Payment, Invoice, Customer, Message, Ticket } = require('../models');
const acct = require('../services/accounting');

const TENANT = () => Number(process.env.LAWNCOPILOT_TENANT_ID || 1);

/**
 * Stripe. Raw body is required for signature verification, so this route is
 * mounted with express.raw() upstream in index.js.
 */
router.post('/stripe', async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  if (secret && acct.stripeEnabled()) {
    try {
      const s = acct.stripe();
      event = s.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch (e) {
      return res.status(400).json({ error: `Signature verification failed: ${e.message}` });
    }
  } else {
    try {
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString()) : req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    if (process.env.NODE_ENV === 'production' && !secret) {
      return res.status(503).json({ error: 'Stripe webhook secret not configured' });
    }
  }

  const tenant_id = TENANT();

  // Idempotency: the same event id can arrive many times. One payment row.
  const existing = await Payment.findOne({ where: { tenant_id, stripe_event_id: event.id } });
  if (existing) return res.json({ received: true, duplicate: true });

  const obj = (event.data && event.data.object) || {};
  const meta = obj.metadata || {};
  const invoiceId = meta.invoice_id ? Number(meta.invoice_id) : null;

  try {
    if (event.type === 'payment_intent.succeeded') {
      const invoice = invoiceId ? await Invoice.findOne({ where: { id: invoiceId, tenant_id } }) : null;
      await Payment.create({
        tenant_id,
        customer_id: invoice ? invoice.customer_id : null,
        invoice_id: invoiceId,
        amount_cents: obj.amount_received || obj.amount || 0,
        status: 'succeeded',
        stripe_payment_intent_id: obj.id,
        stripe_event_id: event.id,
        processed_at: new Date()
      });
      if (invoice) {
        invoice.amount_paid_cents += (obj.amount_received || obj.amount || 0);
        invoice.status = invoice.amount_paid_cents >= invoice.total_cents ? 'paid' : 'open';
        invoice.paid_at = invoice.status === 'paid' ? new Date() : null;
        await invoice.save();
        await Customer.increment(
          { balance_cents: -(obj.amount_received || obj.amount || 0) },
          { where: { id: invoice.customer_id, tenant_id } }
        );
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const invoice = invoiceId ? await Invoice.findOne({ where: { id: invoiceId, tenant_id } }) : null;
      await Payment.create({
        tenant_id,
        customer_id: invoice ? invoice.customer_id : null,
        invoice_id: invoiceId,
        amount_cents: obj.amount || 0,
        status: 'failed',
        failure_reason: (obj.last_payment_error && obj.last_payment_error.message) || 'declined',
        stripe_payment_intent_id: obj.id,
        stripe_event_id: event.id,
        processed_at: new Date()
      });
      if (invoice) {
        invoice.status = 'failed';
        invoice.dunning_stage = (invoice.dunning_stage || 0) + 1;
        await invoice.save();
      }
    } else {
      // Record the event id so replays of unhandled types stay idempotent too.
      await Payment.create({
        tenant_id, amount_cents: 0, status: 'pending',
        stripe_event_id: event.id, failure_reason: `unhandled:${event.type}`
      });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.json({ received: true, type: event.type });
});

/**
 * Twilio inbound SMS. STOP/HELP are handled before anything else.
 */
router.post('/twilio-sms', express.urlencoded({ extended: false }), async (req, res) => {
  const from = req.body.From;
  const body = String(req.body.Body || '').trim();
  const tenant_id = TENANT();

  const digits = String(from || '').replace(/\D/g, '').slice(-10);
  const customers = await Customer.findAll({ where: { tenant_id }, raw: true });
  const match = customers.find(c => String(c.phone || '').replace(/\D/g, '').slice(-10) === digits);

  const reply = (msg) => res.type('text/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`
  );

  if (/^(stop|unsubscribe|cancel|end|quit)$/i.test(body)) {
    if (match) {
      await Customer.update(
        { consent: { ...(match.consent || {}), sms_transactional: false, sms_marketing: false } },
        { where: { id: match.id, tenant_id } }
      );
    }
    return reply('You are unsubscribed and will not receive further texts. Reply START to opt back in.');
  }
  if (/^(start|unstop|yes)$/i.test(body)) {
    if (match) {
      await Customer.update(
        { consent: { ...(match.consent || {}), sms_transactional: true } },
        { where: { id: match.id, tenant_id } }
      );
    }
    return reply('You are opted back in for service texts.');
  }
  if (/^help$/i.test(body)) {
    return reply('Lawn Co-Pilot: reply STOP to unsubscribe. For service questions call us or visit your portal.');
  }

  if (match) {
    await Message.create({
      tenant_id, customer_id: match.id, direction: 'inbound',
      author: match.name, body
    });
    await Ticket.create({
      tenant_id, customer_id: match.id, type: 'message',
      subject: `Text from ${match.name}`, body, source: 'phone', status: 'open'
    });
    return reply('Got it. Someone will get back to you shortly.');
  }

  await Ticket.create({
    tenant_id, type: 'message',
    subject: `Text from ${from}`, body, source: 'phone', status: 'open'
  });
  reply('Thanks for reaching out. Someone will get back to you shortly.');
});

module.exports = router;
