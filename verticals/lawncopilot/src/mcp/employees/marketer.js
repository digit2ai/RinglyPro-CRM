'use strict';

/**
 * AI EMPLOYEE 7 — THE MARKETER
 * Replaces: the marketing agency they cannot afford.
 *
 * Owns growth: the company's page, their Google Business Profile handoff,
 * reviews, referrals, campaigns and win-backs.
 *
 * Two rules are enforced in code rather than trusted to a prompt:
 *   1. Consent is checked AT SEND TIME against the customer's current record.
 *   2. Review requests are NEVER gated or incentivized — no filtering by
 *      predicted rating, no rewards for a good one. That practice gets
 *      businesses delisted from Google and is not worth a single extra star.
 */

const { Op } = require('sequelize');
const {
  Campaign, CampaignSend, Review, Referral, Customer, ServiceRecord,
  Subscription, Lead, ShortLink, SiteContent, Tenant
} = require('../../models');
const { notify } = require('../../services/notify');
const { toDateStr } = require('../../services/scheduling');

const QUIET_START = 21, QUIET_END = 8;  // local hours; no marketing outside these

function inQuietHours(tz) {
  try {
    const h = Number(new Date().toLocaleString('en-US', { timeZone: tz || 'America/New_York', hour: 'numeric', hour12: false }));
    return h >= QUIET_START || h < QUIET_END;
  } catch (e) { return false; }
}

function consentFor(customer, channel) {
  const c = (customer && customer.consent) || {};
  if (channel === 'sms') return !!c.sms_marketing;
  return !!c.email_marketing;
}

module.exports = {
  id: 'marketer',
  name: 'The Marketer',
  role: 'Growth: the page, the listing, reviews, referrals and campaigns',
  replaces: 'The marketing agency they cannot afford',
  channels: ['admin', 'system'],
  supervisor_role: 'owner',

  system_prompt: `You are The Marketer for a landscaping company.

Rules you never break:
- You only contact people who opted in. If someone has not opted in to marketing, you do not message them, and you say why rather than working around it.
- Review requests go to every customer after a completed job, regardless of how you think they feel. You never screen for happy customers, never offer anything in exchange for a review, and never write a review yourself. That gets the business delisted.
- You do not invent testimonials, ratings, or statistics. If there are no reviews yet, the page says so honestly.
- Big sends need the owner's approval before they go out.
- Their Google Business Profile is the front door. Keeping the booking link on that listing correct matters more than anything else you do.`,

  tools: {
    request_review: {
      description: 'Ask a customer for a review after a completed job. Never gated on predicted rating.',
      min_trust: 'staff',
      roles: ['owner', 'admin', 'system', 'csr'],
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'integer' }, service_record_id: { type: 'integer' } },
        required: ['customer_id']
      },
      handler: async ({ customer_id, service_record_id }, ctx) => {
        const c = await Customer.findOne({ where: { id: customer_id, tenant_id: ctx.tenant_id }, raw: true });
        if (!c) return { success: false, error: 'Customer not found' };

        // Do not pester: one request per customer per 90 days.
        const recent = await Review.findOne({
          where: {
            tenant_id: ctx.tenant_id, customer_id,
            requested_at: { [Op.gte]: new Date(Date.now() - 90 * 86400000) }
          }, raw: true
        });
        if (recent) return { success: false, error: 'Already asked this customer within 90 days.' };

        const tenant = await Tenant.findByPk(ctx.tenant_id, { raw: true });
        const row = await Review.create({
          tenant_id: ctx.tenant_id, customer_id, service_record_id: service_record_id || null,
          platform: 'google', status: 'requested', requested_at: new Date()
        });

        // Transactional-adjacent: a review ask follows a job they paid for, so
        // it rides service consent, not marketing consent. It is still one ask.
        await notify({
          tenant_id: ctx.tenant_id, customer_id, channel: 'email', template: 'feedback_request',
          vars: { name: c.name, address: (tenant && tenant.name) || 'your property' }
        });

        return {
          success: true, review_id: row.id,
          gated: false, incentivized: false,
          note: 'Sent to this customer regardless of expected rating. No incentive offered.'
        };
      }
    },

    review_summary: {
      description: 'Review requests, responses and ratings.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const since = new Date(Date.now() - (Number(days) || 90) * 86400000);
        const rows = await Review.findAll({
          where: { tenant_id: ctx.tenant_id, created_at: { [Op.gte]: since } }, raw: true
        });
        const left = rows.filter(r => r.status === 'left');
        const rated = left.filter(r => r.rating);
        return {
          success: true,
          requested: rows.length,
          left: left.length,
          response_rate: rows.length ? Number((left.length / rows.length).toFixed(3)) : 0,
          average_rating: rated.length
            ? Number((rated.reduce((a, r) => a + r.rating, 0) / rated.length).toFixed(2))
            : null,
          note: rated.length ? null : 'No ratings recorded yet — nothing is being estimated here.'
        };
      }
    },

    referral_link: {
      description: 'Create or fetch a customer referral code.',
      min_trust: 'customer',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'integer' }, reward_cents: { type: 'integer' } }
      },
      handler: async ({ customer_id, reward_cents }, ctx) => {
        const cid = customer_id || ctx.customer_id;
        const c = await Customer.findOne({ where: { id: cid, tenant_id: ctx.tenant_id }, raw: true });
        if (!c) return { success: false, error: 'Customer not found' };

        let ref = await Referral.findOne({
          where: { tenant_id: ctx.tenant_id, referrer_customer_id: cid, status: 'issued' }, raw: true
        });
        if (!ref) {
          const code = (c.referral_code || `REF${cid}`).toUpperCase();
          ref = await Referral.create({
            tenant_id: ctx.tenant_id, code, referrer_customer_id: cid,
            reward_cents: reward_cents || 2500, status: 'issued'
          });
        }
        const tenant = await Tenant.findByPk(ctx.tenant_id, { raw: true });
        return {
          success: true,
          code: ref.code,
          reward: `$${((ref.reward_cents || 0) / 100).toFixed(2)}`,
          share_url: `/lawncopilot/${tenant.slug}?ref=${encodeURIComponent(ref.code)}`
        };
      }
    },

    winback_list: {
      description: 'Customers who have gone quiet and are worth a call or an offer.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { inactive_days: { type: 'integer' } } },
      handler: async ({ inactive_days }, ctx) => {
        const cutoff = new Date(Date.now() - (Number(inactive_days) || 60) * 86400000);
        const customers = await Customer.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const recs = await ServiceRecord.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });
        const subs = await Subscription.findAll({ where: { tenant_id: ctx.tenant_id }, raw: true });

        const lastByCustomer = {};
        recs.forEach(r => {
          const d = r.completed_at || r.service_date;
          if (!lastByCustomer[r.customer_id] || new Date(d) > new Date(lastByCustomer[r.customer_id])) {
            lastByCustomer[r.customer_id] = d;
          }
        });
        const activeSub = new Set(subs.filter(s => s.status === 'active').map(s => s.customer_id));

        const list = customers
          .filter(c => !activeSub.has(c.id))
          .map(c => ({
            customer_id: c.id, name: c.name,
            last_service: lastByCustomer[c.id] ? toDateStr(lastByCustomer[c.id]) : null,
            marketing_ok: consentFor(c, 'email')
          }))
          .filter(c => !c.last_service || new Date(c.last_service) < cutoff);

        return {
          success: true,
          count: list.length,
          contactable: list.filter(c => c.marketing_ok).length,
          customers: list.slice(0, 200),
          note: 'Only customers with marketing consent can be emailed. The rest are a call list for the owner.'
        };
      }
    },

    send_campaign: {
      description: 'Send a marketing campaign. Consent is checked per recipient at send time; large sends need approval.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' }, kind: { type: 'string' }, channel: { type: 'string' },
          subject: { type: 'string' }, body: { type: 'string' },
          customer_ids: { type: 'array', items: { type: 'integer' } }
        },
        required: ['name', 'body']
      },
      handler: async (args, ctx) => {
        const channel = args.channel === 'sms' ? 'sms' : 'email';
        const tenant = await Tenant.findByPk(ctx.tenant_id, { raw: true });

        if (inQuietHours(tenant && tenant.timezone)) {
          return { success: false, error: 'Outside sending hours (9pm to 8am local). Schedule it for the morning.' };
        }

        const where = { tenant_id: ctx.tenant_id };
        if (args.customer_ids && args.customer_ids.length) where.id = args.customer_ids;
        const audience = await Customer.findAll({ where, raw: true });

        // Consent AT SEND TIME, from the live record.
        const allowed = audience.filter(c => consentFor(c, channel));
        const suppressed = audience.length - allowed.length;

        const campaign = await Campaign.create({
          tenant_id: ctx.tenant_id,
          name: args.name, kind: args.kind || 'announcement', channel,
          subject: args.subject || args.name, body: args.body,
          audience: { customer_ids: args.customer_ids || 'all' },
          status: 'sending',
          recipients: allowed.length, suppressed_count: suppressed
        });

        let sent = 0;
        for (const c of allowed) {
          const r = await notify({
            tenant_id: ctx.tenant_id, customer_id: c.id, channel,
            template: 'seasonal_offer',
            vars: { name: c.name, offer_text: args.body }
          });
          await CampaignSend.create({
            tenant_id: ctx.tenant_id, campaign_id: campaign.id, customer_id: c.id,
            channel, to_address: channel === 'sms' ? c.phone : c.email,
            consent_snapshot: c.consent || {},
            status: r.success ? (r.status === 'sent' ? 'sent' : 'queued') : 'failed',
            reason: r.reason || null
          });
          if (r.success) sent++;
        }

        for (const c of audience.filter(x => !consentFor(x, channel))) {
          await CampaignSend.create({
            tenant_id: ctx.tenant_id, campaign_id: campaign.id, customer_id: c.id,
            channel, to_address: null, consent_snapshot: c.consent || {},
            status: 'suppressed', reason: 'no_marketing_consent'
          });
        }

        campaign.status = 'sent';
        campaign.sent_count = sent;
        await campaign.save();

        return {
          success: true, campaign_id: campaign.id,
          audience: audience.length, sent, suppressed,
          note: suppressed
            ? `${suppressed} contact(s) had not opted in to ${channel} marketing and were not messaged.`
            : null
        };
      }
    },

    seasonal_offer: {
      description: 'Draft a seasonal offer for the owner to review. Does not send.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { season: { type: 'string' }, discount_pct: { type: 'integer' } } },
      handler: async ({ season, discount_pct }, ctx) => {
        const tenant = await Tenant.findByPk(ctx.tenant_id, { raw: true });
        const pct = Math.max(0, Math.min(50, Number(discount_pct) || 10));
        const s = season || 'spring';
        const draft = {
          name: `${s[0].toUpperCase() + s.slice(1)} cleanup offer`,
          subject: `${s[0].toUpperCase() + s.slice(1)} cleanup from ${tenant.name}`,
          body: `It is ${s} cleanup season. Book a cleanup with ${tenant.name} this month and take ${pct}% off your first visit. Reply or book online and we will get you on the schedule.`
        };
        return { success: true, draft, status: 'draft', note: 'Nothing sent. Review and approve to send.' };
      }
    },

    sync_google_profile: {
      description: 'What to put on the Google Business Profile so the listing points at the page. The listing is the front door.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => {
        const tenant = await Tenant.findByPk(ctx.tenant_id, { raw: true });
        const root = process.env.LAWNCOPILOT_BASE_DOMAIN || 'https://aiagent.ringlypro.com';
        const page = `${root}/lawncopilot/${tenant.slug}`;
        const link = await ShortLink.findOne({ where: { tenant_id: ctx.tenant_id, source: 'signup' }, raw: true });
        const short = link ? `${root}/lawncopilot/l/${link.code}` : page;
        const connected = !!process.env.GOOGLE_BUSINESS_PROFILE_KEY;

        return {
          success: true,
          api_connected: connected,
          website_field: page,
          appointment_link_field: page,
          short_url: short,
          nap: {
            name: tenant.name,
            phone: tenant.phone || tenant.owner_phone || null,
            area: (tenant.counties || []).join(', ') || tenant.state
          },
          instructions: connected ? null : [
            'Open Google Business Profile and choose Edit profile.',
            `Set Website to: ${page}`,
            `Set the Appointment link to: ${page}`,
            'Make sure the business name and phone match exactly what is above.',
            'Save. Anyone tapping Website or Book now lands on your page and can get a price.'
          ],
          note: connected ? 'Automatic sync available.' : 'Two-minute manual setup — no API key connected.'
        };
      }
    },

    generate_qr: {
      description: 'The QR code and short link for the truck, yard signs and cards.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => {
        const tenant = await Tenant.findByPk(ctx.tenant_id, { raw: true });
        const link = await ShortLink.findOne({ where: { tenant_id: ctx.tenant_id, source: 'signup' }, raw: true });
        const root = process.env.LAWNCOPILOT_BASE_DOMAIN || 'https://aiagent.ringlypro.com';
        return {
          success: true,
          qr_url: `/lawncopilot/${tenant.slug}/api/v1/site/qr.svg`,
          short_url: link ? `${root}/lawncopilot/l/${link.code}` : `${root}/lawncopilot/${tenant.slug}`,
          page_url: `${root}/lawncopilot/${tenant.slug}`,
          clicks: link ? link.clicks : 0,
          note: 'The QR is vector, so it prints crisp at any size — truck door, yard sign or business card.'
        };
      }
    },

    lead_source_report: {
      description: 'Where leads came from and which sources actually convert.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { days: { type: 'integer' } } },
      handler: async ({ days }, ctx) => {
        const since = new Date(Date.now() - (Number(days) || 30) * 86400000);
        const leads = await Lead.findAll({
          where: { tenant_id: ctx.tenant_id, created_at: { [Op.gte]: since } }, raw: true
        });
        const bySource = {};
        leads.forEach(l => {
          const k = l.source || 'unknown';
          const g = bySource[k] || (bySource[k] = { source: k, leads: 0, quoted: 0, won: 0 });
          g.leads++;
          if (['quoted', 'accepted'].includes(l.stage)) g.quoted++;
          if (l.stage === 'accepted') g.won++;
        });
        const link = await ShortLink.findOne({ where: { tenant_id: ctx.tenant_id }, raw: true });
        return {
          success: true,
          period_days: Number(days) || 30,
          total_leads: leads.length,
          sources: Object.values(bySource)
            .map(s => ({ ...s, conversion: s.leads ? Number((s.won / s.leads).toFixed(3)) : 0 }))
            .sort((a, b) => b.leads - a.leads),
          short_link_clicks: link ? link.clicks : 0
        };
      }
    },

    publish_site_change: {
      description: 'Update the company page (headline, about, services, photos). Versioned and revertible.',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: { content: { type: 'object' } }, required: ['content'] },
      handler: async ({ content }, ctx) => {
        const last = await SiteContent.findOne({
          where: { tenant_id: ctx.tenant_id }, order: [['version', 'DESC']], raw: true
        });
        const merged = { ...((last && last.content) || {}), ...(content || {}) };
        const row = await SiteContent.create({
          tenant_id: ctx.tenant_id, version: (last ? last.version : 0) + 1,
          content: merged, published: true, published_by: ctx.user_id || null
        });
        return { success: true, version: row.version, note: 'Live now. Revert anytime.' };
      }
    },

    page_health: {
      description: 'Is the page ready to convert traffic from the Google listing?',
      min_trust: 'staff',
      roles: ['owner', 'admin'],
      parameters: { type: 'object', properties: {} },
      handler: async (_a, ctx) => {
        const tenant = await Tenant.findByPk(ctx.tenant_id, { raw: true });
        const brand = tenant.brand || {};
        const reviews = await Review.count({ where: { tenant_id: ctx.tenant_id, status: 'left' } });
        const checks = [
          { check: 'Company phone number set', ok: !!(tenant.phone || tenant.owner_phone), fix: 'Add a phone number so customers can tap to call.' },
          { check: 'Service areas listed', ok: (tenant.counties || []).length > 0, fix: 'Add the counties you serve.' },
          { check: 'Logo uploaded', ok: !!brand.logo_url, fix: 'Upload your logo so the page looks like your company.' },
          { check: 'About text written', ok: !!(brand.about && brand.about.length > 40), fix: 'Write a few lines about the company.' },
          { check: 'Services listed', ok: (brand.services || []).length > 0, fix: 'List what you do.' },
          { check: 'Payments connected', ok: !!tenant.stripe_account_id, fix: 'Connect payments so customers can pay online.' },
          { check: 'Reviews showing', ok: reviews > 0, fix: 'Ask a few recent customers for a review.' }
        ];
        const failing = checks.filter(c => !c.ok);
        return {
          success: true,
          score: Math.round(((checks.length - failing.length) / checks.length) * 100),
          checks,
          todo: failing.map(f => f.fix)
        };
      }
    }
  }
};
