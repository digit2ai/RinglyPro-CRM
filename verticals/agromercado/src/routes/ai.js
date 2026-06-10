'use strict';

/**
 * AgroMercado — Phase 6: Digit2AI AI layer (the differentiator).
 *  - Intelligent listing/seller fraud scoring
 *  - Real-time pricing & market trends (per category)
 *  - Auction traceability (immutable bid trail)
 *  - Operational monitoring snapshot
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { Product, Auction, Bid, User, FxRate } = require('../models');
const { CATEGORY_BY_ID, CATEGORIES } = require('../categories');
const { tenantId, requireRole } = require('../middleware/auth');

// GET /ai/market-trends?category_id= — price index from listings + closed auctions
router.get('/market-trends', async (req, res) => {
  try {
    const tid = tenantId(req);
    const cats = req.query.category_id ? [req.query.category_id] : CATEGORIES.map(c => c.id);
    const out = [];
    for (const cid of cats) {
      const rows = await Product.findAll({
        where: { tenant_id: tid, category_id: cid, status: 'active' },
        attributes: [
          [Product.sequelize.fn('COUNT', Product.sequelize.col('id')), 'count'],
          [Product.sequelize.fn('AVG', Product.sequelize.col('price_usd')), 'avg'],
          [Product.sequelize.fn('MIN', Product.sequelize.col('price_usd')), 'min'],
          [Product.sequelize.fn('MAX', Product.sequelize.col('price_usd')), 'max']
        ], raw: true
      });
      const r = rows[0] || {};
      out.push({
        category_id: cid, name: (CATEGORY_BY_ID[cid] || {}).name,
        listings: Number(r.count) || 0,
        avg_price_usd: r.avg ? Math.round(Number(r.avg) * 100) / 100 : null,
        min_price_usd: r.min ? Number(r.min) : null,
        max_price_usd: r.max ? Number(r.max) : null
      });
    }
    res.json({ success: true, trends: out, generated_at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /ai/auction-trail/:auctionId — immutable bid ledger
router.get('/auction-trail/:auctionId', async (req, res) => {
  try {
    const tid = tenantId(req);
    const auction = await Auction.findOne({ where: { id: req.params.auctionId, tenant_id: tid } });
    if (!auction) return res.status(404).json({ error: 'Subasta no encontrada' });
    const bids = await Bid.findAll({ where: { auction_id: auction.id }, order: [['created_at', 'ASC']] });
    res.json({
      success: true, auction_id: auction.id, title: auction.title, status: auction.status,
      trail: bids.map((b, i) => ({ seq: i + 1, amount_usd: Number(b.amount_usd), bidder_id: b.bidder_id, at: b.created_at }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /ai/fraud-flags — heuristic fraud scoring for listings/sellers (admin)
router.get('/fraud-flags', requireRole('admin'), async (req, res) => {
  try {
    const tid = tenantId(req);
    const products = await Product.findAll({ where: { tenant_id: tid, status: 'active' }, limit: 500 });
    // Per-category average for price-anomaly detection.
    const avgByCat = {};
    for (const c of CATEGORIES) {
      const r = await Product.findAll({
        where: { tenant_id: tid, category_id: c.id, status: 'active' },
        attributes: [[Product.sequelize.fn('AVG', Product.sequelize.col('price_usd')), 'avg']], raw: true
      });
      avgByCat[c.id] = r[0] && r[0].avg ? Number(r[0].avg) : null;
    }
    const flags = [];
    for (const p of products) {
      const reasons = [];
      let score = 0;
      const vendor = p.vendor_id ? await User.findByPk(p.vendor_id) : null;
      if (!vendor || !vendor.is_verified) { score += 40; reasons.push('vendedor no verificado'); }
      const avg = avgByCat[p.category_id];
      if (avg && Number(p.price_usd) < avg * 0.35) { score += 35; reasons.push('precio muy por debajo del promedio de categoría'); }
      if (!p.metadata || Object.keys(p.metadata).length === 0) { score += 15; reasons.push('sin atributos/metadata'); }
      if (!p.location_state) { score += 10; reasons.push('sin ubicación'); }
      if (score >= 50) flags.push({ product_id: p.id, title: p.title, risk_score: Math.min(score, 100), reasons });
    }
    flags.sort((a, b) => b.risk_score - a.risk_score);
    res.json({ success: true, flagged: flags.length, flags });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /ai/monitor — operational snapshot for the dashboard stat cards
router.get('/monitor', async (req, res) => {
  try {
    const tid = tenantId(req);
    const [listings, sellers, verifiedSellers, liveAuctions, totalBids, fx] = await Promise.all([
      Product.count({ where: { tenant_id: tid, status: 'active' } }),
      User.count({ where: { tenant_id: tid, role: { [Op.in]: ['producer', 'admin'] } } }),
      User.count({ where: { tenant_id: tid, is_verified: true } }),
      Auction.count({ where: { tenant_id: tid, status: 'live' } }),
      Bid.count({ where: { tenant_id: tid } }),
      FxRate.findOne({ where: { tenant_id: tid }, order: [['fetched_at', 'DESC']] })
    ]);
    res.json({
      success: true,
      stats: {
        active_listings: listings, sellers, verified_sellers: verifiedSellers,
        live_auctions: liveAuctions, total_bids: totalBids,
        fx: fx ? { bcv_ves: Number(fx.bcv_ves), parallel_ves: fx.parallel_ves ? Number(fx.parallel_ves) : null, fetched_at: fx.fetched_at } : null
      },
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
