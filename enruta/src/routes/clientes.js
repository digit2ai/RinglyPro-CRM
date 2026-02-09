/**
 * ENRUTA - Clientes API Routes
 * CRUD operations for client/citizen management
 */
const express = require('express');
const router = express.Router();
const { EnrutaCliente, EnrutaDocumento, EnrutaRegistroContacto } = require('../../models');
const { Op } = require('sequelize');

// GET /api/clientes - List clients (paginated, filterable)
router.get('/', async (req, res) => {
  try {
    const {
      tenant_id,
      page = 1,
      limit = 20,
      estado,
      ciudad,
      buscar
    } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id };

    if (estado) where.estado = estado;
    if (ciudad) where.ciudad = ciudad;
    if (buscar) {
      where[Op.or] = [
        { numero_documento: { [Op.iLike]: `%${buscar}%` } },
        { primer_nombre: { [Op.iLike]: `%${buscar}%` } },
        { primer_apellido: { [Op.iLike]: `%${buscar}%` } },
        { telefono_principal: { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await EnrutaCliente.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['creado_en', 'DESC']],
      include: [{
        model: EnrutaDocumento,
        as: 'documentos',
        required: false
      }]
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error listing clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/clientes/:id - Get single client with all documents
router.get('/:id', async (req, res) => {
  try {
    const cliente = await EnrutaCliente.findByPk(req.params.id, {
      include: [
        { model: EnrutaDocumento, as: 'documentos' },
        { model: EnrutaRegistroContacto, as: 'contactos', limit: 10, order: [['creado_en', 'DESC']] }
      ]
    });

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error getting client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/clientes - Create new client
router.post('/', async (req, res) => {
  try {
    const { tenant_id, ...clientData } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    // Check for duplicate
    const existing = await EnrutaCliente.findOne({
      where: {
        tenant_id,
        numero_documento: clientData.numero_documento
      }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Ya existe un cliente con este número de documento'
      });
    }

    const cliente = await EnrutaCliente.create({ tenant_id, ...clientData });
    res.status(201).json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/clientes/:id - Update client
router.put('/:id', async (req, res) => {
  try {
    const cliente = await EnrutaCliente.findByPk(req.params.id);

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    await cliente.update(req.body);
    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/clientes/:id - Soft delete (set estado=eliminado)
router.delete('/:id', async (req, res) => {
  try {
    const cliente = await EnrutaCliente.findByPk(req.params.id);

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    await cliente.update({ estado: 'eliminado' });
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/clientes/buscar?cedula=XXX - Search by cedula
router.get('/buscar/cedula', async (req, res) => {
  try {
    const { cedula, tenant_id } = req.query;

    if (!tenant_id || !cedula) {
      return res.status(400).json({ success: false, error: 'tenant_id and cedula required' });
    }

    const cliente = await EnrutaCliente.findOne({
      where: { tenant_id, numero_documento: cedula },
      include: [{ model: EnrutaDocumento, as: 'documentos' }]
    });

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error searching client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/clientes/:id/historial - Full contact history
router.get('/:id/historial', async (req, res) => {
  try {
    const contactos = await EnrutaRegistroContacto.findAll({
      where: { cliente_id: req.params.id },
      order: [['creado_en', 'DESC']],
      include: [{ model: EnrutaDocumento, as: 'documento' }]
    });

    res.json({ success: true, data: contactos });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/clientes/importar - Bulk import from CSV/Excel
router.post('/importar', async (req, res) => {
  try {
    const { tenant_id, clientes } = req.body;

    if (!tenant_id || !clientes || !Array.isArray(clientes)) {
      return res.status(400).json({ success: false, error: 'tenant_id and clientes array required' });
    }

    const results = { created: 0, updated: 0, errors: [] };

    for (const clienteData of clientes) {
      try {
        const [cliente, created] = await EnrutaCliente.findOrCreate({
          where: {
            tenant_id,
            numero_documento: clienteData.numero_documento
          },
          defaults: { tenant_id, ...clienteData, fuente_registro: 'importacion' }
        });

        if (created) {
          results.created++;
        } else {
          await cliente.update(clienteData);
          results.updated++;
        }
      } catch (err) {
        results.errors.push({
          documento: clienteData.numero_documento,
          error: err.message
        });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error importing clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
