/**
 * ENRUTA - Sedes API Routes
 * Transit offices and CDA locations
 */
const express = require('express');
const router = express.Router();
const { EnrutaSede } = require('../../models');
const { Op } = require('sequelize');

// GET /api/sedes - List locations (filterable by city, type)
router.get('/', async (req, res) => {
  try {
    const { tenant_id, ciudad, tipo_sede } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id, esta_activa: true };
    if (ciudad) where.ciudad = ciudad;
    if (tipo_sede) where.tipo_sede = tipo_sede;

    const sedes = await EnrutaSede.findAll({
      where,
      order: [['nombre_sede', 'ASC']]
    });

    res.json({ success: true, data: sedes });
  } catch (error) {
    console.error('Error listing locations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sedes/cercanas - Nearest locations by city
router.get('/cercanas', async (req, res) => {
  try {
    const { tenant_id, ciudad } = req.query;

    if (!tenant_id || !ciudad) {
      return res.status(400).json({ success: false, error: 'tenant_id and ciudad required' });
    }

    const sedes = await EnrutaSede.findAll({
      where: {
        tenant_id,
        ciudad: { [Op.iLike]: `%${ciudad}%` },
        esta_activa: true
      },
      order: [['nombre_sede', 'ASC']]
    });

    res.json({ success: true, data: sedes });
  } catch (error) {
    console.error('Error finding locations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sedes/:id - Single location detail
router.get('/:id', async (req, res) => {
  try {
    const sede = await EnrutaSede.findByPk(req.params.id);

    if (!sede) {
      return res.status(404).json({ success: false, error: 'Sede no encontrada' });
    }

    res.json({ success: true, data: sede });
  } catch (error) {
    console.error('Error getting location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sedes - Add location
router.post('/', async (req, res) => {
  try {
    const { tenant_id, ...data } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const sede = await EnrutaSede.create({ tenant_id, ...data });
    res.status(201).json({ success: true, data: sede });
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/sedes/:id - Update location
router.put('/:id', async (req, res) => {
  try {
    const sede = await EnrutaSede.findByPk(req.params.id);

    if (!sede) {
      return res.status(404).json({ success: false, error: 'Sede no encontrada' });
    }

    await sede.update(req.body);
    res.json({ success: true, data: sede });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/sedes/:id - Deactivate location
router.delete('/:id', async (req, res) => {
  try {
    const sede = await EnrutaSede.findByPk(req.params.id);

    if (!sede) {
      return res.status(404).json({ success: false, error: 'Sede no encontrada' });
    }

    await sede.update({ esta_activa: false });
    res.json({ success: true, message: 'Sede desactivada' });
  } catch (error) {
    console.error('Error deactivating location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
