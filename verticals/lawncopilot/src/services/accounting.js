'use strict';

/**
 * Lawn Co-Pilot — accounting (the Administrator's books)
 *
 * Per-visit invoicing is the default: lawn care bills on service delivery, not
 * on the calendar. Stripe is the system of record for money movement; these
 * tables mirror it for portal display and reporting.
 *
 * NO card data ever lands here. Stripe ids + brand/last4/exp only.
 */

const { Op } = require('sequelize');
const {
  Invoice, InvoiceLineItem, Payment, PaymentMethod, AutopayEnrollment,
  Customer, ServiceRecord, Appointment
} = require('../models');
const { notify } = require('./notify');

const stripeKey = () => process.env.STRIPE_SECRET_KEY || null;
const stripeEnabled = () => !!stripeKey();

let _stripe = null;
function stripe() {
  if (!stripeEnabled()) return null;
  if (_stripe) return _stripe;
  try {
    const Stripe = require('stripe');
    _stripe = new Stripe(stripeKey(), { apiVersion: '2024-06-20' });
    return _stripe;
  } catch (e) {
    return null;
  }
}

function money(cents) { return `$${(Number(cents || 0) / 100).toFixed(2)}`; }

async function nextInvoiceNumber(tenant_id) {
  const count = await Invoice.count({ where: { tenant_id } });
  const year = new Date().getFullYear();
  return `LC-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Issue an invoice for a completed visit.
 */
async function issueInvoice({ tenant_id, customer_id, service_record_id, lines, due_days = 7 }) {
  const items = (lines && lines.length) ? lines : [{ label: 'Lawn service', amount_cents: 0 }];
  const subtotal = items.reduce((a, l) => a + (l.amount_cents || 0), 0);
  const tax = items.filter(l => l.kind === 'tax').reduce((a, l) => a + l.amount_cents, 0);

  const invoice = await Invoice.create({
    tenant_id, customer_id, service_record_id,
    number: await nextInvoiceNumber(tenant_id),
    status: 'open',
    subtotal_cents: subtotal - tax,
    tax_cents: tax,
    total_cents: subtotal,
    issued_at: new Date(),
    due_at: new Date(Date.now() + due_days * 86400000)
  });

  await InvoiceLineItem.bulkCreate(items.map((l, i) => ({
    tenant_id, invoice_id: invoice.id,
    label: l.label, detail: l.detail || null,
    amount_cents: l.amount_cents || 0, sort_order: l.sort_order || i * 10
  })));

  await Customer.increment({ balance_cents: subtotal }, { where: { id: customer_id, tenant_id } });

  const customer = await Customer.findOne({ where: { id: customer_id, tenant_id }, raw: true });
  await notify({
    tenant_id, customer_id, channel: 'email', template: 'invoice_issued',
    vars: {
      name: (customer && customer.name) || 'there',
      invoice_number: invoice.number,
      amount: money(subtotal),
      date_display: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
      due_display: invoice.due_at.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
      portal_url: portalUrl()
    }
  });

  // Autopay: schedule the charge rather than hitting the card instantly.
  const enrollment = await AutopayEnrollment.findOne({
    where: { tenant_id, customer_id, status: 'active' }, raw: true
  });
  if (enrollment) {
    const delay = Number(process.env.LAWNCOPILOT_AUTOPAY_DELAY_DAYS || 1);
    const chargeAt = new Date(Date.now() + delay * 86400000);
    await AutopayEnrollment.update({ next_charge_at: chargeAt }, { where: { id: enrollment.id } });
    const pm = enrollment.payment_method_id
      ? await PaymentMethod.findOne({ where: { id: enrollment.payment_method_id, tenant_id }, raw: true })
      : null;
    await notify({
      tenant_id, customer_id, channel: 'email', template: 'autopay_advance_notice',
      vars: {
        name: (customer && customer.name) || 'there',
        last4: (pm && pm.last4) || 'on file',
        amount: money(subtotal),
        date_display: chargeAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        invoice_number: invoice.number,
        portal_url: portalUrl()
      }
    });
  }

  return { success: true, invoice: invoice.toJSON(), autopay_scheduled: !!enrollment };
}

function portalUrl() {
  return (process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com') + '/lawncopilot/portal';
}

/**
 * Take a payment. Uses Stripe when configured; otherwise records the intent and
 * reports honestly that payments are not configured — never fakes a success.
 */
async function takePayment({ tenant_id, customer_id, invoice_id, payment_method_id, amount_cents }) {
  const invoice = await Invoice.findOne({ where: { id: invoice_id, tenant_id } });
  if (!invoice) return { success: false, error: 'Invoice not found' };
  if (invoice.status === 'paid') return { success: false, error: 'Invoice is already paid' };

  const amount = amount_cents || (invoice.total_cents - invoice.amount_paid_cents);
  if (amount <= 0) return { success: false, error: 'Nothing due on this invoice' };

  if (!stripeEnabled()) {
    await Payment.create({
      tenant_id, customer_id, invoice_id, amount_cents: amount,
      status: 'failed', failure_reason: 'payments_not_configured'
    });
    return { success: false, error: 'Payments are not configured for this account yet.', payments_disabled: true };
  }

  const customer = await Customer.findOne({ where: { id: customer_id, tenant_id }, raw: true });
  const pm = payment_method_id
    ? await PaymentMethod.findOne({ where: { id: payment_method_id, tenant_id }, raw: true })
    : await PaymentMethod.findOne({ where: { tenant_id, customer_id, is_default: true }, raw: true });

  if (!pm) return { success: false, error: 'No payment method on file' };

  try {
    const s = stripe();
    const intent = await s.paymentIntents.create({
      amount, currency: 'usd',
      customer: customer.stripe_customer_id || undefined,
      payment_method: pm.stripe_payment_method_id,
      off_session: true, confirm: true,
      metadata: { tenant_id: String(tenant_id), invoice_id: String(invoice_id), invoice_number: invoice.number }
    });

    const ok = intent.status === 'succeeded';
    await Payment.create({
      tenant_id, customer_id, invoice_id, amount_cents: amount,
      status: ok ? 'succeeded' : 'failed',
      method: `${pm.brand} ${pm.last4}`,
      stripe_payment_intent_id: intent.id,
      failure_reason: ok ? null : intent.status,
      processed_at: new Date()
    });

    if (ok) {
      invoice.amount_paid_cents += amount;
      invoice.status = invoice.amount_paid_cents >= invoice.total_cents ? 'paid' : 'open';
      invoice.paid_at = invoice.status === 'paid' ? new Date() : null;
      await invoice.save();
      await Customer.increment({ balance_cents: -amount }, { where: { id: customer_id, tenant_id } });
      await notify({
        tenant_id, customer_id, channel: 'email', template: 'payment_receipt',
        vars: { name: customer.name, amount: money(amount), invoice_number: invoice.number, method: `${pm.brand} ending ${pm.last4}` }
      });
      return { success: true, payment_intent: intent.id, amount_cents: amount, invoice_status: invoice.status };
    }
    return { success: false, error: `Payment ${intent.status}` };
  } catch (e) {
    await Payment.create({
      tenant_id, customer_id, invoice_id, amount_cents: amount,
      status: 'failed', failure_reason: e.message, processed_at: new Date()
    });
    invoice.status = 'failed';
    invoice.dunning_stage = (invoice.dunning_stage || 0) + 1;
    await invoice.save();
    await notify({
      tenant_id, customer_id, channel: 'email', template: 'payment_failed',
      vars: {
        name: (customer && customer.name) || 'there', amount: money(amount),
        invoice_number: invoice.number, reason: e.message, portal_url: portalUrl()
      }
    });
    return { success: false, error: e.message };
  }
}

/**
 * Dunning. Retries on a 3/5/7-day ladder, then flags the account for a HUMAN
 * decision. Never silently cancels service.
 */
async function runDunning({ tenant_id }) {
  const ladder = [3, 5, 7];
  const failed = await Invoice.findAll({
    where: { tenant_id, status: 'failed', dunning_stage: { [Op.lt]: ladder.length + 1 } }, raw: true
  });
  const results = [];
  for (const inv of failed) {
    const stage = inv.dunning_stage || 1;
    const daysSince = (Date.now() - new Date(inv.issued_at).getTime()) / 86400000;
    if (stage > ladder.length) {
      await Customer.update({ status: 'flagged' }, { where: { id: inv.customer_id, tenant_id } });
      results.push({ invoice: inv.number, action: 'flagged_for_human_review' });
      continue;
    }
    if (daysSince < ladder[stage - 1]) { results.push({ invoice: inv.number, action: 'waiting' }); continue; }
    const r = await takePayment({ tenant_id, customer_id: inv.customer_id, invoice_id: inv.id });
    results.push({ invoice: inv.number, action: r.success ? 'recovered' : 'retry_failed' });
  }
  return { success: true, processed: results.length, results };
}

// ── Reports (what the owner actually looks at) ─────────────────────────────
async function arAging({ tenant_id }) {
  const open = await Invoice.findAll({ where: { tenant_id, status: { [Op.in]: ['open', 'failed'] } }, raw: true });
  const buckets = { current: 0, d30: 0, d60: 0, d90plus: 0 };
  const now = Date.now();
  open.forEach(i => {
    const days = (now - new Date(i.due_at || i.issued_at).getTime()) / 86400000;
    const owed = i.total_cents - i.amount_paid_cents;
    if (days <= 0) buckets.current += owed;
    else if (days <= 30) buckets.d30 += owed;
    else if (days <= 60) buckets.d60 += owed;
    else buckets.d90plus += owed;
  });
  return {
    success: true, open_invoices: open.length,
    total_outstanding_cents: Object.values(buckets).reduce((a, b) => a + b, 0),
    buckets,
    display: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, money(v)]))
  };
}

async function revenueReport({ tenant_id, days = 30 }) {
  const since = new Date(Date.now() - days * 86400000);
  const payments = await Payment.findAll({
    where: { tenant_id, status: 'succeeded', processed_at: { [Op.gte]: since } }, raw: true
  });
  const invoices = await Invoice.findAll({ where: { tenant_id, issued_at: { [Op.gte]: since } }, raw: true });
  const jobs = await ServiceRecord.count({ where: { tenant_id, completed_at: { [Op.gte]: since } } });
  const collected = payments.reduce((a, p) => a + p.amount_cents, 0);
  const billed = invoices.reduce((a, i) => a + i.total_cents, 0);
  return {
    success: true, period_days: days,
    collected_cents: collected, billed_cents: billed,
    jobs_completed: jobs,
    average_ticket_cents: jobs ? Math.round(billed / jobs) : 0,
    collection_rate: billed ? Number((collected / billed).toFixed(3)) : 0,
    display: { collected: money(collected), billed: money(billed), average_ticket: money(jobs ? billed / jobs : 0) }
  };
}

/**
 * Tax-ready export. QuickBooks-shaped CSV.
 */
async function exportBooks({ tenant_id, days = 365 }) {
  const since = new Date(Date.now() - days * 86400000);
  const invoices = await Invoice.findAll({
    where: { tenant_id, issued_at: { [Op.gte]: since } },
    order: [['issued_at', 'ASC']], raw: true
  });
  const customers = await Customer.findAll({ where: { tenant_id }, raw: true });
  const byId = {}; customers.forEach(c => { byId[c.id] = c; });

  const header = 'InvoiceNumber,Date,Customer,Email,Subtotal,Tax,Total,AmountPaid,Status';
  const rows = invoices.map(i => [
    i.number,
    new Date(i.issued_at).toISOString().slice(0, 10),
    csv((byId[i.customer_id] || {}).name),
    csv((byId[i.customer_id] || {}).email),
    (i.subtotal_cents / 100).toFixed(2),
    (i.tax_cents / 100).toFixed(2),
    (i.total_cents / 100).toFixed(2),
    (i.amount_paid_cents / 100).toFixed(2),
    i.status
  ].join(','));
  return { success: true, rows: rows.length, csv: [header, ...rows].join('\n') };
}

function csv(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function getBalance({ tenant_id, customer_id }) {
  const c = await Customer.findOne({ where: { id: customer_id, tenant_id }, raw: true });
  if (!c) return { success: false, error: 'Customer not found' };
  const open = await Invoice.findAll({
    where: { tenant_id, customer_id, status: { [Op.in]: ['open', 'failed'] } },
    order: [['issued_at', 'DESC']], raw: true
  });
  const autopay = await AutopayEnrollment.findOne({ where: { tenant_id, customer_id, status: 'active' }, raw: true });
  return {
    success: true,
    balance_cents: c.balance_cents,
    balance_display: money(c.balance_cents),
    open_invoices: open.map(i => ({
      number: i.number, total: money(i.total_cents),
      due: i.due_at ? new Date(i.due_at).toISOString().slice(0, 10) : null, status: i.status
    })),
    autopay_enabled: !!autopay,
    next_charge_at: autopay ? autopay.next_charge_at : null
  };
}

module.exports = {
  issueInvoice, takePayment, runDunning, arAging, revenueReport,
  exportBooks, getBalance, money, stripe, stripeEnabled, nextInvoiceNumber
};
