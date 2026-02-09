/**
 * ENRUTA - Dashboard API Routes
 * Analytics and overview stats
 */
const express = require('express');
const router = express.Router();
const {
  EnrutaCliente,
  EnrutaDocumento,
  EnrutaRegistroContacto,
  EnrutaRenovacion,
  EnrutaCampana,
  sequelize
} = require('../../models');
const { Op } = require('sequelize');

// GET /api/dashboard/stats - Overview statistics
router.get('/stats', async (req, res) => {
  try {
    const { tenant_id } = req.query;

    // Use default tenant if not provided (for demo)
    const tenantFilter = tenant_id || '00000000-0000-0000-0000-000000000001';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Run queries in parallel
    const [
      totalClientes,
      docsPorVencer,
      docsVencidos,
      llamadasHoy,
      renovacionesActivas,
      campanasActivas
    ] = await Promise.all([
      EnrutaCliente.count({
        where: { tenant_id: tenantFilter, estado: 'activo' }
      }),
      EnrutaDocumento.count({
        where: {
          tenant_id: tenantFilter,
          estado: { [Op.in]: ['por_vencer_30_dias', 'por_vencer_15_dias', 'por_vencer_7_dias'] }
        }
      }),
      EnrutaDocumento.count({
        where: { tenant_id: tenantFilter, estado: 'vencido' }
      }),
      EnrutaRegistroContacto.count({
        where: {
          tenant_id: tenantFilter,
          creado_en: { [Op.between]: [today, tomorrow] }
        }
      }),
      EnrutaRenovacion.count({
        where: {
          tenant_id: tenantFilter,
          estado_renovacion: { [Op.notIn]: ['completada', 'cancelada', 'fallida'] }
        }
      }),
      EnrutaCampana.count({
        where: { tenant_id: tenantFilter, estado: 'activa' }
      })
    ]);

    res.json({
      success: true,
      stats: {
        total_clientes: totalClientes,
        documentos_por_vencer: docsPorVencer,
        documentos_vencidos: docsVencidos,
        llamadas_hoy: llamadasHoy,
        renovaciones_activas: renovacionesActivas,
        campanas_activas: campanasActivas
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dashboard/documentos-por-tipo - Document distribution by type
router.get('/documentos-por-tipo', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    const tenantFilter = tenant_id || '00000000-0000-0000-0000-000000000001';

    const distribution = await EnrutaDocumento.findAll({
      where: { tenant_id: tenantFilter },
      attributes: [
        'tipo_documento',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['tipo_documento'],
      raw: true
    });

    res.json({ success: true, data: distribution });
  } catch (error) {
    console.error('Error getting type distribution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dashboard/llamadas-por-dia - Calls per day (last 7 days)
router.get('/llamadas-por-dia', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    const tenantFilter = tenant_id || '00000000-0000-0000-0000-000000000001';

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const callsByDay = await EnrutaRegistroContacto.findAll({
      where: {
        tenant_id: tenantFilter,
        creado_en: { [Op.gte]: sevenDaysAgo }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('creado_en')), 'fecha'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [sequelize.fn('DATE', sequelize.col('creado_en'))],
      order: [[sequelize.fn('DATE', sequelize.col('creado_en')), 'ASC']],
      raw: true
    });

    res.json({ success: true, data: callsByDay });
  } catch (error) {
    console.error('Error getting calls by day:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dashboard/resultados-llamadas - Call result distribution
router.get('/resultados-llamadas', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    const tenantFilter = tenant_id || '00000000-0000-0000-0000-000000000001';

    const results = await EnrutaRegistroContacto.findAll({
      where: { tenant_id: tenantFilter },
      attributes: [
        'resultado',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['resultado'],
      raw: true
    });

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error getting call results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dashboard/vencimientos-proximos - Upcoming expirations (timeline)
router.get('/vencimientos-proximos', async (req, res) => {
  try {
    const { tenant_id, dias = 30 } = req.query;
    const tenantFilter = tenant_id || '00000000-0000-0000-0000-000000000001';

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(dias));

    const expirations = await EnrutaDocumento.findAll({
      where: {
        tenant_id: tenantFilter,
        fecha_vencimiento: {
          [Op.between]: [new Date(), futureDate]
        },
        estado: { [Op.ne]: 'renovado' }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('fecha_vencimiento')), 'fecha'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [sequelize.fn('DATE', sequelize.col('fecha_vencimiento'))],
      order: [[sequelize.fn('DATE', sequelize.col('fecha_vencimiento')), 'ASC']],
      raw: true
    });

    res.json({ success: true, data: expirations });
  } catch (error) {
    console.error('Error getting expirations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dashboard/rendimiento-campanas - Campaign performance
router.get('/rendimiento-campanas', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    const tenantFilter = tenant_id || '00000000-0000-0000-0000-000000000001';

    const campaigns = await EnrutaCampana.findAll({
      where: { tenant_id: tenantFilter },
      attributes: [
        'id',
        'nombre_campana',
        'estado',
        'total_objetivos',
        'llamadas_realizadas',
        'llamadas_contestadas',
        'llamadas_exitosas',
        'renovaciones_iniciadas'
      ],
      order: [['creado_en', 'DESC']],
      limit: 10
    });

    const performance = campaigns.map(c => ({
      ...c.toJSON(),
      tasa_contacto: c.llamadas_realizadas > 0
        ? ((c.llamadas_contestadas / c.llamadas_realizadas) * 100).toFixed(1)
        : 0,
      tasa_exito: c.llamadas_contestadas > 0
        ? ((c.llamadas_exitosas / c.llamadas_contestadas) * 100).toFixed(1)
        : 0
    }));

    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('Error getting campaign performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
