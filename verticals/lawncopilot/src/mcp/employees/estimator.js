'use strict';

/**
 * AI EMPLOYEE 2 — THE ESTIMATOR
 * Replaces: the owner's truck, the windshield time, "I'll come out Tuesday".
 *
 * Turns an address into a defensible price without anyone driving anywhere.
 * Every number it speaks comes from measurement.js and pricing.js — it does no
 * arithmetic of its own, ever.
 */

const { Op } = require('sequelize');
const crypto = require('crypto');
const { measureProperty, normalizeAddress, CACHE_DAYS } = require('../../services/measurement');
const { priceProperty, labelFrequency } = require('../../services/pricing');
const {
  Property, PropertyGeometry, Measurement, Quote, QuoteLineItem,
  Lead, AddonService
} = require('../../models');

async function findOrCreateProperty(tenant_id, m, customer_id) {
  const norm = normalizeAddress(m.normalized_address);
  let prop = await Property.findOne({
    where: { tenant_id, address: m.normalized_address, ...(customer_id ? { customer_id } : {}) }
  });
  if (!prop) {
    prop = await Property.create({
      tenant_id, customer_id: customer_id || null,
      address_raw: norm, address: m.normalized_address,
      city: m.city, county: m.county, state: m.state, zip: m.zip,
      lat: m.lat, lng: m.lng, parcel_id: m.parcel_id,
      lot_sqft: m.lot_sqft, building_footprint_sqft: m.building_footprint_sqft,
      excluded_sqft: m.excluded_sqft, serviceable_sqft: m.serviceable_sqft,
      confidence: m.confidence, is_estimate: m.is_estimate, needs_review: m.needs_review,
      imagery_url: m.imagery_url
    });
  } else {
    prop.lot_sqft = m.lot_sqft;
    prop.building_footprint_sqft = m.building_footprint_sqft;
    prop.excluded_sqft = m.excluded_sqft;
    prop.serviceable_sqft = m.serviceable_sqft;
    prop.confidence = m.confidence;
    prop.is_estimate = m.is_estimate;
    prop.needs_review = m.needs_review;
    prop.imagery_url = m.imagery_url || prop.imagery_url;
    if (customer_id && !prop.customer_id) prop.customer_id = customer_id;
    prop.updated_at = new Date();
    await prop.save();
  }
  await PropertyGeometry.destroy({ where: { tenant_id, property_id: prop.id } });
  await PropertyGeometry.create({
    tenant_id, property_id: prop.id,
    parcel_geojson: m.geometry.parcel, building_geojson: m.geometry.building,
    excluded_geojson: m.geometry.excluded || [], bbox: m.geometry.bbox
  });
  return prop;
}

module.exports = {
  id: 'estimator',
  name: 'The Estimator',
  role: 'Remote property measurement and pricing',
  replaces: 'The truck roll, the windshield time, the three-day quote turnaround',
  channels: ['web_orb', 'web_chat', 'phone', 'admin', 'portal', 'system'],
  supervisor_role: 'admin',
  model: process.env.LAWNCOPILOT_VOICE_MODEL || 'claude-haiku-4-5-20251001',

  system_prompt: `You are The Estimator for Lawn Co-Pilot, an AI employee whose job is to price a lawn without anyone driving to it.

How you work:
- You NEVER do arithmetic yourself. Every number you say comes back from a tool. If a tool did not return it, you do not say it.
- When you report a measurement, say plainly where it came from: a parcel record, or an estimate from typical properties nearby.
- If the result is an estimate rather than a measurement, say so in the same breath as the number. Never let a customer believe you measured something you inferred.
- Read areas back in plain language: the lot, the house footprint, the driveway and hard surfaces, and what is left to mow.
- Give the price for each frequency and say which one most people pick and why.
- If a property is flagged for review, say a person will confirm it before anything is charged. Do not guess your way past it.
- If someone challenges the number, do not argue. Offer the correction request, which puts a human on it.`,

  tools: {
    verify_address: {
      description: 'Verify and normalize a property address, returning the resolved location.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: { address: { type: 'string', description: 'The street address as the customer said or typed it' } },
        required: ['address']
      },
      handler: async ({ address }, ctx) => {
        if (!address || String(address).trim().length < 5) {
          return { success: false, error: 'That address looks incomplete. Ask for street, city, and ZIP.' };
        }
        const m = await measureProperty({ address, tenant_id: ctx.tenant_id });
        const geocoderConfigured = !!process.env.GOOGLE_MAPS_API_KEY;

        // An unverified address is NOT a dead end. The engine can still produce
        // a clearly-labeled estimate from property records, and a human
        // verifies before anything is charged. Never strand the customer.
        return {
          success: true,
          resolved: m.address_resolved,
          can_estimate: true,
          normalized_address: m.normalized_address,
          city: m.city, county: m.county, state: m.state, zip: m.zip,
          lat: m.lat, lng: m.lng,
          note: m.address_resolved
            ? null
            : (geocoderConfigured
                ? 'Address did not match a mapping record. Read it back once to confirm, then PROCEED with measure_property — the result will be labeled an estimate and a human verifies it before service.'
                : 'Address lookup is not configured on this account, which is expected. PROCEED with measure_property — the result is labeled an estimate and a human verifies it before service.'),
          next_step: 'measure_property'
        };
      }
    },

    measure_property: {
      description: 'Measure the serviceable lawn area for an address. Returns lot size, building footprint, excluded hard surfaces, and the lawn area left to service, with a confidence level and sources.',
      min_trust: 'identified',
      cost_cents: 2,
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          customer_id: { type: 'integer', description: 'Optional, when the property belongs to an existing customer' }
        },
        required: ['address']
      },
      handler: async ({ address, customer_id }, ctx) => {
        const norm = normalizeAddress(address);

        // Cache: never bill a provider twice for the same address.
        const cached = await Measurement.findOne({
          where: {
            tenant_id: ctx.tenant_id,
            normalized_address: norm,
            expires_at: { [Op.gt]: new Date() }
          },
          order: [['created_at', 'DESC']], raw: true
        });

        let m;
        if (cached) {
          m = {
            normalized_address: cached.normalized_address,
            address_resolved: true,
            lot_sqft: cached.lot_sqft,
            building_footprint_sqft: cached.building_footprint_sqft,
            excluded_sqft: cached.excluded_sqft,
            excluded_breakdown: cached.excluded_breakdown,
            serviceable_sqft: cached.serviceable_sqft,
            confidence: cached.confidence,
            is_estimate: cached.is_estimate,
            needs_review: cached.needs_review,
            sources: cached.sources,
            geometry: (cached.raw_payload || {}).geometry || { parcel: null, building: null, excluded: [], bbox: null },
            imagery_url: (cached.raw_payload || {}).imagery_url || null,
            city: (cached.raw_payload || {}).city,
            county: (cached.raw_payload || {}).county,
            state: (cached.raw_payload || {}).state || 'FL',
            zip: (cached.raw_payload || {}).zip,
            lat: (cached.raw_payload || {}).lat,
            lng: (cached.raw_payload || {}).lng,
            provider: cached.provider,
            disclaimer: cached.is_estimate
              ? 'Preliminary estimate based on available property records. Subject to final verification before service.' : null
          };
        } else {
          m = await measureProperty({ address, tenant_id: ctx.tenant_id });
        }

        const prop = await findOrCreateProperty(ctx.tenant_id, m, customer_id || ctx.customer_id);

        let measurementId = cached ? cached.id : null;
        if (!cached) {
          const row = await Measurement.create({
            tenant_id: ctx.tenant_id, property_id: prop.id,
            normalized_address: norm, provider: m.provider,
            lot_sqft: m.lot_sqft, building_footprint_sqft: m.building_footprint_sqft,
            excluded_sqft: m.excluded_sqft, excluded_breakdown: m.excluded_breakdown,
            serviceable_sqft: m.serviceable_sqft,
            confidence: m.confidence, is_estimate: m.is_estimate, needs_review: m.needs_review,
            sources: m.sources,
            raw_payload: {
              geometry: m.geometry, imagery_url: m.imagery_url,
              city: m.city, county: m.county, state: m.state, zip: m.zip, lat: m.lat, lng: m.lng
            },
            expires_at: new Date(Date.now() + CACHE_DAYS * 86400000)
          });
          measurementId = row.id;
        }

        if (ctx.session_id) {
          await Lead.update(
            { address: m.normalized_address, stage: 'measured', updated_at: new Date() },
            { where: { tenant_id: ctx.tenant_id, session_id: ctx.session_id } }
          );
        }

        return {
          success: true,
          property_id: prop.id,
          measurement_id: measurementId,
          normalized_address: m.normalized_address,
          lot_sqft: m.lot_sqft,
          building_footprint_sqft: m.building_footprint_sqft,
          excluded_sqft: m.excluded_sqft,
          excluded_breakdown: m.excluded_breakdown,
          serviceable_sqft: m.serviceable_sqft,
          confidence: m.confidence,
          is_estimate: m.is_estimate,
          needs_review: m.needs_review,
          sources: m.sources,
          geometry: m.geometry,
          imagery_url: m.imagery_url,
          cached: !!cached,
          disclaimer: m.disclaimer,
          spoken_summary: buildSpokenSummary(m)
        };
      }
    },

    price_quote: {
      description: 'Price a measured property across every service frequency. Returns a line-itemized breakdown per frequency.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          property_id: { type: 'integer' },
          serviceable_sqft: { type: 'integer' },
          flags: { type: 'object', description: 'Surcharge flags: access_difficulty, overgrown, corner_lot, gated' },
          addon_codes: { type: 'array', items: { type: 'string' } }
        }
      },
      handler: async ({ property_id, serviceable_sqft, flags, addon_codes }, ctx) => {
        let prop = null;
        if (property_id) {
          prop = await Property.findOne({ where: { id: property_id, tenant_id: ctx.tenant_id }, raw: true });
          if (!prop) return { success: false, error: 'Property not found' };
        }
        const sqft = serviceable_sqft || (prop && (prop.approved_sqft || prop.serviceable_sqft));
        if (!sqft) return { success: false, error: 'No serviceable area available. Measure the property first.' };

        let addons = [];
        if (addon_codes && addon_codes.length) {
          addons = await AddonService.findAll({
            where: { tenant_id: ctx.tenant_id, code: addon_codes, active: true, coming_soon: false }, raw: true
          });
        }

        const priced = await priceProperty({
          tenant_id: ctx.tenant_id,
          serviceable_sqft: sqft,
          city: prop && prop.city, county: prop && prop.county,
          state: (prop && prop.state) || 'FL', zip: prop && prop.zip,
          property_type: (prop && prop.property_type) || 'residential',
          flags: flags || {}, addons
        });

        return {
          success: true,
          serviceable_sqft: sqft,
          options: priced.options,
          recommended: priced.recommended,
          pricing_source: priced.pricing_source,
          is_estimate: prop ? prop.is_estimate : true,
          confidence: prop ? prop.confidence : 'low',
          spoken_summary: buildPriceSummary(priced, sqft)
        };
      }
    },

    explain_price: {
      description: 'Explain in plain language exactly how a price was built, line by line.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: { property_id: { type: 'integer' }, frequency: { type: 'string' } },
        required: ['property_id']
      },
      handler: async ({ property_id, frequency }, ctx) => {
        const prop = await Property.findOne({ where: { id: property_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!prop) return { success: false, error: 'Property not found' };
        const sqft = prop.approved_sqft || prop.serviceable_sqft;
        const priced = await priceProperty({
          tenant_id: ctx.tenant_id, serviceable_sqft: sqft,
          city: prop.city, county: prop.county, state: prop.state, zip: prop.zip
        });
        const f = frequency || 'biweekly';
        const opt = priced.options[f];
        if (!opt) return { success: false, error: `Unknown frequency: ${f}` };
        return {
          success: true,
          frequency: f,
          serviceable_sqft: sqft,
          line_items: opt.line_items.map(l => ({
            label: l.label, detail: l.detail,
            amount: `${l.amount_cents < 0 ? '-' : ''}$${Math.abs(l.amount_cents / 100).toFixed(2)}`
          })),
          total: opt.price_display,
          explanation: `We measured ${Number(sqft).toLocaleString()} square feet of lawn. ` +
            opt.line_items.map(l => `${l.label}: ${l.amount_cents < 0 ? 'minus ' : ''}$${Math.abs(l.amount_cents / 100).toFixed(2)}`).join('. ') +
            `. That comes to ${opt.price_display} per visit.`
        };
      }
    },

    issue_quote: {
      description: 'Persist a formal quote for a property so the customer can accept it, and so the phone, web, and admin all see the same numbers.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          property_id: { type: 'integer' },
          frequency: { type: 'string', enum: ['weekly', 'biweekly', 'monthly', 'one_time'] },
          addon_codes: { type: 'array', items: { type: 'string' } },
          flags: { type: 'object' }
        },
        required: ['property_id']
      },
      handler: async ({ property_id, frequency, addon_codes, flags }, ctx) => {
        const prop = await Property.findOne({ where: { id: property_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!prop) return { success: false, error: 'Property not found' };

        const sqft = prop.approved_sqft || prop.serviceable_sqft;
        if (!sqft) return { success: false, error: 'Property has no serviceable area yet' };

        let addons = [];
        if (addon_codes && addon_codes.length) {
          addons = await AddonService.findAll({
            where: { tenant_id: ctx.tenant_id, code: addon_codes, active: true, coming_soon: false }, raw: true
          });
        }

        const priced = await priceProperty({
          tenant_id: ctx.tenant_id, serviceable_sqft: sqft,
          city: prop.city, county: prop.county, state: prop.state, zip: prop.zip,
          property_type: prop.property_type, flags: flags || {}, addons
        });

        const freq = frequency || priced.recommended;
        const opt = priced.options[freq];
        const ttl = Number(process.env.LAWNCOPILOT_QUOTE_TTL_DAYS || 30);
        const token = crypto.randomBytes(16).toString('hex');

        const measurement = await Measurement.findOne({
          where: { tenant_id: ctx.tenant_id, property_id: prop.id },
          order: [['created_at', 'DESC']], raw: true
        });

        const lead = ctx.session_id
          ? await Lead.findOne({ where: { tenant_id: ctx.tenant_id, session_id: ctx.session_id }, raw: true })
          : null;

        const quote = await Quote.create({
          tenant_id: ctx.tenant_id,
          lead_id: lead ? lead.id : null,
          customer_id: ctx.customer_id || prop.customer_id || null,
          property_id: prop.id,
          measurement_id: measurement ? measurement.id : null,
          token, frequency: freq,
          serviceable_sqft: sqft,
          subtotal_cents: opt.subtotal_cents,
          tax_cents: opt.tax_cents,
          total_cents: opt.total_cents,
          options: Object.fromEntries(Object.entries(priced.options).map(([k, v]) => [k, {
            total_cents: v.total_cents, price_display: v.price_display, per_visit: v.per_visit
          }])),
          status: prop.needs_review ? 'needs_review' : 'issued',
          is_estimate: prop.is_estimate,
          confidence: prop.confidence,
          expires_at: new Date(Date.now() + ttl * 86400000)
        });

        await QuoteLineItem.bulkCreate(opt.line_items.map(l => ({
          tenant_id: ctx.tenant_id, quote_id: quote.id,
          kind: l.kind, label: l.label, detail: l.detail,
          amount_cents: l.amount_cents, sort_order: l.sort_order
        })));

        if (lead) {
          await Lead.update(
            { stage: 'quoted', quote_id: quote.id, updated_at: new Date() },
            { where: { id: lead.id, tenant_id: ctx.tenant_id } }
          );
        }

        return {
          success: true,
          quote_id: quote.id,
          token,
          frequency: freq,
          total_cents: opt.total_cents,
          price_display: opt.price_display,
          options: priced.options,
          status: quote.status,
          needs_review: prop.needs_review,
          is_estimate: prop.is_estimate,
          expires_at: quote.expires_at,
          quote_url: `/lawncopilot/quote/${token}`,
          disclaimer: prop.is_estimate
            ? 'This price is preliminary and subject to final property verification.' : null
        };
      }
    },

    flag_for_review: {
      description: 'Flag a property measurement for a human to review before anything is charged.',
      min_trust: 'public_web',
      parameters: {
        type: 'object',
        properties: { property_id: { type: 'integer' }, reason: { type: 'string' } },
        required: ['property_id']
      },
      handler: async ({ property_id, reason }, ctx) => {
        const prop = await Property.findOne({ where: { id: property_id, tenant_id: ctx.tenant_id } });
        if (!prop) return { success: false, error: 'Property not found' };
        prop.needs_review = true;
        prop.updated_at = new Date();
        await prop.save();
        const { Ticket } = require('../../models');
        await Ticket.create({
          tenant_id: ctx.tenant_id, customer_id: ctx.customer_id || null, property_id: prop.id,
          type: 'measurement_dispute', subject: 'Measurement review requested',
          body: reason || 'Customer asked for the measurement to be checked.',
          source: ctx.channel || 'orb', status: 'open'
        });
        return {
          success: true,
          message: 'Flagged for review. A person on the team will check the measurement before anything is charged.'
        };
      }
    }
  }
};

function buildSpokenSummary(m) {
  const n = (v) => Number(v || 0).toLocaleString('en-US');
  const parts = [];
  parts.push(`The lot is about ${n(m.lot_sqft)} square feet.`);
  parts.push(`The house takes up roughly ${n(m.building_footprint_sqft)}.`);
  const drive = (m.excluded_breakdown || []).find(e => e.type === 'driveway');
  if (drive) parts.push(`Driveway, walkways and patio come to about ${n(m.excluded_sqft)}.`);
  parts.push(`That leaves about ${n(m.serviceable_sqft)} square feet of lawn to service.`);
  if (m.is_estimate) {
    parts.push('That is an estimate from property records rather than a physical measurement, so a person confirms it before your first service.');
  }
  return parts.join(' ');
}

function buildPriceSummary(priced, sqft) {
  const o = priced.options;
  return `For ${Number(sqft).toLocaleString()} square feet: weekly is ${o.weekly.price_display} a visit, ` +
    `every two weeks is ${o.biweekly.price_display}, monthly is ${o.monthly.price_display}, ` +
    `and a one-time cut is ${o.one_time.price_display}. Most people in Florida choose every two weeks.`;
}
