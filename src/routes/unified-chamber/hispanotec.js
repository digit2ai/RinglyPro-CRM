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
const importar = require('../../services/hispanotec/importar');
const enriquecer = require('../../services/hispanotec/enriquecer');
const matching = require('../../services/hispanotec/matching');
const multer = require('multer');
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

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

// ---- SOLO ADMINISTRADORES -------------------------------------------------
//
// El modulo entero queda cerrado a quien no tenga rol administrativo. Un socio
// con la direccion no ve una version reducida: no entra.
//
// Esto se aplica AQUI, en el servidor, y no ocultando el enlace del menu. Un
// enlace oculto es una cortesia —quien conozca la URL entra igual—, y lo que
// hay detras son datos personales de terceros incorporados de fuentes publicas
// y presupuestos de fundaciones. La puerta tiene que estar cerrada, no
// disimulada.
//
// Los tres niveles de HISP-109 siguen existiendo en el codigo y la proyeccion
// por rol se mantiene: es defensa en profundidad, y el dia que HISPANOTEC
// decida abrir el directorio a los socios numerarios —como contempla
// HISP-105— basta con bajar este umbral a 'consulta_basica' sin tocar nada mas.
const UMBRAL_ACCESO = 'gestion';
router.use((req, res, next) => {
  if (dom.rolPermite(req.hdRol, UMBRAL_ACCESO)) return next();
  return res.status(403).json({
    success: false,
    error: 'El Motor de Directorio esta reservado a los administradores de HISPANOTEC.',
    rol_actual: req.hdRol,
    rol_requerido: UMBRAL_ACCESO,
    nota: 'Si necesitas acceso, pidelo a un administrador de la Instancia.',
  });
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

// ---- HISP-101 — ingesta masiva: analizar, y solo despues escribir ----------
//
// Dos endpoints a proposito. /import/analizar no toca la base: devuelve los
// errores fila a fila y los duplicados para que una persona los mire. Solo
// /import/aplicar escribe, y solo las filas que el analisis aprobo.
router.post('/import/analizar', requiereRol('administracion'), subida.single('fichero'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Falta el fichero.' });
    const existentes = await sequelize.query(
      'SELECT dedupe_key, nombre FROM hd_entries WHERE chamber_id = :c AND dedupe_key IS NOT NULL',
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT });
    const r = importar.analizar(req.file.buffer, req.file.originalname, existentes,
      { origen: (req.body || {}).origen });
    if (!r.ok) return res.status(400).json({ success: false, ...r });
    // El plan se guarda en memoria de proceso el tiempo justo para confirmarlo.
    const plan = r._validas; delete r._validas;
    PLANES.set(planId(req), { filas: plan, origen: r.origen, at: Date.now() });
    await audita(req, 'import_analizado', r.fichero,
      `${r.validas} validas, ${r.con_error} con error, ${r.duplicadas} duplicadas`);
    res.json({ success: true, data: r });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// El plan vive 15 minutos. Mas alla, se vuelve a subir el fichero: confirmar a
// ciegas algo analizado hace una hora es confirmar otra cosa.
const PLANES = new Map();
function planId(req) { return `${req.chamber_id}:${(req.member && req.member.id) || 0}`; }
setInterval(() => {
  const corte = Date.now() - 15 * 60 * 1000;
  for (const [k, v] of PLANES) if (v.at < corte) PLANES.delete(k);
}, 5 * 60 * 1000).unref();

router.post('/import/aplicar', requiereRol('administracion'), async (req, res) => {
  try {
    const plan = PLANES.get(planId(req));
    if (!plan) {
      return res.status(409).json({ success: false,
        error: 'No hay un analisis reciente que confirmar. Vuelve a subir el fichero.' });
    }
    const esPublica = plan.origen === 'fuente_publica';
    const art14 = esPublica ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null;
    let creadas = 0; const fallos = [];

    for (const v of plan.filas) {
      const d = v.datos;
      try {
        await sequelize.query(
          `INSERT INTO hd_entries
             (chamber_id, nombre, naturaleza, tipologia, pais, especialidad, experiencia,
              localizacion, email, telefono, web, sector, tamano, notas,
              estado_ficha, origen, base_legal, art14_due_at, dedupe_key, creado_por)
           VALUES (:c,:nom,:nat,:tip,:pais,:esp,:exp,:loc,:mail,:tel,:web,:sec,:tam,:notas,
                   'pendiente_validacion', :origen, :base, :art14, :clave, :actor)`,
          { replacements: {
              c: req.chamber_id, nom: d.nombre, nat: d.naturaleza, tip: d.tipologia,
              pais: d.pais || null, esp: d.especialidad || null, exp: d.experiencia || null,
              loc: d.localizacion || null, mail: d.email || null, tel: d.telefono || null,
              web: d.web || null, sec: d.sector || null, tam: d.tamano || null,
              notas: d.notas || null, origen: plan.origen,
              base: esPublica ? 'Interes legitimo — dato de fuente publica (art. 14 RGPD aplicable)' : null,
              art14, clave: v.dedupe_key, actor: (req.member && req.member.id) || null },
            type: QueryTypes.INSERT });
        creadas++;
      } catch (e) { fallos.push({ fila: v.fila, nombre: d.nombre, error: e.message.slice(0, 160) }); }
    }
    PLANES.delete(planId(req));
    await audita(req, 'import_aplicado', plan.origen, `${creadas} fichas creadas, ${fallos.length} fallos`);

    res.json({ success: true, data: {
      creadas, fallos,
      estado: 'Todas entran como pendiente_validacion. Ninguna se publica sin revision humana.',
      art14: esPublica
        ? 'Origen fuente publica: cada ficha lleva su base legal y la notificacion del art. 14 RGPD '
        + 'vence en un mes desde hoy.' : null,
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- HISP-102 — enriquecimiento: propone campo a campo, no publica ---------
router.post('/entries/:id/enriquecer', requiereRol('gestion'), async (req, res) => {
  try {
    const [ficha] = await sequelize.query(
      'SELECT * FROM hd_entries WHERE id = :id AND chamber_id = :c',
      { replacements: { id: req.params.id, c: req.chamber_id }, type: QueryTypes.SELECT });
    if (!ficha) return res.status(404).json({ success: false, error: 'Ficha no encontrada' });

    const r = await enriquecer.proponer(ficha);
    // Cada propuesta se guarda como 'propuesto'. La ficha NO cambia.
    for (const pr of (r.propuestas || [])) {
      await sequelize.query(
        `INSERT INTO hd_entry_fields (chamber_id, entry_id, campo, valor, origen, fuente, estado)
         VALUES (:c,:e,:campo,:valor,'ia',:fuente,'propuesto')`,
        { replacements: { c: req.chamber_id, e: ficha.id, campo: pr.campo,
                          valor: pr.valor, fuente: pr.fuente + ' (confianza ' + pr.confianza + ')' },
          type: QueryTypes.INSERT });
    }
    await audita(req, 'enriquecimiento_propuesto', 'entry:' + ficha.id,
      `${(r.propuestas || []).length} campo(s) propuestos`);
    res.json({ success: true, data: r });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/entries/:id/propuestas', requiereRol('gestion'), async (req, res) => {
  const rows = await sequelize.query(
    `SELECT * FROM hd_entry_fields WHERE chamber_id = :c AND entry_id = :e AND estado = 'propuesto'
      ORDER BY id`,
    { replacements: { c: req.chamber_id, e: req.params.id }, type: QueryTypes.SELECT });
  res.json({ success: true, data: rows });
});

// Aceptar / editar / rechazar UN campo. Uno por peticion, deliberadamente:
// aceptar diez de golpe es no revisar ninguno.
router.patch('/propuestas/:pid', requiereRol('gestion'), async (req, res) => {
  try {
    const accion = String((req.body || {}).accion || '');
    if (!['aceptar', 'rechazar'].includes(accion)) {
      return res.status(400).json({ success: false, error: "accion debe ser 'aceptar' o 'rechazar'" });
    }
    const [pr] = await sequelize.query(
      "SELECT * FROM hd_entry_fields WHERE id = :id AND chamber_id = :c AND estado = 'propuesto'",
      { replacements: { id: req.params.pid, c: req.chamber_id }, type: QueryTypes.SELECT });
    if (!pr) return res.status(404).json({ success: false, error: 'Propuesta no encontrada o ya resuelta' });

    // El validador puede EDITAR antes de aceptar: se guarda lo que aprobo, no
    // lo que propuso la IA.
    const valorFinal = accion === 'aceptar'
      ? String((req.body || {}).valor != null ? req.body.valor : pr.valor).slice(0, 500) : pr.valor;

    await sequelize.query(
      `UPDATE hd_entry_fields SET estado = :est, valor = :val, decidido_por = :who,
              decidido_en = NOW(), origen = :origen WHERE id = :id`,
      { replacements: { est: accion === 'aceptar' ? 'aceptado' : 'rechazado', val: valorFinal,
          who: (req.member && req.member.id) || null,
          origen: (accion === 'aceptar' && String(req.body.valor || '') !== String(pr.valor)) ? 'humano' : pr.origen,
          id: pr.id }, type: QueryTypes.UPDATE });

    // El nombre de columna se interpola en el SQL, asi que NO puede venir de la
    // base de datos sin mas: se comprueba contra una lista literal escrita aqui.
    // Aunque hoy solo pueda contener valores de enriquecer.CAMPOS, una lista en
    // el punto de interpolacion es lo que hace que siga siendo cierto manana.
    const ACTUALIZABLES = {
      sector: 'texto', pais: 'texto', tamano: 'texto', especialidad: 'texto',
      localizacion: 'texto', web: 'texto', lineas_actuacion: 'jsonb',
    };
    if (accion === 'aceptar' && ACTUALIZABLES[pr.campo]) {
      // lineas_actuacion es JSONB: un string suelto rompe el INSERT, asi que se
      // convierte a array. Antes este campo se aceptaba y no se aplicaba nunca.
      const esJson = ACTUALIZABLES[pr.campo] === 'jsonb';
      const val = esJson
        ? JSON.stringify(String(valorFinal).split(/[;,]/).map((x) => x.trim()).filter(Boolean))
        : valorFinal;
      const sql = esJson
        ? `UPDATE hd_entries SET ${pr.campo} = CAST(:val AS jsonb), updated_at = NOW()
            WHERE id = :e AND chamber_id = :c`
        : `UPDATE hd_entries SET ${pr.campo} = :val, updated_at = NOW()
            WHERE id = :e AND chamber_id = :c`;
      await sequelize.query(sql,
        { replacements: { val, e: pr.entry_id, c: req.chamber_id }, type: QueryTypes.UPDATE });
    }
    await audita(req, 'propuesta_' + accion, 'entry:' + pr.entry_id, pr.campo);
    res.json({ success: true, data: { id: pr.id, campo: pr.campo, estado: accion === 'aceptar' ? 'aceptado' : 'rechazado',
      nota: 'La ficha sigue pendiente de validacion hasta que se valide entera.' } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Validar la ficha entera — el unico paso que la publica.
router.post('/entries/:id/validar', requiereRol('gestion'), async (req, res) => {
  const [n] = await sequelize.query(
    `UPDATE hd_entries SET estado_ficha = 'validada', validado_por = :who, validado_en = NOW()
      WHERE id = :id AND chamber_id = :c RETURNING id`,
    { replacements: { id: req.params.id, c: req.chamber_id, who: (req.member && req.member.id) || null },
      type: QueryTypes.SELECT });
  if (!n || !n.length) return res.status(404).json({ success: false, error: 'Ficha no encontrada' });
  await audita(req, 'ficha_validada', 'entry:' + req.params.id, null);
  res.json({ success: true, data: { validada: true, por: (req.member && req.member.email) || null } });
});

// ---- HISP-106 — matching por proyecto --------------------------------------
router.post('/matching', requiereRol('gestion'), async (req, res) => {
  try {
    const b = req.body || {};
    const etiquetas = (Array.isArray(b.etiquetas) ? b.etiquetas : String(b.etiquetas || '').split(','))
      .map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
    if (!etiquetas.length) {
      return res.status(400).json({ success: false,
        error: 'Indica al menos una etiqueta tematica del proyecto.' });
    }
    const fichas = await sequelize.query(
      `SELECT e.*, f.presupuesto_eur, f.presupuesto_ejercicio, f.proxy_valor, f.proxy_tipo, f.proxy_ejercicio
         FROM hd_entries e
    LEFT JOIN hd_foundations f ON f.entry_id = e.id AND f.chamber_id = e.chamber_id
        WHERE e.chamber_id = :c`,
      { replacements: { c: req.chamber_id }, type: QueryTypes.SELECT });

    const r = matching.candidatos(fichas, {
      etiquetas, naturaleza_buscada: b.naturaleza_buscada || null,
      pais: b.pais || null, localizacion: b.localizacion || null,
    }, {});

    // Se registra lo propuesto para poder recalibrar con el tiempo.
    if (b.project_id) {
      for (const c of r.candidatos) {
        await sequelize.query(
          `INSERT INTO hd_matches (chamber_id, project_id, entry_id, score, motivos, decision)
           VALUES (:c,:p,:e,:s,:m,'propuesto')`,
          { replacements: { c: req.chamber_id, p: b.project_id, e: c.entry_id, s: c.score,
                            m: JSON.stringify(c.motivos) }, type: QueryTypes.INSERT });
      }
    }
    await audita(req, 'matching', etiquetas.join(','), `${r.candidatos.length} candidatos`);
    res.json({ success: true, data: r });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
