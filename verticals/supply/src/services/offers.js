'use strict';

/**
 * AI Offer Engine.
 *
 * THE FIGURES ARE COMPUTED, NEVER WRITTEN BY A MODEL. Prices come from the
 * product row (promo if set, else selling, never below the minimum price);
 * quantities from inventory; a saving ONLY from pricing.bestClaim(), which
 * demands a verified, fresh, same-unit competitor price. With no such price
 * the offer says nothing about competitors — not "competitive", not "below
 * market" — nothing.
 *
 * A model may rephrase the value proposition and talking points. Its text is
 * DISCARDED if it contains any number that is not in the facts it was given,
 * or any comparative claim ("cheapest", "lowest", "below") when there is no
 * verified comparison.
 */

const db = require('../db');
const llm = require('../llm');
const catalog = require('./catalog');
const pricing = require('./pricing');

const fmt = (n) => (Number.isInteger(Number(n)) ? Number(n).toLocaleString('en-US') : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const unitLabel = (u) => (u ? String(u).replace(/^per\s+/i, '') : 'unit');

function numbersIn(s) { return (String(s || '').match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => x.replace(/,/g, '').replace(/\.0+$/, '')); }
function guard(text, facts, hasClaim) {
  const allowed = new Set(numbersIn(facts));
  for (const n of numbersIn(text)) if (!allowed.has(n)) return false;
  if (!hasClaim && /\b(cheap(er|est)|lowest|below|less than|beat|save|savings|discount(ed)? (vs|versus|compared))\b/i.test(text)) return false;
  return true;
}

async function productOffer(tenantId, product, settings) {
  const offer = catalog.offerPrice(product);
  const claim = offer.price != null ? await pricing.bestClaim(tenantId, product, settings) : null;
  const qty = product.quantity_available != null && Number(product.quantity_available) > 0 ? Number(product.quantity_available) : null;
  const u = unitLabel(product.unit);
  const lines = [];
  if (offer.price != null) {
    lines.push(`${product.name}${qty ? `: ${fmt(qty)} ${u} in stock` : ''} at $${fmt(offer.price)} per ${u}${offer.is_promotional ? ' (current promotional price)' : ''}.`);
  }
  if (claim) {
    lines.push(`That is about ${Math.round(claim.savings_pct)}% below the ${claim.competitor} price of $${fmt(claim.competitor_price)} per ${u} we checked on ${String(claim.date_checked).slice(0, 10)} for a comparable item.`);
  }
  return {
    product_id: product.id, name: product.name, sku: product.sku, unit: u, price: offer.price, is_promotional: !!offer.is_promotional,
    price_unavailable_reason: offer.price == null ? offer.reason : null, quantity_available: qty, claim, lines
  };
}

/**
 * build(tenant, { productIds, categoryName }) -> offer object stored on the
 * campaign and sent into every call's context package.
 */
async function build(tenant, { productIds, categoryNames = [], objective } = {}) {
  const ids = (productIds || []).map(Number).filter(Boolean);
  const products = ids.length ? await db.tq(tenant.id, 'SELECT * FROM sup_products WHERE tenant_id = :tenant AND id IN (:ids) AND active', { ids }) : [];
  const items = [];
  for (const p of products) items.push(await productOffer(tenant.id, p, tenant.settings));
  const priced = items.filter((i) => i.price != null);
  const withClaim = priced.filter((i) => i.claim);
  const who = categoryNames.length ? categoryNames.join(', ') : 'contractors';
  const valueProp = withClaim.length
    ? `${tenant.name} has ${withClaim.map((i) => i.name).join(', ')} in stock at prices below what we verified at ${[...new Set(withClaim.map((i) => i.claim.competitor))].join(' and ')}.`
    : priced.length ? `${tenant.name} has ${priced.map((i) => i.name).join(', ')} in stock and ready for ${who}.` : `${tenant.name} supplies building materials for ${who}.`;
  const talking = [].concat(...priced.map((i) => i.lines));
  talking.push('Ask which materials they buy regularly and roughly how much per job.');
  talking.push('Ask when their next project needs material.');
  talking.push('Offer to connect them with a sales representative for contractor pricing or a quote.');
  const objections = [
    { objection: 'We already have a supplier', response: 'Understood. Many contractors keep a second supplier for stock-outs and better pricing on specific items; we can quote the items you use most.' },
    { objection: 'Send me something in writing', response: 'A sales representative can send a written quote; may I confirm the best email and the products you want priced?' },
    { objection: 'Too busy right now', response: 'When would be a better time for a short follow-up call?' }
  ];
  if (!withClaim.length) objections.push({ objection: 'Is it cheaper than Home Depot?', response: 'Do not make a price comparison. Offer to have a sales representative quote their exact items.' });
  const offer = {
    products: items,
    value_proposition: valueProp,
    talking_points: talking,
    pricing_language: withClaim.length
      ? 'Only quote the prices and the verified comparisons listed. Say "approximately" for percentages. Anything else goes to a sales representative.'
      : 'Quote only the listed prices. Make no comparison to any competitor: none is verified.',
    objection_handling: objections,
    call_objective: objective || 'Introduce the supplier, confirm they buy these materials, present the offer, capture product needs, quantity and timeframe, and offer a transfer to sales when they are interested.',
    has_verified_comparison: withClaim.length > 0,
    composed_by: 'rules'
  };
  // Optional model polish, guarded.
  if (llm.configured() && priced.length) {
    const facts = JSON.stringify({ items: priced.map((i) => ({ name: i.name, price: i.price, unit: i.unit, qty: i.quantity_available, claim: i.claim && { competitor: i.claim.competitor, competitor_price: i.claim.competitor_price, savings_pct: Math.round(i.claim.savings_pct), date: String(i.claim.date_checked).slice(0, 10) } })), who, supplier: tenant.name });
    const out = await llm.json({
      system: 'Rewrite a building-materials sales offer for a phone agent. Return JSON {"value_proposition":"...","talking_points":["..."]}. Use ONLY the numbers in the facts. Make no competitor comparison unless the facts include a claim. Plain spoken English, short sentences.',
      user: facts
    });
    if (out && typeof out.value_proposition === 'string' && Array.isArray(out.talking_points)) {
      const text = [out.value_proposition].concat(out.talking_points).join(' ');
      if (guard(text, facts + ' ' + talking.join(' '), withClaim.length > 0)) {
        offer.value_proposition = out.value_proposition.slice(0, 600);
        offer.talking_points = out.talking_points.map((s) => String(s).slice(0, 400)).slice(0, 10);
        offer.composed_by = 'model';
      } else offer.model_rewrite_rejected = 'introduced a number or a comparison not in the facts';
    }
  }
  return offer;
}

module.exports = { build, productOffer, guard, numbersIn };
