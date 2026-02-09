/**
 * ENRUTA - Contactos API Routes
 * Call records and contact history
 */
const express = require('express');
const router = express.Router();
const { EnrutaRegistroContacto, EnrutaCliente, EnrutaDocumento } = require('../../models');
const { Op } = require('sequelize');

// GET /api/contactos - List contact records (paginated)
router.get('/', async (req, res) => {
  try {
    const { tenant_id, page = 1, limit = 20, resultado, direccion } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id };
    if (resultado) where.resultado = resultado;
    if (direccion) where.direccion_llamada = direccion;

    const offset = (page - 1) * limit;

    const { count, rows } = await EnrutaRegistroContacto.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['creado_en', 'DESC']],
      include: [
        { model: EnrutaCliente, as: 'cliente', attributes: ['id', 'primer_nombre', 'primer_apellido', 'telefono_principal'] },
        { model: EnrutaDocumento, as: 'documento', attributes: ['id', 'tipo_documento', 'fecha_vencimiento', 'estado'] }
      ]
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('Error listing contacts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contactos/:id - Single contact with transcript
router.get('/:id', async (req, res) => {
  try {
    const contacto = await EnrutaRegistroContacto.findByPk(req.params.id, {
      include: [
        { model: EnrutaCliente, as: 'cliente' },
        { model: EnrutaDocumento, as: 'documento' }
      ]
    });

    if (!contacto) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    res.json({ success: true, data: contacto });
  } catch (error) {
    console.error('Error getting contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contactos/cliente/:clienteId - All contacts for a client
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const contactos = await EnrutaRegistroContacto.findAll({
      where: { cliente_id: req.params.clienteId },
      order: [['creado_en', 'DESC']],
      include: [{ model: EnrutaDocumento, as: 'documento' }]
    });

    res.json({ success: true, data: contactos });
  } catch (error) {
    console.error('Error getting client contacts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/contactos - Create contact record
router.post('/', async (req, res) => {
  try {
    const { tenant_id, cliente_id, ...data } = req.body;

    if (!tenant_id || !cliente_id) {
      return res.status(400).json({ success: false, error: 'tenant_id and cliente_id required' });
    }

    const contacto = await EnrutaRegistroContacto.create({
      tenant_id,
      cliente_id,
      ...data
    });

    // Update client's last contact timestamp
    await EnrutaCliente.update(
      { ultimo_contacto_en: new Date() },
      { where: { id: cliente_id } }
    );

    res.status(201).json({ success: true, data: contacto });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/contactos/:id - Update contact record
router.put('/:id', async (req, res) => {
  try {
    const contacto = await EnrutaRegistroContacto.findByPk(req.params.id);

    if (!contacto) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    await contacto.update(req.body);
    res.json({ success: true, data: contacto });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contactos/estadisticas - Call statistics
router.get('/estadisticas/resumen', async (req, res) => {
  try {
    const { tenant_id, fecha_desde, fecha_hasta } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const { sequelize } = require('../../models');

    // Default to today
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const where = {
      tenant_id,
      creado_en: {
        [Op.between]: [fecha_desde || hoy, fecha_hasta || manana]
      }
    };

    const total = await EnrutaRegistroContacto.count({ where });

    const porResultado = await EnrutaRegistroContacto.findAll({
      where,
      attributes: ['resultado', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['resultado'],
      raw: true
    });

    const porEstado = await EnrutaRegistroContacto.findAll({
      where,
      attributes: ['estado_llamada', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['estado_llamada'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        total,
        por_resultado: porResultado,
        por_estado: porEstado
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contactos/seguimientos - Pending follow-ups
router.get('/seguimientos/pendientes', async (req, res) => {
  try {
    const { tenant_id } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const seguimientos = await EnrutaRegistroContacto.findAll({
      where: {
        tenant_id,
        requiere_seguimiento: true,
        fecha_seguimiento: {
          [Op.lte]: new Date()
        }
      },
      order: [['fecha_seguimiento', 'ASC']],
      include: [
        { model: EnrutaCliente, as: 'cliente' },
        { model: EnrutaDocumento, as: 'documento' }
      ]
    });

    res.json({ success: true, data: seguimientos });
  } catch (error) {
    console.error('Error getting follow-ups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
