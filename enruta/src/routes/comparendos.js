/**
 * ENRUTA - Comparendos API Routes
 * Traffic tickets and fines tracking
 */
const express = require('express');
const router = express.Router();
const { EnrutaComparendo, EnrutaCliente } = require('../../models');
const { Op } = require('sequelize');

// GET /api/comparendos - List fines
router.get('/', async (req, res) => {
  try {
    const { tenant_id, estado, page = 1, limit = 20 } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id };
    if (estado) where.estado = estado;

    const offset = (page - 1) * limit;

    const { count, rows } = await EnrutaComparendo.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['fecha_comparendo', 'DESC']],
      include: [{
        model: EnrutaCliente,
        as: 'cliente',
        attributes: ['id', 'primer_nombre', 'primer_apellido', 'numero_documento']
      }]
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('Error listing fines:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/comparendos/cliente/:clienteId - Fines for a client
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const comparendos = await EnrutaComparendo.findAll({
      where: { cliente_id: req.params.clienteId },
      order: [['fecha_comparendo', 'DESC']]
    });

    res.json({ success: true, data: comparendos });
  } catch (error) {
    console.error('Error getting client fines:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/comparendos/:id - Single fine
router.get('/:id', async (req, res) => {
  try {
    const comparendo = await EnrutaComparendo.findByPk(req.params.id, {
      include: [{ model: EnrutaCliente, as: 'cliente' }]
    });

    if (!comparendo) {
      return res.status(404).json({ success: false, error: 'Comparendo no encontrado' });
    }

    res.json({ success: true, data: comparendo });
  } catch (error) {
    console.error('Error getting fine:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/comparendos - Register fine
router.post('/', async (req, res) => {
  try {
    const { tenant_id, cliente_id, ...data } = req.body;

    if (!tenant_id || !cliente_id) {
      return res.status(400).json({ success: false, error: 'tenant_id and cliente_id required' });
    }

    const comparendo = await EnrutaComparendo.create({ tenant_id, cliente_id, ...data });
    res.status(201).json({ success: true, data: comparendo });
  } catch (error) {
    console.error('Error creating fine:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/comparendos/:id - Update fine
router.put('/:id', async (req, res) => {
  try {
    const comparendo = await EnrutaComparendo.findByPk(req.params.id);

    if (!comparendo) {
      return res.status(404).json({ success: false, error: 'Comparendo no encontrado' });
    }

    await comparendo.update(req.body);
    res.json({ success: true, data: comparendo });
  } catch (error) {
    console.error('Error updating fine:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
