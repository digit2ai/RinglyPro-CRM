/**
 * Unified core router: public info, auth, members, regions, exchange,
 * metrics, payments, admin, match. Preserves the previous unified-chamber.js
 * surface and adds admin write paths.
 */
const express = require('express');
const { sequelize, QueryTypes, bcrypt, signToken, authMiddleware, requireAdmin } = require('./lib/shared');

// Canonical lists -- mirror the dropdowns in public/dashboard/{en,index}.html
// and public/signup-member/{en,index}.html. Server validates against these so
// no free-form values can sneak in via a forged request and break matching.
const CHAMBER_COUNTRIES = new Set([
  'Argentina','Austria','Belgium','Belize','Bolivia','Brazil','Bulgaria','Canada',
  'Chile','Colombia','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic',
  'Denmark','Dominican Republic','Ecuador','El Salvador','Estonia','Finland',
  'France','Germany','Greece','Guatemala','Guyana','Haiti','Honduras','Hungary',
  'Iceland','Ireland','Italy','Jamaica','Latvia','Lithuania','Luxembourg','Malta',
  'Mexico','Netherlands','Nicaragua','Norway','Panama','Paraguay','Peru',
  'Philippines','Poland','Portugal','Puerto Rico','Romania','Slovakia','Slovenia',
  'Spain','Suriname','Sweden','Switzerland','Trinidad and Tobago','Turkey',
  'Ukraine','United Kingdom','United States','Uruguay','Venezuela'
]);
const CHAMBER_LANGUAGES = new Set(['English', 'Spanish']);

// Chambers in this comma-separated env list skip the $25 setup fee and the
// $10/mo subscription at signup. Members are activated immediately and a
// $0 "waived" transaction is recorded for audit. Remove the slug from the
// env var to restore paid signup with no other code changes.
const WAIVED_FEE_SLUGS = (process.env.WAIVE_SIGNUP_FEES_SLUGS || 'cv-2')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
function signupFeesWaived(chamberSlug) {
  return WAIVED_FEE_SLUGS.includes(String(chamberSlug || '').toLowerCase());
}

const router = express.Router();

// =====================================================================
// PUBLIC -- chamber landing info
// =====================================================================
router.get('/public/info', async (req, res) => {
  try {
    const chamber = req.chamber;
    const [{ count: memberCount }] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM members WHERE chamber_id = :c AND status = 'active'`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const projects = await sequelize.query(
      `SELECT id, title, sector, plan_status, created_at
       FROM projects WHERE chamber_id = :c AND visibility = 'public_plan'
       ORDER BY created_at DESC LIMIT 3`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const rfqs = await sequelize.query(
      `SELECT id, title, sector, budget_range, deadline
       FROM rfqs WHERE chamber_id = :c AND status = 'open'
       ORDER BY created_at DESC LIMIT 3`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const sectors = await sequelize.query(
      `SELECT sector, COUNT(*) AS count FROM members
       WHERE chamber_id = :c AND status = 'active' AND sector IS NOT NULL
       GROUP BY sector ORDER BY count DESC LIMIT 8`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({
      success: true,
      data: {
        slug: chamber.slug, name: chamber.name, brand_domain: chamber.brand_domain,
        primary_language: chamber.primary_language, country: chamber.country,
        logo_url: chamber.logo_url, contact_email: chamber.contact_email,
        contact_phone: chamber.contact_phone, member_count: parseInt(memberCount),
        recent_projects: projects, open_rfqs: rfqs, top_sectors: sectors,
        payment_waived: signupFeesWaived(chamber.slug)
      }
    });
  } catch (err) {
    console.error('[/public/info]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// AUTH
// =====================================================================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'email and password required' });
    const [member] = await sequelize.query(
      `SELECT id, email, password_hash, first_name, last_name, membership_type, governance_role, access_level, status
       FROM members WHERE chamber_id = :c AND email = :email`,
      { replacements: { c: req.chamber_id, email: email.toLowerCase() }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    if (member.status === 'deleted' || member.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Account ' + member.status });
    }
    if (member.status === 'pending_payment') {
      // Waived chamber: auto-activate stragglers who registered before the
      // fee waiver was turned on, so they can log in without paying.
      if (signupFeesWaived(req.chamber.slug)) {
        await sequelize.query(
          `UPDATE members SET status = 'active', updated_at = NOW()
           WHERE chamber_id = :c AND id = :id`,
          { replacements: { c: req.chamber_id, id: member.id } }
        );
        await sequelize.query(
          `INSERT INTO transactions
           (chamber_id, type, from_member_id, amount, currency, status, description, created_at)
           VALUES (:c, 'membership_signup', :m, 0, 'USD', 'waived', :desc, NOW())`,
          {
            replacements: {
              c: req.chamber_id, m: member.id,
              desc: `Setup fee + monthly subscription waived for chamber ${req.chamber.slug} (promotional period, auto-activated at login)`
            }
          }
        );
        member.status = 'active';
        // Fall through to normal password verification below.
      } else {
      // Mint a fresh Stripe Checkout so the login screen can offer a
      // clickable resume link. Existing Checkout sessions on the row may
      // already be expired (24h limit), so always create a new one.
      let checkoutUrl = null;
      try {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (stripeKey) {
          const stripe = require('stripe')(stripeKey);
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          const slug = req.chamber.slug;
          const chamberName = req.chamber.name;
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: member.email,
            metadata: {
              chamber_id: String(req.chamber_id),
              chamber_slug: slug,
              member_id: String(member.id),
              member_email: member.email,
              flow: 'member_signup'
            },
            subscription_data: {
              metadata: {
                chamber_id: String(req.chamber_id),
                chamber_slug: slug,
                member_id: String(member.id)
              }
            },
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: `${chamberName} -- One-Time Setup Fee`,
                    description: 'Account provisioning, onboarding, and platform activation'
                  },
                  unit_amount: 2500
                },
                quantity: 1
              },
              {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: `${chamberName} -- Monthly Membership`,
                    description: 'Full ecosystem access: AI matching, directory, projects, exchange, analytics'
                  },
                  unit_amount: 1000,
                  recurring: { interval: 'month' }
                },
                quantity: 1
              }
            ],
            mode: 'subscription',
            success_url: `${baseUrl}/${slug}/login?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/${slug}/login?payment=cancelled`
          });
          checkoutUrl = session.url;
          await sequelize.query(
            `UPDATE members SET stripe_customer_id = :cs, updated_at = NOW()
             WHERE chamber_id = :c AND id = :id`,
            { replacements: { c: req.chamber_id, id: member.id, cs: session.id } }
          );
        }
      } catch (stripeErr) {
        console.error('[/auth/login resume-checkout]', stripeErr.message);
      }
      return res.status(402).json({
        success: false,
        error: 'Membership payment incomplete. Please finish checkout to activate your account.',
        code: 'PAYMENT_REQUIRED',
        checkout_url: checkoutUrl
      });
      } // end else (non-waived chamber)
    }
    const ok = await bcrypt.compare(password, member.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = signToken({
      member_id: member.id, chamber_id: req.chamber_id, chamber_slug: req.chamber.slug,
      email: member.email,
      access_level: member.access_level || 'member',
      governance_role: member.governance_role || 'member'
    });
    await sequelize.query(`UPDATE members SET last_active_at = NOW() WHERE id = :id`, { replacements: { id: member.id } });

    return res.json({
      success: true,
      data: {
        token,
        member: {
          id: member.id, email: member.email,
          first_name: member.first_name, last_name: member.last_name,
          membership_type: member.membership_type,
          governance_role: member.governance_role,
          access_level: member.access_level
        },
        chamber: { slug: req.chamber.slug, name: req.chamber.name, primary_language: req.chamber.primary_language }
      }
    });
  } catch (err) {
    console.error('[/auth/login]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Member signup. Creates the row with status='pending_payment' and returns a
// Stripe Checkout session URL. The member cannot log in or use /auth/me until
// the Stripe webhook (or the success_url verification call) flips their
// status to 'active' after the $25 setup + $10/mo recurring subscription
// payment succeeds.
router.post('/auth/signup-member', async (req, res) => {
  try {
    const {
      email, password, first_name, last_name,
      country, sector, company_name,
      // Business + matching fields
      sub_specialty, bio, years_experience, languages,
      linkedin_url, website_url, phone
    } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ success: false, error: 'email, password, first_name, last_name required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    const lowerEmail = email.toLowerCase().trim();

    // Normalise inputs that need light shaping before persistence.
    let langArray = null;
    if (Array.isArray(languages)) {
      langArray = languages.filter(l => l && String(l).trim()).map(l => String(l).trim());
    } else if (typeof languages === 'string' && languages.trim()) {
      langArray = languages.split(',').map(l => l.trim()).filter(Boolean);
    }
    // Enforce canonical English/Spanish only.
    if (langArray) langArray = langArray.filter(l => CHAMBER_LANGUAGES.has(l));
    // Country must be in the canonical list (blank is allowed for the form).
    let normalizedCountry = country;
    if (typeof country === 'string') {
      const t = country.trim();
      normalizedCountry = t === '' ? null : t;
      if (normalizedCountry && !CHAMBER_COUNTRIES.has(normalizedCountry)) {
        return res.status(400).json({ success: false, error: 'Invalid country -- pick one from the dropdown list' });
      }
    }
    const yrs = years_experience !== undefined && years_experience !== null && String(years_experience).trim() !== ''
      ? parseInt(years_experience) : null;
    function urlOk(u) {
      if (!u) return null;
      const trimmed = String(u).trim();
      if (!trimmed) return null;
      // Add https:// if missing
      return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
    }
    const linkedin = urlOk(linkedin_url);
    const website = urlOk(website_url);

    // Idempotent: if the email exists with status='pending_payment', reuse the
    // row and let them try checkout again. If it exists active, refuse.
    const [existing] = await sequelize.query(
      `SELECT id, status FROM members WHERE chamber_id = :c AND email = :email`,
      { replacements: { c: req.chamber_id, email: lowerEmail }, type: QueryTypes.SELECT }
    );
    if (existing && existing.status !== 'pending_payment') {
      return res.status(409).json({ success: false, error: 'Email already registered in this chamber' });
    }

    const baseReplacements = {
      c: req.chamber_id, fn: first_name, ln: last_name,
      country: normalizedCountry || null, sector: sector || null, company: company_name || null,
      sub: sub_specialty || null, bio: bio || null, yrs,
      langs: langArray && langArray.length > 0 ? '{' + langArray.map(l => '"' + l.replace(/"/g, '\\"') + '"').join(',') + '}' : null,
      linkedin, website, phone: phone || null
    };

    // For chambers in the waiver list, skip Stripe entirely and activate
    // immediately. Otherwise insert as pending_payment and proceed to checkout.
    const feesWaived = signupFeesWaived(req.chamber.slug);
    const initialStatus = feesWaived ? 'active' : 'pending_payment';

    let memberRow;
    if (existing) {
      const hash = await bcrypt.hash(password, 10);
      const [updated] = await sequelize.query(
        `UPDATE members
         SET password_hash = :hash, first_name = :fn, last_name = :ln,
             country = :country, sector = :sector, company_name = :company,
             sub_specialty = :sub, bio = :bio, years_experience = :yrs,
             languages = COALESCE(:langs::text[], languages),
             linkedin_url = :linkedin, website_url = :website, phone = :phone,
             status = CASE WHEN :waived THEN 'active' ELSE status END,
             updated_at = NOW()
         WHERE chamber_id = :c AND id = :id
         RETURNING id, email, first_name, last_name, membership_type, governance_role, access_level, status`,
        {
          replacements: { ...baseReplacements, id: existing.id, hash, waived: feesWaived },
          type: QueryTypes.SELECT
        }
      );
      memberRow = updated;
    } else {
      const hash = await bcrypt.hash(password, 10);
      const [row] = await sequelize.query(
        `INSERT INTO members
         (chamber_id, email, password_hash, first_name, last_name,
          country, sector, company_name, sub_specialty, bio, years_experience,
          languages, linkedin_url, website_url, phone,
          membership_type, governance_role, access_level, verification_level,
          status, trust_score, created_at, updated_at)
         VALUES
         (:c, :email, :hash, :fn, :ln,
          :country, :sector, :company, :sub, :bio, :yrs,
          COALESCE(:langs::text[], '{}'::text[]), :linkedin, :website, :phone,
          'individual', 'member', 'member', 'email',
          :status, 0.7, NOW(), NOW())
         RETURNING id, email, first_name, last_name, membership_type, governance_role, access_level, status`,
        {
          replacements: { ...baseReplacements, email: lowerEmail, hash, status: initialStatus },
          type: QueryTypes.SELECT
        }
      );
      memberRow = row;
    }

    // Waived chambers: record $0 audit row, mint token, skip Stripe.
    if (feesWaived) {
      await sequelize.query(
        `INSERT INTO transactions
         (chamber_id, type, from_member_id, amount, currency, status, description, created_at)
         VALUES (:c, 'membership_signup', :m, 0, 'USD', 'waived', :desc, NOW())`,
        {
          replacements: {
            c: req.chamber_id, m: memberRow.id,
            desc: `Setup fee + monthly subscription waived for chamber ${req.chamber.slug} (promotional period)`
          }
        }
      );
      const token = signToken({
        member_id: memberRow.id, chamber_id: req.chamber_id, chamber_slug: req.chamber.slug,
        email: memberRow.email,
        access_level: memberRow.access_level || 'member',
        governance_role: memberRow.governance_role || 'member'
      });
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      return res.status(201).json({
        success: true,
        data: {
          member_id: memberRow.id,
          email: memberRow.email,
          status: 'active',
          payment_waived: true,
          token,
          member: {
            id: memberRow.id, email: memberRow.email,
            first_name: memberRow.first_name, last_name: memberRow.last_name,
            membership_type: memberRow.membership_type, status: 'active'
          },
          redirect_url: `${baseUrl}/${req.chamber.slug}/dashboard/?welcome=1`,
          chamber: { slug: req.chamber.slug, name: req.chamber.name }
        }
      });
    }

    // Create Stripe Checkout session
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(500).json({ success: false, error: 'Stripe is not configured. Contact support.' });
    }
    const stripe = require('stripe')(stripeKey);

    // Determine the absolute base URL for redirect URLs. Honour the request's
    // host so the same code works on aiagent.ringlypro.com and camaravirtual.app.
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const slug = req.chamber.slug;
    const chamberName = req.chamber.name;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: lowerEmail,
      metadata: {
        chamber_id: String(req.chamber_id),
        chamber_slug: slug,
        member_id: String(memberRow.id),
        member_email: lowerEmail,
        flow: 'member_signup'
      },
      subscription_data: {
        metadata: {
          chamber_id: String(req.chamber_id),
          chamber_slug: slug,
          member_id: String(memberRow.id)
        }
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${chamberName} -- One-Time Setup Fee`,
              description: 'Account provisioning, onboarding, and platform activation'
            },
            unit_amount: 2500
          },
          quantity: 1
        },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${chamberName} -- Monthly Membership`,
              description: 'Full ecosystem access: AI matching, directory, projects, exchange, analytics'
            },
            unit_amount: 1000,
            recurring: { interval: 'month' }
          },
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: `${baseUrl}/${slug}/dashboard/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${slug}/signup-member?payment=cancelled`
    });

    // Stash the checkout session id on the row so the success-URL verifier can
    // double-check it matches before flipping status.
    await sequelize.query(
      `UPDATE members SET stripe_customer_id = :cs, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: memberRow.id, cs: session.id } }
    );

    return res.status(201).json({
      success: true,
      data: {
        member_id: memberRow.id,
        email: memberRow.email,
        status: 'pending_payment',
        checkout_url: session.url,
        checkout_session_id: session.id,
        chamber: { slug: req.chamber.slug, name: req.chamber.name }
      }
    });
  } catch (err) {
    console.error('[/auth/signup-member]', err.message, err.stack);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Verify Stripe Checkout completion using the session_id from the success URL.
// Flips member status to 'active', records the customer + subscription IDs,
// and returns a real auth token.
router.post('/auth/complete-signup-payment', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ success: false, error: 'session_id required' });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ success: false, error: 'Stripe is not configured' });
    const stripe = require('stripe')(stripeKey);

    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription'] });
    if (!session) return res.status(404).json({ success: false, error: 'Checkout session not found' });
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ success: false, error: `Payment not completed (status: ${session.payment_status})` });
    }

    const meta = session.metadata || {};
    if (String(meta.chamber_id) !== String(req.chamber_id)) {
      return res.status(403).json({ success: false, error: 'Session does not belong to this chamber' });
    }
    const memberId = parseInt(meta.member_id);
    if (!memberId) return res.status(400).json({ success: false, error: 'Session missing member_id metadata' });

    const [member] = await sequelize.query(
      `SELECT id, email, first_name, last_name, membership_type, governance_role, access_level, status
       FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: memberId }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    const subscriptionId = session.subscription && (session.subscription.id || session.subscription);
    const customerId = session.customer;

    await sequelize.query(
      `UPDATE members
       SET status = 'active',
           stripe_customer_id = :cust,
           stripe_subscription_id = :sub,
           updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      {
        replacements: {
          c: req.chamber_id, id: memberId,
          cust: customerId || null, sub: subscriptionId || null
        }
      }
    );
    await sequelize.query(
      `INSERT INTO transactions
       (chamber_id, type, from_member_id, amount, currency, status, description, created_at)
       VALUES (:c, 'membership_signup', :m, :amt, 'USD', 'completed', :desc, NOW())`,
      {
        replacements: {
          c: req.chamber_id, m: memberId,
          amt: (session.amount_total || 3500) / 100,
          desc: `Initial setup ($25) + first month ($10) -- session ${session.id}`
        }
      }
    );

    const token = signToken({
      member_id: member.id, chamber_id: req.chamber_id, chamber_slug: req.chamber.slug,
      email: member.email,
      access_level: member.access_level || 'member',
      governance_role: member.governance_role || 'member'
    });

    return res.json({
      success: true,
      data: {
        token,
        member: {
          id: member.id, email: member.email,
          first_name: member.first_name, last_name: member.last_name,
          membership_type: member.membership_type, status: 'active'
        },
        chamber: { slug: req.chamber.slug, name: req.chamber.name }
      }
    });
  } catch (err) {
    console.error('[/auth/complete-signup-payment]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const [member] = await sequelize.query(
      `SELECT m.id, m.chamber_id, m.email, m.first_name, m.last_name, m.country, m.region_id,
              m.sector, m.sub_specialty, m.years_experience, m.languages, m.company_name,
              m.company_registration_id, m.company_registration_country,
              m.membership_type, m.governance_role, m.access_level, m.bio, m.phone,
              m.linkedin_url, m.website_url, m.trust_score, m.verified, m.verification_level,
              m.status, m.created_at,
              r.name AS region_name
       FROM members m LEFT JOIN regions r ON r.id = m.region_id
       WHERE m.chamber_id = :c AND m.id = :id`,
      { replacements: { c: req.chamber_id, id: req.member.id }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({
      success: true, data: member,
      chamber: { slug: req.chamber.slug, name: req.chamber.name, primary_language: req.chamber.primary_language }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// MEMBERS
// =====================================================================
router.get('/members', authMiddleware, async (req, res) => {
  try {
    const { sector, country, region_id, search, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = ['m.chamber_id = :c', `m.status = 'active'`];
    const replacements = { c: req.chamber_id, limit: parseInt(limit), offset };
    if (sector) { conditions.push('m.sector = :sector'); replacements.sector = sector; }
    if (country) { conditions.push('m.country = :country'); replacements.country = country; }
    if (region_id) { conditions.push('m.region_id = :region_id'); replacements.region_id = parseInt(region_id); }
    if (search) {
      conditions.push("(m.first_name ILIKE :search OR m.last_name ILIKE :search OR m.email ILIKE :search OR m.company_name ILIKE :search)");
      replacements.search = `%${search}%`;
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const members = await sequelize.query(
      `SELECT m.id, m.email, m.first_name, m.last_name, m.country, m.region_id, m.sector, m.sub_specialty,
              m.years_experience, m.languages, m.company_name,
              m.company_registration_id, m.company_registration_country,
              m.membership_type, m.governance_role,
              m.access_level, m.bio, m.linkedin_url, m.website_url, m.trust_score, m.verified,
              m.verification_level, m.created_at, r.name AS region_name
       FROM members m LEFT JOIN regions r ON r.id = m.region_id ${where}
       ORDER BY m.last_name, m.first_name LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { members, pagination: { page: parseInt(page), limit: parseInt(limit) } } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/members/:id', authMiddleware, async (req, res) => {
  try {
    const [member] = await sequelize.query(
      `SELECT id, email, first_name, last_name, country, region_id, sector, sub_specialty,
              years_experience, languages, company_name, membership_type, governance_role,
              access_level, bio, phone, linkedin_url, website_url, trust_score, verified,
              verification_level, status, created_at
       FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({ success: true, data: member });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /members/:id -- self profile update OR admin/superadmin can update anyone in their chamber
router.put('/members/:id', authMiddleware, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const isSelf = targetId === req.member.id;
    const isAdmin = ['superadmin', 'admin_global', 'admin_regional'].includes(req.member.access_level);
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Cannot edit other members' });
    }
    const [exists] = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: targetId }, type: QueryTypes.SELECT }
    );
    if (!exists) return res.status(404).json({ success: false, error: 'Member not found' });

    const allowed = ['first_name', 'last_name', 'country', 'region_id', 'sector', 'sub_specialty',
                     'years_experience', 'languages', 'company_name', 'bio', 'phone',
                     'linkedin_url', 'website_url',
                     'company_registration_id', 'company_registration_country'];
    if (isAdmin) allowed.push('membership_type', 'governance_role', 'verified', 'verification_level');

    // Type-aware coercion. Empty strings become NULL so blanks clear the
    // column rather than write '' (which Postgres rejects for typed columns
    // like integer/text[]). Arrays and integers get explicit casts so raw
    // SQL parameter binding doesn't blow up with 'syntax error at or near ,'.
    const INT_FIELDS = new Set(['region_id', 'years_experience']);
    const ARRAY_FIELDS = new Set(['languages']);
    const URL_FIELDS = new Set(['linkedin_url', 'website_url']);

    function normalize(key, val) {
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val === 'string' && val.trim() === '') return null;
      if (INT_FIELDS.has(key)) {
        const n = parseInt(val);
        return Number.isFinite(n) ? n : null;
      }
      if (URL_FIELDS.has(key) && typeof val === 'string') {
        const t = val.trim();
        return /^https?:\/\//i.test(t) ? t : 'https://' + t;
      }
      // Country: strict whitelist. Reject anything not in CHAMBER_COUNTRIES
      // by returning undefined (caller will throw 400 below).
      if (key === 'country' && typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '') return null;
        if (!CHAMBER_COUNTRIES.has(trimmed)) {
          // Sentinel to flag invalid country -- caught below.
          return '__INVALID_COUNTRY__';
        }
        return trimmed;
      }
      if (ARRAY_FIELDS.has(key)) {
        // Accept either a JS array or a comma-separated string and emit a
        // postgres array literal -- bound with explicit ::text[] cast.
        let arr;
        if (Array.isArray(val)) arr = val;
        else if (typeof val === 'string') arr = val.split(',');
        else return null;
        arr = arr.map(s => String(s).trim()).filter(Boolean);
        // Languages: filter to canonical English/Spanish only.
        if (key === 'languages') {
          arr = arr.filter(s => CHAMBER_LANGUAGES.has(s));
        }
        if (arr.length === 0) return '{}';
        return '{' + arr.map(s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
      }
      return val;
    }

    const sets = []; const r = { c: req.chamber_id, id: targetId };
    for (const k of allowed) {
      if (!(k in req.body)) continue;
      const v = normalize(k, req.body[k]);
      if (v === undefined) continue;
      if (v === '__INVALID_COUNTRY__') {
        return res.status(400).json({ success: false, error: 'Invalid country -- pick one from the dropdown list' });
      }
      if (ARRAY_FIELDS.has(k)) {
        sets.push(`${k} = :${k}::text[]`);
      } else {
        sets.push(`${k} = :${k}`);
      }
      r[k] = v;
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    const [updated] = await sequelize.query(
      `UPDATE members SET ${sets.join(', ')} WHERE chamber_id = :c AND id = :id RETURNING *`,
      { replacements: r, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// REGIONS
// =====================================================================
router.get('/regions', authMiddleware, async (req, res) => {
  try {
    const regions = await sequelize.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM members m
         WHERE m.chamber_id = :c AND m.region_id = r.id AND m.status = 'active') AS member_count
       FROM regions r WHERE r.chamber_id = :c ORDER BY r.id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: regions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// EXCHANGE
// =====================================================================
router.get('/exchange/companies', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const companies = await sequelize.query(
      `SELECT c.*, m.first_name || ' ' || m.last_name AS owner_name
       FROM companies c LEFT JOIN members m ON m.id = c.owner_member_id
       WHERE c.chamber_id = :c ORDER BY c.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { companies, pagination: { total: companies.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// GET /exchange/rfqs -- visibility rule:
//   - 'open' RFQs are visible to every chamber member
//   - 'closed' RFQs are visible only to the requester OR to members whose
//     response was accepted (i.e. they "won" a piece of the work)
router.get('/exchange/rfqs', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rfqs = await sequelize.query(
      `SELECT r.*, m.first_name || ' ' || m.last_name AS requester_name, co.name AS company_name
       FROM rfqs r LEFT JOIN members m ON m.id = r.requester_member_id
       LEFT JOIN companies co ON co.id = r.company_id
       WHERE r.chamber_id = :c
         AND (
           r.status != 'closed'
           OR r.requester_member_id = :me
           OR EXISTS (
             SELECT 1 FROM rfq_responses rr
             WHERE rr.chamber_id = :c AND rr.rfq_id = r.id
               AND rr.responder_member_id = :me AND rr.status = 'accepted'
           )
         )
       ORDER BY r.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, me: req.member.id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { rfqs, pagination: { total: rfqs.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// GET /exchange/rfqs/:id -- single RFQ + responses joined with member/company.
// Visibility:
//   - 'open' RFQ: anyone in the chamber can see it + all responses
//   - 'closed' RFQ: only the requester + accepted responders can see it
// Non-owner responders only see their OWN response in the list (so bidders
// don't see competitor quotes); the owner sees everything.
router.get('/exchange/rfqs/:id', authMiddleware, async (req, res) => {
  try {
    const [rfq] = await sequelize.query(
      `SELECT r.*, m.first_name || ' ' || m.last_name AS requester_name,
              m.email AS requester_email, co.name AS company_name
       FROM rfqs r
       LEFT JOIN members m ON m.id = r.requester_member_id
       LEFT JOIN companies co ON co.id = r.company_id
       WHERE r.chamber_id = :c AND r.id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found' });

    const isOwner = rfq.requester_member_id === req.member.id;

    if (rfq.status === 'closed' && !isOwner) {
      // Closed RFQs are only visible to accepted bidders
      const [myAccepted] = await sequelize.query(
        `SELECT id FROM rfq_responses
         WHERE chamber_id = :c AND rfq_id = :id AND responder_member_id = :me AND status = 'accepted'`,
        { replacements: { c: req.chamber_id, id: req.params.id, me: req.member.id }, type: QueryTypes.SELECT }
      );
      if (!myAccepted) {
        return res.status(404).json({ success: false, error: 'RFQ not found' });
      }
    }

    // Responses scope: owner sees all; bidders see only their own.
    const responses = await sequelize.query(
      `SELECT rr.*, m.first_name || ' ' || m.last_name AS responder_name,
              co.name AS responder_company
       FROM rfq_responses rr
       LEFT JOIN members m ON m.id = rr.responder_member_id
       LEFT JOIN companies co ON co.id = rr.company_id
       WHERE rr.chamber_id = :c AND rr.rfq_id = :id
         AND (:isOwner OR rr.responder_member_id = :me)
       ORDER BY rr.created_at DESC`,
      {
        replacements: { c: req.chamber_id, id: req.params.id, me: req.member.id, isOwner },
        type: QueryTypes.SELECT
      }
    );
    return res.json({
      success: true,
      data: { ...rfq, responses, viewer_is_owner: isOwner }
    });
  } catch (err) {
    console.error('[GET /exchange/rfqs/:id]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /exchange/rfqs/:id/respond -- submit a proposal against an open RFQ.
// Anyone in the chamber can respond except the requester (can't bid on your own).
router.post('/exchange/rfqs/:id/respond', authMiddleware, async (req, res) => {
  try {
    const { proposal_text, price_quote, delivery_timeline, currency, company_id } = req.body || {};
    if (!proposal_text || !String(proposal_text).trim()) {
      return res.status(400).json({ success: false, error: 'proposal_text is required' });
    }
    const [rfq] = await sequelize.query(
      `SELECT id, status, requester_member_id FROM rfqs WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found' });
    if (rfq.status !== 'open') {
      return res.status(400).json({ success: false, error: `RFQ is ${rfq.status} -- no longer accepting proposals` });
    }
    if (rfq.requester_member_id === req.member.id) {
      return res.status(400).json({ success: false, error: 'You cannot respond to your own RFQ' });
    }
    // Prevent duplicate proposals from the same member.
    const [existing] = await sequelize.query(
      `SELECT id FROM rfq_responses WHERE chamber_id = :c AND rfq_id = :id AND responder_member_id = :m`,
      { replacements: { c: req.chamber_id, id: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    if (existing) {
      return res.status(409).json({ success: false, error: 'You already submitted a proposal for this RFQ' });
    }
    const [row] = await sequelize.query(
      `INSERT INTO rfq_responses
       (chamber_id, rfq_id, responder_member_id, company_id, proposal_text,
        price_quote, currency, delivery_timeline, status, created_at, updated_at)
       VALUES (:c, :id, :m, :company_id, :p, :pq, :cur, :dt, 'submitted', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, id: req.params.id, m: req.member.id,
          company_id: company_id ? parseInt(company_id) : null,
          p: String(proposal_text).trim(),
          pq: price_quote ? parseFloat(price_quote) : null,
          cur: currency || 'USD',
          dt: delivery_timeline ? String(delivery_timeline).trim() : null
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error('[POST /exchange/rfqs/:id/respond]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /exchange/rfqs/:id/responses/:rid/accept -- proposer accepts ONE
// proposal. Can be called multiple times on different responses (no
// single-winner constraint). Idempotent: re-accepting an already-accepted
// proposal is a no-op.
router.post('/exchange/rfqs/:id/responses/:rid/accept', authMiddleware, async (req, res) => {
  try {
    const [rfq] = await sequelize.query(
      `SELECT id, status, requester_member_id FROM rfqs WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found' });
    if (rfq.requester_member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Only the RFQ owner can accept proposals' });
    }
    if (rfq.status === 'closed') {
      return res.status(400).json({ success: false, error: 'RFQ is closed -- cannot accept new proposals' });
    }
    const [resp] = await sequelize.query(
      `SELECT id, status FROM rfq_responses WHERE chamber_id = :c AND rfq_id = :id AND id = :rid`,
      { replacements: { c: req.chamber_id, id: req.params.id, rid: req.params.rid }, type: QueryTypes.SELECT }
    );
    if (!resp) return res.status(404).json({ success: false, error: 'Proposal not found' });
    if (resp.status === 'accepted') {
      return res.json({ success: true, data: { already_accepted: true } });
    }
    await sequelize.query(
      `UPDATE rfq_responses SET status = 'accepted', updated_at = NOW()
       WHERE chamber_id = :c AND id = :rid`,
      { replacements: { c: req.chamber_id, rid: req.params.rid } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /exchange/rfqs/:id/responses/:rid/accept]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /exchange/rfqs/:id/close -- proposer closes the RFQ. After close,
// visibility narrows to the owner + responders whose proposals are accepted.
// Idempotent: closing an already-closed RFQ is a no-op.
router.post('/exchange/rfqs/:id/close', authMiddleware, async (req, res) => {
  try {
    const [rfq] = await sequelize.query(
      `SELECT id, status, requester_member_id FROM rfqs WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found' });
    if (rfq.requester_member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Only the RFQ owner can close it' });
    }
    if (rfq.status === 'closed') return res.json({ success: true, data: { already_closed: true } });
    await sequelize.query(
      `UPDATE rfqs SET status = 'closed', updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /exchange/rfqs/:id/close]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /exchange/rfqs -- create a new RFQ. Validates country + language
// inputs against the same canonical lists used everywhere else so the new
// row can match cleanly via AI scoring later.
router.post('/exchange/rfqs', authMiddleware, async (req, res) => {
  try {
    const { title, description, sector, budget_range, deadline, countries_target,
            target_languages, company_id } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ success: false, error: 'description is required' });
    }
    if (!sector) {
      return res.status(400).json({ success: false, error: 'sector is required' });
    }

    // Country whitelist: each entry must be in CHAMBER_COUNTRIES.
    let countriesArr = Array.isArray(countries_target) ? countries_target : [];
    countriesArr = countriesArr.map(c => String(c).trim()).filter(Boolean);
    const invalidCountries = countriesArr.filter(c => !CHAMBER_COUNTRIES.has(c));
    if (invalidCountries.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid country: ' + invalidCountries.join(', ') + '. Pick from the dropdown.'
      });
    }

    // Language whitelist: English / Spanish only.
    let langsArr = Array.isArray(target_languages) ? target_languages : [];
    langsArr = langsArr.map(l => String(l).trim()).filter(l => CHAMBER_LANGUAGES.has(l));

    const ctLiteral = countriesArr.length === 0
      ? '{}'
      : '{' + countriesArr.map(c => '"' + c.replace(/"/g, '\\"') + '"').join(',') + '}';
    const langLiteral = langsArr.length === 0
      ? '{}'
      : '{' + langsArr.map(l => '"' + l.replace(/"/g, '\\"') + '"').join(',') + '}';

    const [row] = await sequelize.query(
      `INSERT INTO rfqs
        (chamber_id, title, description, sector, budget_range, deadline,
         countries_target, target_languages, company_id, requester_member_id,
         status, created_at, updated_at)
       VALUES
        (:c, :title, :description, :sector, :budget_range, :deadline,
         :ct::text[], :lang::text[], :company_id, :req, 'open', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          c: req.chamber_id,
          title: String(title).trim(),
          description: String(description).trim(),
          sector,
          budget_range: budget_range ? String(budget_range).trim() : null,
          deadline: deadline || null,
          ct: ctLiteral,
          lang: langLiteral,
          company_id: company_id ? parseInt(company_id) : null,
          req: req.member.id
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error('[POST /exchange/rfqs]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/exchange/opportunities', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const opportunities = await sequelize.query(
      `SELECT o.*, m.first_name || ' ' || m.last_name AS posted_by_name
       FROM opportunities o LEFT JOIN members m ON m.id = o.posted_by_member_id
       WHERE o.chamber_id = :c ORDER BY o.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { opportunities, pagination: { total: opportunities.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// =====================================================================
// METRICS
// =====================================================================
router.get('/metrics/dashboard', authMiddleware, async (req, res) => {
  try {
    const [counts] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c AND status = 'active') AS members,
         (SELECT COUNT(*) FROM projects WHERE chamber_id = :c AND status NOT IN ('completed','cancelled')) AS active_projects,
         (SELECT COUNT(*) FROM companies WHERE chamber_id = :c) AS companies,
         (SELECT COUNT(*) FROM rfqs WHERE chamber_id = :c AND status = 'open') AS open_rfqs,
         (SELECT COUNT(*) FROM opportunities WHERE chamber_id = :c AND status = 'active') AS opportunities,
         (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE chamber_id = :c AND status = 'completed') AS total_revenue`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const membersByRegion = await sequelize.query(
      `SELECT r.name, COUNT(m.id) AS count
       FROM regions r LEFT JOIN members m
         ON m.region_id = r.id AND m.chamber_id = r.chamber_id AND m.status = 'active'
       WHERE r.chamber_id = :c
       GROUP BY r.id, r.name ORDER BY r.id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const membersByType = await sequelize.query(
      `SELECT membership_type, COUNT(*) AS count FROM members
       WHERE chamber_id = :c AND status = 'active'
       GROUP BY membership_type ORDER BY count DESC`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    // network_metrics history is optional -- table may not be populated for new chambers.
    let history = [];
    try {
      history = await sequelize.query(
        `SELECT * FROM network_metrics WHERE chamber_id = :c ORDER BY date DESC LIMIT 30`,
        { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
      );
    } catch (e) { /* table absent or empty -- fine */ }
    return res.json({
      success: true,
      data: {
        current: counts,
        members_by_region: membersByRegion,
        members_by_type: membersByType,
        history: history.reverse()
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/metrics/hci', authMiddleware, async (req, res) => {
  try {
    const [r] = await sequelize.query(
      `SELECT COALESCE(AVG(trust_score), 0.7) AS hci, COUNT(*) AS members
       FROM members WHERE chamber_id = :c AND status = 'active'`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const hci = parseFloat(r.hci) || 0.7;
    return res.json({ success: true, data: { hci, score: hci, value: hci, members: parseInt(r.members) } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/metrics/gini', authMiddleware, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT region_id, COUNT(*) AS n FROM members
       WHERE chamber_id = :c AND status='active' GROUP BY region_id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const counts = rows.map(r => parseInt(r.n)).sort((a, b) => a - b);
    let gini = 0;
    if (counts.length > 1) {
      const n = counts.length;
      const total = counts.reduce((s, x) => s + x, 0);
      let acc = 0;
      counts.forEach((x, i) => { acc += (i + 1) * x; });
      gini = total > 0 ? (2 * acc) / (n * total) - (n + 1) / n : 0;
    }
    return res.json({
      success: true,
      data: {
        gini: Math.max(0, gini),
        dimension: req.query.dimension || 'regional',
        metric: req.query.metric || 'members'
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/metrics/network-value', authMiddleware, async (req, res) => {
  try {
    const [s] = await sequelize.query(
      `SELECT COUNT(*) AS members,
              (SELECT COUNT(*) FROM projects WHERE chamber_id = :c) AS projects
       FROM members WHERE chamber_id = :c AND status='active'`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const m = parseInt(s.members) || 0;
    return res.json({
      success: true,
      data: { members: m, projects: parseInt(s.projects) || 0, network_value: m * m, formula: 'metcalfe_n_squared' }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// GET /metrics/trust/:id -- read the cached components/evidence + the score.
// Returns the result of the most recent verifier run; does NOT recompute.
// Use POST /members/:id/verify-trust to trigger a fresh computation.
router.get('/metrics/trust/:id', authMiddleware, async (req, res) => {
  try {
    const [m] = await sequelize.query(
      `SELECT id, first_name, last_name, trust_score, verified, verification_level,
              membership_type, created_at, trust_components, trust_evidence, trust_verified_at
       FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    if (!m) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({
      success: true,
      data: {
        member_id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        trust_score: parseFloat(m.trust_score),
        components: m.trust_components || {},
        evidence: m.trust_evidence || {},
        verified_at: m.trust_verified_at
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// POST /members/:id/verify-trust -- recompute the trust score from real
// business signals (website probe, company search, AI synthesis). Callable
// by the member themselves (id matches token) or by a chamber superadmin.
// Persists the result to members.trust_score + trust_components + trust_evidence.
router.post('/members/:id/verify-trust', authMiddleware, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (!targetId) return res.status(400).json({ success: false, error: 'Invalid member id' });

    const isSelf = targetId === req.member.id;
    const isAdmin = ['superadmin', 'admin_global', 'admin_regional'].includes(req.member.access_level);
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ success: false, error: 'You can only verify your own trust score' });
    }

    const [m] = await sequelize.query(
      `SELECT id, email, first_name, last_name, company_name, website_url, linkedin_url,
              sector, sub_specialty, bio, phone, languages, years_experience,
              verified, verification_level, created_at,
              company_registration_id, company_registration_country
       FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: targetId }, type: QueryTypes.SELECT }
    );
    if (!m) return res.status(404).json({ success: false, error: 'Member not found' });

    // Pull activity counts (projects + DMs sent + groups joined + searches saved).
    const [counts] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM project_members WHERE chamber_id = :c AND member_id = :m) AS projects,
         (SELECT COUNT(*) FROM chamber_messages WHERE chamber_id = :c AND sender_id = :m) AS dms,
         (SELECT COUNT(*) FROM chamber_group_members WHERE member_id = :m) AS groups,
         (SELECT COUNT(*) FROM member_searches WHERE chamber_id = :c AND member_id = :m) AS searches`,
      { replacements: { c: req.chamber_id, m: targetId }, type: QueryTypes.SELECT }
    );
    const activity = {
      projects: parseInt(counts.projects) || 0,
      dms: parseInt(counts.dms) || 0,
      groups: parseInt(counts.groups) || 0,
      searches: parseInt(counts.searches) || 0
    };

    const verifier = require('./lib/trust-verifier');
    // Default to AI on; allow caller to skip via ?ai=0 for fast/cheap re-runs.
    const useAi = !(req.query.ai === '0' || req.body && req.body.useAi === false);
    const result = await verifier.verifyMember(m, activity, { useAi });

    // Persist to DB.
    await sequelize.query(
      `UPDATE members
       SET trust_score = :s,
           trust_components = :comp::jsonb,
           trust_evidence = :ev::jsonb,
           trust_verified_at = NOW(),
           updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      {
        replacements: {
          c: req.chamber_id, id: targetId,
          s: result.score,
          comp: JSON.stringify(result.components),
          ev: JSON.stringify({ ...result.evidence, ai: result.ai })
        }
      }
    );

    return res.json({
      success: true,
      data: {
        member_id: targetId,
        trust_score: result.score,
        base_score: result.base_score,
        components: result.components,
        evidence: result.evidence,
        ai: result.ai,
        verified_at: result.verified_at
      }
    });
  } catch (err) {
    console.error('[verify-trust]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// PAYMENTS
// Dashboard expects /pricing (dict keyed by tier slug) + /history (joined
// with projects). Match the legacy chamber-template contract so the existing
// dashboard JS renders without a rewrite.
// =====================================================================
const DEFAULT_TIERS = {
  individual:   { monthly: 0,   annual: 0,    label: 'Individual' },
  emprendedor:  { monthly: 10,  annual: 96,   label: 'Emprendedor' },
  business:     { monthly: 25,  annual: 240,  label: 'Business' },
  empresarial:  { monthly: 25,  annual: 240,  label: 'Empresarial' },
  corporate:    { monthly: 75,  annual: 720,  label: 'Corporate' },
  corporativo:  { monthly: 75,  annual: 720,  label: 'Corporativo' },
  founding:     { monthly: 0,   annual: 0,    label: 'Founding' },
  fundador:     { monthly: 0,   annual: 0,    label: 'Fundador' }
};

router.get('/payments/pricing', authMiddleware, async (req, res) => {
  // Theme override hook: chambers.theme_config.membership_tiers wins if set.
  const theme = (req.chamber && req.chamber.theme_config) || {};
  const tiers = (theme && theme.membership_tiers) || DEFAULT_TIERS;
  return res.json({ success: true, data: tiers });
});

// /payments/plans alias kept for any older callers (returns the same dict).
router.get('/payments/plans', authMiddleware, async (req, res) => {
  const theme = (req.chamber && req.chamber.theme_config) || {};
  const tiers = (theme && theme.membership_tiers) || DEFAULT_TIERS;
  return res.json({ success: true, data: tiers });
});

router.post('/payments/membership', authMiddleware, async (req, res) => {
  try {
    const { membership_type, billing_period = 'monthly' } = req.body;
    const theme = (req.chamber && req.chamber.theme_config) || {};
    const tiers = (theme && theme.membership_tiers) || DEFAULT_TIERS;
    const pricing = tiers[membership_type];
    if (!pricing) return res.status(400).json({ success: false, error: 'Invalid membership type' });
    const amount = billing_period === 'annual' ? pricing.annual : pricing.monthly;

    const [member] = await sequelize.query(
      `SELECT id, email, first_name, last_name, stripe_customer_id
       FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.member.id }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    await sequelize.query(
      `INSERT INTO transactions
       (chamber_id, type, from_member_id, amount, currency, status, description, created_at)
       VALUES (:c, 'membership', :m, :amt, 'USD', 'pending', :desc, NOW())`,
      {
        replacements: {
          c: req.chamber_id, m: req.member.id, amt: amount,
          desc: `${pricing.label || membership_type} - ${billing_period}`
        }
      }
    );
    await sequelize.query(
      `UPDATE members SET membership_type = :type, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, type: membership_type, id: req.member.id } }
    );

    return res.json({
      success: true,
      data: {
        membership_type, billing_period, amount, currency: 'USD',
        stripe_customer_id: member.stripe_customer_id || null,
        pricing: tiers
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/payments/history', authMiddleware, async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = ['t.chamber_id = :c', '(t.from_member_id = :me OR t.to_member_id = :me)'];
    const replacements = { c: req.chamber_id, me: req.member.id, limit: parseInt(limit), offset };
    if (type) { conditions.push('t.type = :type'); replacements.type = type; }
    if (status) { conditions.push('t.status = :status'); replacements.status = status; }
    const where = 'WHERE ' + conditions.join(' AND ');

    const transactions = await sequelize.query(
      `SELECT t.*, p.title AS project_title
       FROM transactions t LEFT JOIN projects p ON p.id = t.project_id AND p.chamber_id = t.chamber_id
       ${where}
       ORDER BY t.created_at DESC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    );
    const [{ count }] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM transactions t ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({
      success: true, data: transactions,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// ADMIN
// =====================================================================
// GET /admin/chamber -- chamber settings the chamber admin can edit
router.get('/admin/chamber', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [row] = await sequelize.query(
      `SELECT id, slug, name, brand_domain, primary_language, country,
              logo_url, contact_email, contact_phone, status,
              subscription_status, created_at, updated_at
       FROM chambers WHERE id = :c`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    if (!row) return res.status(404).json({ success: false, error: 'Chamber not found' });
    return res.json({ success: true, data: row });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// PUT /admin/chamber -- update editable chamber metadata
router.put('/admin/chamber', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'contact_email', 'contact_phone', 'logo_url', 'country'];
    const sets = [];
    const repl = { c: req.chamber_id };
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        let v = req.body[k];
        if (typeof v === 'string') v = v.trim();
        if (v === '') v = null;
        if (k === 'name' && !v) {
          return res.status(400).json({ success: false, error: 'name cannot be empty' });
        }
        if (k === 'contact_email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          return res.status(400).json({ success: false, error: 'Invalid contact_email' });
        }
        if (k === 'logo_url' && v && !/^https?:\/\//i.test(v)) {
          return res.status(400).json({ success: false, error: 'logo_url must start with http(s)://' });
        }
        sets.push(`${k} = :${k}`);
        repl[k] = v;
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No editable fields supplied' });
    }
    sets.push('updated_at = NOW()');
    const [updated] = await sequelize.query(
      `UPDATE chambers SET ${sets.join(', ')} WHERE id = :c
       RETURNING id, slug, name, brand_domain, primary_language, country,
                 logo_url, contact_email, contact_phone, status, updated_at`,
      { replacements: repl, type: QueryTypes.SELECT }
    );
    // Drop both the chamber-resolver cache (slug-keyed) so subsequent
    // requests pick up the new logo/name immediately.
    try {
      const { invalidateCache } = require('../../../chamber-template/lib/chamber-resolver');
      invalidateCache(req.chamber.slug);
    } catch (_) {}
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /admin/chamber]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/admin/members', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const members = await sequelize.query(
      `SELECT m.*, r.name AS region_name FROM members m
       LEFT JOIN regions r ON r.id = m.region_id
       WHERE m.chamber_id = :c ORDER BY m.created_at DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, limit }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { members, pagination: { total: members.length } } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// POST /admin/members -- admin/superadmin creates a new member directly.
// Generates a random 12-char temporary password, returns it ONCE in the
// response. The member is created with status='active' so they can log in
// immediately (the admin shares the temp pw out of band).
router.post('/admin/members', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      email, first_name, last_name, country, region_id, sector, sub_specialty,
      company_name, company_registration_id, company_registration_country,
      bio, phone, linkedin_url, website_url, years_experience, languages,
      membership_type, governance_role, access_level
    } = req.body || {};
    if (!email || !first_name || !last_name) {
      return res.status(400).json({ success: false, error: 'email, first_name, last_name are required' });
    }
    const lowerEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowerEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email' });
    }
    // Reject duplicate email within the same chamber.
    const [dupe] = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND email = :email`,
      { replacements: { c: req.chamber_id, email: lowerEmail }, type: QueryTypes.SELECT }
    );
    if (dupe) {
      return res.status(409).json({ success: false, error: 'Email already registered in this chamber' });
    }
    // Country whitelist if provided
    if (country && !CHAMBER_COUNTRIES.has(country)) {
      return res.status(400).json({ success: false, error: 'Invalid country -- pick from the dropdown' });
    }
    // Languages filter
    let langsArr = Array.isArray(languages) ? languages : [];
    langsArr = langsArr.map(l => String(l).trim()).filter(l => CHAMBER_LANGUAGES.has(l));

    // Generate a 12-char URL-safe random temporary password.
    const tempPw = require('crypto').randomBytes(9).toString('base64')
      .replace(/\+/g, 'A').replace(/\//g, 'B').replace(/=/g, '');
    const hash = await bcrypt.hash(tempPw, 10);

    const langLiteral = langsArr.length === 0
      ? '{}'
      : '{' + langsArr.map(l => '"' + l.replace(/"/g, '\\"') + '"').join(',') + '}';
    const yrs = years_experience && String(years_experience).trim() !== ''
      ? parseInt(years_experience) : null;

    const [row] = await sequelize.query(
      `INSERT INTO members
        (chamber_id, email, password_hash, first_name, last_name, country, region_id,
         sector, sub_specialty, company_name, company_registration_id, company_registration_country,
         bio, phone, linkedin_url, website_url, years_experience, languages,
         membership_type, governance_role, access_level, verification_level,
         status, trust_score, created_at, updated_at)
       VALUES
        (:c, :email, :hash, :fn, :ln, :country, :region_id,
         :sector, :sub, :company, :crid, :crc,
         :bio, :phone, :linkedin, :website, :yrs, :langs::text[],
         :mt, :gr, :al, 'email',
         'active', 0.5, NOW(), NOW())
       RETURNING id, email, first_name, last_name, governance_role, access_level, membership_type`,
      {
        replacements: {
          c: req.chamber_id, email: lowerEmail, hash,
          fn: first_name, ln: last_name,
          country: country || null,
          region_id: region_id ? parseInt(region_id) : null,
          sector: sector || null, sub: sub_specialty || null,
          company: company_name || null,
          crid: company_registration_id || null,
          crc: company_registration_country || null,
          bio: bio || null, phone: phone || null,
          linkedin: linkedin_url || null, website: website_url || null,
          yrs, langs: langLiteral,
          mt: membership_type || 'individual',
          gr: governance_role || 'member',
          al: access_level || 'member'
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({
      success: true,
      data: { ...row, temporary_password: tempPw }
    });
  } catch (err) {
    console.error('[POST /admin/members]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /admin/members/:id -- soft-delete (status='deleted'). The row stays
// for audit + foreign-key integrity. Deleted members can't log in, won't
// appear in search/match results, and their content stays attributed.
router.delete('/admin/members/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (!targetId) return res.status(400).json({ success: false, error: 'Invalid member id' });
    if (targetId === req.member.id) {
      return res.status(400).json({ success: false, error: 'You cannot delete yourself' });
    }
    const [m] = await sequelize.query(
      `SELECT id, status FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: targetId }, type: QueryTypes.SELECT }
    );
    if (!m) return res.status(404).json({ success: false, error: 'Member not found' });
    if (m.status === 'deleted') {
      return res.json({ success: true, data: { already_deleted: true } });
    }
    await sequelize.query(
      `UPDATE members SET status = 'deleted', updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: targetId } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /admin/members/:id]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/admin/roles', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const board = await sequelize.query(
      `SELECT m.id, m.first_name, m.last_name, m.email, m.governance_role, m.access_level,
              m.region_id, m.membership_type, r.name AS region_name
       FROM members m LEFT JOIN regions r ON r.id = m.region_id
       WHERE m.chamber_id = :c AND m.governance_role != 'member'
       ORDER BY m.governance_role, m.last_name`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    const available_roles = ['superadmin', 'president', 'vp', 'secretary_general', 'treasurer',
      'board_member', 'chapter_president', 'chapter_secretary', 'chapter_treasurer',
      'chapter_board', 'member'];
    return res.json({
      success: true,
      data: { governance_board: board, available_roles, access_levels: ['superadmin', 'admin_global', 'admin_regional', 'member'] }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/regions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const regions = await sequelize.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM members m
         WHERE m.region_id = r.id AND m.status = 'active' AND m.chamber_id = :c) AS member_count
       FROM regions r WHERE r.chamber_id = :c ORDER BY r.id`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: regions });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/system/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [stats] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c) AS total_members,
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c AND status='active') AS active_members,
         (SELECT COUNT(*) FROM members WHERE chamber_id = :c AND governance_role != 'member') AS governance_roles_assigned,
         (SELECT COUNT(*) FROM projects WHERE chamber_id = :c) AS total_projects,
         (SELECT COUNT(*) FROM companies WHERE chamber_id = :c) AS total_companies,
         (SELECT COUNT(*) FROM rfqs WHERE chamber_id = :c AND status='open') AS open_rfqs,
         (SELECT COUNT(*) FROM transactions WHERE chamber_id = :c) AS total_transactions,
         (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE chamber_id = :c AND status='completed') AS total_revenue,
         (SELECT COUNT(*) FROM matches WHERE chamber_id = :c) AS total_matches,
         (SELECT COUNT(*) FROM trust_references WHERE chamber_id = :c) AS total_references,
         (SELECT COUNT(*) FROM opportunities WHERE chamber_id = :c AND status='active') AS active_opportunities,
         (SELECT COUNT(*) FROM events WHERE chamber_id = :c) AS total_events`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { overview: stats, members_by_access: [], database_tables: [] } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// PUT /admin/members/:id/access -- update access_level
router.put('/admin/members/:id/access', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { access_level } = req.body;
    const valid = ['superadmin', 'admin_global', 'admin_regional', 'member'];
    if (!valid.includes(access_level)) {
      return res.status(400).json({ success: false, error: 'Invalid access_level' });
    }
    if (access_level === 'superadmin' && req.member.access_level !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Only superadmin can grant superadmin' });
    }
    const [updated] = await sequelize.query(
      `UPDATE members SET access_level = :al, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id RETURNING id, access_level`,
      { replacements: { c: req.chamber_id, id: targetId, al: access_level }, type: QueryTypes.SELECT }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /admin/members/:id/membership -- update membership_type
router.put('/admin/members/:id/membership', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { membership_type } = req.body;
    if (!membership_type) {
      return res.status(400).json({ success: false, error: 'membership_type required' });
    }
    const [updated] = await sequelize.query(
      `UPDATE members SET membership_type = :mt, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id RETURNING id, membership_type`,
      { replacements: { c: req.chamber_id, id: targetId, mt: membership_type }, type: QueryTypes.SELECT }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Member not found' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// AI MATCHING
// =====================================================================
router.post('/match', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.body.limit) || 10, 50);
    const members = await sequelize.query(
      `SELECT id AS member_id, first_name, last_name, email, company_name, sector, country,
              trust_score, membership_type, region_id
       FROM members
       WHERE chamber_id = :c AND status='active' AND id != :me
       ORDER BY trust_score DESC LIMIT :limit`,
      { replacements: { c: req.chamber_id, me: req.member.id, limit }, type: QueryTypes.SELECT }
    );
    const results = members.map(m => ({
      ...m,
      trust_score: parseFloat(m.trust_score),
      similarity_score: 0.5,
      gini_correction: 1.0,
      final_score: parseFloat(m.trust_score)
    }));
    return res.json({ success: true, data: { results, total_candidates: results.length } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// =====================================================================
// SAVED SEARCHES -- persist a member's AI Matching queries so they can
// re-run them later without retyping. Schema is created by the DDL in
// the deploy migration; see CLAUDE.md for table definition.
// =====================================================================

// List the current member's saved searches, newest first.
router.get('/searches', authMiddleware, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, label, query_text, sector, region_id, country, result_count,
              last_run_at, created_at
       FROM member_searches
       WHERE chamber_id = :c AND member_id = :m
       ORDER BY created_at DESC
       LIMIT 100`,
      { replacements: { c: req.chamber_id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Save a new search. Body: { label?, query_text?, sector?, region_id?, country?, result_count? }
router.post('/searches', authMiddleware, async (req, res) => {
  try {
    const { label, query_text, sector, region_id, country, result_count } = req.body || {};
    if (!query_text && !sector && !region_id && !country) {
      return res.status(400).json({ success: false, error: 'At least one filter or query_text required' });
    }
    const autoLabel = label && String(label).trim()
      ? String(label).trim().slice(0, 255)
      : (query_text ? String(query_text).slice(0, 80) : `${sector || 'All'} - ${country || 'Any'}`);
    const [row] = await sequelize.query(
      `INSERT INTO member_searches
       (chamber_id, member_id, label, query_text, sector, region_id, country, result_count, last_run_at, created_at, updated_at)
       VALUES (:c, :m, :label, :qt, :sec, :rid, :ctry, :rc, NOW(), NOW(), NOW())
       RETURNING id, label, query_text, sector, region_id, country, result_count, last_run_at, created_at`,
      {
        replacements: {
          c: req.chamber_id, m: req.member.id,
          label: autoLabel,
          qt: query_text || null,
          sec: sector || null,
          rid: region_id ? parseInt(region_id) : null,
          ctry: country || null,
          rc: Number.isInteger(result_count) ? result_count : 0
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Touch a saved search's last_run_at (when the member re-runs it).
router.post('/searches/:id/touch', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
    await sequelize.query(
      `UPDATE member_searches
       SET last_run_at = NOW(), result_count = COALESCE(:rc, result_count), updated_at = NOW()
       WHERE chamber_id = :c AND member_id = :m AND id = :id`,
      {
        replacements: {
          c: req.chamber_id, m: req.member.id, id,
          rc: Number.isInteger(req.body && req.body.result_count) ? req.body.result_count : null
        }
      }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a saved search.
router.delete('/searches/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
    await sequelize.query(
      `DELETE FROM member_searches WHERE chamber_id = :c AND member_id = :m AND id = :id`,
      { replacements: { c: req.chamber_id, m: req.member.id, id } }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// DIRECT MESSAGES (member-to-member) -- inbox + threads
// =====================================================================
// Schema: chamber_conversations (canonical pair with member_a_id < member_b_id),
// chamber_messages (each message has sender + recipient + body + read_at).
// All queries are scoped by chamber_id so members in different chambers can't
// see each other's threads even when sharing a member_id space.

function pairKey(a, b) {
  const ai = parseInt(a), bi = parseInt(b);
  return ai < bi ? [ai, bi] : [bi, ai];
}

// Look up or create the conversation row between the current member and `other`.
async function findOrCreateConversation(chamberId, meId, otherId) {
  const [a, b] = pairKey(meId, otherId);
  const [existing] = await sequelize.query(
    `SELECT id FROM chamber_conversations
     WHERE chamber_id = :c AND member_a_id = :a AND member_b_id = :b`,
    { replacements: { c: chamberId, a, b }, type: QueryTypes.SELECT }
  );
  if (existing) return existing.id;
  const [row] = await sequelize.query(
    `INSERT INTO chamber_conversations (chamber_id, member_a_id, member_b_id, last_message_at, created_at, updated_at)
     VALUES (:c, :a, :b, NOW(), NOW(), NOW())
     RETURNING id`,
    { replacements: { c: chamberId, a, b }, type: QueryTypes.SELECT }
  );
  return row.id;
}

// Cheap unread-count endpoint for the sidebar badge. Called frequently so it
// must be cheap; sums unread direct messages + unread group messages.
router.get('/inbox/unread-count', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const [dmRow] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM chamber_messages
       WHERE chamber_id = :c AND recipient_id = :m AND read_at IS NULL`,
      { replacements: { c: req.chamber_id, m: me }, type: QueryTypes.SELECT }
    );
    const [grpRow] = await sequelize.query(
      `SELECT COUNT(*) AS c
       FROM chamber_group_messages gm
       JOIN chamber_group_members gmem ON gmem.group_id = gm.group_id AND gmem.member_id = :me
       WHERE gm.chamber_id = :c
         AND gm.created_at > gmem.last_read_at
         AND gm.sender_id != :me`,
      { replacements: { c: req.chamber_id, me }, type: QueryTypes.SELECT }
    );
    const total = (parseInt(dmRow.c) || 0) + (parseInt(grpRow.c) || 0);
    return res.json({
      success: true,
      data: {
        unread: total,
        unread_dms: parseInt(dmRow.c) || 0,
        unread_groups: parseInt(grpRow.c) || 0
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// List the current member's conversations, newest activity first.
router.get('/inbox', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const rows = await sequelize.query(
      `SELECT c.id, c.last_message_at, c.last_message_preview, c.last_sender_id,
              CASE WHEN c.member_a_id = :me THEN c.member_b_id ELSE c.member_a_id END AS other_id,
              o.first_name AS other_first_name, o.last_name AS other_last_name,
              o.company_name AS other_company, o.email AS other_email, o.sector AS other_sector,
              (SELECT COUNT(*) FROM chamber_messages m
                WHERE m.conversation_id = c.id AND m.recipient_id = :me AND m.read_at IS NULL) AS unread_count
       FROM chamber_conversations c
       JOIN members o ON o.id = CASE WHEN c.member_a_id = :me THEN c.member_b_id ELSE c.member_a_id END
       WHERE c.chamber_id = :ch AND (c.member_a_id = :me OR c.member_b_id = :me)
       ORDER BY c.last_message_at DESC
       LIMIT 100`,
      { replacements: { ch: req.chamber_id, me }, type: QueryTypes.SELECT }
    );
    return res.json({
      success: true,
      data: rows.map(r => ({
        conversation_id: r.id,
        last_message_at: r.last_message_at,
        last_message_preview: r.last_message_preview,
        last_sender_id: r.last_sender_id,
        unread_count: parseInt(r.unread_count) || 0,
        other_member: {
          id: r.other_id, first_name: r.other_first_name, last_name: r.other_last_name,
          company_name: r.other_company, email: r.other_email, sector: r.other_sector
        }
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get the message thread between current member and :other_id.
// Marks all messages from :other_id as read in the same call.
router.get('/conversations/:other_id/messages', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const other = parseInt(req.params.other_id);
    if (!other) return res.status(400).json({ success: false, error: 'Invalid other_id' });
    if (other === me) return res.status(400).json({ success: false, error: 'Cannot message yourself' });

    // Verify the other member belongs to this chamber.
    const [otherMember] = await sequelize.query(
      `SELECT id, first_name, last_name, company_name, email, sector
       FROM members WHERE chamber_id = :c AND id = :id AND status = 'active'`,
      { replacements: { c: req.chamber_id, id: other }, type: QueryTypes.SELECT }
    );
    if (!otherMember) return res.status(404).json({ success: false, error: 'Member not found in this chamber' });

    const [a, b] = pairKey(me, other);
    const [conv] = await sequelize.query(
      `SELECT id FROM chamber_conversations
       WHERE chamber_id = :c AND member_a_id = :a AND member_b_id = :b`,
      { replacements: { c: req.chamber_id, a, b }, type: QueryTypes.SELECT }
    );

    if (!conv) {
      return res.json({ success: true, data: { messages: [], other_member: otherMember } });
    }

    const messages = await sequelize.query(
      `SELECT id, sender_id, recipient_id, body, read_at, created_at
       FROM chamber_messages
       WHERE conversation_id = :cid
       ORDER BY created_at ASC
       LIMIT 500`,
      { replacements: { cid: conv.id }, type: QueryTypes.SELECT }
    );

    // Mark unread inbound messages as read.
    await sequelize.query(
      `UPDATE chamber_messages SET read_at = NOW()
       WHERE conversation_id = :cid AND recipient_id = :me AND read_at IS NULL`,
      { replacements: { cid: conv.id, me } }
    );

    return res.json({ success: true, data: { messages, other_member: otherMember, conversation_id: conv.id } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Send a message. Body: { recipient_id, body }
router.post('/messages', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const recipient = parseInt(req.body && req.body.recipient_id);
    const body = (req.body && req.body.body || '').toString().trim();
    if (!recipient) return res.status(400).json({ success: false, error: 'recipient_id required' });
    if (recipient === me) return res.status(400).json({ success: false, error: 'Cannot message yourself' });
    if (!body) return res.status(400).json({ success: false, error: 'Message body required' });
    if (body.length > 5000) return res.status(400).json({ success: false, error: 'Message too long (5000 chars max)' });

    // Verify recipient is active in this chamber.
    const [recip] = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND id = :id AND status = 'active'`,
      { replacements: { c: req.chamber_id, id: recipient }, type: QueryTypes.SELECT }
    );
    if (!recip) return res.status(404).json({ success: false, error: 'Recipient not found in this chamber' });

    const convId = await findOrCreateConversation(req.chamber_id, me, recipient);

    const [msg] = await sequelize.query(
      `INSERT INTO chamber_messages (chamber_id, conversation_id, sender_id, recipient_id, body, created_at)
       VALUES (:c, :cid, :s, :r, :b, NOW())
       RETURNING id, sender_id, recipient_id, body, read_at, created_at`,
      { replacements: { c: req.chamber_id, cid: convId, s: me, r: recipient, b: body }, type: QueryTypes.SELECT }
    );

    // Update the conversation's denormalised "last message" fields for cheap inbox queries.
    const preview = body.length > 200 ? body.slice(0, 197) + '...' : body;
    await sequelize.query(
      `UPDATE chamber_conversations
       SET last_message_at = NOW(), last_message_preview = :p, last_sender_id = :s, updated_at = NOW()
       WHERE id = :cid`,
      { replacements: { cid: convId, p: preview, s: me } }
    );

    return res.status(201).json({ success: true, data: { message: msg, conversation_id: convId } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Explicit mark-all-read for a conversation (also done implicitly by GET thread).
router.post('/conversations/:other_id/read', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const other = parseInt(req.params.other_id);
    if (!other) return res.status(400).json({ success: false, error: 'Invalid other_id' });
    const [a, b] = pairKey(me, other);
    const [conv] = await sequelize.query(
      `SELECT id FROM chamber_conversations
       WHERE chamber_id = :c AND member_a_id = :a AND member_b_id = :b`,
      { replacements: { c: req.chamber_id, a, b }, type: QueryTypes.SELECT }
    );
    if (!conv) return res.json({ success: true, data: { updated: 0 } });
    await sequelize.query(
      `UPDATE chamber_messages SET read_at = NOW()
       WHERE conversation_id = :cid AND recipient_id = :me AND read_at IS NULL`,
      { replacements: { cid: conv.id, me } }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// GROUP CHATS (chamber-scoped, WhatsApp-style)
// Schema: chamber_groups + chamber_group_members (join, with last_read_at)
//        + chamber_group_messages (single sender, broadcast to all members)
// =====================================================================

// List the current member's groups, newest activity first, with per-group
// unread count (messages newer than my last_read_at that I did not send).
router.get('/groups', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const rows = await sequelize.query(
      `SELECT g.id, g.name, g.last_message_at, g.last_message_preview, g.last_sender_id,
              g.created_by_member_id, gm.last_read_at,
              (SELECT COUNT(*) FROM chamber_group_members WHERE group_id = g.id) AS member_count,
              (SELECT COUNT(*) FROM chamber_group_messages mm
                WHERE mm.group_id = g.id
                  AND mm.created_at > gm.last_read_at
                  AND mm.sender_id != :me) AS unread_count
       FROM chamber_groups g
       JOIN chamber_group_members gm ON gm.group_id = g.id AND gm.member_id = :me
       WHERE g.chamber_id = :c
       ORDER BY g.last_message_at DESC
       LIMIT 100`,
      { replacements: { c: req.chamber_id, me }, type: QueryTypes.SELECT }
    );
    return res.json({
      success: true,
      data: rows.map(r => ({
        group_id: r.id,
        name: r.name,
        last_message_at: r.last_message_at,
        last_message_preview: r.last_message_preview,
        last_sender_id: r.last_sender_id,
        created_by_member_id: r.created_by_member_id,
        member_count: parseInt(r.member_count) || 0,
        unread_count: parseInt(r.unread_count) || 0
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create a group. Body: { name, member_ids: [int...] }
// The creator is auto-added as a member.
router.post('/groups', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const name = ((req.body && req.body.name) || '').toString().trim().slice(0, 120);
    const requested = Array.isArray(req.body && req.body.member_ids) ? req.body.member_ids : [];
    if (!name) return res.status(400).json({ success: false, error: 'Group name required' });
    const memberIds = [...new Set(requested.map(v => parseInt(v)).filter(v => v && v !== me))];
    if (memberIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Pick at least one other member' });
    }
    if (memberIds.length > 100) {
      return res.status(400).json({ success: false, error: 'Groups are capped at 100 members' });
    }

    // Validate every requested member belongs to this chamber + is active.
    const validRows = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND status = 'active' AND id IN (:ids)`,
      { replacements: { c: req.chamber_id, ids: memberIds }, type: QueryTypes.SELECT }
    );
    const validIds = new Set(validRows.map(r => r.id));
    const invalid = memberIds.filter(id => !validIds.has(id));
    if (invalid.length > 0) {
      return res.status(400).json({ success: false, error: `Invalid member ids: ${invalid.join(', ')}` });
    }

    const [grp] = await sequelize.query(
      `INSERT INTO chamber_groups (chamber_id, name, created_by_member_id, last_message_at, created_at, updated_at)
       VALUES (:c, :n, :me, NOW(), NOW(), NOW())
       RETURNING id, name, created_at`,
      { replacements: { c: req.chamber_id, n: name, me }, type: QueryTypes.SELECT }
    );

    const allIds = [me, ...memberIds];
    const values = allIds.map(id => `(${grp.id}, ${id}, NOW(), NOW())`).join(', ');
    await sequelize.query(
      `INSERT INTO chamber_group_members (group_id, member_id, joined_at, last_read_at) VALUES ${values}`
    );

    return res.status(201).json({
      success: true,
      data: { group_id: grp.id, name: grp.name, member_count: allIds.length, created_at: grp.created_at }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get a group's thread + member list. Marks the thread read for the caller.
router.get('/groups/:id/messages', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const groupId = parseInt(req.params.id);
    if (!groupId) return res.status(400).json({ success: false, error: 'Invalid group id' });

    // Caller must be a member of this group + group must belong to this chamber.
    const [grp] = await sequelize.query(
      `SELECT g.id, g.name, g.created_by_member_id, g.created_at
       FROM chamber_groups g
       WHERE g.chamber_id = :c AND g.id = :id
         AND EXISTS (SELECT 1 FROM chamber_group_members WHERE group_id = g.id AND member_id = :me)`,
      { replacements: { c: req.chamber_id, id: groupId, me }, type: QueryTypes.SELECT }
    );
    if (!grp) return res.status(404).json({ success: false, error: 'Group not found or you are not a member' });

    const members = await sequelize.query(
      `SELECT gm.member_id, gm.joined_at, m.first_name, m.last_name, m.email
       FROM chamber_group_members gm
       JOIN members m ON m.id = gm.member_id
       WHERE gm.group_id = :gid
       ORDER BY gm.joined_at ASC`,
      { replacements: { gid: groupId }, type: QueryTypes.SELECT }
    );

    const messages = await sequelize.query(
      `SELECT m.id, m.sender_id, m.body, m.created_at,
              s.first_name AS sender_first_name, s.last_name AS sender_last_name
       FROM chamber_group_messages m
       LEFT JOIN members s ON s.id = m.sender_id
       WHERE m.group_id = :gid
       ORDER BY m.created_at ASC
       LIMIT 500`,
      { replacements: { gid: groupId }, type: QueryTypes.SELECT }
    );

    await sequelize.query(
      `UPDATE chamber_group_members SET last_read_at = NOW()
       WHERE group_id = :gid AND member_id = :me`,
      { replacements: { gid: groupId, me } }
    );

    return res.json({
      success: true,
      data: {
        group: grp,
        members,
        messages
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Send a message to a group. Body: { body }
router.post('/groups/:id/messages', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const groupId = parseInt(req.params.id);
    const body = ((req.body && req.body.body) || '').toString().trim();
    if (!groupId) return res.status(400).json({ success: false, error: 'Invalid group id' });
    if (!body) return res.status(400).json({ success: false, error: 'Message body required' });
    if (body.length > 5000) return res.status(400).json({ success: false, error: 'Message too long (5000 chars max)' });

    const [member] = await sequelize.query(
      `SELECT g.id FROM chamber_groups g
       JOIN chamber_group_members gm ON gm.group_id = g.id AND gm.member_id = :me
       WHERE g.chamber_id = :c AND g.id = :gid`,
      { replacements: { c: req.chamber_id, gid: groupId, me }, type: QueryTypes.SELECT }
    );
    if (!member) return res.status(403).json({ success: false, error: 'You are not a member of this group' });

    const [msg] = await sequelize.query(
      `INSERT INTO chamber_group_messages (chamber_id, group_id, sender_id, body, created_at)
       VALUES (:c, :gid, :me, :b, NOW())
       RETURNING id, sender_id, body, created_at`,
      { replacements: { c: req.chamber_id, gid: groupId, me, b: body }, type: QueryTypes.SELECT }
    );

    const preview = body.length > 200 ? body.slice(0, 197) + '...' : body;
    await sequelize.query(
      `UPDATE chamber_groups
       SET last_message_at = NOW(), last_message_preview = :p, last_sender_id = :me, updated_at = NOW()
       WHERE id = :gid`,
      { replacements: { gid: groupId, p: preview, me } }
    );

    // Sender's own read pointer advances so they don't see their own message as unread.
    await sequelize.query(
      `UPDATE chamber_group_members SET last_read_at = NOW() WHERE group_id = :gid AND member_id = :me`,
      { replacements: { gid: groupId, me } }
    );

    return res.status(201).json({ success: true, data: { message: msg } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Add members to an existing group (any member of the group can add others).
router.post('/groups/:id/members', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const groupId = parseInt(req.params.id);
    const requested = Array.isArray(req.body && req.body.member_ids) ? req.body.member_ids : [];
    if (!groupId) return res.status(400).json({ success: false, error: 'Invalid group id' });
    const ids = [...new Set(requested.map(v => parseInt(v)).filter(v => v && v !== me))];
    if (ids.length === 0) return res.status(400).json({ success: false, error: 'No members to add' });

    const [grp] = await sequelize.query(
      `SELECT g.id FROM chamber_groups g
       JOIN chamber_group_members gm ON gm.group_id = g.id AND gm.member_id = :me
       WHERE g.chamber_id = :c AND g.id = :gid`,
      { replacements: { c: req.chamber_id, gid: groupId, me }, type: QueryTypes.SELECT }
    );
    if (!grp) return res.status(403).json({ success: false, error: 'You are not a member of this group' });

    const valid = await sequelize.query(
      `SELECT id FROM members WHERE chamber_id = :c AND status = 'active' AND id IN (:ids)`,
      { replacements: { c: req.chamber_id, ids }, type: QueryTypes.SELECT }
    );
    const validIds = valid.map(r => r.id);
    if (validIds.length === 0) return res.status(400).json({ success: false, error: 'None of the ids are active members of this chamber' });

    const values = validIds.map(id => `(${groupId}, ${id}, NOW(), NOW())`).join(', ');
    await sequelize.query(
      `INSERT INTO chamber_group_members (group_id, member_id, joined_at, last_read_at) VALUES ${values}
       ON CONFLICT (group_id, member_id) DO NOTHING`
    );
    return res.json({ success: true, data: { added: validIds.length } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Leave a group (remove self).
router.delete('/groups/:id/members/me', authMiddleware, async (req, res) => {
  try {
    const me = req.member.id;
    const groupId = parseInt(req.params.id);
    if (!groupId) return res.status(400).json({ success: false, error: 'Invalid group id' });
    await sequelize.query(
      `DELETE FROM chamber_group_members WHERE group_id = :gid AND member_id = :me`,
      { replacements: { gid: groupId, me } }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
