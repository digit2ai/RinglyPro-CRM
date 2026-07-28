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

router.use('/projects/:id/workspace', require('./workspace'));
router.use('/projects', require('./projects'));
router.use('/wp', require('./wp'));
router.use('/', require('./core'));

module.exports = router;
