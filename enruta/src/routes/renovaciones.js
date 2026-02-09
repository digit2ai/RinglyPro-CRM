/**
 * ENRUTA - Renovaciones API Routes
 * Renewal pipeline tracking
 */
const express = require('express');
const router = express.Router();
const { EnrutaRenovacion, EnrutaCliente, EnrutaDocumento, EnrutaRegistroContacto } = require('../../models');
const { Op } = require('sequelize');

// GET /api/renovaciones - List renewals (filterable by status)
router.get('/', async (req, res) => {
  try {
    const { tenant_id, estado_renovacion, page = 1, limit = 20 } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id };
    if (estado_renovacion) where.estado_renovacion = estado_renovacion;

    const offset = (page - 1) * limit;

    const { count, rows } = await EnrutaRenovacion.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['creado_en', 'DESC']],
      include: [
        { model: EnrutaCliente, as: 'cliente', attributes: ['id', 'primer_nombre', 'primer_apellido', 'telefono_principal'] },
        { model: EnrutaDocumento, as: 'documento', attributes: ['id', 'tipo_documento', 'fecha_vencimiento'] }
      ]
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('Error listing renewals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/renovaciones/pipeline - Count by status
router.get('/pipeline', async (req, res) => {
  try {
    const { tenant_id } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const { sequelize } = require('../../models');

    const pipeline = await EnrutaRenovacion.findAll({
      where: { tenant_id },
      attributes: ['estado_renovacion', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['estado_renovacion'],
      raw: true
    });

    res.json({ success: true, data: pipeline });
  } catch (error) {
    console.error('Error getting pipeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/renovaciones/citas - Upcoming appointments
router.get('/citas', async (req, res) => {
  try {
    const { tenant_id, dias = 7 } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(dias));

    const citas = await EnrutaRenovacion.findAll({
      where: {
        tenant_id,
        fecha_cita: {
          [Op.between]: [new Date(), futureDate]
        },
        estado_renovacion: 'cita_agendada'
      },
      order: [['fecha_cita', 'ASC']],
      include: [
        { model: EnrutaCliente, as: 'cliente' },
        { model: EnrutaDocumento, as: 'documento' }
      ]
    });

    res.json({ success: true, data: citas });
  } catch (error) {
    console.error('Error getting appointments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/renovaciones/:id - Single renewal detail
router.get('/:id', async (req, res) => {
  try {
    const renovacion = await EnrutaRenovacion.findByPk(req.params.id, {
      include: [
        { model: EnrutaCliente, as: 'cliente' },
        { model: EnrutaDocumento, as: 'documento' },
        { model: EnrutaRegistroContacto, as: 'contacto' }
      ]
    });

    if (!renovacion) {
      return res.status(404).json({ success: false, error: 'Renovación no encontrada' });
    }

    res.json({ success: true, data: renovacion });
  } catch (error) {
    console.error('Error getting renewal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/renovaciones - Create renewal record
router.post('/', async (req, res) => {
  try {
    const { tenant_id, cliente_id, documento_id, ...data } = req.body;

    if (!tenant_id || !cliente_id || !documento_id) {
      return res.status(400).json({ success: false, error: 'tenant_id, cliente_id, and documento_id required' });
    }

    const renovacion = await EnrutaRenovacion.create({
      tenant_id,
      cliente_id,
      documento_id,
      historial_estados: [{ estado: 'iniciada', fecha: new Date().toISOString(), nota: 'Proceso iniciado' }],
      ...data
    });

    res.status(201).json({ success: true, data: renovacion });
  } catch (error) {
    console.error('Error creating renewal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/renovaciones/:id - Update renewal
router.put('/:id', async (req, res) => {
  try {
    const renovacion = await EnrutaRenovacion.findByPk(req.params.id);

    if (!renovacion) {
      return res.status(404).json({ success: false, error: 'Renovación no encontrada' });
    }

    await renovacion.update(req.body);
    res.json({ success: true, data: renovacion });
  } catch (error) {
    console.error('Error updating renewal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/renovaciones/:id/estado - Update status with history
router.put('/:id/estado', async (req, res) => {
  try {
    const { estado_renovacion, nota } = req.body;

    if (!estado_renovacion) {
      return res.status(400).json({ success: false, error: 'estado_renovacion required' });
    }

    const renovacion = await EnrutaRenovacion.findByPk(req.params.id);

    if (!renovacion) {
      return res.status(404).json({ success: false, error: 'Renovación no encontrada' });
    }

    await renovacion.actualizarEstado(estado_renovacion, nota);

    // If completed, update the document status
    if (estado_renovacion === 'completada' && req.body.nueva_fecha_vencimiento) {
      await EnrutaDocumento.update(
        {
          estado: 'renovado',
          fecha_vencimiento: req.body.nueva_fecha_vencimiento,
          fecha_expedicion: new Date()
        },
        { where: { id: renovacion.documento_id } }
      );
    }

    res.json({ success: true, data: renovacion });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
