'use strict';

/**
 * Checkout Routes - TunjoRacing Store
 * Handles Stripe checkout integration
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const { optionalAuth } = require('../middleware/auth');

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

let models;
try {
  models = require('../../models');
} catch (e) {
  console.log('TunjoRacing: Models not loaded yet');
  models = {};
}

const getSessionId = (req) => {
  return req.headers['x-cart-session'] || req.query.session_id;
};

// POST /api/v1/checkout/create-session - Create Stripe Checkout session
router.post('/create-session', optionalAuth, asyncHandler(async (req, res) => {
  const cartSessionId = getSessionId(req);
  const { customer_email, shipping_address } = req.body;

  if (!cartSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Cart session ID required'
    });
  }

  const TunjoCartItem = models.TunjoCartItem;
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  if (!TunjoCartItem) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  // Get cart items
  const cartItems = await TunjoCartItem.findAll({
    where: { session_id: cartSessionId, tenant_id: 1 },
    include: [
      { model: TunjoProduct, as: 'product' },
      { model: TunjoProductVariant, as: 'variant' }
    ]
  });

  if (cartItems.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Cart is empty'
    });
  }

  // Build Stripe line items
  const lineItems = cartItems.map(item => {
    const price = item.variant?.price || item.product.price;
    const name = item.variant
      ? `${item.product.name} - ${item.variant.title}`
      : item.product.name;
    const image = item.variant?.image_url || (item.product.images && item.product.images[0]);

    return {
      price_data: {
        currency: 'usd',
        product_data: {
          name,
          images: image ? [image] : [],
          metadata: {
            product_id: item.product_id.toString(),
            variant_id: item.variant_id?.toString() || ''
          }
        },
        unit_amount: Math.round(parseFloat(price) * 100) // Convert to cents
      },
      quantity: item.quantity
    };
  });

  // Calculate shipping (flat rate for MVP)
  const SHIPPING_RATE = 999; // $9.99 in cents

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    customer_email: customer_email || undefined,
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {
            amount: SHIPPING_RATE,
            currency: 'usd'
          },
          display_name: 'Standard Shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 5 },
            maximum: { unit: 'business_day', value: 10 }
          }
        }
      },
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {
            amount: 1999, // $19.99
            currency: 'usd'
          },
          display_name: 'Express Shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 2 },
            maximum: { unit: 'business_day', value: 3 }
          }
        }
      }
    ],
    shipping_address_collection: {
      allowed_countries: ['US', 'CA', 'MX', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'AU']
    },
    billing_address_collection: 'required',
    success_url: `${process.env.APP_URL || 'https://aiagent.ringlypro.com'}/tunjoracing/store/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL || 'https://aiagent.ringlypro.com'}/tunjoracing/store/cart`,
    metadata: {
      cart_session_id: cartSessionId,
      tenant_id: '1'
    }
  });

  res.json({
    success: true,
    checkout_url: session.url,
    session_id: session.id
  });
}));

// GET /api/v1/checkout/session/:sessionId - Get checkout session status
router.get('/session/:sessionId', asyncHandler(async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
    expand: ['line_items', 'customer', 'payment_intent']
  });

  res.json({
    success: true,
    session: {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email,
      amount_total: session.amount_total / 100,
      currency: session.currency
    }
  });
}));

// POST /api/v1/checkout/webhook - Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_TUNJO;

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // For testing without webhook secret
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.data.object.id);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
}));

// Handle successful checkout
async function handleCheckoutComplete(session) {
  console.log('Processing completed checkout:', session.id);

  const TunjoCartItem = models.TunjoCartItem;
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;
  const TunjoOrder = models.TunjoOrder;
  const TunjoOrderItem = models.TunjoOrderItem;
  const TunjoFan = models.TunjoFan;

  const cartSessionId = session.metadata.cart_session_id;

  // Get cart items
  const cartItems = await TunjoCartItem.findAll({
    where: { session_id: cartSessionId, tenant_id: 1 },
    include: [
      { model: TunjoProduct, as: 'product' },
      { model: TunjoProductVariant, as: 'variant' }
    ]
  });

  if (cartItems.length === 0) {
    console.log('No cart items found for session:', cartSessionId);
    return;
  }

  // Get shipping details from Stripe
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items', 'shipping_details', 'customer_details']
  });

  const customerDetails = fullSession.customer_details;
  const shippingDetails = fullSession.shipping_details || fullSession.customer_details;

  // Calculate totals
  let subtotal = 0;
  cartItems.forEach(item => {
    const price = item.variant?.price || item.product.price;
    subtotal += parseFloat(price) * item.quantity;
  });

  const shippingCost = (fullSession.total_details?.amount_shipping || 0) / 100;
  const taxAmount = (fullSession.total_details?.amount_tax || 0) / 100;
  const total = subtotal + shippingCost + taxAmount;

  // Find or create fan
  let fan = null;
  if (customerDetails?.email) {
    fan = await TunjoFan.findOne({
      where: { email: customerDetails.email.toLowerCase(), tenant_id: 1 }
    });

    if (!fan) {
      fan = await TunjoFan.create({
        tenant_id: 1,
        email: customerDetails.email.toLowerCase(),
        first_name: customerDetails.name?.split(' ')[0],
        last_name: customerDetails.name?.split(' ').slice(1).join(' '),
        country: shippingDetails?.address?.country,
        source: 'store_purchase'
      });
    }

    // Update fan stats
    await fan.increment('total_orders');
    await fan.increment('total_spent', { by: total });
  }

  // Create order
  const order = await TunjoOrder.create({
    tenant_id: 1,
    fan_id: fan?.id || null,
    customer_email: customerDetails?.email || 'unknown@email.com',
    customer_first_name: customerDetails?.name?.split(' ')[0] || 'Unknown',
    customer_last_name: customerDetails?.name?.split(' ').slice(1).join(' ') || '',
    customer_phone: customerDetails?.phone || null,
    shipping_address_line1: shippingDetails?.address?.line1 || '',
    shipping_address_line2: shippingDetails?.address?.line2 || null,
    shipping_city: shippingDetails?.address?.city || '',
    shipping_state: shippingDetails?.address?.state || '',
    shipping_postal_code: shippingDetails?.address?.postal_code || '',
    shipping_country: shippingDetails?.address?.country || 'US',
    subtotal,
    shipping_cost: shippingCost,
    tax_amount: taxAmount,
    total,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent,
    payment_status: 'paid',
    paid_at: new Date()
  });

  // Create order items
  for (const item of cartItems) {
    const price = item.variant?.price || item.product.price;

    await TunjoOrderItem.create({
      tenant_id: 1,
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product.name,
      variant_title: item.variant?.title || null,
      sku: item.variant?.sku || item.product.sku,
      image_url: item.variant?.image_url || (item.product.images && item.product.images[0]),
      quantity: item.quantity,
      unit_price: price,
      total_price: parseFloat(price) * item.quantity
    });

    // Reduce inventory
    if (item.variant_id) {
      await TunjoProductVariant.decrement('inventory_quantity', {
        by: item.quantity,
        where: { id: item.variant_id }
      });
    } else {
      await TunjoProduct.decrement('inventory_quantity', {
        by: item.quantity,
        where: { id: item.product_id }
      });
    }

    // Update product sold count
    await TunjoProduct.increment('total_sold', {
      by: item.quantity,
      where: { id: item.product_id }
    });
  }

  // Clear cart
  await TunjoCartItem.destroy({
    where: { session_id: cartSessionId, tenant_id: 1 }
  });

  console.log('Order created successfully:', order.order_number);

  // TODO: Send order confirmation email
  // await sendOrderConfirmationEmail(order);
}

module.exports = router;
