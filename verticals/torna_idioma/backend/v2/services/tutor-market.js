'use strict';

/**
 * Tutor Marketplace Service
 *
 * Handles the business logic for tutor bookings, Stripe Connect payouts,
 * and session room generation.
 *
 * Stripe Connect (optional): requires TI_V2_STRIPE_KEY and a verified
 * business entity on Stripe. If missing, createPaymentIntent() returns
 * a stub that lets the flow proceed in demo mode.
 *
 * Video rooms: uses Jitsi Meet public infrastructure (https://meet.jit.si).
 * Room IDs are unique per booking, prefixed with "torna-idioma-" so they
 * don't collide with other Jitsi users. No signaling server needed.
 */

const crypto = require('crypto');
const sequelize = require('../../services/db.ti');

const STRIPE_KEY = process.env.TI_V2_STRIPE_KEY || process.env.STRIPE_KEY;
const PLATFORM_FEE_PERCENT = 20; // platform takes 20%, tutor gets 80%
const JITSI_DOMAIN = process.env.TI_V2_JITSI_DOMAIN || 'meet.jit.si';
const ROOM_PREFIX = 'torna-idioma-';

function generateRoomId() {
  return ROOM_PREFIX + crypto.randomBytes(8).toString('hex');
}

function splitPrice(priceUsd) {
  const price = Number(priceUsd) || 0;
  const fee = Math.round(price * PLATFORM_FEE_PERCENT) / 100;
  const payout = Math.round((price - fee) * 100) / 100;
  return { price, fee, payout };
}

/**
 * Create a Stripe payment intent (real call) or a stub (graceful fallback).
 * Real implementation requires the Stripe package — we call the REST API
 * directly to avoid adding a new dependency.
 */
async function createPaymentIntent(amountUsd, metadata = {}) {
  if (!STRIPE_KEY) {
    // Demo mode — return a stub that lets the booking flow proceed
    return {
      id: 'stub_pi_' + crypto.randomBytes(8).toString('hex'),
      client_secret: null,
      status: 'stub',
      mode: 'demo',
      message: 'Stripe not configured — booking will be auto-confirmed in demo mode'
    };
  }

  const amountCents = Math.round(amountUsd * 100);
  const params = new URLSearchParams();
  params.append('amount', String(amountCents));
  params.append('currency', 'usd');
  params.append('automatic_payment_methods[enabled]', 'true');
  for (const [k, v] of Object.entries(metadata)) {
    params.append(`metadata[${k}]`, String(v));
  }

  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Stripe API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    client_secret: data.client_secret,
    status: data.status,
    mode: 'live',
    amount: data.amount
  };
}

async function updateTutorRating(tutorId) {
  const [[stats]] = await sequelize.query(
    `SELECT COUNT(*)::int AS count, AVG(rating)::numeric(3,2) AS avg
     FROM ti_v2_tutor_reviews WHERE tutor_id = $1`,
    { bind: [tutorId] }
  );
  await sequelize.query(
    `UPDATE ti_v2_tutors
     SET rating_avg = $1, rating_count = $2, updated_at = NOW()
     WHERE id = $3`,
    { bind: [stats.avg || 0, stats.count || 0, tutorId] }
  );
}

function isConfigured() {
  return {
    stripe: !!STRIPE_KEY,
    platform_fee_percent: PLATFORM_FEE_PERCENT,
    jitsi_domain: JITSI_DOMAIN
  };
}

module.exports = {
  generateRoomId,
  splitPrice,
  createPaymentIntent,
  updateTutorRating,
  isConfigured,
  PLATFORM_FEE_PERCENT,
  JITSI_DOMAIN
};
