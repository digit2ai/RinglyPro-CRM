'use strict';

/**
 * AgroMercado — Phase 3: Synchronous live auction engine.
 * Each bid is an ACID transaction (row-locked) to prevent concurrency collisions
 * and equal-value over-bids. Minimum next bid uses the ISTC ln() formula.
 * Live updates streamed via SSE (no server-bootstrap changes needed).
 */

const express = require('express');
const router = express.Router();

const { sequelize, Auction, Bid } = require('../models');
const { CATEGORY_BY_ID } = require('../categories');
const { minimumBid } = require('../utils/bid');
const { tenantId, requireAuth, requireRole } = require('../middleware/auth');

// ── SSE: one event bus per auction lot ──────────────────────────────────────
const streams = new Map(); // auctionId -> Set<res>
function broadcast(auctionId, event, data) {
  const set = streams.get(String(auctionId));
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(payload); } catch (e) { /* dropped */ } }
}

// GET /subastas/reglamento — static auction rules
router.get('/reglamento', (req, res) => {
  res.json({
    success: true,
    reglamento: [
      'Cada puja debe superar la puja mínima calculada por el sistema.',
      'La puja mínima crece con el volumen de pujas del lote (factor logarítmico).',
      'Las pujas son vinculantes y se registran de forma inmutable.',
      'El lote se adjudica a la puja más alta al cierre del temporizador.',
      'Solo usuarios verificados (KYC) pueden pujar en lotes de alta genética.'
    ]
  });
});

// GET /subastas — list (optionally by status)
router.get('/', async (req, res) => {
  try {
    const tid = tenantId(req);
    const where = { tenant_id: tid };
    if (req.query.status) where.status = req.query.status;
    const auctions = await Auction.findAll({ where, order: [['starts_at', 'ASC']] });
    res.json({ success: true, count: auctions.length, auctions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /subastas/:id — detail with bid count + computed next minimum bid
router.get('/:id', async (req, res) => {
  try {
    const tid = tenantId(req);
    const auction = await Auction.findOne({ where: { id: req.params.id, tenant_id: tid } });
    if (!auction) return res.status(404).json({ error: 'Subasta no encontrada' });
    const bidCount = await Bid.count({ where: { auction_id: auction.id } });
    const current = Number(auction.current_bid_usd || auction.start_price_usd);
    const next_min_bid = minimumBid(current, Number(auction.base_increment_usd), bidCount);
    res.json({ success: true, auction, bid_count: bidCount, current_bid_usd: current, next_min_bid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /subastas/:id/stream — SSE live bid feed
router.get('/:id/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders && res.flushHeaders();
  const key = String(req.params.id);
  if (!streams.has(key)) streams.set(key, new Set());
  streams.get(key).add(res);
  res.write(`event: connected\ndata: {"auction_id":"${key}"}\n\n`);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(ping); const s = streams.get(key); if (s) s.delete(res); });
});

// POST /subastas/:id/puja — place a bid (ACID, server recomputes P_min)
router.post('/:id/puja', requireAuth, async (req, res) => {
  const tid = tenantId(req);
  const amount = Number(req.body.amount_usd);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount_usd inválido' });
  try {
    const result = await sequelize.transaction(async (t) => {
      // Row-lock the auction to serialize concurrent bids on the same lot.
      const auction = await Auction.findOne({
        where: { id: req.params.id, tenant_id: tid }, lock: t.LOCK.UPDATE, transaction: t
      });
      if (!auction) { const e = new Error('Subasta no encontrada'); e.code = 404; throw e; }
      if (auction.status === 'closed') { const e = new Error('La subasta está cerrada'); e.code = 409; throw e; }

      const bidCount = await Bid.count({ where: { auction_id: auction.id }, transaction: t });
      const current = Number(auction.current_bid_usd || auction.start_price_usd);
      const pMin = minimumBid(current, Number(auction.base_increment_usd), bidCount);
      if (amount < pMin) {
        const e = new Error(`La puja debe ser al menos $${pMin.toFixed(2)} USD`); e.code = 422; e.next_min_bid = pMin; throw e;
      }
      const bid = await Bid.create({
        tenant_id: tid, auction_id: auction.id, bidder_id: req.amUser.id, amount_usd: amount
      }, { transaction: t });
      auction.current_bid_usd = amount;
      if (auction.status === 'scheduled') auction.status = 'live';
      await auction.save({ transaction: t });

      const nextMin = minimumBid(amount, Number(auction.base_increment_usd), bidCount + 1);
      return { bid, current_bid_usd: amount, next_min_bid: nextMin, bid_count: bidCount + 1 };
    });

    broadcast(req.params.id, 'bid:placed', {
      auction_id: Number(req.params.id), amount_usd: result.current_bid_usd,
      next_min_bid: result.next_min_bid, bid_count: result.bid_count, at: new Date().toISOString()
    });
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    const code = e.code || 500;
    const body = { error: e.message };
    if (e.next_min_bid) body.next_min_bid = e.next_min_bid;
    res.status(code === 404 || code === 409 || code === 422 ? code : 500).json(body);
  }
});

// POST /subastas — create (admin)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const tid = tenantId(req);
    const { title, category_id, lots, start_price_usd, starts_at, location } = req.body;
    if (!title || !category_id || start_price_usd == null || !starts_at) {
      return res.status(400).json({ error: 'title, category_id, start_price_usd y starts_at son requeridos' });
    }
    const cat = CATEGORY_BY_ID[category_id];
    if (!cat) return res.status(400).json({ error: 'category_id inválido' });
    const auction = await Auction.create({
      tenant_id: tid, title, category_id, lots: lots || 1, start_price_usd,
      base_increment_usd: cat.base_increment_usd, starts_at, location, status: 'scheduled'
    });
    res.status(201).json({ success: true, auction });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /subastas/:id/cerrar — close (admin)
router.patch('/:id/cerrar', requireRole('admin'), async (req, res) => {
  try {
    const tid = tenantId(req);
    const auction = await Auction.findOne({ where: { id: req.params.id, tenant_id: tid } });
    if (!auction) return res.status(404).json({ error: 'Subasta no encontrada' });
    auction.status = 'closed';
    await auction.save();
    broadcast(req.params.id, 'auction:closed', { auction_id: Number(req.params.id), final_bid_usd: Number(auction.current_bid_usd || 0) });
    res.json({ success: true, auction });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
