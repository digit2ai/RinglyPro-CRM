// =====================================================
// Health — GET /health (public, no auth). Acceptance #1.
//
// En producción reporta el modo de persistencia (postgres|memory), si los pagos
// están configurados y el entorno, para poder MONITOREAR el riesgo #1 de un
// cliente que paga: caer a memoria (se perderían datos/pagos al reiniciar).
// status='degraded' si estamos en producción sirviendo desde memoria.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();

let account = null, championship = null;
try { account = require('../models/account'); } catch (e) { /* optional */ }
try { championship = require('../models/championship'); } catch (e) { /* optional */ }

const SERVICE = 'evaluacion-del-caballo-de-paso-fino';
const VERSION = '1.1.0';

router.get('/', (req, res) => {
  const accMode = account && account.mode ? account.mode() : 'unknown';
  const champMode = championship && championship.mode ? championship.mode() : 'unknown';
  const paymentsEnabled = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
  const webhookSecured = !!process.env.STRIPE_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  const onMemory = accMode === 'memory' || champMode === 'memory';

  // En producción, servir desde memoria (o pagos activos sin firma de webhook) es
  // una condición degradada que debe alertar en el monitoreo.
  const degraded = isProd && (onMemory || (paymentsEnabled && !webhookSecured));

  // Siempre 200 para no cascadear en agregadores de health; el monitoreo alerta
  // sobre el campo `status`/`db.accounts`, no sobre el código HTTP.
  res.json({
    status: degraded ? 'degraded' : 'ok',
    service: SERVICE,
    version: VERSION,
    env: process.env.NODE_ENV || 'development',
    db: { accounts: accMode, championship: champMode },
    payments: { enabled: paymentsEnabled, webhook_secured: webhookSecured }
  });
});

module.exports = router;
