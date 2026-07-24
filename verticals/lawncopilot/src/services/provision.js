'use strict';

/**
 * Lawn Co-Pilot — tenant provisioning
 *
 * A landscaper fills in a short form and, within seconds, has a live page their
 * customers can quote and book on. Everything below happens in ONE transaction:
 * partial provisioning would leave a company with a broken presence, which is
 * worse than a failed signup.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  sequelize, Tenant, User, Crew, ShortLink, SiteContent,
  PlatformUser, PlatformSubscription, JobChecklist
} = require('../models');
const { seedDefaultRules, seedDefaultPlans } = require('./pricing');
const { isSlugAvailable, cacheBust } = require('../tenancy');

const TRIAL_DAYS = () => Number(process.env.LAWNCOPILOT_TRIAL_DAYS || 14);

/**
 * The three plans.
 *
 * PRICING IS A BUSINESS DECISION — these figures are a proposal, not confirmed
 * by the operator. They live here so changing them is one edit, and the landing
 * page reads them from /api/v1/signup/plans rather than hardcoding numbers in
 * markup that would drift.
 */
const PLAN_LIMITS = {
  solo: {
    label: 'Solo',
    tagline: 'Owner-operator, one truck',
    price_cents: 9900,                    // TODO: operator-confirmed price
    crews: 1, employees: 3, ai_actions_month: 3000,
    payroll: false, marketing: true, controller: false,
    highlights: [
      'Your own booking page and QR code',
      'Receptionist, Estimator, Dispatcher, Bookkeeper',
      'Instant measured quotes, no site visit',
      'Invoicing, card payments and autopay',
      'Customer portal with schedule and history'
    ]
  },
  crew: {
    label: 'Crew',
    tagline: 'A few crews, growing',
    price_cents: 24900,                   // TODO: operator-confirmed price
    crews: 5, employees: 15, ai_actions_month: 15000,
    payroll: true, marketing: true, controller: false,
    popular: true,
    highlights: [
      'Everything in Solo',
      'Crew Manager: time tracking and certifications',
      'Payroll Officer',
      'Marketing, review requests and referrals',
      'Route sequencing and dispatch'
    ]
  },
  multi_trucks: {
    label: 'Multi Trucks',
    tagline: 'Multiple crews and locations',
    price_cents: 49900,                   // TODO: operator-confirmed price
    crews: 999, employees: 999, ai_actions_month: 100000,
    payroll: true, marketing: true, controller: true,
    highlights: [
      'Everything in Crew',
      'The Controller: job costing and margin per customer',
      'Underpriced-work and route-waste reporting',
      'Unlimited crews and employees',
      'Priority support'
    ]
  }
};

const PLAN_ORDER = ['solo', 'crew', 'multi_trucks'];

// v1/v2-alpha plan names, so existing tenants keep working.
const LEGACY_PLANS = { starter: 'solo', pro: 'crew', scale: 'multi_trucks' };
function normalizePlan(p) {
  const k = String(p || '').toLowerCase();
  return PLAN_LIMITS[k] ? k : (LEGACY_PLANS[k] || 'solo');
}

function shortCode() {
  return crypto.randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase();
}

function defaultBrand(companyName) {
  return {
    display_name: companyName,
    accent: '#307f44',
    logo_url: null,
    hero_headline: `Lawn care in your neighborhood, priced in seconds.`,
    hero_sub: `Tell us your address and ${companyName} will measure your lawn and give you a real price right now. No waiting for a callback.`,
    about: `${companyName} is a local, owner-operated lawn care company. We show up when we say we will, and we do the work right.`,
    services: [
      { name: 'Mowing', description: 'Cut, edged, trimmed and blown off every visit.' },
      { name: 'Edging and trimming', description: 'Clean lines along walks, beds and driveways.' },
      { name: 'Hedge and shrub trimming', description: 'Shaped and cleaned up.' },
      { name: 'Leaf and debris cleanup', description: 'Yard cleared and hauled off.' }
    ],
    photos: [],
    license_text: null,
    show_powered_by: true
  };
}

const DEFAULT_CHECKLISTS = [
  { service_type: 'mowing', items: ['Mow all turf areas', 'Edge walks and driveway', 'String trim fence lines and beds', 'Blow off hard surfaces', 'Close and latch all gates', 'Photo of finished yard'] },
  { service_type: 'cleanup', items: ['Clear leaves and debris', 'Bag or haul off', 'Blow off hard surfaces', 'Before and after photo'] }
];

/**
 * Create a complete, working landscaping company.
 */
async function provisionTenant({
  company_name, slug, owner_name, owner_email, owner_phone, password,
  state, counties, crew_count, plan
}) {
  const avail = await isSlugAvailable(slug);
  if (!avail.ok) return { success: false, error: avail.error, field: 'slug' };

  if (!company_name || String(company_name).trim().length < 2) {
    return { success: false, error: 'Company name is required.', field: 'company_name' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(owner_email || ''))) {
    return { success: false, error: 'A valid email is required.', field: 'owner_email' };
  }
  if (!password || String(password).length < 8) {
    return { success: false, error: 'Choose a password of at least 8 characters.', field: 'password' };
  }

  const existingUser = await User.findOne({ where: { email: String(owner_email).toLowerCase().trim() }, raw: true });
  if (existingUser) {
    return { success: false, error: 'That email already has an account. Sign in instead.', field: 'owner_email' };
  }

  const chosenPlan = normalizePlan(plan);
  const t = await sequelize.transaction();

  try {
    const tenant = await Tenant.create({
      name: String(company_name).trim(),
      slug: avail.slug,
      email: String(owner_email).toLowerCase().trim(),
      owner_phone: owner_phone || null,
      state: state || 'FL',
      counties: Array.isArray(counties) ? counties : [],
      brand: defaultBrand(String(company_name).trim()),
      settings: { enabled_employees: enabledFor(chosenPlan) },
      status: 'trialing',
      plan: chosenPlan,
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS() * 86400000),
      short_code: shortCode()
    }, { transaction: t });

    await User.create({
      tenant_id: tenant.id,
      name: owner_name || String(company_name).trim(),
      email: String(owner_email).toLowerCase().trim(),
      password_hash: await bcrypt.hash(String(password), 10),
      phone: owner_phone || null,
      role: 'owner',
      status: 'active'
    }, { transaction: t });

    // Their rate card, plans and add-ons. Editable from day one.
    await seedDefaultRules(tenant.id, t);
    await seedDefaultPlans(tenant.id, t);

    const crews = Math.min(Math.max(Number(crew_count) || 1, 1), PLAN_LIMITS[chosenPlan].crews);
    await Crew.bulkCreate(
      Array.from({ length: crews }, (_, i) => ({
        tenant_id: tenant.id,
        name: crews === 1 ? 'Main Crew' : `Crew ${String.fromCharCode(65 + i)}`,
        capacity_per_day: 12,
        active: true
      })),
      { transaction: t }
    );

    await JobChecklist.bulkCreate(
      DEFAULT_CHECKLISTS.map(c => ({ tenant_id: tenant.id, ...c, is_template: true })),
      { transaction: t }
    );

    await SiteContent.create({
      tenant_id: tenant.id, version: 1, content: tenant.brand, published: true
    }, { transaction: t });

    await ShortLink.create({
      tenant_id: tenant.id,
      code: tenant.short_code,
      target: `/lawncopilot/${tenant.slug}`,
      source: 'signup'
    }, { transaction: t });

    await PlatformSubscription.create({
      tenant_id: tenant.id,
      plan: chosenPlan,
      status: 'trialing',
      price_cents: PLAN_LIMITS[chosenPlan].price_cents,
      limits: PLAN_LIMITS[chosenPlan],
      current_period_end: new Date(Date.now() + TRIAL_DAYS() * 86400000)
    }, { transaction: t });

    await t.commit();
    cacheBust();

    return {
      success: true,
      tenant_id: tenant.id,
      slug: tenant.slug,
      short_code: tenant.short_code,
      plan: chosenPlan,
      trial_ends_at: tenant.trial_ends_at,
      page_url: `/lawncopilot/${tenant.slug}`,
      admin_url: `/lawncopilot/${tenant.slug}/admin`,
      short_url: `/lawncopilot/l/${tenant.short_code}`
    };
  } catch (e) {
    await t.rollback();
    const detail = (e.errors && e.errors.length)
      ? e.errors.map(x => `${x.path}: ${x.message}`).join('; ')
      : e.message;
    return { success: false, error: `Could not create the account: ${detail}` };
  }
}

function enabledFor(plan) {
  const l = PLAN_LIMITS[normalizePlan(plan)];
  const on = ['receptionist', 'estimator', 'dispatcher', 'bookkeeper', 'crew'];
  if (l.marketing) on.push('marketer');
  if (l.payroll) on.push('payroll');
  if (l.controller) on.push('controller');
  return on;
}

/**
 * Digit2AI super-admin accounts. Password force-synced on boot so the operator
 * is never locked out of their own platform.
 */
async function ensurePlatform() {
  const pw = process.env.LAWNCOPILOT_PLATFORM_PASSWORD || 'lawncopilot@2026';
  const hash = await bcrypt.hash(pw, 10);
  const accounts = [
    { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'owner' },
    { email: 'admin@digit2ai.com', name: 'Digit2AI Admin', role: 'admin' }
  ];
  for (const a of accounts) {
    const [u, created] = await PlatformUser.findOrCreate({
      where: { email: a.email },
      defaults: { ...a, password_hash: hash, status: 'active' }
    });
    if (!created) { u.password_hash = hash; u.role = a.role; await u.save(); }
  }
  console.log(`  Lawn Co-Pilot platform accounts ensured (${accounts.length})`);
}

/**
 * The demo company on the platform page — "try it yourself" before signing up.
 * Idempotent: created once, never re-seeded over.
 */
async function ensureDemoTenant() {
  // 'demo' is a reserved platform word, so the sample company gets a real
  // company-shaped slug — which is also a truer demo.
  const slug = process.env.LAWNCOPILOT_DEMO_SLUG || 'green-acres';
  const existing = await Tenant.findOne({ where: { slug } });
  if (existing) {
    // Keep v1's tenant usable as the demo after the v2 migration.
    if (existing.status === 'active' || existing.status === 'trialing') return existing;
    existing.status = 'active';
    await existing.save();
    return existing;
  }

  const r = await provisionTenant({
    company_name: 'Green Acres Lawn Care',
    slug,
    owner_name: 'Demo Owner',
    owner_email: 'demo@lawncopilot.com',
    owner_phone: null,
    password: process.env.LAWNCOPILOT_ADMIN_PASSWORD || 'lawncopilot@2026',
    state: 'FL',
    counties: ['Orange', 'Seminole'],
    crew_count: 2,
    plan: 'multi_trucks'
  });
  if (r.success) {
    await Tenant.update({ status: 'active' }, { where: { id: r.tenant_id } });
    console.log(`  Lawn Co-Pilot demo company live at /lawncopilot/${slug}`);
  } else {
    console.log('  Lawn Co-Pilot demo company not created:', r.error);
  }
  return r;
}

/**
 * Migrate the v1 single-tenant instance (tenant 1) into a real slugged company
 * so nothing that already exists is stranded.
 */
async function adoptLegacyTenant() {
  const legacy = await Tenant.findByPk(1);
  if (!legacy) return { adopted: false, reason: 'no tenant 1' };

  // v1 shipped tenant 1 with slug 'lawncopilot', which v2 reserves for the
  // platform itself. A reserved slug resolves to nothing, so the company would
  // be unreachable — rename it rather than leaving it stranded.
  const { RESERVED } = require('../tenancy');
  const needsSlug = !legacy.slug || RESERVED.has(legacy.slug);
  if (needsSlug) legacy.slug = 'lawn-monster';
  // v1 named tenant 1 after the platform. As a company it needs its own name,
  // or the demo reads as if the platform is a lawn care company.
  if (legacy.name === 'Lawn Co-Pilot') legacy.name = 'Lawn Monster';
  if (!legacy.brand || !legacy.brand.display_name || legacy.brand.display_name === 'Lawn Co-Pilot') {
    legacy.brand = defaultBrand('Lawn Monster');
  }
  if (!legacy.settings || !legacy.settings.enabled_employees) {
    legacy.settings = { ...(legacy.settings || {}), enabled_employees: enabledFor('scale') };
  }
  legacy.plan = normalizePlan(legacy.plan);
  legacy.status = 'active';
  legacy.short_code = legacy.short_code || shortCode();
  await legacy.save();

  // Make sure the adopted company has the share link every tenant gets.
  const existingLink = await ShortLink.findOne({ where: { tenant_id: legacy.id }, raw: true });
  if (!existingLink) {
    await ShortLink.create({
      tenant_id: legacy.id, code: legacy.short_code,
      target: `/lawncopilot/${legacy.slug}`, source: 'signup'
    });
  }
  cacheBust();
  return { adopted: true, slug: legacy.slug, name: legacy.name };
}

module.exports = {
  provisionTenant, ensurePlatform, ensureDemoTenant, adoptLegacyTenant,
  PLAN_LIMITS, PLAN_ORDER, normalizePlan, enabledFor, shortCode, defaultBrand
};
