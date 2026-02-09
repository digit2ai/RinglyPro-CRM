/**
 * ENRUTA - Documentos API Routes
 * CRUD operations for vehicle/driving documents
 */
const express = require('express');
const router = express.Router();
const { EnrutaDocumento, EnrutaCliente } = require('../../models');
const { Op } = require('sequelize');

// GET /api/documentos - List documents (filterable by type, status, expiration)
router.get('/', async (req, res) => {
  try {
    const {
      tenant_id,
      tipo_documento,
      estado,
      page = 1,
      limit = 20
    } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const where = { tenant_id };

    if (tipo_documento) where.tipo_documento = tipo_documento;
    if (estado) where.estado = estado;

    const offset = (page - 1) * limit;

    const { count, rows } = await EnrutaDocumento.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['fecha_vencimiento', 'ASC']],
      include: [{
        model: EnrutaCliente,
        as: 'cliente',
        attributes: ['id', 'primer_nombre', 'primer_apellido', 'telefono_principal', 'ciudad']
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
    console.error('Error listing documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/documentos/por-vencer - Documents expiring soon
router.get('/por-vencer', async (req, res) => {
  try {
    const { tenant_id, dias = 30, limit = 50 } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(dias));

    const documentos = await EnrutaDocumento.findAll({
      where: {
        tenant_id,
        fecha_vencimiento: {
          [Op.between]: [new Date(), futureDate]
        },
        estado: {
          [Op.in]: ['vigente', 'por_vencer_30_dias', 'por_vencer_15_dias', 'por_vencer_7_dias']
        }
      },
      limit: parseInt(limit),
      order: [['fecha_vencimiento', 'ASC']],
      include: [{
        model: EnrutaCliente,
        as: 'cliente',
        attributes: ['id', 'primer_nombre', 'primer_apellido', 'telefono_principal', 'ciudad', 'numero_documento']
      }]
    });

    res.json({ success: true, data: documentos });
  } catch (error) {
    console.error('Error getting expiring documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/documentos/vencidos - Expired documents
router.get('/vencidos', async (req, res) => {
  try {
    const { tenant_id, limit = 50 } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const documentos = await EnrutaDocumento.findAll({
      where: {
        tenant_id,
        estado: 'vencido'
      },
      limit: parseInt(limit),
      order: [['fecha_vencimiento', 'DESC']],
      include: [{
        model: EnrutaCliente,
        as: 'cliente',
        attributes: ['id', 'primer_nombre', 'primer_apellido', 'telefono_principal', 'ciudad', 'numero_documento']
      }]
    });

    res.json({ success: true, data: documentos });
  } catch (error) {
    console.error('Error getting expired documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/documentos/estadisticas - Status distribution
router.get('/estadisticas', async (req, res) => {
  try {
    const { tenant_id } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const { sequelize } = require('../../models');

    const stats = await EnrutaDocumento.findAll({
      where: { tenant_id },
      attributes: [
        'estado',
        'tipo_documento',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['estado', 'tipo_documento'],
      raw: true
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/documentos/:id - Get single document
router.get('/:id', async (req, res) => {
  try {
    const documento = await EnrutaDocumento.findByPk(req.params.id, {
      include: [{
        model: EnrutaCliente,
        as: 'cliente'
      }]
    });

    if (!documento) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    }

    res.json({ success: true, data: documento });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/documentos - Add document to client
router.post('/', async (req, res) => {
  try {
    const { tenant_id, cliente_id, ...docData } = req.body;

    if (!tenant_id || !cliente_id) {
      return res.status(400).json({ success: false, error: 'tenant_id and cliente_id required' });
    }

    // Calculate initial status based on expiration date
    const today = new Date();
    const expDate = new Date(docData.fecha_vencimiento);
    const daysUntilExp = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    let estado = 'vigente';
    if (daysUntilExp < 0) estado = 'vencido';
    else if (daysUntilExp <= 7) estado = 'por_vencer_7_dias';
    else if (daysUntilExp <= 15) estado = 'por_vencer_15_dias';
    else if (daysUntilExp <= 30) estado = 'por_vencer_30_dias';

    // Set default fine values based on document type
    const fineDefaults = {
      licencia_conduccion: { tipo_multa_asociada: 'C', valor_multa_cop: 695000, riesgo_inmovilizacion: false },
      soat: { tipo_multa_asociada: 'D', valor_multa_cop: 1207800, riesgo_inmovilizacion: true },
      revision_tecnicomecanica: { tipo_multa_asociada: 'C', valor_multa_cop: 695000, riesgo_inmovilizacion: true }
    };

    const defaults = fineDefaults[docData.tipo_documento] || {};

    const documento = await EnrutaDocumento.create({
      tenant_id,
      cliente_id,
      estado,
      ...defaults,
      ...docData
    });

    res.status(201).json({ success: true, data: documento });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/documentos/:id - Update document
router.put('/:id', async (req, res) => {
  try {
    const documento = await EnrutaDocumento.findByPk(req.params.id);

    if (!documento) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    }

    await documento.update(req.body);
    res.json({ success: true, data: documento });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/documentos/:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const documento = await EnrutaDocumento.findByPk(req.params.id);

    if (!documento) {
      return res.status(404).json({ success: false, error: 'Documento no encontrado' });
    }

    await documento.destroy();
    res.json({ success: true, message: 'Documento eliminado' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/documentos/actualizar-estados - Update all document statuses (cron job)
router.post('/actualizar-estados', async (req, res) => {
  try {
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ success: false, error: 'tenant_id required' });
    }

    const today = new Date();
    const in7days = new Date(today);
    in7days.setDate(in7days.getDate() + 7);
    const in15days = new Date(today);
    in15days.setDate(in15days.getDate() + 15);
    const in30days = new Date(today);
    in30days.setDate(in30days.getDate() + 30);

    // Update expired
    const [expiredCount] = await EnrutaDocumento.update(
      { estado: 'vencido', ultima_actualizacion_estado: new Date() },
      {
        where: {
          tenant_id,
          estado: { [Op.notIn]: ['renovado', 'vencido'] },
          fecha_vencimiento: { [Op.lt]: today }
        }
      }
    );

    // Update 7 days
    const [days7Count] = await EnrutaDocumento.update(
      { estado: 'por_vencer_7_dias', ultima_actualizacion_estado: new Date() },
      {
        where: {
          tenant_id,
          estado: { [Op.in]: ['vigente', 'por_vencer_30_dias', 'por_vencer_15_dias'] },
          fecha_vencimiento: { [Op.between]: [today, in7days] }
        }
      }
    );

    // Update 15 days
    const [days15Count] = await EnrutaDocumento.update(
      { estado: 'por_vencer_15_dias', ultima_actualizacion_estado: new Date() },
      {
        where: {
          tenant_id,
          estado: { [Op.in]: ['vigente', 'por_vencer_30_dias'] },
          fecha_vencimiento: { [Op.between]: [in7days, in15days] }
        }
      }
    );

    // Update 30 days
    const [days30Count] = await EnrutaDocumento.update(
      { estado: 'por_vencer_30_dias', ultima_actualizacion_estado: new Date() },
      {
        where: {
          tenant_id,
          estado: 'vigente',
          fecha_vencimiento: { [Op.between]: [in15days, in30days] }
        }
      }
    );

    res.json({
      success: true,
      updated: {
        vencido: expiredCount,
        por_vencer_7_dias: days7Count,
        por_vencer_15_dias: days15Count,
        por_vencer_30_dias: days30Count
      }
    });
  } catch (error) {
    console.error('Error updating statuses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
