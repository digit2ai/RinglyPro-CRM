/**
 * ENRUTA - Plantillas API Routes
 * SMS/WhatsApp message templates
 */
const express = require('express');
const router = express.Router();
const { EnrutaPlantillaMensaje } = require('../../models');

// GET /api/plantillas - List templates
router.get('/', async (req, res) => {
  try {
    const { tenant_id, tipo_plantilla, evento_disparador } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id, esta_activa: true };
    if (tipo_plantilla) where.tipo_plantilla = tipo_plantilla;
    if (evento_disparador) where.evento_disparador = evento_disparador;

    const plantillas = await EnrutaPlantillaMensaje.findAll({
      where,
      order: [['nombre_plantilla', 'ASC']]
    });

    res.json({ success: true, data: plantillas });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/plantillas/:id - Single template
router.get('/:id', async (req, res) => {
  try {
    const plantilla = await EnrutaPlantillaMensaje.findByPk(req.params.id);

    if (!plantilla) {
      return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
    }

    res.json({ success: true, data: plantilla });
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/plantillas - Create template
router.post('/', async (req, res) => {
  try {
    const { tenant_id, ...data } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const plantilla = await EnrutaPlantillaMensaje.create({ tenant_id, ...data });
    res.status(201).json({ success: true, data: plantilla });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/plantillas/:id - Update template
router.put('/:id', async (req, res) => {
  try {
    const plantilla = await EnrutaPlantillaMensaje.findByPk(req.params.id);

    if (!plantilla) {
      return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
    }

    await plantilla.update(req.body);
    res.json({ success: true, data: plantilla });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/plantillas/:id - Delete template
router.delete('/:id', async (req, res) => {
  try {
    const plantilla = await EnrutaPlantillaMensaje.findByPk(req.params.id);

    if (!plantilla) {
      return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
    }

    await plantilla.update({ esta_activa: false });
    res.json({ success: true, message: 'Plantilla eliminada' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/plantillas/:id/preview - Preview template with data
router.post('/:id/preview', async (req, res) => {
  try {
    const plantilla = await EnrutaPlantillaMensaje.findByPk(req.params.id);

    if (!plantilla) {
      return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
    }

    const preview = plantilla.renderizar(req.body);
    res.json({ success: true, data: { preview } });
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
