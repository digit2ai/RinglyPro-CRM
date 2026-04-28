/**
 * Chamber Resolver Middleware
 *
 * Resolves chamber_id from URL slug parameter. Mounted at
 * /:chamber_slug/api/* by src/app.js. Attaches req.chamber and
 * req.chamber_id for downstream handlers to use in queries.
 *
 * Returns:
 *   404 if slug not found
 *   402 Payment Required if chamber subscription has lapsed
 */
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// Cheap in-memory cache: slug -> { chamber, expiresAt }
const cache = new Map();
const TTL_MS = 60_000; // 60s

async function lookupChamber(slug) {
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.chamber;
  const [row] = await sequelize.query(
    `SELECT id, slug, name, brand_domain, primary_language, country, status,
            logo_url, contact_email, owner_member_id,
            stripe_customer_id, subscription_status, theme_config
     FROM chambers WHERE slug = :slug`,
    { replacements: { slug }, type: QueryTypes.SELECT }
  );
  if (!row) return null;
  cache.set(slug, { chamber: row, expiresAt: Date.now() + TTL_MS });
  return row;
}

function invalidateCache(slug) {
  if (slug) cache.delete(slug);
  else cache.clear();
}

async function resolveChamberFromSlug(req, res, next) {
  const slug = req.params.chamber_slug || req.headers['x-chamber-slug'];
  if (!slug) {
    return res.status(400).json({ success: false, error: 'Chamber slug required in URL' });
  }
  try {
    const chamber = await lookupChamber(slug);
    if (!chamber) {
      return res.status(404).json({ success: false, error: 'Chamber not found' });
    }
    if (chamber.status === 'archived') {
      return res.status(410).json({ success: false, error: 'Chamber archived' });
    }
    if (chamber.status === 'suspended') {
      return res.status(402).json({ success: false, error: 'Chamber subscription lapsed -- payment required' });
    }
    req.chamber = chamber;
    req.chamber_id = chamber.id;
    next();
  } catch (err) {
    console.error('[chamber-resolver]', err.message);
    return res.status(500).json({ success: false, error: 'Chamber lookup failed' });
  }
}

module.exports = { resolveChamberFromSlug, invalidateCache, lookupChamber };
