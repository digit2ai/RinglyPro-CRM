'use strict';

/**
 * Answering entitlement — decides whether Lina should answer calls for a tenant.
 * Enforces the trial: after the 7-day trial ends with no active subscription,
 * answering is suspended (callers get the fallback voicemail) until the owner
 * adds payment. Free mode (LITE_BILLING_ENABLED=0) never enforces.
 */

function billingEnabled() {
  return !['0', 'false', 'no', 'off'].includes(String(process.env.LITE_BILLING_ENABLED || '').trim().toLowerCase());
}

function trialEndsAt(tenant) {
  return tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
}

function trialExpired(tenant) {
  const t = trialEndsAt(tenant);
  return !!t && t.getTime() < Date.now();
}

function trialDaysLeft(tenant) {
  const t = trialEndsAt(tenant);
  if (!t) return null;
  return Math.max(0, Math.ceil((t.getTime() - Date.now()) / 86400000));
}

/**
 * @returns {boolean} whether the AI should answer calls right now.
 */
function answeringAllowed(tenant) {
  if (!billingEnabled()) return true;                 // free mode
  if (tenant.suspended_at) return false;              // failed payment (webhook)
  if (tenant.subscription_status === 'active') return true;
  if (tenant.subscription_status === 'canceled') return false;
  if (tenant.stripe_subscription_id) return true;     // Stripe-managed trial/active
  // No subscription on file → allow only inside the app-level trial window.
  return !trialExpired(tenant);
}

/**
 * Whether the tenant may have a dedicated number provisioned. A Twilio DID is a
 * real recurring cost, so we only buy one once a payment method is on file
 * (card-required trial) — this stops non-converting free signups from burning
 * numbers. Free/dev mode (billing off) always allows it.
 * @returns {boolean}
 */
function canProvisionNumber(tenant) {
  if (!billingEnabled()) return true;              // free/dev mode
  if (tenant.stripe_subscription_id) return true;  // card on file (trialing or active)
  if (tenant.subscription_status === 'active') return true;
  return false;                                    // no card yet → no number
}

// Owner-facing entitlement snapshot for the dashboard/billing UI.
function entitlement(tenant) {
  const enabled = billingEnabled();
  return {
    billing_enabled: enabled,
    answering_allowed: answeringAllowed(tenant),
    subscription_status: tenant.subscription_status,
    has_subscription: !!tenant.stripe_subscription_id,
    trial_ends_at: tenant.trial_ends_at,
    trial_days_left: trialDaysLeft(tenant),
    trial_expired: trialExpired(tenant),
    // needs_payment = billing on, no active sub, and trial is over
    needs_payment: enabled && !tenant.stripe_subscription_id && tenant.subscription_status !== 'active' && trialExpired(tenant)
  };
}

module.exports = { billingEnabled, answeringAllowed, canProvisionNumber, entitlement, trialExpired, trialDaysLeft };
