/**
 * ENRUTA - Campanas API Routes
 * Mass outreach campaign management
 */
const express = require('express');
const router = express.Router();
const { EnrutaCampana, EnrutaDocumento, EnrutaCliente } = require('../../models');
const { Op } = require('sequelize');

// GET /api/campanas - List campaigns
router.get('/', async (req, res) => {
  try {
    const { tenant_id, estado } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id };
    if (estado) where.estado = estado;

    const campanas = await EnrutaCampana.findAll({
      where,
      order: [['creado_en', 'DESC']]
    });

    res.json({ success: true, data: campanas });
  } catch (error) {
    console.error('Error listing campaigns:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/campanas/:id - Campaign detail with stats
router.get('/:id', async (req, res) => {
  try {
    const campana = await EnrutaCampana.findByPk(req.params.id);

    if (!campana) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    res.json({ success: true, data: campana });
  } catch (error) {
    console.error('Error getting campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/campanas - Create campaign
router.post('/', async (req, res) => {
  try {
    const { tenant_id, ...data } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    // Calculate target count based on criteria
    const where = { tenant_id };

    if (data.tipos_documentos_objetivo?.length) {
      where.tipo_documento = { [Op.in]: data.tipos_documentos_objetivo };
    }

    if (data.fecha_vencimiento_desde && data.fecha_vencimiento_hasta) {
      where.fecha_vencimiento = {
        [Op.between]: [data.fecha_vencimiento_desde, data.fecha_vencimiento_hasta]
      };
    }

    const targetCount = await EnrutaDocumento.count({ where });

    const campana = await EnrutaCampana.create({
      tenant_id,
      total_objetivos: targetCount,
      ...data
    });

    res.status(201).json({ success: true, data: campana });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/campanas/:id - Update campaign
router.put('/:id', async (req, res) => {
  try {
    const campana = await EnrutaCampana.findByPk(req.params.id);

    if (!campana) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    await campana.update(req.body);
    res.json({ success: true, data: campana });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/campanas/:id/activar - Activate campaign
router.put('/:id/activar', async (req, res) => {
  try {
    const campana = await EnrutaCampana.findByPk(req.params.id);

    if (!campana) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    await campana.activar();
    res.json({ success: true, data: campana, message: 'Campaña activada' });
  } catch (error) {
    console.error('Error activating campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/campanas/:id/pausar - Pause campaign
router.put('/:id/pausar', async (req, res) => {
  try {
    const campana = await EnrutaCampana.findByPk(req.params.id);

    if (!campana) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    await campana.pausar();
    res.json({ success: true, data: campana, message: 'Campaña pausada' });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/campanas/:id/cancelar - Cancel campaign
router.put('/:id/cancelar', async (req, res) => {
  try {
    const campana = await EnrutaCampana.findByPk(req.params.id);

    if (!campana) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    await campana.cancelar();
    res.json({ success: true, data: campana, message: 'Campaña cancelada' });
  } catch (error) {
    console.error('Error canceling campaign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/campanas/:id/resultados - Detailed results
router.get('/:id/resultados', async (req, res) => {
  try {
    const campana = await EnrutaCampana.findByPk(req.params.id);

    if (!campana) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    const resultados = {
      campana: campana,
      metricas: {
        tasa_contacto: campana.llamadas_realizadas > 0
          ? ((campana.llamadas_contestadas / campana.llamadas_realizadas) * 100).toFixed(1)
          : 0,
        tasa_exito: campana.llamadas_contestadas > 0
          ? ((campana.llamadas_exitosas / campana.llamadas_contestadas) * 100).toFixed(1)
          : 0,
        tasa_renovacion: campana.llamadas_exitosas > 0
          ? ((campana.renovaciones_iniciadas / campana.llamadas_exitosas) * 100).toFixed(1)
          : 0,
        progreso: campana.total_objetivos > 0
          ? ((campana.llamadas_realizadas / campana.total_objetivos) * 100).toFixed(1)
          : 0
      }
    };

    res.json({ success: true, data: resultados });
  } catch (error) {
    console.error('Error getting results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
