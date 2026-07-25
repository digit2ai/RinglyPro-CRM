// First-party, privacy-friendly page-view analytics for the personal CV pages
// (manuelstagg.com / julianagramowski.com and their /manuelstagg, /juliana_gramowski
// clean URLs). Fully owned — no third party, no cookies. Logs one row per view to
// cv_page_hits, dedupes rapid reloads in-memory, and exposes an aggregated stats API
// gated by a key. IPs are never stored raw — only a salted SHA-256 hash.
const express = require('express');
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');

const router = express.Router();

const DB_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const sequelize = DB_URL ? new Sequelize(DB_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
}) : null;

const SALT = process.env.SESSION_SALT || process.env.JWT_SECRET || 'cv-analytics-salt';
const STATS_KEY = process.env.CV_ANALYTICS_KEY || 'Palindrome@7';
const ALLOWED_PAGES = new Set(['manuelstagg', 'juliana_gramowski']);

let ready = false;
async function ensureTable() {
  if (ready || !sequelize) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cv_page_hits (
      id BIGSERIAL PRIMARY KEY,
      page VARCHAR(64) NOT NULL,
      path TEXT,
      referrer TEXT,
      ua TEXT,
      ip_hash VARCHAR(64),
      country VARCHAR(8),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_page_hits_page_time ON cv_page_hits(page, created_at);
  `);
  ready = true;
}
if (sequelize) ensureTable().catch(e => console.error('cv-analytics ensureTable:', e.message));
else console.warn('cv-analytics: no DB URL set — analytics disabled');

function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || req.connection?.remoteAddress || '';
}
function hashIp(ip) {
  return crypto.createHash('sha256').update(SALT + '|' + ip).digest('hex').slice(0, 32);
}

// In-memory dedupe: ignore repeat hits from the same ip+page within 30s.
const recent = new Map();
function isDupe(key) {
  const now = Date.now();
  const last = recent.get(key) || 0;
  if (now - last < 30000) return true;
  recent.set(key, now);
  if (recent.size > 5000) { for (const [k, t] of recent) if (now - t > 60000) recent.delete(k); }
  return false;
}

// POST /api/cv/hit  { page, path, ref }  — fire-and-forget beacon from the CV pages.
router.post('/hit', async (req, res) => {
  res.status(204).end(); // ack immediately; never block the page
  try {
    if (!sequelize) return;
    await ensureTable();
    let { page, path: pth, ref } = req.body || {};
    page = String(page || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 64);
    if (!ALLOWED_PAGES.has(page)) return;
    const ip = clientIp(req);
    const iph = hashIp(ip);
    if (isDupe(iph + '|' + page)) return;
    const country = (req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '').toString().slice(0, 8) || null;
    await sequelize.query(
      `INSERT INTO cv_page_hits (page, path, referrer, ua, ip_hash, country)
       VALUES (:page, :path, :ref, :ua, :iph, :country)`,
      { replacements: {
          page,
          path: (pth || '').toString().slice(0, 300),
          ref: (ref || req.get('referer') || '').toString().slice(0, 500),
          ua: (req.get('user-agent') || '').toString().slice(0, 400),
          iph, country
        }, type: QueryTypes.INSERT }
    );
  } catch (e) { /* swallow — analytics must never error the site */ }
});

// GET /api/cv/stats?page=manuelstagg&days=30&key=...  — aggregated dashboard data.
router.get('/stats', async (req, res) => {
  try {
    if ((req.query.key || '') !== STATS_KEY) return res.status(401).json({ error: 'invalid key' });
    if (!sequelize) return res.status(503).json({ error: 'analytics DB not configured' });
    await ensureTable();
    const page = String(req.query.page || 'manuelstagg').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!ALLOWED_PAGES.has(page)) return res.status(400).json({ error: 'unknown page' });
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));

    const [totals] = await sequelize.query(
      `SELECT COUNT(*)::int AS views, COUNT(DISTINCT ip_hash)::int AS visitors
       FROM cv_page_hits WHERE page=:page AND created_at > now() - (:days || ' days')::interval`,
      { replacements: { page, days }, type: QueryTypes.SELECT });

    const byDay = await sequelize.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS views, COUNT(DISTINCT ip_hash)::int AS visitors
       FROM cv_page_hits WHERE page=:page AND created_at > now() - (:days || ' days')::interval
       GROUP BY 1 ORDER BY 1`,
      { replacements: { page, days }, type: QueryTypes.SELECT });

    const topRef = await sequelize.query(
      `SELECT COALESCE(NULLIF(referrer,''),'(direct)') AS referrer, COUNT(*)::int AS views
       FROM cv_page_hits WHERE page=:page AND created_at > now() - (:days || ' days')::interval
       GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      { replacements: { page, days }, type: QueryTypes.SELECT });

    const allTime = await sequelize.query(
      `SELECT COUNT(*)::int AS views, COUNT(DISTINCT ip_hash)::int AS visitors FROM cv_page_hits WHERE page=:page`,
      { replacements: { page }, type: QueryTypes.SELECT });

    res.json({ page, days, window: totals, all_time: allTime[0], by_day: byDay, top_referrers: topRef });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/health', (req, res) => res.json({ ok: true, ready }));

module.exports = router;
