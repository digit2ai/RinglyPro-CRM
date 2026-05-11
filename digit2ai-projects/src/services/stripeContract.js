'use strict';

// Stripe payment rail for project contracts. Phase 2 wires:
//   - 10% deposit collected via Stripe Checkout (one-time payment)
//   - PaymentMethod saved to the customer for future off-session charges
//   - Monthly subscription created with that PaymentMethod on success
//
// All Stripe calls are guarded — when STRIPE_SECRET_KEY is missing the
// service falls back to the legacy (free) signoff flow so phase 1 keeps
// working in environments without Stripe.

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try { return require('stripe')(process.env.STRIPE_SECRET_KEY); }
  catch (e) { console.error('[D2AI-Stripe] stripe SDK load failed:', e.message); return null; }
}

function dollarsToCents(amount) {
  return Math.max(0, Math.round(Number(amount || 0) * 100));
}

// Create a Stripe Checkout session for the 10% deposit. We pass
// metadata so the webhook can reconcile back to the contract row, and
// `setup_future_usage: 'off_session'` so the card is saved for the
// recurring subscription that fires on completion.
async function createDepositCheckoutSession({ contract, project, signerName, signerEmail }) {
  const stripe = getStripe();
  if (!stripe) return { skipped: true, reason: 'stripe_not_configured' };

  const depositCents = dollarsToCents(contract.deposit_amount_usd);
  const monthlyCents = dollarsToCents(contract.monthly_amount_usd);
  if (!depositCents) return { skipped: true, reason: 'no_deposit_amount' };

  const successUrl = `${PUBLIC_BASE}/projects/contracts/sign.html?token=${contract.signoff_token}&checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${PUBLIC_BASE}/projects/contracts/sign.html?token=${contract.signoff_token}&checkout=canceled`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: signerEmail || undefined,
    line_items: [{
      price_data: {
        currency: (contract.currency || 'USD').toLowerCase(),
        product_data: {
          name: `Project deposit — ${project.name}`,
          description: `${Number(contract.deposit_percent || 10)}% upfront deposit on a ${Number(contract.total_amount_usd || 0).toLocaleString('en-US', { style: 'currency', currency: contract.currency || 'USD' })} engagement. Monthly fee of ${Number(contract.monthly_amount_usd || 0).toLocaleString('en-US', { style: 'currency', currency: contract.currency || 'USD' })} starts after signature.`
        },
        unit_amount: depositCents
      },
      quantity: 1
    }],
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: {
        d2ai_contract_id: String(contract.id),
        d2ai_project_id: String(contract.project_id),
        d2ai_kind: 'project_deposit'
      }
    },
    metadata: {
      d2ai_contract_id: String(contract.id),
      d2ai_project_id: String(contract.project_id),
      d2ai_signer_name: signerName || '',
      d2ai_signer_email: signerEmail || '',
      d2ai_monthly_cents: String(monthlyCents),
      d2ai_currency: (contract.currency || 'USD').toLowerCase(),
      d2ai_project_name: (project.name || '').slice(0, 240)
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  return { url: session.url, id: session.id };
}

// Called from the Stripe webhook on checkout.session.completed. Attaches
// the saved PaymentMethod to a Customer, creates a Price on the fly for
// the monthly fee, and starts the Subscription.
async function activateContractFromCompletedSession(session) {
  const stripe = getStripe();
  if (!stripe) throw new Error('stripe_not_configured');

  const contractId = parseInt(session?.metadata?.d2ai_contract_id, 10);
  if (!contractId) throw new Error('Missing d2ai_contract_id in session metadata');

  const { ProjectContract, Project } = require('../models');
  const contract = await ProjectContract.findByPk(contractId);
  if (!contract) throw new Error(`Contract ${contractId} not found`);

  // Expand PI to get charge + payment method.
  let pi = null;
  if (session.payment_intent) {
    pi = typeof session.payment_intent === 'string'
      ? await stripe.paymentIntents.retrieve(session.payment_intent)
      : session.payment_intent;
  }

  const signerName  = session?.metadata?.d2ai_signer_name  || contract.signed_by_name  || '';
  const signerEmail = session?.customer_details?.email || session?.metadata?.d2ai_signer_email || contract.signed_by_email || '';
  const monthlyCents = parseInt(session?.metadata?.d2ai_monthly_cents || '0', 10);
  const currency = (session?.metadata?.d2ai_currency || contract.currency || 'usd').toLowerCase();

  // Ensure a Customer.
  let customerId = contract.stripe_customer_id || (typeof session.customer === 'string' ? session.customer : session.customer?.id) || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: signerEmail || undefined,
      name: signerName || undefined,
      metadata: {
        d2ai_contract_id: String(contract.id),
        d2ai_project_id: String(contract.project_id)
      }
    });
    customerId = customer.id;
  }

  // Attach the PaymentMethod to that Customer + set as default.
  let pmId = pi?.payment_method || null;
  if (pmId && typeof pmId !== 'string') pmId = pmId.id;
  if (pmId) {
    try {
      await stripe.paymentMethods.attach(pmId, { customer: customerId });
    } catch (e) {
      if (!/already.*attached/i.test(e.message || '')) {
        console.warn('[D2AI-Stripe] attach PM failed:', e.message);
      }
    }
    try {
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
    } catch (e) {
      console.warn('[D2AI-Stripe] set default PM failed:', e.message);
    }
  }

  // Persist signature + deposit details now so even if subscription
  // creation fails we have a clean signed-with-deposit-paid record.
  contract.stripe_customer_id = customerId;
  contract.stripe_payment_method_id = pmId || null;
  contract.stripe_deposit_session_id = session.id;
  contract.stripe_deposit_payment_intent_id = pi?.id || null;
  contract.signed_by_name = signerName || contract.signed_by_name;
  contract.signed_by_email = signerEmail || contract.signed_by_email;
  contract.signed_at = contract.signed_at || new Date();
  contract.deposit_paid_at = new Date();
  contract.status = 'signed';
  await contract.save();

  // Sync the project state.
  const project = await Project.findByPk(contract.project_id);
  if (project) {
    project.contract_status = 'signed';
    project.workflow_phase = 'deposit_paid';
    await project.save();
  }

  // Start the monthly subscription if a monthly fee is configured.
  if (monthlyCents > 0 && pmId) {
    try {
      const product = await stripe.products.create({
        name: `Monthly — ${project ? project.name : 'Engagement'}`,
        metadata: {
          d2ai_contract_id: String(contract.id),
          d2ai_project_id: String(contract.project_id)
        }
      });
      const price = await stripe.prices.create({
        product: product.id,
        currency,
        unit_amount: monthlyCents,
        recurring: { interval: 'month' }
      });
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        default_payment_method: pmId,
        metadata: {
          d2ai_contract_id: String(contract.id),
          d2ai_project_id: String(contract.project_id)
        }
      });
      contract.stripe_price_id = price.id;
      contract.stripe_subscription_id = subscription.id;
      if (['active', 'trialing'].includes(subscription.status)) {
        contract.status = 'active';
        contract.subscription_active_at = new Date();
      }
      await contract.save();
      if (project && contract.status === 'active') {
        project.contract_status = 'active';
        project.workflow_phase = 'build_authorized';
        await project.save();
      }
    } catch (subErr) {
      console.error('[D2AI-Stripe] Subscription create failed:', subErr.message);
    }
  } else if (project) {
    // No monthly configured — treat deposit as the full commitment and
    // authorize the build right away.
    project.contract_status = 'active';
    project.workflow_phase = 'build_authorized';
    contract.status = 'active';
    contract.subscription_active_at = new Date();
    await contract.save();
    await project.save();
  }

  // Kick off the architect pipeline now that the engagement is paid +
  // activated. Run async so the webhook ACK isn't blocked on prompt
  // generation or email I/O. Errors are logged but never bubble up to
  // Stripe (we don't want webhook retries because our internal handoff
  // crashed).
  if (project && project.workflow_phase === 'build_authorized') {
    setImmediate(() => {
      try {
        const architectPipeline = require('./architectPipeline');
        architectPipeline.start(project).catch(err =>
          console.error('[D2AI-Stripe] architectPipeline.start failed:', err.message)
        );
      } catch (e) {
        console.error('[D2AI-Stripe] could not load architectPipeline:', e.message);
      }
    });
  }

  return { contract, project };
}

module.exports = {
  getStripe,
  createDepositCheckoutSession,
  activateContractFromCompletedSession
};
