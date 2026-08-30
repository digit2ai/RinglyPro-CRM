'use strict';

// =============================================================
// Motor de Directorio Inteligente HISPANOTEC — superficie HTTP.
//
// MONTADO PARA cv-105 Y PARA NADIE MAS.
//
// El primer middleware compara el slug resuelto contra dom.INSTANCIA y
// responde 404 — no 403 — para cualquier otro. Un 403 confirma que la ruta
// existe; el Acuerdo Marco reserva estos elementos a la capa funcional
// diferenciada de HISPANOTEC (HISP-108), asi que desde cv-1 o cv-2 esto
// sencillamente no esta ahi.
//
// Todas las consultas llevan chamber_id ademas del gate. El gate es la puerta;
// el chamber_id es la cerradura.
// =============================================================

const express = require('express');
const { sequelize, QueryTypes, authMiddleware } = require('./lib/shared');
const dom = require('../../services/hispanotec/domain');
const assistant = require('../../services/hispanotec/assistant');

const router = express.Router({ mergeParams: true });

// ---- EL GATE ---------------------------------------------------------------
router.use((req, res, next) => {
  const slug = String((req.chamber && req.chamber.slug) || req.params.chamber_slug || '').toLowerCase();
  if (slug !== dom.INSTANCIA) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  if (!req.chamber_id) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  next();
});

// Todo lo que sigue exige sesion. No hay superficie publica del directorio:
// contiene datos personales de terceros incorporados de fuentes publicas.
router.use(authMiddleware);

// Rol derivado del miembro, nunca enviado por el cliente.
router.use((req, res, next) => {
  req.hdRol = dom.rolDeMiembro(req.member || {});
  next();
});

async function audita(req, accion, objetivo, detalle) {
  try {
    await sequelize.query(
      `INSERT INTO hd_audit (chamber_id, actor_id, rol, accion, objetivo, detalle)
       VALUES (:c,:a,:r,:ac,:o,:d)`,
      { replacements: { c: req.chamber_id, a: (req.member && req.member.id) || null,
                        r: req.hdRol, ac: accion, o: objetivo || null, d: detalle || null },
        type: QueryTypes.INSERT });
  } catch (e) { /* la auditoria nunca rompe la peticion */ }
}

function requiereRol(minimo) {
  return (req, res, next) => {
    if (!dom.rolPermite(req.hdRol, minimo)) {
      return res.status(403).json({ success: false,
        error: 'Esta operacion requiere rol ' + minimo + '. Tu rol es ' + req.hdRol + '.',
        rol_actual: req.hdRol, rol_requerido: minimo });
    }
    next();
  };
}

// ---- Vocabulario, para que la interfaz no lo reinvente ---------------------
router.get('/meta', (req, res) => {
  res.json({ success: true, data: {
    instancia: dom.INSTANCIA,
    tipologias: dom.TIPOLOGIAS,
    naturalezas: dom.NATURALEZAS,
    estados_ficha: dom.ESTADOS_FICHA,
    estados_interaccion: dom.ESTADOS_INTERACCION,
    roles: dom.ROLES,
    rol_usuario: req.hdRol,
    antiguedad_max_meses: dom.ANTIGUEDAD_MAX_MESES,
    asistente: { configurado: assistant.estaConfigurado(), modelo: assistant.MODEL },
  }});
});

// ---- HISP-105 — buscador con filtros combinables ---------------------------
router.get('/entries', async (req, res) => {
  try {
    const q = req.query || {};
    const where = ['e.chamber_id = :c'];
    const rep = { c: req.chamber_id };
    if (q.tipologia)  { where.push('e.tipologia = :tip');  rep.tip = q.tipologia; }
    if (q.naturaleza) { where.push('e.naturaleza = :nat');  rep.nat = q.naturaleza; }
    if (q.pais)       { where.push('e.pais ILIKE :pais');   rep.pais = '%' + q.pais + '%'; }
    if (q.especialidad) { where.push('e.especialidad ILIKE :esp'); rep.esp = '%' + q.especialidad + '%'; }
    if (q.estado)     { where.push('e.estado_ficha = :est'); rep.est = q.estado; }
    if (q.buscar)     { where.push('(e.nombre ILIKE :b OR e.especialidad ILIKE :b OR e.sector ILIKE :b)');
                        rep.b = '%' + q.buscar + '%'; }
    const limit = Math.min(parseInt(q.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(q.offset, 10) || 0, 0);

    const rows = await sequelize.query(
      `SELECT e.*, f.presupuesto_eur, f.presupuesto_fuente, f.presupuesto_ejercicio,
              f.proxy_valor, f.proxy_tipo, f.proxy_fuente, f.proxy_ejercicio
         FROM hd_entries e
    LEFT JOIN hd_foundations f ON f.entry_id = e.id AND f.chamber_id = e.chamber_id
        WHERE ${where.join(' AND ')}
     ORDER BY e.nombre ASC LIMIT ${limit} OFFSET ${offset}`,
      { replacements: rep, type: QueryTypes.SELECT });

    const [{ total }] = await sequelize.query(
      `SELECT COUNT(*)::int AS total FROM hd_entries e WHERE ${where.join(' AND ')}`,
      { replacements: rep, type: QueryTypes.SELECT });

    // Consultar contacto directo o presupuestos es un acceso sensible.
    if (dom.rolPermite(req.hdRol, 'gestion')) {
      await audita(req, 'consulta_directorio', 'entries', `${rows.length} fichas`);
    }

    const data = rows.map((r) => dom.proyectarPorRol({
      ...r,
      nivel_contacto: dom.nivelDeContacto(r),
      es_socio_formal: dom.esSocioFormal(r.tipologia),
    }, req.hdRol));

    res.json({ success: true, data, total, limit, offset, rol: req.hdRol,
      // Una busqueda sin resultados explica el motivo; nunca una pantalla vacia.
      nota: total === 0
        ? 'Ninguna ficha coincide con esos criterios. Prueba a retirar un filtro o a ampliar '
        + 'la busqueda por nombre, sector o especialidad.' : undefined });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- HISP-104 — fundaciones, ordenadas sin mezclar criterios ---------------
router.get('/foundations', requiereRol('gestion'), async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT e.id AS entry_id, e.nombre, e.pais, e.tipologia, e.lineas_actuacion,
              f.*
         FROM hd_entries e
         JOIN hd_foundations f ON f.entry_id = e.id AND f.chamber_id = e.chamber_id
        WHERE e.chamber_id = :c AND e.naturaleza = 'fundacion'`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT });

    await audita(req, 'consulta_presupuestos', 'foundations', `${rows.length} fundaciones`);
    const orden = dom.ordenarFundaciones(rows);
    res.json({ success: true, data: orden.orden, grupos: orden.grupos,
      mezcla_criterios: orden.mezcla_criterios, aviso: orden.aviso,
      caducados: orden.caducados, antiguedad_max_meses: orden.antiguedad_max_meses });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- HISP-110/111 — que se puede enviar a este contacto, y que no ----------
router.get('/entries/:id/contactabilidad', async (req, res) => {
  try {
    const [entry] = await sequelize.query(
      'SELECT * FROM hd_entries WHERE id = :id AND chamber_id = :c',
      { replacements: { id: req.params.id, c: req.chamber_id }, type: QueryTypes.SELECT });
    if (!entry) return res.status(404).json({ success: false, error: 'Ficha no encontrada' });

    const [consent] = await sequelize.query(
      'SELECT * FROM hd_consent WHERE entry_id = :id AND chamber_id = :c',
      { replacements: { id: req.params.id, c: req.chamber_id }, type: QueryTypes.SELECT });

    const veredicto = dom.admiteAutomatizacion(entry, consent);
    res.json({ success: true, data: {
      entry_id: entry.id, nombre: entry.nombre,
      nivel: veredicto.nivel, permitido: veredicto.permitido,
      tipo_envio_admisible: veredicto.tipo || null,
      motivo: veredicto.motivo,
      consentimiento: consent ? consent.estado : 'no_solicitado',
      llamada_humana: {
        permitida: true,
        requisitos: ['Comprobar lista de exclusion del pais (Lista Robinson en Espana, '
                   + 'Do Not Call en EE. UU.) y bloquear si figura',
                     'Identificarse desde el primer segundo como HISPANOTEC con numero verificable',
                     'Ofrecer no volver a ser contactado; la baja se aplica en 10 dias habiles'],
        base_legal: 'Interes legitimo de contacto profesional/institucional (B2B, RGPD)',
      },
      voz_ia: { disponible: false,
        motivo: 'No existe en esta fase ninguna funcionalidad de llamada con voz generada por IA '
              + 'ni de marcacion automatica aleatoria o secuencial.' },
    }});
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- El asistente ----------------------------------------------------------
router.post('/assistant', async (req, res) => {
  try {
    const mensajes = Array.isArray(req.body && req.body.mensajes) ? req.body.mensajes : [];
    if (!mensajes.length) return res.status(400).json({ success: false, error: 'mensajes requerido' });

    // El contexto lo construye el servidor a partir de filas reales de cv-105,
    // ya proyectadas por el rol del usuario. El asistente no consulta la base.
    const rows = await sequelize.query(
      `SELECT e.id, e.nombre, e.naturaleza, e.tipologia, e.pais, e.especialidad, e.sector,
              e.estado_ficha, e.lineas_actuacion, e.email, e.telefono,
              f.presupuesto_eur, f.presupuesto_ejercicio, f.presupuesto_fuente,
              f.proxy_valor, f.proxy_tipo, f.proxy_ejercicio
         FROM hd_entries e
    LEFT JOIN hd_foundations f ON f.entry_id = e.id AND f.chamber_id = e.chamber_id
        WHERE e.chamber_id = :c ORDER BY e.nombre LIMIT 120`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT });

    const filas = rows.map((r) => dom.proyectarPorRol({
      ...r, nivel_contacto: dom.nivelDeContacto(r),
      cifra: dom.cifraFundacion(r),
    }, req.hdRol));

    const out = await assistant.responder({
      mensajes, rol: req.hdRol,
      usuario: (req.member && req.member.email) || null,
      contexto: { filas, total: filas.length,
                  hay_proxy: rows.some((r) => r.proxy_valor != null) },
    });

    await audita(req, 'asistente', out.regla || out.source, String(mensajes[mensajes.length - 1].content).slice(0, 200));
    res.json({ success: true, data: out });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- HISP-109 — el registro de accesos, visible para administracion --------
router.get('/audit', requiereRol('administracion'), async (req, res) => {
  const rows = await sequelize.query(
    'SELECT * FROM hd_audit WHERE chamber_id = :c ORDER BY id DESC LIMIT 200',
    { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT });
  res.json({ success: true, data: rows });
});

router.get('/health', (req, res) => {
  res.json({ success: true, service: 'hispanotec-directory', instancia: dom.INSTANCIA,
    rol: req.hdRol, asistente: assistant.estaConfigurado() ? 'modelo' : 'heuristico' });
});

module.exports = router;
