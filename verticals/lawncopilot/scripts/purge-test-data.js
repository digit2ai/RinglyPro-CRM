'use strict';

/**
 * Remove SIT / verification records from the Lawn Co-Pilot tables.
 *
 * The SIT runs against the real database (CRM_DATABASE_URL), so it leaves
 * synthetic customers, leads, quotes and appointments behind. Run this after a
 * SIT pass against production:
 *
 *   node verticals/lawncopilot/scripts/purge-test-data.js         (dry run)
 *   node verticals/lawncopilot/scripts/purge-test-data.js --apply
 *
 * Matches only synthetic identities. Real customer rows are never touched.
 */

require('dotenv').config();
const { Op } = require('sequelize');
const m = require('../src/models');

const APPLY = process.argv.includes('--apply');
const EMAIL_PATTERNS = [
  { [Op.like]: 'sit_%@example.com' },
  { [Op.like]: 'prodverify%@example.com' },
  { [Op.like]: '%@example.com' }
];

(async () => {
  const custWhere = { [Op.or]: EMAIL_PATTERNS.map(p => ({ email: p })) };

  const customers = await m.Customer.findAll({ where: custWhere, raw: true });
  const leads = await m.Lead.findAll({ where: custWhere, raw: true });
  const custIds = customers.map(c => c.id);
  const leadIds = leads.map(l => l.id);

  const props = custIds.length
    ? await m.Property.findAll({ where: { customer_id: custIds }, raw: true }) : [];
  const propIds = props.map(p => p.id);

  console.log(`Synthetic records found:
  customers   ${customers.length}
  leads       ${leads.length}
  properties  ${props.length}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to delete.');
    process.exit(0);
  }

  const byCustomer = custIds.length ? { customer_id: custIds } : null;

  if (byCustomer) {
    await m.ServicePhoto.destroy({ where: propIds.length ? { property_id: propIds } : { id: -1 } });
    await m.ServiceRecord.destroy({ where: byCustomer });
    await m.InvoiceLineItem.destroy({
      where: { invoice_id: (await m.Invoice.findAll({ where: byCustomer, raw: true })).map(i => i.id).concat([-1]) }
    });
    await m.Payment.destroy({ where: byCustomer });
    await m.Invoice.destroy({ where: byCustomer });
    await m.AutopayEnrollment.destroy({ where: byCustomer });
    await m.PaymentMethod.destroy({ where: byCustomer });
    await m.Appointment.destroy({ where: byCustomer });
    await m.Subscription.destroy({ where: byCustomer });
    await m.Message.destroy({ where: byCustomer });
    await m.Ticket.destroy({ where: byCustomer });
    await m.QuoteLineItem.destroy({
      where: { quote_id: (await m.Quote.findAll({ where: byCustomer, raw: true })).map(q => q.id).concat([-1]) }
    });
    await m.Quote.destroy({ where: byCustomer });
  }

  if (propIds.length) {
    await m.QuoteLineItem.destroy({
      where: { quote_id: (await m.Quote.findAll({ where: { property_id: propIds }, raw: true })).map(q => q.id).concat([-1]) }
    });
    await m.Quote.destroy({ where: { property_id: propIds } });
    await m.PropertyGeometry.destroy({ where: { property_id: propIds } });
    await m.MeasurementOverride.destroy({ where: { property_id: propIds } });
    await m.Measurement.destroy({ where: { property_id: propIds } });
    await m.Ticket.destroy({ where: { property_id: propIds } });
    await m.Property.destroy({ where: { id: propIds } });
  }

  if (leadIds.length) {
    const sessions = await m.AgentSession.findAll({ where: { lead_id: leadIds }, raw: true });
    const sids = sessions.map(s => s.session_id);
    if (sids.length) {
      await m.AgentCall.destroy({ where: { session_id: sids } });
      await m.AgentApproval.destroy({ where: { session_id: sids } });
    }
    await m.AgentSession.destroy({ where: { lead_id: leadIds } });
    await m.Lead.destroy({ where: { id: leadIds } });
  }

  if (custIds.length) {
    await m.Notification.destroy({ where: { customer_id: custIds } });
    await m.CallLog.destroy({ where: { customer_id: custIds } });
    await m.Customer.destroy({ where: { id: custIds } });
  }

  // Orphaned sessions from gate-only verification (no lead attached).
  await m.AgentSession.destroy({ where: { lead_id: null, customer_id: null } });
  // Other-tenant SIT fixtures.
  for (const k of ['Appointment', 'Invoice', 'Property', 'Customer']) {
    await m[k].destroy({ where: { tenant_id: 999 } });
  }

  const after = {};
  for (const k of ['Lead', 'Customer', 'Property', 'Quote', 'Appointment', 'AgentSession', 'Ticket']) {
    after[k] = await m[k].count();
  }
  console.log('\nRemaining rows:', JSON.stringify(after));
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
