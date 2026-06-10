'use strict';

/**
 * AgroMercado — Phase 5: KYC review, professional directory, farm map,
 * financiamiento + logística leads. WhatsApp notifications are log-only unless
 * AGROMERCADO_WHATSAPP_TOKEN + _PHONE_ID are set (disabled-by-default safety).
 */

const express = require('express');
const router = express.Router();

const { User, Kyc, Directory, Farm, ServiceRequest } = require('../models');
const { VE_STATES } = require('../categories');
const { tenantId, requireAuth, requireRole } = require('../middleware/auth');
const { notify } = require('../services/whatsapp');

// ── KYC ─────────────────────────────────────────────────────────────────────
// GET /services/kyc?status=  (admin queue)
router.get('/kyc', requireRole('admin'), async (req, res) => {
  const tid = tenantId(req);
  const where = { tenant_id: tid };
  if (req.query.status) where.status = req.query.status;
  const items = await Kyc.findAll({ where, order: [['created_at', 'ASC']] });
  res.json({ success: true, count: items.length, items });
});

// PATCH /services/kyc/:id  { status: approved|rejected }  (admin)
router.patch('/kyc/:id', requireRole('admin'), async (req, res) => {
  try {
    const tid = tenantId(req);
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status inválido' });
    const kyc = await Kyc.findOne({ where: { id: req.params.id, tenant_id: tid } });
    if (!kyc) return res.status(404).json({ error: 'KYC no encontrado' });
    kyc.status = status; kyc.reviewed_by = req.amUser.id;
    await kyc.save();
    if (status === 'approved' && kyc.user_id) {
      await User.update({ is_verified: true }, { where: { id: kyc.user_id, tenant_id: tid } });
    }
    const u = kyc.user_id ? await User.findByPk(kyc.user_id) : null;
    if (u && u.phone) notify(u.phone, status === 'approved'
      ? 'AgroMercado: su verificación KYC fue aprobada. Ya puede publicar.'
      : 'AgroMercado: su verificación KYC fue rechazada. Revise sus documentos.');
    res.json({ success: true, kyc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Professional directory ──────────────────────────────────────────────────
router.get('/directory', async (req, res) => {
  const tid = tenantId(req);
  const where = { tenant_id: tid };
  if (req.query.profession) where.profession = req.query.profession;
  if (req.query.state) where.state = req.query.state;
  const items = await Directory.findAll({ where, order: [['nombre', 'ASC']] });
  res.json({ success: true, count: items.length, items });
});

router.post('/directory', requireRole('admin'), async (req, res) => {
  try {
    const tid = tenantId(req);
    const { nombre, profession, state, certification, contact, is_verified } = req.body;
    if (!nombre || !profession) return res.status(400).json({ error: 'nombre y profession requeridos' });
    const item = await Directory.create({ tenant_id: tid, nombre, profession, state, certification, contact, is_verified: !!is_verified });
    res.status(201).json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Farm map ────────────────────────────────────────────────────────────────
router.get('/farms', async (req, res) => {
  const tid = tenantId(req);
  const where = { tenant_id: tid };
  if (req.query.state) where.state = req.query.state;
  const items = await Farm.findAll({ where });
  res.json({ success: true, count: items.length, farms: items });
});

router.post('/farms', requireAuth, async (req, res) => {
  try {
    const tid = tenantId(req);
    const { name, state, lat, lng } = req.body;
    if (state && !VE_STATES.includes(state)) return res.status(400).json({ error: 'state inválido' });
    const farm = await Farm.create({ tenant_id: tid, owner_id: req.amUser.id, name, state, lat, lng });
    res.status(201).json({ success: true, farm });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Financiamiento + Logística leads ────────────────────────────────────────
router.post('/request', async (req, res) => {
  try {
    const tid = tenantId(req);
    const { type, payload } = req.body;
    if (!['financiamiento', 'logistica'].includes(type)) return res.status(400).json({ error: 'type inválido (financiamiento|logistica)' });
    const reqItem = await ServiceRequest.create({
      tenant_id: tid, type, requester_id: req.amUser ? req.amUser.id : null, payload: payload || {}
    });
    res.status(201).json({ success: true, request: reqItem });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/request', requireRole('admin'), async (req, res) => {
  const tid = tenantId(req);
  const where = { tenant_id: tid };
  if (req.query.type) where.type = req.query.type;
  const items = await ServiceRequest.findAll({ where, order: [['created_at', 'DESC']] });
  res.json({ success: true, count: items.length, items });
});

module.exports = router;
