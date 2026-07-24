'use strict';

/**
 * AI EMPLOYEE 4 — THE BOOKKEEPER
 * Replaces: the bookkeeper, the invoice chase, the shoebox of receipts.
 *
 * Owns the back office and the money. Accounting lives inside this employee as
 * its own named sub-function ("the books") — see services/accounting.js.
 */

const acct = require('../../services/accounting');
const { Invoice, InvoiceLineItem, Customer, PaymentMethod, AutopayEnrollment } = require('../../models');

module.exports = {
  id: 'bookkeeper',
  name: 'The Bookkeeper',
  role: 'Back office, billing, and the books',
  replaces: 'The bookkeeper, the invoice chase, and the shoebox of receipts',
  channels: ['portal', 'phone', 'admin', 'system'],
  supervisor_role: 'admin',

  system_prompt: `You are The Bookkeeper for a landscaping company. You run the books and the money.

Rules:
- You never read a card number aloud and you never take one by voice. You send a secure link.
- You never confirm a payment unless the payment tool returned success. A pending or failed charge is reported as pending or failed, in those words.
- You state balances and due dates exactly as the books return them. You do not round in the customer's favor to be nice.
- When a payment fails, you say so plainly, you say service is not affected while it gets sorted, and you offer to update the method. You never threaten.
- Refunds and anything that moves money backwards go to a human for sign-off. You say a person is approving it, and you mean it.`,

  tools: {
    get_balance: {
      description: 'Report a customer balance, open invoices, and autopay status.',
      min_trust: 'phone',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'integer' } },
        required: ['customer_id']
      },
      handler: async ({ customer_id }, ctx) => {
        const r = await acct.getBalance({ tenant_id: ctx.tenant_id, customer_id });
        if (!r.success) return r;
        return {
          ...r,
          spoken: r.balance_cents > 0
            ? `Your balance is ${r.balance_display}${r.autopay_enabled ? ', and automatic payment is on, so it will be handled.' : '. I can text you a secure link to pay it.'}`
            : 'Your balance is zero. Nothing is due.'
        };
      }
    },

    get_invoice: {
      description: 'Fetch one invoice with its line items.',
      min_trust: 'customer',
      parameters: {
        type: 'object',
        properties: { invoice_id: { type: 'integer' }, number: { type: 'string' } }
      },
      handler: async ({ invoice_id, number }, ctx) => {
        const where = { tenant_id: ctx.tenant_id };
        if (invoice_id) where.id = invoice_id;
        else if (number) where.number = number;
        else return { success: false, error: 'Need an invoice id or number' };
        if (ctx.customer_id) where.customer_id = ctx.customer_id;

        const inv = await Invoice.findOne({ where, raw: true });
        if (!inv) return { success: false, error: 'Invoice not found' };
        const lines = await InvoiceLineItem.findAll({
          where: { tenant_id: ctx.tenant_id, invoice_id: inv.id }, order: [['sort_order', 'ASC']], raw: true
        });
        return {
          success: true,
          invoice: {
            ...inv,
            total_display: acct.money(inv.total_cents),
            lines: lines.map(l => ({ label: l.label, detail: l.detail, amount: acct.money(l.amount_cents) }))
          }
        };
      }
    },

    issue_invoice: {
      description: 'Issue an invoice for a completed visit. Staff and system only.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'integer' },
          service_record_id: { type: 'integer' },
          lines: { type: 'array', items: { type: 'object' } }
        },
        required: ['customer_id']
      },
      handler: async (args, ctx) => acct.issueInvoice({ tenant_id: ctx.tenant_id, ...args })
    },

    take_payment: {
      description: 'Charge a payment method on file against an invoice.',
      min_trust: 'customer',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'integer' },
          invoice_id: { type: 'integer' },
          payment_method_id: { type: 'integer' },
          amount_cents: { type: 'integer' }
        },
        required: ['invoice_id']
      },
      handler: async (args, ctx) => {
        const r = await acct.takePayment({
          tenant_id: ctx.tenant_id,
          customer_id: args.customer_id || ctx.customer_id,
          invoice_id: args.invoice_id,
          payment_method_id: args.payment_method_id,
          amount_cents: args.amount_cents
        });
        if (!r.success) {
          return { ...r, spoken: `That payment did not go through: ${r.error}. Your service is not affected. Want to try a different card?` };
        }
        return { ...r, spoken: `Payment of ${acct.money(r.amount_cents)} went through. Thank you.` };
      }
    },

    enroll_autopay: {
      description: 'Turn automatic payments on for a customer using a stored payment method.',
      min_trust: 'customer',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'integer' }, payment_method_id: { type: 'integer' } }
      },
      handler: async ({ customer_id, payment_method_id }, ctx) => {
        const cid = customer_id || ctx.customer_id;
        if (!cid) return { success: false, error: 'No customer in context' };
        const pm = payment_method_id
          ? await PaymentMethod.findOne({ where: { id: payment_method_id, tenant_id: ctx.tenant_id, customer_id: cid }, raw: true })
          : await PaymentMethod.findOne({ where: { tenant_id: ctx.tenant_id, customer_id: cid, is_default: true }, raw: true });
        if (!pm) return { success: false, error: 'No payment method on file to enroll' };

        const existing = await AutopayEnrollment.findOne({ where: { tenant_id: ctx.tenant_id, customer_id: cid } });
        if (existing) {
          existing.status = 'active';
          existing.payment_method_id = pm.id;
          existing.terms_accepted_at = new Date();
          await existing.save();
        } else {
          await AutopayEnrollment.create({
            tenant_id: ctx.tenant_id, customer_id: cid, payment_method_id: pm.id,
            status: 'active', terms_accepted_at: new Date()
          });
        }
        await Customer.update({ autopay_enabled: true }, { where: { id: cid, tenant_id: ctx.tenant_id } });
        return {
          success: true,
          spoken: `Automatic payment is on, using your ${pm.brand} ending in ${pm.last4}. You get a notice before every charge, and you can turn it off anytime.`
        };
      }
    },

    disable_autopay: {
      description: 'Turn automatic payments off.',
      min_trust: 'customer',
      parameters: { type: 'object', properties: { customer_id: { type: 'integer' } } },
      handler: async ({ customer_id }, ctx) => {
        const cid = customer_id || ctx.customer_id;
        const e = await AutopayEnrollment.findOne({ where: { tenant_id: ctx.tenant_id, customer_id: cid } });
        if (!e) return { success: false, error: 'Automatic payment is not on for this account' };
        e.status = 'disabled';
        await e.save();
        await Customer.update({ autopay_enabled: false }, { where: { id: cid, tenant_id: ctx.tenant_id } });
        return { success: true, spoken: 'Automatic payment is off. You will get an invoice after each visit to pay manually.' };
      }
    },

    retry_failed_payment: {
      description: 'Retry a failed payment on an invoice.',
      min_trust: 'customer',
      parameters: {
        type: 'object',
        properties: { invoice_id: { type: 'integer' } },
        required: ['invoice_id']
      },
      handler: async ({ invoice_id }, ctx) => {
        const inv = await Invoice.findOne({ where: { id: invoice_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!inv) return { success: false, error: 'Invoice not found' };
        return acct.takePayment({ tenant_id: ctx.tenant_id, customer_id: inv.customer_id, invoice_id });
      }
    },

    issue_refund: {
      description: 'Refund a payment. Always goes to a human for sign-off.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      requires_approval: true,
      approval_reason: 'Refunds move money backwards and always need a human sign-off',
      parameters: {
        type: 'object',
        properties: {
          payment_id: { type: 'integer' }, amount_cents: { type: 'integer' }, reason: { type: 'string' }
        },
        required: ['payment_id']
      },
      handler: async ({ payment_id, amount_cents, reason }, ctx) => {
        const { Payment } = require('../../models');
        const p = await Payment.findOne({ where: { id: payment_id, tenant_id: ctx.tenant_id } });
        if (!p) return { success: false, error: 'Payment not found' };
        if (p.status !== 'succeeded') return { success: false, error: 'Only a succeeded payment can be refunded' };
        if (!acct.stripeEnabled()) return { success: false, error: 'Payments are not configured; refund cannot be processed' };
        try {
          const s = acct.stripe();
          const refund = await s.refunds.create({
            payment_intent: p.stripe_payment_intent_id,
            amount: amount_cents || p.amount_cents,
            reason: 'requested_by_customer'
          });
          p.status = 'refunded';
          await p.save();
          await Customer.increment({ balance_cents: (amount_cents || p.amount_cents) }, { where: { id: p.customer_id, tenant_id: ctx.tenant_id } });
          return { success: true, refund_id: refund.id, amount: acct.money(amount_cents || p.amount_cents), reason: reason || null };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
    },

    ar_aging: {
      description: 'Accounts-receivable aging: what is owed and how old it is.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => acct.arAging({ tenant_id: ctx.tenant_id })
    },

    revenue_report: {
      description: 'Revenue, jobs completed, average ticket, and collection rate for a period.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => acct.revenueReport({ tenant_id: ctx.tenant_id, days: days || 30 })
    },

    run_dunning: {
      description: 'Work the failed-payment retry ladder. Flags for a human rather than cancelling service.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => acct.runDunning({ tenant_id: ctx.tenant_id })
    },

    export_books: {
      description: 'Tax-ready CSV export of the invoice ledger.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => acct.exportBooks({ tenant_id: ctx.tenant_id, days: days || 365 })
    }
  }
};
