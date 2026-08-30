/**
 * Unified Chamber Router (cv-* / vc-* slugs)
 *
 * Mounted at /:chamber_slug/api/* by src/app.js after resolveChamberFromSlug
 * middleware. Every handler scopes queries by req.chamber_id.
 *
 * Routers:
 *   workspace.js -- /projects/:id/workspace/* (mounted FIRST so it wins over /:id)
 *   projects.js  -- /projects + lifecycle, invitations, signoff, meetings, plan-versions
 *   wp.js        -- /wp/* WordPress-as-system-of-record sync, webhook, SSO
 *   core.js      -- /public/info, /public/members, /auth, /members, /regions,
 *                   /exchange, /metrics, /payments, /admin, /match
 */
const express = require('express');
const router = express.Router();

// Motor de Directorio Inteligente HISPANOTEC. El router se auto-limita a
// cv-105 y devuelve 404 para cualquier otro slug, asi que montarlo aqui no
// expone nada a las demas camaras. Va ARRIBA para que core.js no se lo trague.
router.use('/directorio', require('./hispanotec'));
router.use('/projects/:id/workspace', require('./workspace'));
router.use('/projects', require('./projects'));
router.use('/wp', require('./wp'));
router.use('/', require('./core'));

module.exports = router;
