'use strict';

// =============================================================
// Canal B — webhook de aprovisionamiento.
//
// POST /api/v1/webhooks/wordpress/users
//
// EL CUERPO LLEGA SIN PARSEAR. express.raw se monta AQUI, y este router debe
// montarse en app.js ANTES del express.json global. El HMAC cubre los bytes
// exactos que envio WordPress: si algo los parsea y reserializa antes, ninguna
// firma vuelve a coincidir y el fallo se manifiesta como "401 siempre", que es
// dificil de diagnosticar desde el otro lado.
//
// Codigos, tal como los espera el plugin:
//   200 aceptado · 401 firma incorrecta · 409 entrega duplicada
//   422 payload invalido · 5xx reintentable
// WordPress reintenta 3 veces con 30s / 5min / 30min reutilizando X-CV-Delivery,
// asi que la idempotencia la da el indice unico, no una comprobacion previa.
// =============================================================

const express = require('express');
const { QueryTypes } = require('sequelize');
const wp = require('../services/wpIdentity');
const auth = require('./wordpressAuth');

const router = express.Router();
const sequelize = auth.sequelize;

const EVENTOS = ['user.created', 'user.updated', 'user.role_changed', 'user.deleted'];

router.post('/wordpress/users',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (req, res) => {
    const slug = String(req.get('X-CV-Tenant') || '').toLowerCase();
    const evento = String(req.get('X-CV-Event') || '');
    const entrega = String(req.get('X-CV-Delivery') || '').slice(0, 64);
    const ts = req.get('X-CV-Timestamp');
    const firma = req.get('X-CV-Signature');

    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');

    let cfg = null;
    const registrar = async (code, accion, error, wpUserId) => {
      if (!cfg) return;
      try {
        await sequelize.query(
          `INSERT INTO cv_webhook_deliveries
             (chamber_id, delivery_id, event, wp_user_id, status_code, action, error, payload)
           VALUES (:c,:d,:e,:u,:s,:a,:err,CAST(:p AS jsonb))
           ON CONFLICT (chamber_id, delivery_id) DO NOTHING`,
          { replacements: { c: cfg.chamber_id, d: entrega || ('sin-id-' + Date.now()),
              e: evento || 'desconocido', u: wpUserId || null, s: code, a: accion || null,
              err: error ? String(error).slice(0, 500) : null,
              // El payload se guarda para poder auditar, pero NUNCA se escribe
              // en el log de la aplicacion: lleva datos personales.
              p: JSON.stringify(safeJson(raw)) },
            type: QueryTypes.INSERT });
      } catch (e) { /* la traza nunca rompe la respuesta */ }
    };

    try {
      if (!slug || !evento || !entrega) {
        return res.status(422).json({ error: 'faltan cabeceras X-CV-Tenant, X-CV-Event o X-CV-Delivery' });
      }
      if (!EVENTOS.includes(evento)) {
        return res.status(422).json({ error: 'evento no soportado', soportados: EVENTOS });
      }

      cfg = await auth.integracionPorSlug(slug);
      if (!cfg) return res.status(404).json({ error: 'tenant no encontrado' });
      if (!cfg.webhook_enabled) {
        return res.status(403).json({ error: 'el webhook no esta activado para este tenant' });
      }

      const v = wp.verificarWebhook(cfg, { timestamp: ts, rawBody: raw, firma });
      if (!v.ok) {
        await registrar(401, null, v.error, null);
        return res.status(401).json({ error: v.error });
      }

      let cuerpo;
      try { cuerpo = JSON.parse(raw); }
      catch (e) { await registrar(422, null, 'JSON invalido', null);
        return res.status(422).json({ error: 'JSON invalido' }); }

      const u = cuerpo && cuerpo.user;
      if (!u || !u.wp_user_id) {
        await registrar(422, null, 'falta user.wp_user_id', null);
        return res.status(422).json({ error: 'falta user.wp_user_id' });
      }

      // IDEMPOTENCIA: se reserva la entrega ANTES de tocar al miembro. Si otra
      // instancia ya la tomo, esta se retira con 409 sin escribir dos veces.
      try {
        await sequelize.query(
          `INSERT INTO cv_webhook_deliveries (chamber_id, delivery_id, event, wp_user_id, status_code)
           VALUES (:c,:d,:e,:u,0)`,
          { replacements: { c: cfg.chamber_id, d: entrega, e: evento, u: Number(u.wp_user_id) },
            type: QueryTypes.INSERT });
      } catch (e) {
        return res.status(409).json({ error: 'entrega duplicada', delivery_id: entrega });
      }

      let accion, resultado;
      if (evento === 'user.deleted') {
        // No se borra: se desactiva. Un miembro tiene proyectos, mensajes e
        // historial, y ademas asi el siguiente SSO puede responder 403 con
        // sentido en vez de "no existe".
        const [fila] = await sequelize.query(
          `UPDATE members SET status = 'inactive', wp_synced_at = NOW(), updated_at = NOW()
            WHERE chamber_id = :c AND wp_user_id = :w RETURNING id`,
          { replacements: { c: cfg.chamber_id, w: Number(u.wp_user_id) }, type: QueryTypes.SELECT });
        accion = fila ? 'desactivado' : 'sin_efecto';
        resultado = { ok: true, accion };
      } else {
        resultado = await wp.upsertMiembro(sequelize, QueryTypes,
          { chamberId: cfg.chamber_id, cfg: Object.assign({}, cfg, { auto_provision: true }), datos: u });
        accion = resultado.accion;
      }

      await sequelize.query(
        `UPDATE cv_webhook_deliveries SET status_code = 200, action = :a, payload = CAST(:p AS jsonb)
          WHERE chamber_id = :c AND delivery_id = :d`,
        { replacements: { a: accion, c: cfg.chamber_id, d: entrega, p: JSON.stringify(safeJson(raw)) },
          type: QueryTypes.UPDATE });
      await sequelize.query(
        'UPDATE cv_tenant_integrations SET last_webhook_at = NOW() WHERE id = :id',
        { replacements: { id: cfg.id }, type: QueryTypes.UPDATE });

      return res.status(200).json({ ok: true, accion,
        member_id: (resultado.member && resultado.member.id) || null,
        roles: resultado.roles || null });
    } catch (e) {
      console.error('[wp-webhook]', slug, evento, e.message);   // nunca el cuerpo
      await registrar(500, null, e.message, null);
      return res.status(500).json({ error: 'error interno' });  // reintentable
    }
  });

function safeJson(raw) {
  try { return JSON.parse(raw); } catch (e) { return { _no_parseable: true }; }
}

module.exports = router;
